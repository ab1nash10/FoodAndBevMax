import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CounterShiftStatus,
  OnlinePaymentProvider,
  OnlinePaymentStatus,
  OrderStatus,
  Prisma,
  ShiftReconciliationStatus,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { lockRow } from '../common/row-lock';
import { optionalText, toNumber } from '../common/values';
import { siteInstant } from '../restaurant-orders/board-schedule';
import type {
  ApproveShiftDto,
  ListShiftReconciliationsDto,
  SaveShiftReasonsDto,
  SendBackShiftDto,
} from './dto/shift-reconciliation.dto';
import { siteBusinessDate } from './pos-pricing';
import {
  reasonRefusal,
  reconciliationStatus,
  shiftBills,
  shiftMoney,
  type Reasons,
  type UnbilledPayment,
} from './shift-reconciliation';
import { userNames } from './shifts';

type Client = Prisma.TransactionClient | PrismaService;

const ENDED: CounterShiftStatus[] = [CounterShiftStatus.CLOSED, CounterShiftStatus.HANDED_OVER];

const shiftInclude = {
  counter: {
    select: { counterName: true, restaurant: { select: { id: true, restaurantName: true } } },
  },
  reconciliation: true,
} satisfies Prisma.CounterShiftInclude;

type LoadedShift = Prisma.CounterShiftGetPayload<{ include: typeof shiftInclude }>;

const billSelect = {
  billNumber: true,
  // A Pay later bill counts in the shift that collected it (shiftBills).
  collectedMode: true,
  collectedShiftId: true,
  grandTotal: true,
  id: true,
  isComplimentary: true,
  onlinePayment: { select: { status: true } },
  orderNumber: true,
  paymentMode: true,
  shiftId: true,
  status: true,
} satisfies Prisma.RestaurantOrderSelect;

type LoadedBill = Prisma.RestaurantOrderGetPayload<{ select: typeof billSelect }>;

interface LoadedPayment {
  amount: Prisma.Decimal;
  counterId: string;
  id: string;
  paidAt: Date | null;
  paidReference: string | null;
  provider: OnlinePaymentProvider;
}

/**
 * Payment reconciliation and Supervisor approval, per closed shift (the user, 2026-11-26). The
 * restaurant admin gives a reason for each cash, UPI and card difference; a Supervisor then
 * approves every shift, matched or not, or sends it back with a comment. Approval makes the
 * shift's money final: its bills can no longer be amended or cancelled, and its restaurant's day
 * can go to the ERP once all its shifts are approved. Reads are limited to the user's locations
 * by the Prisma scope (counter_shifts is scoped).
 */
