import { ApiClientError } from '@aahar/api-client';
import { QueryClient } from '@tanstack/react-query';
import { liveQueueKeys, masterDataKeys } from '@/lib/query-keys';

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          if (error instanceof ApiClientError && [401, 403, 404].includes(error.status)) {
            return false;
          }

          return failureCount < 1;
        },
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
