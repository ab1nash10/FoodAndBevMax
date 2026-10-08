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

test('keeps trying for about a minute while a service is starting, not after a timeout', () => {
  const options = createQueryClient().defaultQueryOptions({ queryKey: ['x'] });
  const retry = options.retry as (count: number, error: unknown) => boolean;
  const retryDelay = options.retryDelay as (attempt: number) => number;
  const refused = new ApiClientError(0, 'x', new TypeError('Failed to fetch'));

  for (const error of [refused, new ApiClientError(502, 'x'), new ApiClientError(503, 'x')]) {
    expect(retry(11, error)).toBe(true);
    expect(retry(12, error)).toBe(false);
  }
  expect(retry(1, new ApiClientError(0, 'timed out'))).toBe(false);
  expect(retry(1, new ApiClientError(500, 'x'))).toBe(false);
  const totalWait = Array.from({ length: 12 }, (_, attempt) => retryDelay(attempt)).reduce(
    (sum, delay) => sum + delay,
  );
  expect(totalWait).toBeGreaterThan(45_000);
  expect(totalWait).toBeLessThan(75_000);
});
