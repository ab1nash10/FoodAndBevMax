import { ApiClientError } from '@aahar/api-client';
import { keepPreviousData } from '@tanstack/react-query';
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
  // The inventory and kitchen screens' pickers are master data too (refreshed on master edits).
  expect(staleTimeOf(queryKeys.storeOptions('inventory', 'hospital-1'))).toBe(300_000);
  expect(staleTimeOf(queryKeys.kitchenOptions('kitchen', 'hospital-1'))).toBe(300_000);
});

test("a till's counters stay fresh 2 minutes: every shift action refreshes them anyway", () => {
  expect(staleTimeOf(queryKeys.posCounters('till-1'))).toBe(120_000);
});

test('lists keep their rows while the next page loads; records never show another record', () => {
  const placeholderOf = (queryKey: readonly unknown[]) =>
    createQueryClient().defaultQueryOptions({ queryKey }).placeholderData;

  expect(placeholderOf(queryKeys.grns(1, '', '', '', '', 'desc'))).toBe(keepPreviousData);
  expect(placeholderOf(queryKeys.transfers(2, 'all'))).toBe(keepPreviousData);
  expect(placeholderOf(queryKeys.employees({ page: 1 }))).toBe(keepPreviousData);
  expect(placeholderOf(queryKeys.grns('detail', 'grn-1'))).toBeUndefined();
  expect(placeholderOf(queryKeys.transfers('detail', 'transfer-1'))).toBeUndefined();
  expect(placeholderOf(queryKeys.items('detail', 'item-1'))).toBeUndefined();
  expect(placeholderOf(queryKeys.kitchenProductions('detail', 'p-1'))).toBeUndefined();
  expect(placeholderOf(queryKeys.stockLedgers('movements', 's-1', 'i-1', 14))).toBeUndefined();
  expect(placeholderOf(queryKeys.posBill('bill-1'))).toBeUndefined();
  expect(placeholderOf(queryKeys.restaurant('r-1'))).toBeUndefined();
  // The list default does not undo the live queue's shorter staleTime.
  expect(staleTimeOf(queryKeys.transfersViewCounts('7d'))).toBe(15_000);
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
