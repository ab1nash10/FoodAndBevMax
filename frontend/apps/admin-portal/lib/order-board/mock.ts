import type { BoardFeed, BoardOrder } from './rules';

/** One simulated event (an order turns ready, collections, a new order) this often. */
export const MOCK_STEP_MS = 4000;
const MINUTE = 60_000;

interface SimOrder extends BoardOrder {
  collectAt?: number;
}

/**
 * A moving pickup board for demos (?demo=1) and tests: orders turn ready every few seconds,
 * are collected and new ones arrive, so every state shows: the banner, collect soon (one ready
 * order is left waiting), "+N more" when it gets busy. Steady state, so it never grows.
 */
export function createBoardSimulation(start = Date.now(), random: () => number = Math.random) {
  let kioskNumber = 136;
  let counterNumber = 51;
  let last = start;
  let stepCount = 0;
  const orders: SimOrder[] = [];

  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T;
  const newOrder = (now: number, etaMinutes: number): SimOrder => {
    const fromKiosk = random() < 0.7;
    const number = fromKiosk ? (kioskNumber += 1) : (counterNumber += 1);

    return {
      counterName: pick(['Counter 1', 'Counter 2']),
      estimatedReadyAt: new Date(now + etaMinutes * MINUTE).toISOString(),
      itemCount: 1 + Math.floor(random() * 4),
      orderNumber: `${fromKiosk ? 'A' : 'C'} ${String(number).padStart(3, '0')}`,
      serviceType: random() < 0.6 ? 'DINE_IN' : 'TAKE_AWAY',
      status: 'PREPARING',
    };
  };
  const markReady = (order: SimOrder, at: number, waitMs: number) => {
    order.status = 'READY';
    order.readyAt = new Date(at).toISOString();
    order.collectAt = at + waitMs;
    delete order.estimatedReadyAt;
  };

  // The opening picture: a busy lunch, one order left waiting past "collect soon".
  for (let index = 0; index < 9; index += 1) orders.push(newOrder(start, 2 + index * 1.5));
  [0.5, 2, 4, 6, 7, 11].forEach((minutes, index) => {
    const order = newOrder(start, 0);
    markReady(order, start - minutes * MINUTE, minutes === 11 ? 20 * MINUTE : (index + 1) * 9000);
    orders.push(order);
  });

  function step(at: number) {
    stepCount += 1;
    // Collected orders leave the board.
    for (let index = orders.length - 1; index >= 0; index -= 1) {
      if ((orders[index]?.collectAt ?? Infinity) <= at) orders.splice(index, 1);
    }
    // The soonest order turns ready; now and then one is left waiting a long time.
    const next = orders
      .filter((order) => order.status === 'PREPARING')
      .sort(
        (a, b) => Date.parse(a.estimatedReadyAt ?? '') - Date.parse(b.estimatedReadyAt ?? ''),
      )[0];
    if (next) markReady(next, at, stepCount % 12 === 0 ? 12 * MINUTE : (12 + random() * 20) * 1000);
    // A new order arrives, more of them now and then, so "+N more" shows.
    const arrivals = stepCount % 15 < 3 ? 2 : 1;
    for (let index = 0; index < arrivals; index += 1) {
      if (orders.filter((order) => order.status === 'PREPARING').length < 14) {
        orders.push(newOrder(at, 2 + random() * 12));
      }
    }
  }

  return {
    feed(now: number): BoardFeed {
      while (last + MOCK_STEP_MS <= now) {
        last += MOCK_STEP_MS;
        step(last);
      }

      return {
        helpCounterName: 'Counter 1',
        isOpen: true,
        locationName: 'Main Cafeteria · Max Saket',
        orders: orders.map(({ collectAt: _collectAt, ...order }) => ({ ...order })),
        restaurantName: 'AAHAR Café',
        serverTime: new Date(now).toISOString(),
        slotEndsAt: new Date(start + 2 * 60 * MINUTE).toISOString(),
        slotName: 'Lunch',
      };
    },
  };
}
