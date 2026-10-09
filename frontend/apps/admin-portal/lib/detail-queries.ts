import { queryOptions } from '@tanstack/react-query';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// Detail queries shared by the page that shows a record and the list link that leads to it, so
// a prefetch from the list fills exactly the cache entry the page reads.

export const restaurantDetailQuery = (restaurantId: string | undefined) =>
  queryOptions({
    queryFn: async () => {
      const response = await organizationApi.getRestaurant(restaurantId!);

      return response.data;
    },
    queryKey: queryKeys.restaurant(restaurantId),
  });

export const transferDetailQuery = (transferId: string) =>
  queryOptions({
    queryFn: async () => (await organizationApi.getTransfer(transferId)).data,
    queryKey: queryKeys.transfers('detail', transferId),
  });

/**
 * Props for a link to a detail page: start loading the record when the pointer rests on the link
 * or it gets keyboard focus, so it is usually there by the time the page opens. A fresh cached
 * copy is not fetched again.
 */
export function prefetchOnIntent(prefetch: () => Promise<void>) {
  const run = () => void prefetch();

  return { onFocus: run, onMouseEnter: run };
}
