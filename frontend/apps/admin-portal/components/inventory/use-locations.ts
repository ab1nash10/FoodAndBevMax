'use client';

import type { InventoryLocationType } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { organizationApi } from '@/lib/api';
import { locationHref } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';

// Every active store, kitchen and restaurant, for turning a transfer's location ids into names.
// ponytail: first 100 of each, the API's page cap; page through if a group outgrows it.

function useAllStores(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const response = await organizationApi.listStores({
        isActive: true,
        limit: 100,
        sortBy: 'storeName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.inventoryAllStores(),
  });
}

function useAllKitchens(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.inventoryAllKitchens(),
  });
}

function useAllRestaurants(enabled = true) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.inventoryAllRestaurants(),
  });
}

const typeLabels: Record<InventoryLocationType, string> = {
  COUNTER: 'Counter',
  KITCHEN: 'Kitchen',
  RESTAURANT: 'Restaurant',
  STORE: 'Store',
};

/**
 * Name of a store, kitchen or restaurant by id. Lists the user may not view are not fetched,
 * and an unknown id falls back to its type ("Store"), never a raw id.
 */
export function useLocationNames(
  hasPermission: (permission: string | string[]) => boolean,
): (type: InventoryLocationType, id: string) => string {
  const stores = useAllStores(hasPermission('STORE_VIEW')).data;
  const kitchens = useAllKitchens(hasPermission('KITCHEN_VIEW')).data;
  const restaurants = useAllRestaurants(hasPermission('RESTAURANT_VIEW')).data;

  return useMemo(() => {
    const names = new Map<string, string>([
      ...(stores ?? []).map((store): [string, string] => [store.id, store.storeName]),
      ...(kitchens ?? []).map((kitchen): [string, string] => [kitchen.id, kitchen.kitchenName]),
      ...(restaurants ?? []).map((restaurant): [string, string] => [
        restaurant.id,
        restaurant.restaurantName,
      ]),
    ]);

    return (type, id) => names.get(id) ?? typeLabels[type];
  }, [kitchens, restaurants, stores]);
}

/** A location's page by type and id (searched by its code), or null until it is known. */
export function useLocationHrefs(
  hasPermission: (permission: string | string[]) => boolean,
): (type: InventoryLocationType, id: string) => string | null {
  const stores = useAllStores(hasPermission('STORE_VIEW')).data;
  const kitchens = useAllKitchens(hasPermission('KITCHEN_VIEW')).data;
  const restaurants = useAllRestaurants(hasPermission('RESTAURANT_VIEW')).data;

  return useMemo(() => {
    const searches = new Map<string, string>([
      ...(stores ?? []).map((store): [string, string] => [
        store.id,
        store.storeCode || store.storeName,
      ]),
      ...(kitchens ?? []).map((kitchen): [string, string] => [
        kitchen.id,
        kitchen.kitchenCode || kitchen.kitchenName,
      ]),
      ...(restaurants ?? []).map((restaurant): [string, string] => [
        restaurant.id,
        restaurant.restaurantCode || restaurant.restaurantName,
      ]),
    ]);

    return (type, id) => {
      const search = searches.get(id);

      return search ? locationHref(type, search) : null;
    };
  }, [kitchens, restaurants, stores]);
}
