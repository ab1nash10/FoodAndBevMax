import { ApiClientError } from '@aahar/api-client';
import { keepPreviousData, QueryClient } from '@tanstack/react-query';
import { liveQueueKeys, masterDataKeys, queryKeys } from '@/lib/query-keys';

// The lists behind the busiest pages: while a filter, search or page change loads, the current
// rows stay on screen instead of skeletons.
export const listKeys = [
  queryKeys.accessUsers(),
  queryKeys.employees(),
  queryKeys.grns(),
  queryKeys.hospitals(),
  queryKeys.items(),
  queryKeys.kitchenProductions(),
  queryKeys.kitchenStock(),
  queryKeys.kitchens(),
  queryKeys.legalEntities(),
  queryKeys.paymentMachines(),
  queryKeys.posBills(),
  queryKeys.posDevices(),
  queryKeys.restaurantMenus(),
  queryKeys.restaurantStock(),
  queryKeys.restaurants(),
  queryKeys.stockBalances(),
  queryKeys.stockLedgers(),
  queryKeys.stores(),
  queryKeys.transfers(),
];

// Under those prefixes but about one record (or one store, item or kitchen): another id must
// never show the previous one's data.
export const recordKeys = [
  queryKeys.grns('detail'),
  queryKeys.grns('vendor-history'),
  queryKeys.grns('vendors'),
  queryKeys.items('detail'),
  queryKeys.kitchenProductions('detail'),
  queryKeys.kitchenProductionsToday(),
  queryKeys.stockLedgers('movements'),
  queryKeys.transfers('detail'),
  queryKeys.transfersRecentToRestaurant(),
];

// A service that is starting (a restart or a deploy) refuses the connection or answers 502-504.
// A timeout also has status 0 but no payload: each try has already waited its full timeout.
export function isServiceUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    ((error.status === 0 && error.payload !== undefined) || [502, 503, 504].includes(error.status))
  );
}

// About a minute in all over 12 tries: 1, 2 and 4 s, then every 5 s.
export const serviceRetryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 5000);
export const serviceRetries = 12;

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        refetchOnWindowFocus: false,
        // While a service is starting, keep trying for about a minute: the page keeps showing
        // its loading state instead of errors, and loads as soon as the service answers.
        retry(failureCount, error) {
          if (isServiceUnavailable(error)) {
            return failureCount < serviceRetries;
          }

          if (error instanceof ApiClientError && [401, 403, 404].includes(error.status)) {
            return false;
          }

          return failureCount < 1;
        },
        retryDelay: serviceRetryDelay,
        staleTime: 30_000,
      },
    },
  });

  // Matched by key prefix; a query that sets its own staleTime keeps it.
  masterDataKeys.forEach((queryKey) =>
    client.setQueryDefaults(queryKey, { staleTime: 5 * 60_000 }),
  );
  liveQueueKeys.forEach((queryKey) => client.setQueryDefaults(queryKey, { staleTime: 15_000 }));
  // Asked by every POS screen (8 queries each); opening, handing over or ending a shift
  // refreshes it, so only another till's shift change can show up to 2 minutes late.
  client.setQueryDefaults(queryKeys.posCounters(), { staleTime: 2 * 60_000 });
  // Every matching prefix applies in this order, so the record keys undo the list default.
  listKeys.forEach((queryKey) =>
    client.setQueryDefaults(queryKey, { placeholderData: keepPreviousData }),
  );
  recordKeys.forEach((queryKey) =>
    client.setQueryDefaults(queryKey, { placeholderData: undefined }),
  );

  return client;
}
