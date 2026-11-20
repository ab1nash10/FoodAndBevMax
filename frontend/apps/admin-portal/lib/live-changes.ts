'use client';

import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { changesUrl } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Live changes: every save made anywhere (another tab, another till, another admin) reaches this
// screen at once. The organization service streams the names of the areas that changed
// (GET /changes, server-sent events); this screen refetches what it shows of them.

const billKeys = [
  queryKeys.posBills(),
  queryKeys.posBill(),
  queryKeys.posSummary(),
  queryKeys.posMenu(),
  queryKeys.counterStock(),
  queryKeys.restaurantOrders(),
  queryKeys.stockLedgers(),
  queryKeys.kioskMenu(),
  queryKeys.orderBoard(),
  ['qr-menu'],
  queryKeys.orderReports(),
  queryKeys.dashboard(),
];
const stockKeys = [
  queryKeys.stockBalances(),
  queryKeys.stockLedgers(),
  queryKeys.restaurantStock(),
  queryKeys.kitchenStock(),
  queryKeys.kitchenStockLedgers(),
  queryKeys.counterStock(),
  queryKeys.transferStoreStock(),
  queryKeys.transferKitchenStock(),
  queryKeys.posMenu(),
  queryKeys.dashboard(),
];
const grnKeys = [queryKeys.grns(), queryKeys.grnEntries(), ...stockKeys];
const transferKeys = [queryKeys.transfers(), queryKeys.transferAcknowledgements(), ...stockKeys];

/**
 * The busy areas, written all day by tills, kiosks, guests and kitchens: each refreshes only what
 * its writes change, so a bill at one till does not reload every list on every screen. Every
 * other area is setup (locations, entities, items, menus, prices, restaurants, users, roles):
 * rarely written, and its names and settings show on many screens, so everything refreshes.
 */
const busyAreas: Record<string, QueryKey[]> = {
  counters: [queryKeys.posCounters(), queryKeys.counters(), queryKeys.dashboard()],
  erp: grnKeys,
  'erp-postings': [queryKeys.erpPostings()],
  'grn-entries': grnKeys,
  grns: grnKeys,
  'kitchen-productions': [
    queryKeys.kitchenProductions(),
    queryKeys.kitchenProductionItems(),
    queryKeys.kitchenStock(),
    queryKeys.kitchenStockLedgers(),
    queryKeys.transferKitchenStock(),
    queryKeys.dashboard(),
  ],
  kiosk: billKeys,
  'order-reports': [...billKeys, queryKeys.orderAmendments()],
  pos: billKeys,
  qr: billKeys,
  rooms: [queryKeys.rooms()],
  'stock-discards': stockKeys,
  'transfer-acknowledgements': transferKeys,
  transfers: transferKeys,
};

/** Refetches what this screen shows of the changed areas ("*": everything). */
export async function applyChanges(client: QueryClient, areas: readonly string[]): Promise<void> {
  // cancelRefetch false: the screen that made the save is already refetching; it is not restarted.
  const options = { cancelRefetch: false };

  if (areas.some((area) => !(area in busyAreas))) {
    await client.invalidateQueries(undefined, options);
    return;
  }

  const keys = new Set(areas.flatMap((area) => busyAreas[area] ?? []));
  await Promise.all([...keys].map((queryKey) => client.invalidateQueries({ queryKey }, options)));
}

/** The areas in each complete event of `buffer`, and what is left of a partly received one. */
export function takeEvents(buffer: string): { areas: string[]; rest: string } {
  const events = buffer.split('\n\n');
  const rest = events.pop() ?? '';
  const areas = events.flatMap((event) =>
    event
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .flatMap((line) => {
        try {
          const parsed: unknown = JSON.parse(line.slice('data: '.length));
          return Array.isArray(parsed) ? parsed.filter((area) => typeof area === 'string') : [];
        } catch {
          return [];
        }
      }),
  );

  return { areas, rest };
}

// Notices from several services and processes arrive together: one refresh for the burst.
const BURST_MS = 100;
// A bulk edit or an import saves many times a second: every screen refreshes once a second at most.
const MIN_REFRESH_GAP_MS = 1000;

/** How long to wait before refreshing: the burst window, or the rest of the second since the last. */
export function refreshDelay(now: number, lastRefreshAt: number): number {
  return Math.max(BURST_MS, lastRefreshAt + MIN_REFRESH_GAP_MS - now);
}

/**
 * The wait before reconnecting, spread over half to one and a half times the backoff: screens
 * cut off together (a deploy) then come back, and refresh, spread out instead of all at once.
 */
export function reconnectDelay(retryMs: number, random = Math.random()): number {
  return Math.floor(retryMs * (0.5 + random));
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Holds this screen's one connection to GET /changes for as long as the app is open. */
export function LiveChanges(): null {
  const client = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefreshAt = 0;

    const queue = (areas: string[]) => {
      areas.forEach((area) => pending.add(area));
      timer ??= setTimeout(
        () => {
          timer = undefined;
          lastRefreshAt = Date.now();
          const batch = [...pending];
          pending.clear();
          void applyChanges(client, batch);
        },
        refreshDelay(Date.now(), lastRefreshAt),
      );
    };

    void (async () => {
      let retryMs = 1000;
      let dropped = false;

      while (!controller.signal.aborted) {
        try {
          const response = await fetch(changesUrl, {
            cache: 'no-store',
            signal: controller.signal,
          });
          // 204: live changes are off here (tests that wait for an idle network); stop asking.
          if (response.status === 204) return;
          if (!response.ok || !response.body) throw new Error(`changes ${response.status}`);
          // Saves made while this screen was cut off were never heard: refresh everything once.
          if (dropped) queue(['*']);
          retryMs = 1000;

          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const { areas, rest } = takeEvents(buffer + value);
            buffer = rest;
            if (areas.length > 0) queue(areas);
          }
        } catch {
          // Offline, a deploy, or the page closing: retried below unless it closed.
        }

        dropped = true;
        await wait(reconnectDelay(retryMs), controller.signal);
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client]);

  return null;
}
