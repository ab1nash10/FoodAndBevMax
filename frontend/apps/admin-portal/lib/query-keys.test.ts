import { expect, test } from 'vitest';
import { queryKeys } from './query-keys';

test('builders give the same arrays the literal keys were', () => {
  expect(queryKeys.hospitalOptions()).toEqual(['hospital-options']);
  expect(queryKeys.transfers('detail', 'id-1')).toEqual(['transfers', 'detail', 'id-1']);
  expect(queryKeys.itemOptions('MRP', 'rice')).toEqual(['item-options', 'MRP', 'rice']);
  expect(queryKeys.dashboardStats('grns', 7, 'all')).toEqual([
    'dashboard',
    'stats',
    'grns',
    7,
    'all',
  ]);
  expect(queryKeys.dashboard('items')).toEqual(['dashboard', 'items']);
});

// The prefixes are what cache sharing and invalidation match on: renaming one silently splits
// a cache or leaves a screen stale after a save.
test('every prefix stays as it is', () => {
  expect(
    Object.fromEntries(Object.entries(queryKeys).map(([name, build]) => [name, build()])),
  ).toMatchSnapshot();
});
