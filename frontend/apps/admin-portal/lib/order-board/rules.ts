import type { BoardFeed, BoardOrder } from '@aahar/api-client';

export type { BoardFeed, BoardOrder };

/** A ready order is kept this long at the counter (shown in the footer). */
export const HOLD_MINUTES = 15;
/** After this long ready, a tile turns amber: "n min · collect soon". */
export const COLLECT_SOON_MINUTES = 10;
/** How many tiles fit before the last one becomes "+N more". */
export const READY_SLOTS = 8;
export const PREPARING_SLOTS = 9;

const MINUTE = 60_000;

export interface ReadyTileView extends BoardOrder {
  collectSoon: boolean;
  readyMinutes: number;
}

export interface PreparingTileView extends BoardOrder {
  etaMinutes: number;
}

export interface BoardView {
  /** The most recent ready order, in the banner. */
  nowReady: ReadyTileView | null;
  preparing: PreparingTileView[];
  preparingMore: number;
  preparingTotal: number;
  ready: ReadyTileView[];
  readyMore: number;
  readyTotal: number;
}

/** Whole minutes from `iso` to `now`, never negative. */
export function minutesSince(iso: string | undefined, now: number): number {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / MINUTE)) : 0;
}

/** Whole minutes from `now` until `iso`, at least 1 ("~1 min" while it is due). */
export function minutesUntil(iso: string | undefined, now: number): number {
  return iso ? Math.max(1, Math.ceil((Date.parse(iso) - now) / MINUTE)) : 1;
}

/** Shows what fits; past `slots`, the last place becomes "+N more" so the board never scrolls. */
export function fit<T>(items: T[], slots: number): { more: number; shown: T[] } {
  return items.length <= slots
    ? { more: 0, shown: items }
    : { more: items.length - (slots - 1), shown: items.slice(0, slots - 1) };
}

/**
 * What the board shows at `now` (the server's clock): the newest ready order in the banner,
 * the other ready orders newest first, and the orders being prepared soonest first.
 */
export function boardView(orders: BoardOrder[], now: number): BoardView {
  const ready = orders
    .filter((order) => order.status === 'READY')
    .sort((a, b) => Date.parse(b.readyAt ?? '') - Date.parse(a.readyAt ?? ''))
    .map((order) => {
      const readyMinutes = minutesSince(order.readyAt, now);

      return { ...order, collectSoon: readyMinutes >= COLLECT_SOON_MINUTES, readyMinutes };
    });
  const preparing = orders
    .filter((order) => order.status === 'PREPARING')
    .sort(
      (a, b) =>
        (Date.parse(a.estimatedReadyAt ?? '') || Infinity) -
        (Date.parse(b.estimatedReadyAt ?? '') || Infinity),
    )
    .map((order) => ({ ...order, etaMinutes: minutesUntil(order.estimatedReadyAt, now) }));
  const [nowReady = null, ...otherReady] = ready;
  const readyFit = fit(otherReady, READY_SLOTS);
  const preparingFit = fit(preparing, PREPARING_SLOTS);

  return {
    nowReady,
    preparing: preparingFit.shown,
    preparingMore: preparingFit.more,
    preparingTotal: preparing.length,
    ready: readyFit.shown,
    readyMore: readyFit.more,
    readyTotal: ready.length,
  };
}
