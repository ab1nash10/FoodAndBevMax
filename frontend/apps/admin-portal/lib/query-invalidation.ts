import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

function invalidate(queryClient: QueryClient, keys: QueryKey[]): void {
  keys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey });
  });
}

export function invalidateItemCategoryQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.itemCategories(), queryKeys.itemCategoryOptions()]);
}

export function invalidateItemQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.items(),
    queryKeys.itemOptions(),
    queryKeys.dashboard('items'),
  ]);
}

export function invalidateItemPriceQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.itemPrices()]);
}

export function invalidateEmployeeQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.employees(), queryKeys.dashboard('employees')]);
}

export function invalidateGrnQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.grns(),
    queryKeys.stockBalances(),
    queryKeys.stockLedgers(),
    queryKeys.transferStoreStock(),
    queryKeys.dashboard(),
  ]);
}

export function invalidateTransferQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.transfers(),
    queryKeys.transferAcknowledgements(),
    queryKeys.stockBalances(),
    queryKeys.stockLedgers(),
    queryKeys.kitchenStock(),
    queryKeys.restaurantStock(),
    queryKeys.transferStoreStock(),
    queryKeys.transferKitchenStock(),
    queryKeys.dashboard(),
  ]);
}

export function invalidateKitchenProductionQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.kitchenProductions(),
    queryKeys.kitchenStock(),
    queryKeys.kitchenStockLedgers(),
    queryKeys.transferKitchenStock(),
    queryKeys.dashboard(),
  ]);
}
