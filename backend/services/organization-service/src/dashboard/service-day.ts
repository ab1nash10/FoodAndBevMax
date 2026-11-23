import type { OrderChannel } from '@prisma/client';

/** How a bill reached the counter, for the Dashboard's channel mix. */
export type ChannelKey = 'COUNTER' | 'KIOSK' | 'QR' | 'ROOM' | 'TABLE';

/** A day's counter bill, slimmed to what the Dashboard's numbers read. */
export interface DayBill {
  at: Date;
  channel: OrderChannel | null;
  counterId: string | null;
  grandTotal: number;
  /** Ordered at a kiosk, billed at the counter. */
  kiosk: boolean;
  /** Ordered on a phone by QR. */
  qr: boolean;
  shiftId: string | null;
}

export interface OpenShift {
  cashier: string | null;
  counterId: string;
  counterName: string;
  id: string;
  openedAt: Date;
  restaurantName: string;
}

const IST_OFFSET_MS = 330 * 60_000;
const channelOrder: ChannelKey[] = ['COUNTER', 'KIOSK', 'QR', 'ROOM', 'TABLE'];
const money = (value: number) => Math.round(value * 100) / 100;

/** The hour (0–23) of a moment in India time. */
export const istHour = (at: Date) => new Date(at.getTime() + IST_OFFSET_MS).getUTCHours();

/** The day (YYYY-MM-DD) of a moment in India time. */
export const istDay = (at: Date) =>
  new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Room and table come first (where it is served), then how it was ordered. */
export function channelOf(bill: DayBill): ChannelKey {
  if (bill.channel === 'ROOM' || bill.channel === 'TABLE') return bill.channel;
  if (bill.qr) return 'QR';
  if (bill.kiosk) return 'KIOSK';

  return 'COUNTER';
}

export function totalsOf(bills: DayBill[]) {
  const sales = money(bills.reduce((sum, bill) => sum + bill.grandTotal, 0));

  return {
    averageBill: bills.length ? money(sales / bills.length) : 0,
    bills: bills.length,
    roomOrders: bills.filter((bill) => bill.channel === 'ROOM').length,
    sales,
  };
}

/** What a day is compared with: the same weekday a week before, or the day before. */
export type CompareWith = 'day' | 'week';

/** The business day (YYYY-MM-DD) a day is compared with. */
export function compareDay(day: string, compare: CompareWith): string {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(Date.UTC(year!, month! - 1, date! - (compare === 'day' ? 1 : 7)))
    .toISOString()
    .slice(0, 10);
}

/** Each hour of the day (India time): bills and sales on the day and on the day compared with. */
export function salesByHour(today: DayBill[], compared: DayBill[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    bills: 0,
    compareBills: 0,
    compareSales: 0,
    hour,
    sales: 0,
  }));

  for (const bill of today) {
    const row = hours[istHour(bill.at)]!;
    row.bills += 1;
    row.sales += bill.grandTotal;
  }
  for (const bill of compared) {
    const row = hours[istHour(bill.at)]!;
    row.compareBills += 1;
    row.compareSales += bill.grandTotal;
  }

  return hours.map((row) => ({
    ...row,
    compareSales: money(row.compareSales),
    sales: money(row.sales),
  }));
}

/** Bills and sales per channel, every channel listed, the busiest first. */
export function channelMix(bills: DayBill[]) {
  const rows = channelOrder.map((key) => ({ bills: 0, key, sales: 0 }));

  for (const bill of bills) {
    const row = rows.find((each) => each.key === channelOf(bill))!;
    row.bills += 1;
    row.sales += bill.grandTotal;
  }

  return rows
    .map((row) => ({ ...row, sales: money(row.sales) }))
    .sort((a, b) => b.bills - a.bills || channelOrder.indexOf(a.key) - channelOrder.indexOf(b.key));
}

/** A kitchen ticket's dishes from an order's stored [{ name, quantity }] list. */
export function itemSummary(items: unknown): string {
  return Array.isArray(items)
    ? items
        .filter(
          (item): item is { name: string; quantity: number } =>
            Boolean(item) && typeof item === 'object' && 'name' in item,
        )
        .map((item) => `${item.name} ×${Number(item.quantity) || 1}`)
        .join(' · ')
    : '';
}

/** Where an order goes: a room and bed, a table, or its counter. */
export function whereServed(order: {
  bedNumber: string | null;
  counter?: { counterName: string } | null;
  roomNumber: string | null;
  tableName: string | null;
}): string {
  if (order.roomNumber) {
    return `Room ${order.roomNumber}${order.bedNumber ? `, bed ${order.bedNumber}` : ''}`;
  }
  if (order.tableName) return `Table ${order.tableName}`;

  return order.counter?.counterName ?? 'Counter';
}

/**
 * Counters now: each open shift with what it billed, then the counters that billed today and
 * have closed (their day's takings).
 */
export function counterRows(
  bills: DayBill[],
  shifts: OpenShift[],
  closedNames: Map<string, { counterName: string; restaurantName: string }>,
) {
  const open = shifts.map((shift) => {
    const mine = bills.filter((bill) => bill.shiftId === shift.id);

    return {
      bills: mine.length,
      cashier: shift.cashier,
      counterId: shift.counterId,
      counterName: shift.counterName,
      open: true,
      openedAt: shift.openedAt.toISOString(),
      restaurantName: shift.restaurantName,
      sales: money(mine.reduce((sum, bill) => sum + bill.grandTotal, 0)),
    };
  });
  const openCounters = new Set(shifts.map((shift) => shift.counterId));
  const closed = [...closedNames]
    .filter(([counterId]) => !openCounters.has(counterId))
    .map(([counterId, names]) => {
      const mine = bills.filter((bill) => bill.counterId === counterId);

      return {
        bills: mine.length,
        cashier: null,
        counterId,
        counterName: names.counterName,
        open: false,
        openedAt: null,
        restaurantName: names.restaurantName,
        sales: money(mine.reduce((sum, bill) => sum + bill.grandTotal, 0)),
      };
    });

  return [...open, ...closed];
}