@Injectable()
export class ShiftReconciliationService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /** The ended shifts that opened on a site day, each with its money check and where it stands. */
  async list(query: ListShiftReconciliationsDto) {
    const date = query.date?.slice(0, 10) ?? siteBusinessDate(new Date());
    const shifts = await this.prisma.counterShift.findMany({
      include: shiftInclude,
      orderBy: { openedAt: 'asc' },
      where: {
        openedAt: {
          gte: new Date(siteInstant(date, '00:00')),
          lt: new Date(siteInstant(date, '00:00', 1)),
        },
        status: { in: ENDED },
        ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
        ...(query.restaurantId ? { counter: { restaurantId: query.restaurantId } } : {}),
      },
    });
    const views = await this.views(this.prisma, shifts);

    return {
      date,
      items: query.status ? views.filter((view) => view.status === query.status) : views,
    };
  }

  /** The restaurant admin's reasons for the shift's differences: it then waits for approval. */
  async saveReasons(shiftId: string, dto: SaveShiftReasonsDto, context: ActorContext) {
    await this.prisma.$transaction(async (tx) => {
      const { shift, view } = await this.loadForChange(tx, shiftId);

      if (view.status === 'APPROVED') {
        throw new ConflictException('This shift is approved, so its reasons can no longer change.');
      }

      const given: Reasons = dto.reasons ?? {};
      const refusal = reasonRefusal(view.checks, given);

      if (refusal) throw new BadRequestException(refusal);

      // Only the differences the shift has now, each with its reason and note as given.
      const reasons = Object.fromEntries(
        view.checks.map((check) => [
          check.key,
          {
            note: optionalText(given[check.key]?.note ?? undefined) ?? null,
            reason: given[check.key]!.reason,
          },
        ]),
      );
      const sent = {
        reasons,
        status: ShiftReconciliationStatus.SUBMITTED,
        submittedAt: new Date(),
        submittedBy: context.actorId ?? null,
      };
      const record = await tx.shiftReconciliation.upsert({
        create: { ...sent, hospitalId: shift.hospitalId, shiftId },
        update: sent,
        where: { shiftId },
      });

      await this.auditLog.record(
        {
          action: 'SHIFT_REASONS',
          actorId: context.actorId,
          entityId: record.id,
          entityName: 'shift_reconciliations',
          hospitalId: shift.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { reasons, shiftId },
        },
        tx,
      );
    });

    return this.one(shiftId);
  }

  /** A Supervisor approves the shift: its money is final. */
  async approve(shiftId: string, dto: ApproveShiftDto, context: ActorContext) {
    await this.prisma.$transaction(async (tx) => {
      const { shift, view } = await this.loadForChange(tx, shiftId);

      if (view.status !== 'WAITING') throw new ConflictException(notWaiting[view.status]);

      const decided = {
        // What was approved, kept as it was: JSON keeps the dates as text.
        approvedChecks: JSON.parse(
          JSON.stringify({ checks: view.checks, money: view.money, reasons: view.reasons }),
        ) as Prisma.InputJsonValue,
        comment: optionalText(dto.comment) ?? null,
        decidedAt: new Date(),
        decidedBy: context.actorId ?? null,
        status: ShiftReconciliationStatus.APPROVED,
      };
      const record = await tx.shiftReconciliation.upsert({
        create: { ...decided, hospitalId: shift.hospitalId, shiftId },
        update: decided,
        where: { shiftId },
      });

      await this.auditLog.record(
        {
          action: 'SHIFT_APPROVE',
          actorId: context.actorId,
          entityId: record.id,
          entityName: 'shift_reconciliations',
          hospitalId: shift.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { comment: decided.comment, shiftId },
        },
        tx,
      );
    });

    return this.one(shiftId);
  }

  /** A Supervisor sends the shift back to the restaurant admin, saying what to fix. */
  async sendBack(shiftId: string, dto: SendBackShiftDto, context: ActorContext) {
    await this.prisma.$transaction(async (tx) => {
      const { shift, view } = await this.loadForChange(tx, shiftId);

      if (view.status !== 'WAITING') throw new ConflictException(notWaiting[view.status]);

      const decided = {
        comment: dto.comment,
        decidedAt: new Date(),
        decidedBy: context.actorId ?? null,
        status: ShiftReconciliationStatus.SENT_BACK,
      };
      const record = await tx.shiftReconciliation.upsert({
        create: { ...decided, hospitalId: shift.hospitalId, shiftId },
        update: decided,
        where: { shiftId },
      });

      await this.auditLog.record(
        {
          action: 'SHIFT_SEND_BACK',
          actorId: context.actorId,
          entityId: record.id,
          entityName: 'shift_reconciliations',
          hospitalId: shift.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { comment: dto.comment, shiftId },
        },
        tx,
      );
    });

    return this.one(shiftId);
  }

  /** One ended shift's view, as the list shows it. */
  private async one(shiftId: string) {
    const shift = await this.prisma.counterShift.findFirst({
      include: shiftInclude,
      where: { id: shiftId, status: { in: ENDED } },
    });

    if (!shift) throw new NotFoundException('Shift not found.');

    const [view] = await this.views(this.prisma, [shift]);

    return view!;
  }

  /**
   * The shift, locked, with its view. The lock is the one ending the shift and cancelling or
   * amending its bills take, so a decision never lands on figures that changed underneath it.
   */
  private async loadForChange(tx: Prisma.TransactionClient, shiftId: string) {
    await lockRow(tx, 'counter_shifts', shiftId);
    const shift = await tx.counterShift.findFirst({
      include: shiftInclude,
      where: { id: shiftId },
    });

    if (!shift) throw new NotFoundException('Shift not found.');
    if (!ENDED.includes(shift.status)) {
      throw new ConflictException('This shift is still open: its money is checked once it ends.');
    }

    const [view] = await this.views(tx, [shift]);

    return { shift, view: view! };
  }

  /** Each shift's money check and where it stands, a query each for all of them. */
  private async views(client: Client, shifts: LoadedShift[]) {
    if (shifts.length === 0) return [];

    const ids = shifts.map((shift) => shift.id);
    const counterIds = [...new Set(shifts.map((shift) => shift.counterId))];
    const from = new Date(Math.min(...shifts.map((shift) => shift.openedAt.valueOf())));
    const to = new Date(
      Math.max(...shifts.map((shift) => (shift.closedAt ?? new Date()).valueOf())),
    );
    const [bills, payments, names] = await Promise.all([
      client.restaurantOrder.findMany({
        select: billSelect,
        where: { OR: [{ shiftId: { in: ids } }, { collectedShiftId: { in: ids } }] },
      }),
      // Taken at a till (by a cashier, not a guest's QR or the kiosk) with no bill made.
      client.onlinePayment.findMany({
        select: {
          amount: true,
          counterId: true,
          id: true,
          paidAt: true,
          paidReference: true,
          provider: true,
        },
        where: {
          counterId: { in: counterIds },
          createdBy: { not: null },
          orderId: null,
          paidAt: { gte: from, lte: to },
          status: OnlinePaymentStatus.PAID,
        },
      }),
      userNames(
        client,
        shifts.flatMap((shift) => [
          shift.openedBy,
          shift.reconciliation?.submittedBy ?? null,
          shift.reconciliation?.decidedBy ?? null,
        ]),
      ),
    ]);

    return shifts.map((shift) =>
      toView(
        shift,
        bills.filter((bill) => bill.shiftId === shift.id || bill.collectedShiftId === shift.id),
        payments.filter(
          (payment) =>
            payment.counterId === shift.counterId &&
            payment.paidAt !== null &&
            payment.paidAt >= shift.openedAt &&
            (!shift.closedAt || payment.paidAt <= shift.closedAt),
        ),
        names,
      ),
    );
  }
}

