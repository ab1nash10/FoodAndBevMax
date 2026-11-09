import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErpPostingStatus,
  OnlinePaymentStatus,
  OrderAmendmentType,
  OrderSource,
  QrOrderStatus,
  type PaymentMode,
  type Prisma,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { lockRow } from '../common/row-lock';
import { toDateOnly, toNumber } from '../common/values';
import { PosService } from '../pos/pos.service';
import { userNames } from '../pos/shifts';
import type {
  CreateAmendmentDto,
  FindAmendableQueryDto,
  ListAmendmentsQueryDto,
  ListOrderReportQueryDto,
  OperatorsQueryDto,
} from './dto/order-reports.dto';
import {
  AMEND_WINDOW_MS,
  amendRefusal,
  billRefusal,
  referenceFor,
  reportFacts,
} from './order-report';

const money = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));
const dayKey = (restaurantId: string, day: Date | null) =>
  `${restaurantId}|${day?.toISOString().slice(0, 10) ?? ''}`;

const reportSelect = {
  acceptedAt: true,
  bedNumber: true,
  billNumber: true,
  businessDate: true,
  cancelReason: true,
  cancelledAt: true,
  channel: true,
  complimentaryReason: true,
  counter: { select: { counterCode: true, counterName: true, posDeviceId: true } },
  createdBy: true,
  deliveredAt: true,
  discountTotal: true,
  grandTotal: true,
  gstTotal: true,
  id: true,
  isComplimentary: true,
  items: true,
  onlinePayment: { select: { paidAt: true, provider: true, status: true } },
  orderNumber: true,
  paymentMode: true,
  paymentReference: true,
  placedAt: true,
  posDeviceId: true,
  readyAt: true,
  restaurant: { select: { id: true, restaurantName: true } },
  restaurantId: true,
  roomNumber: true,
  roundOff: true,
  status: true,
  stewardId: true,
  subtotal: true,
} satisfies Prisma.RestaurantOrderSelect;

type ReportOrder = Prisma.RestaurantOrderGetPayload<{ select: typeof reportSelect }>;

/** The gateway or card machine's confirmation, when it took the payment. */
const onlinePaidAt = (order: ReportOrder) =>
  order.onlinePayment?.status === OnlinePaymentStatus.PAID
    ? (order.onlinePayment.paidAt ?? order.placedAt)
    : null;

/**
 * Orders & Reports: every counter bill with its steps, flags and money, and the amendments
 * admins make to a bill's payment mode within 48 hours of billing. Reads are limited to the
 * user's locations by the Prisma scope.
 */
@Injectable()
export class OrderReportsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: ListOrderReportQueryDto) {
    const { limit, page } = getPagination(query);
    const search = query.search?.trim();
    const and: Prisma.RestaurantOrderWhereInput[] = [];

