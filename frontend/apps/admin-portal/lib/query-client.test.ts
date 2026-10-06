import { ApiClientError } from '@aahar/api-client';
import { expect, test } from 'vitest';
import { createQueryClient } from './query-client';
import { queryKeys } from './query-keys';

const staleTimeOf = (queryKey: readonly unknown[]) =>
  createQueryClient().defaultQueryOptions({ queryKey }).staleTime;

test('master data lists stay fresh 5 minutes, live queues 15 s, everything else 30 s', () => {
  expect(staleTimeOf(queryKeys.restaurantOptions('hospital-1'))).toBe(300_000);
  expect(staleTimeOf(queryKeys.itemOptions('MRP', 'rice'))).toBe(300_000);
  expect(staleTimeOf(queryKeys.dashboardQueue('transfers', 'all'))).toBe(15_000);
  expect(staleTimeOf(queryKeys.transfersViewCounts('7d'))).toBe(15_000);
  expect(staleTimeOf(queryKeys.transfers({ page: 1 }))).toBe(30_000);
  // Not invalidated when the masters change, so not lengthened.
  expect(staleTimeOf(queryKeys.inventoryStores())).toBe(30_000);
});

test('retries once, never on 401, 403 or 404, and never refetches on focus', () => {
  const options = createQueryClient().defaultQueryOptions({ queryKey: ['x'] });
  const retry = options.retry as (count: number, error: unknown) => boolean;
  expect(options.refetchOnWindowFocus).toBe(false);
  expect(retry(0, new Error('network'))).toBe(true);
  expect(retry(1, new Error('network'))).toBe(false);
  for (const status of [401, 403, 404]) {
    expect(retry(0, new ApiClientError(status, 'x'))).toBe(false);
  }
});
