import {
  CounterShiftStatus,
  InventoryLocationType,
  OrderStatus,
  type CounterShift,
  type PaymentMode,
  type Prisma,
} from '@prisma/client';
import { siteInstant } from '../restaurant-orders/board-schedule';
import { toNumber } from '../common/values';
import { isInSchedule } from './pos-pricing';

type Client = Pick<
  Prisma.TransactionClient,
  'counterDayClose' | 'counterShift' | 'item' | 'stockBalance' | 'user'
>;

export interface ShiftTiming {
  endTime: string;
  name: string;
  startTime: string;
}

const cash = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));

/** Money summed from bills, kept to paise. */
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** The fixed shift `now` falls in by site time (one ending before it starts runs past midnight). */
export function fixedShiftAt(timings: readonly ShiftTiming[], now: Date): string | null {
  return (
    timings.find((timing) =>
      isInSchedule({ days: [], from: timing.startTime, to: timing.endTime }, now),
    )?.name ?? null
  );
}

/** Takings of counter bills: by payment mode, with complimentary and cancelled bills kept apart. */
export function tally(
  orders: Array<{
    grandTotal: Prisma.Decimal | null;
    isComplimentary: boolean;
    paymentMode: PaymentMode | null;
    status: OrderStatus;
  }>,
) {
  const byMode = new Map<string, { amount: number; count: number }>();
  const complimentary = { amount: 0, count: 0 };
  const cancelled = { amount: 0, count: 0 };
  let sales = 0;
  let bills = 0;

  for (const order of orders) {
    const amount = cash(order.grandTotal) ?? 0;
    const bucket =
      order.status === OrderStatus.CANCELLED
        ? cancelled
        : order.isComplimentary
          ? complimentary
          : undefined;

    if (bucket) {
      bucket.amount += amount;
      bucket.count += 1;
      continue;
    }

    const mode = order.paymentMode ?? 'OTHER';
    const entry = byMode.get(mode) ?? { amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    byMode.set(mode, entry);
    sales += amount;
    bills += 1;
  }

  return {
    bills,
    byPaymentMode: [...byMode].map(([mode, entry]) => ({ mode, ...entry })),
    cancelled,
    complimentary,
    sales,
  };
}

export async function userNames(client: Client, ids: Array<string | null>) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const users = wanted.length
    ? await client.user.findMany({
        select: { id: true, name: true },
        where: { id: { in: wanted } },
      })
    : [];

  return new Map(users.map((user) => [user.id, user.name]));
}

export async function toShiftViews(client: Client, shifts: CounterShift[]) {
  const names = await userNames(
    client,
    shifts.flatMap((shift) => [shift.openedBy, shift.closedBy]),
  );

  return shifts.map((shift) => ({
    closedAt: shift.closedAt,
    closedByName: shift.closedBy ? (names.get(shift.closedBy) ?? null) : null,
    counterId: shift.counterId,
    countedCash: cash(shift.countedCash),
    expectedCash: cash(shift.expectedCash),
    handoverStock: shift.handoverStock,
    id: shift.id,
    name: shift.name,
    note: shift.note,
    openedAt: shift.openedAt,
    openedBy: shift.openedBy,
    openedByName: names.get(shift.openedBy) ?? null,
    openingCash: toNumber(shift.openingCash),
    status: shift.status,
    summary: shift.summary,
    takenOverFromId: shift.takenOverFromId,
  }));
}

/**
 * Per counter: its open shift, a handed-over shift still waiting for the next cashier (its cash
 * and stock are theirs to take on), and whether the business day `today` is closed there.
 */
export async function shiftStates(client: Client, counterIds: string[], today: Date) {
  const [shifts, closes] = await Promise.all([
    client.counterShift.findMany({
      orderBy: { openedAt: 'desc' },
      where: {
        counterId: { in: counterIds },
        OR: [
          { status: CounterShiftStatus.OPEN },
          { status: CounterShiftStatus.HANDED_OVER, takenOverBy: { is: null } },
        ],
      },
    }),
    client.counterDayClose.findMany({
      select: { counterId: true },
      where: { businessDate: today, counterId: { in: counterIds } },
    }),
  ]);
  const views = await toShiftViews(client, shifts);
  const closed = new Set(closes.map((close) => close.counterId));
  const latest = (counterId: string, status: CounterShiftStatus) =>
    views.find((view) => view.counterId === counterId && view.status === status) ?? null;

  return new Map(
    counterIds.map((id) => [
      id,
      {
        dayClosed: closed.has(id),
        handover: latest(id, CounterShiftStatus.HANDED_OVER),
        open: latest(id, CounterShiftStatus.OPEN),
      },
    ]),
  );
}

/** A counter's shifts that opened on the site day `date`, and any still open. */
export async function shiftsOn(client: Client, counterId: string, date: string) {
  const shifts = await client.counterShift.findMany({
    orderBy: { openedAt: 'asc' },
    where: {
      counterId,
      OR: [
        {
          openedAt: {
            gte: new Date(siteInstant(date, '00:00')),
            lt: new Date(siteInstant(date, '00:00', 1)),
          },
        },
        { status: CounterShiftStatus.OPEN },
      ],
    },
  });

  return toShiftViews(client, shifts);
}

/** What the counter holds now, per item: passed on to the next cashier at a handover. */
export async function counterStockNow(client: Client, counterId: string) {
  const balances = await client.stockBalance.groupBy({
    _sum: { availableQty: true },
    by: ['itemId'],
    where: {
      availableQty: { gt: 0 },
      deletedAt: null,
      locationId: counterId,
      locationType: InventoryLocationType.COUNTER,
    },
  });
  const items = await client.item.findMany({
    select: { id: true, itemName: true },
    where: { id: { in: balances.map((balance) => balance.itemId) } },
  });
  const names = new Map(items.map((item) => [item.id, item.itemName]));

  return balances
    .map((balance) => ({
      itemId: balance.itemId,
      itemName: names.get(balance.itemId) ?? '',
      quantity: toNumber(balance._sum.availableQty ?? 0),
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}
