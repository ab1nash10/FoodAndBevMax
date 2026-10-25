'use client';

import { useQuery } from '@tanstack/react-query';
import type { InventoryLocationType } from '@aahar/api-client';
import { organizationApi } from '@/lib/api';
import { optionalValue } from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

function useStoreStock(storeId?: string) {
  return useQuery({
    enabled: Boolean(storeId),
    queryFn: async () => {
      const response = await organizationApi.listStockBalances({
        itemType: 'MRP',
        limit: 100,
        locationId: storeId,
        locationType: 'STORE',
        sortBy: 'expiryDate',
        sortOrder: 'asc',
      });

      return response.data.items.filter((stock) => stock.availableQty > 0);
    },
    queryKey: queryKeys.transferStoreStock(storeId),
  });
}

function useKitchenStock(kitchenId?: string, businessDate?: string) {
  return useQuery({
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const businessDateFilter = optionalValue(businessDate ?? '');
      const response = await organizationApi.listKitchenStock({
        ...(businessDateFilter ? { businessDate: businessDateFilter } : {}),
        itemType: 'READYMADE',
        limit: 100,
        locationId: kitchenId,
        sortBy: 'lastUpdatedOn',
        sortOrder: 'desc',
      });

      return response.data.items.filter((stock) => stock.availableQty > 0);
    },
    queryKey: queryKeys.transferKitchenStock(kitchenId, optionalValue(businessDate ?? '')),
  });
}

/** A restaurant's ready-made leftovers, to pass on to another restaurant. */
function useRestaurantStock(restaurantId?: string, businessDate?: string) {
  return useQuery({
    enabled: Boolean(restaurantId),
    queryFn: async () => {
      const businessDateFilter = optionalValue(businessDate ?? '');
      const response = await organizationApi.listRestaurantStock({
        ...(businessDateFilter ? { businessDate: businessDateFilter } : {}),
        itemType: 'READYMADE',
        limit: 100,
        locationId: restaurantId,
        sortBy: 'lastUpdatedOn',
        sortOrder: 'desc',
      });

      return response.data.items.filter((stock) => stock.availableQty > 0);
    },
    queryKey: queryKeys.restaurantStock('transfer-source', restaurantId, businessDate ?? ''),
  });
}

export function useSourceStock(
  sourceType: InventoryLocationType,
  sourceId?: string,
  businessDate?: string,
) {
  const storeStock = useStoreStock(sourceType === 'STORE' ? sourceId : undefined);
  const kitchenStock = useKitchenStock(
    sourceType === 'KITCHEN' ? sourceId : undefined,
    businessDate,
  );
  const restaurantStock = useRestaurantStock(
    sourceType === 'RESTAURANT' ? sourceId : undefined,
    businessDate,
  );

  return sourceType === 'KITCHEN'
    ? kitchenStock
    : sourceType === 'RESTAURANT'
      ? restaurantStock
      : storeStock;
}
