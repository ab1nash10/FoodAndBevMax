import { ApiClientError } from '@aahar/api-client';
import { QueryClient } from '@tanstack/react-query';
import { liveQueueKeys, masterDataKeys } from '@/lib/query-keys';

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

  return client;
}
