import type { QrGuest, QrOrderView } from '@aahar/api-client';
import { withBasePath } from './base-path';

export type StepState = 'done' | 'now' | 'todo';

/** Kitchen statuses in order; an order at one has passed every one before it. */
const kitchenOrder = ['PLACED', 'PREPARING', 'READY', 'COLLECTED'] as const;

type Progress = Pick<
  QrOrderView,
  'channel' | 'kitchenStatus' | 'roomNumber' | 'status' | 'tableName'
>;

/** The last step's words: delivered to a bed, served at a table, or collected. */
function handedOver(order: Progress, pickup: boolean): string {
  if (pickup) return 'Collected';
  if (order.channel === 'TABLE') return order.tableName ? `Served at ${order.tableName}` : 'Served';

  return order.roomNumber ? `Delivered to ${order.roomNumber}` : 'Delivered';
}

/** Paid → being prepared → ready → delivered (served, or collected), as far as it has gone. */
export function progressSteps(order: Progress): Array<{ label: string; state: StepState }> {
  const reached = kitchenOrder.indexOf(
    (order.kitchenStatus ?? 'PLACED') as (typeof kitchenOrder)[number],
  );
  const billed = order.status === 'BILLED';
  // Being prepared from PLACED or PREPARING, ready at READY, delivered at COLLECTED.
  const at = billed ? Math.max(1, reached) : 0;
  const states = [1, 2, 3].map((step): StepState =>
    at > step || (step === 3 && at === 3) ? 'done' : at === step ? 'now' : 'todo',
  );

  const pickup = order.channel === 'COUNTER';

  return [
    { label: 'Paid', state: billed ? 'done' : 'now' },
    { label: 'Being prepared', state: states[0]! },
    {
      label: pickup
        ? 'Ready to collect at the counter'
        : order.channel === 'TABLE'
          ? 'Ready, coming to your table'
          : 'Ready',
      state: states[1]!,
    },
    { label: handedOver(order, pickup), state: states[2]! },
  ];
}

/** Nothing more will change: the page stops checking. */
export function isSettled(order: Pick<QrOrderView, 'kitchenStatus' | 'status'>): boolean {
  return (
    order.status === 'CLOSED' ||
    order.status === 'PAID_NOT_BILLED' ||
    order.kitchenStatus === 'COLLECTED' ||
    order.kitchenStatus === 'CANCELLED'
  );
}

/** Where the order is now, in a word or two: the list of orders on this phone. */
export function orderStatus(order: Progress): string {
  if (order.status === 'AWAITING_PAYMENT') return 'Waiting for payment';
  if (order.status === 'CLOSED') return 'Not paid';
  if (order.status === 'PAID_NOT_BILLED') return 'Paid, not placed';
  if (order.kitchenStatus === 'CANCELLED') return 'Cancelled';

  return (
    progressSteps(order)
      .filter((step) => step.state !== 'todo')
      .at(-1)?.label ?? 'Paid'
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "07:00" → "7:00 am", "19:30" → "7:30 pm": a restaurant's opening time as people say it. */
export function clockLabel(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);

  return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? 'am' : 'pm'}`;
}

/** A moment in India time ("10:42 am"), whatever time zone the phone is set to. */
export function timeOf(iso: string): string {
  // ponytail: a fixed +5:30; India keeps no daylight saving.
  const india = new Date(Date.parse(iso) + 330 * 60_000);

  return clockLabel(`${india.getUTCHours()}:${india.getUTCMinutes()}`);
}

/** "Ready in 25–40 min", from a restaurant's quickest and slowest dish. */
export function readyLabel(minutes: { max: number; min: number }): string {
  return minutes.min === minutes.max
    ? `Ready in about ${minutes.max} min`
    : `Ready in ${minutes.min}–${minutes.max} min`;
}

/**
 * This page's address with only its link secret (and, from a room's QR, the room and the way
 * back to its restaurants; from a table's QR, the table): the server adds the order and its key.
 */
export function returnUrlFor(href: string): string {
  const url = new URL(href);
  const kept = ['token', 'room', 'roomId', 'table', 'tableId'].flatMap((name) => {
    const value = url.searchParams.get(name);
    return value ? [[name, value] as const] : [];
  });

  url.search = '';
  for (const [name, value] of kept) url.searchParams.set(name, value);

  return url.toString();
}

const savedKey = (restaurantId: string) => `aahar:qr-order:${restaurantId}`;

/** The order this phone placed here last, so coming back from the payment page finds it. */
export function savedOrder(restaurantId: string): { id: string; key: string } | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(savedKey(restaurantId)) ?? 'null') as {
      id?: unknown;
      key?: unknown;
    } | null;

    return typeof saved?.id === 'string' && typeof saved.key === 'string'
      ? { id: saved.id, key: saved.key }
      : null;
  } catch {
    return null;
  }
}

export function saveOrder(restaurantId: string, order: { id: string; key: string } | null) {
  try {
    if (order) window.localStorage.setItem(savedKey(restaurantId), JSON.stringify(order));
    else window.localStorage.removeItem(savedKey(restaurantId));
  } catch {
    // Private browsing: the order link in the address still works.
  }
}

const ordersKey = 'aahar:qr-orders';
/** ponytail: the last 20 on this phone; older ones drop off the list (their links still work). */
const KEPT_ORDERS = 20;

/** Every order placed from this phone, newest first: "My Orders". */
export function myOrders(): Array<{ id: string; key: string }> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(ordersKey) ?? '[]') as unknown;

    return Array.isArray(saved)
      ? (saved as Array<{ id?: unknown; key?: unknown } | null>).flatMap((order) =>
          typeof order?.id === 'string' && typeof order.key === 'string'
            ? [{ id: order.id, key: order.key }]
            : [],
        )
      : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: { id: string; key: string }) {
  try {
    const others = myOrders().filter((saved) => saved.id !== order.id);
    window.localStorage.setItem(
      ordersKey,
      JSON.stringify([{ id: order.id, key: order.key }, ...others].slice(0, KEPT_ORDERS)),
    );
  } catch {
    // Private browsing: the order's own page still shows it.
  }
}

const guestKey = 'aahar:qr-guest';

/** The guest signed in on this phone (name and mobile, confirmed by OTP); none once it lapses. */
export function guestSession(): QrGuest | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(guestKey) ?? 'null') as Partial<
      Record<keyof QrGuest, unknown>
    > | null;

    return typeof saved?.guestToken === 'string' &&
      typeof saved.name === 'string' &&
      typeof saved.mobile === 'string' &&
      typeof saved.expiresAt === 'string' &&
      Date.parse(saved.expiresAt) > Date.now()
      ? {
          expiresAt: saved.expiresAt,
          guestToken: saved.guestToken,
          mobile: saved.mobile,
          name: saved.name,
        }
      : null;
  } catch {
    return null;
  }
}

export function saveGuestSession(guest: QrGuest | null) {
  try {
    if (guest) window.localStorage.setItem(guestKey, JSON.stringify(guest));
    else window.localStorage.removeItem(guestKey);
  } catch {
    // Private browsing: they confirm their number again next time.
  }
}

/** This site's address as a phone can reach it (in development, this PC's network address). */
export async function fetchQrOrigin(): Promise<string> {
  const response = await fetch(withBasePath('/api/qr-origin'), { cache: 'no-store' });

  if (!response.ok) throw new Error('Could not determine a phone-reachable site address.');

  return ((await response.json()) as { origin: string }).origin;
}
