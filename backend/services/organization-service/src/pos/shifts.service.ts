import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CounterShiftStatus, PaymentMode, Prisma, ShiftMode } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { lockRow } from '../common/row-lock';
import { optionalText, toDateOnly, toNumber } from '../common/values';
import type { CloseDayDto, EndShiftDto, OpenShiftDto } from './dto/shift.dto';
import { siteBusinessDate } from './pos-pricing';
import { PosService } from './pos.service';
import {
  counterStockNow,
  fixedShiftAt,
  roundMoney,
  tally,
  toShiftViews,
  userNames,
  type ShiftTiming,
} from './shifts';

/**
 * Shifts at a counter and closing its day. A cashier opens a shift (with the till's cash) before
 * billing; it ends with the cash counted against opening cash plus the shift's cash bills, and is
 * either closed or handed over, the next cashier then taking on its cash and the counter's stock.
 * An admin closes the counter's day once no shift is open: later bills go on the next day.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
  ) {}

  async open(dto: OpenShiftDto, context: ActorContext) {
    const counter = await this.pos.findCounter(dto.counterId);
    const actorId = context.actorId;

    if (!actorId) {
      throw new ForbiddenException('Sign in again to open a shift.');
    }

    const now = new Date();
    const shift = await this.prisma.$transaction(async (tx) => {
      // One open shift per counter and per cashier: the counter's row lock queues two cashiers
      // opening at once, the cashier's own row one cashier opening at two counters at once.
      await lockRow(tx, 'counters', counter.id);
      await lockRow(tx, 'users', actorId);
      const [open, mine, handover, restaurant] = await Promise.all([
        tx.counterShift.findFirst({
          select: { id: true },
          where: { counterId: counter.id, status: CounterShiftStatus.OPEN },
        }),
        tx.counterShift.findFirst({
          select: { counter: { select: { counterName: true } } },
          where: { openedBy: actorId, status: CounterShiftStatus.OPEN },
        }),
        tx.counterShift.findFirst({
          orderBy: { closedAt: 'desc' },
          select: { id: true },
          where: {
            counterId: counter.id,
            status: CounterShiftStatus.HANDED_OVER,
            takenOverBy: { is: null },
          },
        }),
        tx.restaurant.findFirstOrThrow({
          select: { shiftMode: true, shiftTimings: true },
          where: { id: counter.restaurantId },
        }),
      ]);

      if (open) {
        throw new ConflictException('A shift is already open at this counter. End it first.');
      }

      if (mine) {
        throw new ConflictException(
          `You already have a shift open at ${mine.counter.counterName}. End it before opening another.`,
        );
      }

      const created = await tx.counterShift.create({
        data: {
          counterId: counter.id,
          hospitalId: counter.hospitalId,
          name:
            restaurant.shiftMode === ShiftMode.FIXED
              ? fixedShiftAt(restaurant.shiftTimings as unknown as ShiftTiming[], now)
              : null,
          openedAt: now,
          openedBy: actorId,
          openingCash: dto.openingCash,
          takenOverFromId: handover?.id ?? null,
        },
      });

      await this.auditLog.record(
        {
          action: 'SHIFT_OPEN',
          actorId,
          entityId: created.id,
          entityName: 'counter_shifts',
          hospitalId: counter.hospitalId,
          ipAddress: context.ipAddress,
          newValue: {
            counterId: counter.id,
            openingCash: dto.openingCash,
            takenOverFromId: handover?.id ?? null,
          },
        },
        tx,
      );

      return created;
    });
    const [view] = await toShiftViews(this.prisma, [shift]);

    return view;
  }

  async end(id: string, dto: EndShiftDto, context: ActorContext) {
    const shift = await this.prisma.$transaction(async (tx) => {
      // Billing holds this lock too, so no bill lands in the shift while it is being counted.
      await lockRow(tx, 'counter_shifts', id);
      const existing = await tx.counterShift.findFirst({ where: { id } });

      if (!existing) {
        throw new NotFoundException('Shift not found.');
      }

      if (existing.status !== CounterShiftStatus.OPEN) {
        throw new ConflictException('This shift has already ended.');
      }

      if (
        existing.openedBy !== context.actorId &&
        !context.permissions?.includes('POS_DAY_CLOSE')
      ) {
        throw new ForbiddenException(
          'Only the cashier who opened this shift, or an admin, can end it.',
        );
      }

      const summary = tally(
        await tx.restaurantOrder.findMany({
          select: { grandTotal: true, isComplimentary: true, paymentMode: true, status: true },
          where: { shiftId: id },
        }),
      );
      const cashSales =
        summary.byPaymentMode.find((entry) => entry.mode === PaymentMode.CASH)?.amount ?? 0;
      const ended = await tx.counterShift.update({
        data: {
          closedAt: new Date(),
          closedBy: context.actorId ?? null,
          countedCash: dto.countedCash,
          expectedCash: roundMoney(toNumber(existing.openingCash) + cashSales),
          handoverStock: dto.handover
            ? await counterStockNow(tx, existing.counterId)
            : Prisma.DbNull,
          note: optionalText(dto.note) ?? null,
          status: dto.handover ? CounterShiftStatus.HANDED_OVER : CounterShiftStatus.CLOSED,
          summary,
        },
        where: { id },
      });

      await this.auditLog.record(
        {
          action: dto.handover ? 'SHIFT_HANDOVER' : 'SHIFT_CLOSE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'counter_shifts',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          newValue: {
            countedCash: dto.countedCash,
            expectedCash: toNumber(ended.expectedCash ?? 0),
            status: ended.status,
          },
        },
        tx,
      );

      return ended;
    });
    const [view] = await toShiftViews(this.prisma, [shift]);

    return view;
  }

  async closeDay(dto: CloseDayDto, context: ActorContext) {
    const counter = await this.pos.findCounter(dto.counterId);
    const today = siteBusinessDate(new Date());
    const date = dto.date?.slice(0, 10) ?? today;

    if (date > today) {
      throw new BadRequestException('A day can only be closed once it has started.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Opening a shift takes this lock too, so none can open while the day is being closed.
      await lockRow(tx, 'counters', counter.id);
      const [open, closed] = await Promise.all([
        tx.counterShift.findFirst({
          select: { id: true },
          where: { counterId: counter.id, status: CounterShiftStatus.OPEN },
        }),
        tx.counterDayClose.findFirst({
          select: { id: true },
          where: { businessDate: toDateOnly(date), counterId: counter.id },
        }),
      ]);

      if (open) {
        throw new ConflictException('End the open shift at this counter before closing the day.');
      }

      if (closed) {
        throw new ConflictException('This day is already closed at this counter.');
      }

      // No shift is open, so no bill can land on the day while its takings are read.
      const { bills, byPaymentMode, cancelled, complimentary, sales } = await this.pos.summary({
        counterId: counter.id,
        date,
      });
      const close = await tx.counterDayClose.create({
        data: {
          businessDate: toDateOnly(date),
          closedBy: context.actorId ?? null,
          counterId: counter.id,
          hospitalId: counter.hospitalId,
          summary: { bills, byPaymentMode, cancelled, complimentary, sales },
        },
      });

      await this.auditLog.record(
        {
          action: 'DAY_CLOSE',
          actorId: context.actorId,
          entityId: close.id,
          entityName: 'counter_day_closes',
          hospitalId: counter.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { businessDate: date, counterId: counter.id, sales },
        },
        tx,
      );
      const names = await userNames(tx, [close.closedBy]);

      return {
        businessDate: date,
        closedAt: close.closedAt,
        closedByName: close.closedBy ? (names.get(close.closedBy) ?? null) : null,
      };
    });
  }
}