const notWaiting: Record<'APPROVED' | 'NEEDS_REASON' | 'SENT_BACK', string> = {
  APPROVED: 'This shift is already approved.',
  NEEDS_REASON: 'This shift still needs the restaurant admin’s reason for each difference.',
  SENT_BACK: 'This shift was sent back: it waits for the restaurant admin to send it again.',
};

function toView(
  shift: LoadedShift,
  bills: LoadedBill[],
  payments: LoadedPayment[],
  names: Map<string, string>,
) {
  const { checks, money } = shiftMoney({
    bills: shiftBills(
      shift.id,
      bills.map((bill) => ({
        amount: bill.grandTotal === null ? 0 : toNumber(bill.grandTotal),
        cancelled: bill.status === OrderStatus.CANCELLED,
        collectedMode: bill.collectedMode,
        collectedShiftId: bill.collectedShiftId,
        complimentary: bill.isComplimentary,
        confirmed: bill.onlinePayment?.status === OnlinePaymentStatus.PAID,
        id: bill.id,
        number: bill.billNumber ?? bill.orderNumber,
        paymentMode: bill.paymentMode,
        shiftId: bill.shiftId,
      })),
    ),
    countedCash: shift.countedCash === null ? null : toNumber(shift.countedCash),
    openingCash: toNumber(shift.openingCash),
    unbilled: payments.map((payment): UnbilledPayment => ({
      amount: toNumber(payment.amount),
      id: payment.id,
      mode: payment.provider === OnlinePaymentProvider.PINELABS ? 'CARD' : 'UPI',
      paidAt: payment.paidAt,
      reference: payment.paidReference,
    })),
  });
  const record = shift.reconciliation;
  const reasons = (record?.reasons ?? {}) as Reasons;
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  return {
    cashierName: nameOf(shift.openedBy),
    checks,
    closedAt: shift.closedAt,
    comment: record?.comment ?? null,
    counterName: shift.counter.counterName,
    decidedAt: record?.decidedAt ?? null,
    decidedByName: nameOf(record?.decidedBy),
    hospitalId: shift.hospitalId,
    money,
    openedAt: shift.openedAt,
    openingCash: toNumber(shift.openingCash),
    reasons,
    restaurantId: shift.counter.restaurant.id,
    restaurantName: shift.counter.restaurant.restaurantName,
    shiftId: shift.id,
    shiftName: shift.name,
    status: reconciliationStatus(checks, record ? { reasons, status: record.status } : null),
    submittedAt: record?.submittedAt ?? null,
    submittedByName: nameOf(record?.submittedBy),
  };
}
