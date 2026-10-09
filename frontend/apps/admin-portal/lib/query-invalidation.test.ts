import type { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import * as invalidation from './query-invalidation';

// Which cached lists each write refreshes. A missing key here means a screen keeps showing stale
// stock or totals after a save, so the query-key work has to keep every one of these.
test('each write invalidates the same query keys', () => {
  const keysFor = (invalidate: (client: QueryClient) => void) => {
    const keys: unknown[] = [];
    invalidate({
      invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
        keys.push(queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient);
    return keys;
  };

  expect(
    Object.fromEntries(Object.entries(invalidation).map(([name, fn]) => [name, keysFor(fn)])),
  ).toEqual({
    invalidateEmployeeQueries: [['employees'], ['dashboard', 'employees']],
    invalidateGrnQueries: [
      ['grns'],
      ['stock-balances'],
      ['stock-ledgers'],
      ['transfer-store-stock'],
      ['dashboard'],
    ],
    invalidateItemCategoryQueries: [
      ['item-categories'],
      ['item-category-options'],
      ['items'],
      ['item-options'],
    ],
    invalidateItemQueries: [['items'], ['item-options'], ['dashboard', 'items']],
    invalidateKitchenProductionQueries: [
      ['kitchen-productions'],
      ['kitchen-stock'],
      ['kitchen-stock-ledgers'],
      ['transfer-kitchen-stock'],
      ['dashboard'],
    ],
    invalidateKitchenQueries: [
      ['kitchens'],
      ['kitchen-options'],
      ['inventory-kitchens'],
      ['inventory-all-kitchens'],
      ['kitchen-kitchens'],
    ],
    invalidateTransferQueries: [
      ['transfers'],
      ['transfer-acknowledgements'],
      ['stock-balances'],
      ['stock-ledgers'],
      ['kitchen-stock'],
      ['restaurant-stock'],
      ['transfer-store-stock'],
      ['transfer-kitchen-stock'],
      ['dashboard'],
    ],
  });
});