    // The till it was billed at; a bill from before tills were kept, its counter's own till.
    if (query.posDeviceId) {
      and.push({
        OR: [
          { posDeviceId: query.posDeviceId },
          { counter: { posDeviceId: query.posDeviceId }, posDeviceId: null },
        ],
      });
    }
    if (query.discounted === true) and.push({ discountTotal: { gt: 0 } });
    if (query.discounted === false) {
      and.push({ OR: [{ discountTotal: null }, { discountTotal: { lte: 0 } }] });
    }
    if (search) {
      and.push({
        OR: [
          { billNumber: { contains: search, mode: 'insensitive' } },
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customerMobile: { contains: search } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { roomNumber: { contains: search, mode: 'insensitive' } },
          { paymentReference: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.RestaurantOrderWhereInput = {
      AND: and,
      source: OrderSource.COUNTER,
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),

      ...(query.operatorId ? { createdBy: query.operatorId } : {}),
      ...(query.isComplimentary !== undefined ? { isComplimentary: query.isComplimentary } : {}),
      ...(query.from || query.to
        ? {
            businessDate: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    };
    const [orders, total] = await Promise.all([
      limit
        ? this.prisma.restaurantOrder.findMany({
            orderBy: getOrderBy(query, 'placedAt'),
            select: reportSelect,
            skip: (page - 1) * limit,
            take: limit,
            where,
          })
        : Promise.resolve([]),
      this.prisma.restaurantOrder.count({ where }),
    ]);

    return { items: await this.toRows(orders), meta: getPageMeta(page, limit, total) };
  }

  /** The page's extra facts, a query each for the whole page: tills, cashiers, kiosk, ERP. */
  private async toRows(orders: ReportOrder[]) {
    if (orders.length === 0) return [];

    const ids = orders.map((order) => order.id);
    const tillOf = (order: ReportOrder) => order.posDeviceId ?? order.counter?.posDeviceId ?? null;
    const deviceIds = [...new Set(orders.map(tillOf).filter(Boolean))] as string[];
    const [devices, operators, kiosk, posted] = await Promise.all([
      deviceIds.length
        ? this.prisma.posDevice.findMany({
            select: { code: true, id: true, name: true },
            where: { id: { in: deviceIds } },
          })
        : [],
      userNames(
        this.prisma,
        orders.flatMap((order) => [order.createdBy, order.stewardId]),
      ),
      Promise.all([
        this.prisma.kioskOrder.findMany({
          select: { billedOrderId: true },
          where: { billedOrderId: { in: ids } },
        }),
        this.prisma.qrOrder.findMany({
          select: { billedOrderId: true },
          where: { billedOrderId: { in: ids } },
        }),
      ]).then((lists) => lists.flat()),
      this.prisma.erpPosting.findMany({
        select: { businessDate: true, restaurantId: true },
        where: {
          OR: orders.map((order) => ({
            businessDate: order.businessDate ?? undefined,
            restaurantId: order.restaurantId,
          })),
          status: ErpPostingStatus.SUCCESS,
        },
      }),
    ]);
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    const fromKiosk = new Set(kiosk.map((entry) => entry.billedOrderId));
    const sentDays = new Set(posted.map((post) => dayKey(post.restaurantId, post.businessDate)));

    return orders.map(({ createdBy, onlinePayment, posDeviceId, ...order }) => {
      const till = tillOf({ ...order, createdBy, onlinePayment, posDeviceId });
      const discountTotal = money(order.discountTotal) ?? 0;
      const paidOnline = onlinePaidAt({ ...order, createdBy, onlinePayment, posDeviceId });

      return {
        ...order,
        ...reportFacts({ ...order, discountTotal, onlinePaidAt: paidOnline }),
        discountTotal,
        erpSent: sentDays.has(dayKey(order.restaurantId, order.businessDate)),
        grandTotal: money(order.grandTotal),
        gstTotal: money(order.gstTotal),
        onlineProvider: paidOnline ? (onlinePayment?.provider ?? null) : null,
        operatorName: createdBy ? (operators.get(createdBy) ?? null) : null,
        posDevice: till ? (deviceById.get(till) ?? null) : null,
        // Billed at the till itself; a kiosk or QR order was ordered elsewhere and billed there.
        posOrder: !fromKiosk.has(order.id),
        roundOff: money(order.roundOff),
        stewardAssigned: order.stewardId !== null,
        stewardName: order.stewardId ? (operators.get(order.stewardId) ?? null) : null,
        subtotal: money(order.subtotal),
      };
    });
  }

  /** Who has made bills (at the location), for the POS Operator filter. */
  async operators(query: OperatorsQueryDto) {
    const groups = await this.prisma.restaurantOrder.groupBy({
      by: ['createdBy'],
      where: {
        createdBy: { not: null },
        source: OrderSource.COUNTER,
        ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      },
    });
    const names = await userNames(
      this.prisma,
      groups.map((group) => group.createdBy),
    );

    return {
      items: [...names]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** QR orders the guest paid for but that could not be billed: each to refund at the counter. */
  async paidNotBilled(query: OperatorsQueryDto) {
    const orders = await this.prisma.qrOrder.findMany({
      include: {
        onlinePayment: {
          select: { amount: true, paidAt: true, paidReference: true, provider: true },
        },
        restaurant: { select: { restaurantName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        status: QrOrderStatus.PAID_NOT_BILLED,
        ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      },
    });

    return {
      items: orders.map((order) => ({
        amount: toNumber(order.onlinePayment.amount),
        channel: order.channel,
        createdAt: order.createdAt,
        id: order.id,
        paidAt: order.onlinePayment.paidAt,
        paymentReference: order.onlinePayment.paidReference,
        provider: order.onlinePayment.provider,
        reason: order.failureReason,
        restaurantName: order.restaurant.restaurantName,
        roomNumber: order.roomNumber,
      })),
    };
  }

  /** One bill with its lines, for the invoice: the POS's own, without a till. */
  bill(id: string) {
    return this.pos.detail(id);
  }

  async amendments(query: ListAmendmentsQueryDto) {
    const { limit, page } = getPagination(query);
    const search = query.search?.trim();
    const where: Prisma.OrderAmendmentWhereInput = {
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(search
        ? {
            OR: [
              { order: { billNumber: { contains: search, mode: 'insensitive' } } },
              { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
              { remarks: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      limit
        ? this.prisma.orderAmendment.findMany({
            include: { order: { select: { billNumber: true, id: true, orderNumber: true } } },
            orderBy: [{ amendedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * limit,
            take: limit,
            where,
          })
        : Promise.resolve([]),
      this.prisma.orderAmendment.count({ where }),
    ]);
    const names = await userNames(
      this.prisma,
      rows.map((row) => row.amendedBy),
    );

    return {
      items: rows.map((row) => {
        const before = row.oldValue as { paymentMode?: PaymentMode; paymentReference?: string };
        const after = row.newValue as { paymentMode?: PaymentMode; paymentReference?: string };

        return {
          amendedAt: row.amendedAt,
          amendedByName: row.amendedBy ? (names.get(row.amendedBy) ?? null) : null,
          billNumber: row.order.billNumber,
          fromPaymentMode: before.paymentMode ?? null,
          fromPaymentReference: before.paymentReference ?? null,
          id: row.id,
          orderId: row.order.id,
          orderNumber: row.order.orderNumber,
          remarks: row.remarks,
          toPaymentMode: after.paymentMode ?? null,
          toPaymentReference: after.paymentReference ?? null,
          type: row.type,
        };
      }),
      meta: getPageMeta(page, limit, total),
    };
  }

  /**
   * Bills of the last 48 hours with this order number (it repeats each day and per counter, so
   * there may be several) or bill number, each with why it cannot be amended, if it cannot.
   */
  async findAmendable(query: FindAmendableQueryDto) {
    const q = query.q.trim();
    const orders = await this.prisma.restaurantOrder.findMany({
      orderBy: { placedAt: 'desc' },
      select: reportSelect,
      take: 20,
      where: {
        OR: [{ billNumber: { equals: q, mode: 'insensitive' } }, { orderNumber: q }],
        placedAt: { gte: new Date(Date.now() - AMEND_WINDOW_MS) },
        source: OrderSource.COUNTER,
        ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      },
    });
    const rows = await this.toRows(orders);
    const now = new Date();

    return {
      items: rows.map((row) => ({
        ...row,
        refusal: billRefusal({ ...row, onlinePaid: row.online }, now),
      })),
    };
  }

  /** Changes a bill's payment mode, with remarks; the bill and its amendment in one go. */
  async amend(id: string, dto: CreateAmendmentDto, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({
        select: reportSelect,
        where: { id, source: OrderSource.COUNTER },
      });

      if (!order) throw new NotFoundException('Bill not found.');

      // Two admins amending at once: the second sees the first's change.
      await lockRow(tx, 'restaurant_orders', id);
      const current = await tx.restaurantOrder.findUniqueOrThrow({
        select: { hospitalId: true, paymentMode: true, paymentReference: true, status: true },
        where: { id },
      });
      const erpSent = Boolean(
        order.businessDate &&
        (await tx.erpPosting.findFirst({
          select: { id: true },
          where: {
            businessDate: order.businessDate,
            restaurantId: order.restaurantId,
            status: ErpPostingStatus.SUCCESS,
          },
        })),
      );
      const refusal = amendRefusal(
        {
          erpSent,
          isComplimentary: order.isComplimentary,
          onlinePaid: onlinePaidAt(order) !== null,
          paymentMode: current.paymentMode,
          paymentReference: current.paymentReference,
          placedAt: order.placedAt,
          status: current.status,
        },
        dto,
        new Date(),
      );

      if (refusal) throw new ConflictException(refusal);

      const before = {
        paymentMode: current.paymentMode,
        paymentReference: current.paymentReference,
      };
      const after = {
        paymentMode: dto.paymentMode,
        paymentReference: referenceFor(dto.paymentMode, dto.paymentReference),
      };
      const remarks = dto.remarks.trim();

      await tx.restaurantOrder.update({
        data: { ...after, updatedBy: context.actorId },
        where: { id },
      });
      const amendment = await tx.orderAmendment.create({
        data: {
          amendedBy: context.actorId,
          hospitalId: current.hospitalId,
          newValue: after,
          oldValue: before,
          orderId: id,
          remarks,
          type: OrderAmendmentType.PAYMENT_MODE,
        },
      });
      await this.auditLog.record(
        {
          action: 'AMEND',
          actorId: context.actorId,
          entityId: id,
          entityName: 'restaurant_orders',
          ipAddress: context.ipAddress,
          newValue: { ...after, remarks },
          oldValue: before,
        },
        tx,
      );

      return { id: amendment.id, orderId: id, ...after };
    });
  }
}
