import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Dev-only Prisma query counting, for measuring query budgets and N+1s: with
 * PRISMA_QUERY_LOG=1 (refused when NODE_ENV=production) each request's `http_request` log line
 * gains `prismaQueries`. Off, nothing is registered and nothing is counted.
 */
const counter = new AsyncLocalStorage<{ queries: number }>();

/** A query slower than this logs a `slow_query` warning with its SQL text (never its parameters). */
const SLOW_QUERY_MS = 300;

export function isQueryLogEnabled(): boolean {
  return process.env.PRISMA_QUERY_LOG === '1' && process.env.NODE_ENV !== 'production';
}

/**
 * Slow-query warnings are on outside production. A deploy that runs with NODE_ENV=production
 * but is not production (staging, the `dev` namespace) turns them on with PRISMA_SLOW_QUERY_LOG=1.
 */
export function isSlowQueryLogEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.PRISMA_SLOW_QUERY_LOG === '1';
}

/** PrismaClient options that make it emit query events, when counting or slow-query warnings are on. */
export function prismaQueryLogOptions(): { log?: [{ emit: 'event'; level: 'query' }] } {
  return isQueryLogEnabled() || isSlowQueryLogEnabled()
    ? { log: [{ emit: 'event', level: 'query' }] }
    : {};
}

/** Counts the client's queries against the request that issued them, and warns on slow ones. */
export function countPrismaQueries(client: object): void {
  const slowQueryLog = isSlowQueryLogEnabled();

  if (!isQueryLogEnabled() && !slowQueryLog) {
    return;
  }

  type QueryEvent = { duration: number; query: string };
  (client as { $on(event: 'query', callback: (event: QueryEvent) => void): void }).$on(
    'query',
    (event) => {
      const store = counter.getStore();

      if (store) {
        store.queries += 1;
      }

      if (slowQueryLog && event.duration > SLOW_QUERY_MS) {
        console.warn(
          JSON.stringify({
            durationMs: Math.round(event.duration),
            event: 'slow_query',
            query: event.query.slice(0, 1000),
          }),
        );
      }
    },
  );
}

/** Runs `next` with a fresh per-request count; returns the store, or null when counting is off. */
export function startQueryCount(next: () => void): { queries: number } | null {
  if (!isQueryLogEnabled()) {
    next();
    return null;
  }

  const store = { queries: 0 };
  counter.run(store, next);

  return store;
}
