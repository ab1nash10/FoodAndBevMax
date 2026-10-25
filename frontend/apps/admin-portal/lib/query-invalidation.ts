import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

function invalidate(queryClient: QueryClient, keys: QueryKey[]): void {
  keys.forEach((queryKey) => {
    void queryClient.invalidateQueries({ queryKey });
  });
}

/** Time slots: their list and the slot picker on restaurant menu items. */
export function invalidateTimeSlotQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.timeSlots()]);
}

export function invalidateItemCategoryQueries(queryClient: QueryClient): void {
  // Items carry their category's name and status, so their lists and pickers refresh too.
  invalidate(queryClient, [
    queryKeys.itemCategories(),
    queryKeys.itemCategoryOptions(),
    queryKeys.items(),
    queryKeys.itemOptions(),
  ]);
}

/** Every kitchen list: the Kitchens page, the pickers, and the inventory, kitchen and menu forms. */
export function invalidateKitchenQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.kitchens(),
    queryKeys.kitchenOptions(),
    queryKeys.inventoryKitchens(),
    queryKeys.locationNames(),
    queryKeys.kitchenKitchens(),
  ]);
}

export function invalidateLegalEntityQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.legalEntities(), queryKeys.legalEntityOptions()]);
}

export function invalidateItemQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.items(), queryKeys.itemOptions(), queryKeys.dashboardSetup()]);
}

export function invalidateEmployeeQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [queryKeys.employees(), queryKeys.dashboardSetup()]);
}

/** A discard lowers one batch wherever it is held, and adds a ledger line. */
export function invalidateStockDiscardQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.stockBalances(),
    queryKeys.stockLedgers(),
    queryKeys.restaurantStock(),
    queryKeys.kitchenStock(),
    queryKeys.kitchenStockLedgers(),
    queryKeys.counterStock(),
    queryKeys.transferStoreStock(),
    queryKeys.transferKitchenStock(),
    queryKeys.dashboard(),
  ]);
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
    queryKeys.counterStock(),
    queryKeys.posMenu(),
    queryKeys.transferStoreStock(),
    queryKeys.transferKitchenStock(),
    queryKeys.dashboard(),
  ]);
}

/** A bill made or cancelled: the bill lists, the day's takings, the kitchen queue and stock. */
export function invalidatePosBillQueries(queryClient: QueryClient): void {
  invalidate(queryClient, [
    queryKeys.posBills(),
    queryKeys.posBill(),
    queryKeys.posSummary(),
    queryKeys.posMenu(),
    queryKeys.counterStock(),
    queryKeys.restaurantOrders(),
    queryKeys.stockLedgers(),
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
