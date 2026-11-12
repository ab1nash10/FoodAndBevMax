import type { QrOrderView } from '@aahar/api-client';

export type StepState = 'done' | 'now' | 'todo';

/** Kitchen statuses in order; an order at one has passed every one before it. */
const kitchenOrder = ['PLACED', 'PREPARING', 'READY', 'COLLECTED'] as const;

/** Paid → being prepared → ready → delivered (or collected), as far as the order has gone. */
export function progressSteps(
  order: Pick<QrOrderView, 'channel' | 'kitchenStatus' | 'roomNumber' | 'status'>,
): Array<{ label: string; state: StepState }> {
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
    { label: pickup ? 'Ready to collect at the counter' : 'Ready', state: states[1]! },
    {
      label: pickup
        ? 'Collected'
        : order.roomNumber
          ? `Delivered to Room ${order.roomNumber}`
          : 'Delivered',
      state: states[2]!,
    },
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

/** This page's address with only its link secret: the server adds the order and its key. */
export function returnUrlFor(href: string): string {
  const url = new URL(href);
  const token = url.searchParams.get('token');

  url.search = '';
  if (token) url.searchParams.set('token', token);

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
