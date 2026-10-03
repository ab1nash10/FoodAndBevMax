import type { QueryClient } from '@tanstack/react-query';

function invalidate(queryClient: QueryClient, queryKeys: unknown[][]): void {
  queryKeys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey });
  });
}

export function invalidateItemCategoryQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [['item-categories'], ['item-category-options']]);
}

export function invalidateItemQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [['items'], ['item-options'], ['dashboard', 'items']]);
}

export function invalidateItemPriceQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [['item-prices']]);
}

export function invalidateEmployeeQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [['employees'], ['dashboard', 'employees']]);
}

export function invalidateGrnQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    ['grns'],
    ['stock-balances'],
    ['stock-ledgers'],
    ['transfer-store-stock'],
    ['dashboard'],
  ]);
}

export function invalidateTransferQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    ['transfers'],
    ['transfer-acknowledgements'],
    ['stock-balances'],
    ['stock-ledgers'],
    ['kitchen-stock'],
    ['restaurant-stock'],
    ['transfer-store-stock'],
    ['transfer-kitchen-stock'],
    ['dashboard'],
  ]);
}

export function invalidateKitchenProductionQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    ['kitchen-productions'],
    ['kitchen-stock'],
    ['kitchen-stock-ledgers'],
    ['transfer-kitchen-stock'],
    ['dashboard'],
  ]);
}
