'use client';

import type { InventoryLocationType, LocationNames } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { organizationApi } from '@/lib/api';
import { locationHref } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';

// Every active store, kitchen, restaurant and counter the user may list, by id, name and code:
// one light request (GET /dashboard/location-names) instead of four full lists, shared by every
// screen that turns a location id into a name or a link. A kind the user may not view is absent.
const locationNamesQuery = {
  queryFn: async (): Promise<LocationNames> => (await organizationApi.getLocationNames()).data,
  queryKey: queryKeys.locationNames(),
};

const anyLocationView = ['STORE_VIEW', 'KITCHEN_VIEW', 'RESTAURANT_VIEW', 'COUNTER_VIEW'];

/** Every active counter (one shared request: location names and the dashboard read the same cache). */
export function useAllCounters(enabled = true) {
  return useQuery({
    ...locationNamesQuery,
    enabled,
    select: (names) => names.counters ?? [],
  });
}

const typeLabels: Record<InventoryLocationType, string> = {
  COUNTER: 'Counter',
  KITCHEN: 'Kitchen',
  RESTAURANT: 'Restaurant',
  STORE: 'Store',
};

/**
 * Name of a store, kitchen, restaurant or counter by id. Kinds the user may not view are not
 * returned, and an unknown id falls back to its type ("Store"), never a raw id.
 */
export function useLocationNames(
  hasPermission: (permission: string | string[]) => boolean,
): (type: InventoryLocationType, id: string) => string {
  const names = useQuery({ ...locationNamesQuery, enabled: hasPermission(anyLocationView) }).data;

  return useMemo(() => {
    const byId = new Map<string, string>([
      ...(names?.stores ?? []).map((store): [string, string] => [store.id, store.storeName]),
      ...(names?.kitchens ?? []).map((kitchen): [string, string] => [
        kitchen.id,
        kitchen.kitchenName,
      ]),
      ...(names?.restaurants ?? []).map((restaurant): [string, string] => [
        restaurant.id,
        restaurant.restaurantName,
      ]),
      ...(names?.counters ?? []).map((counter): [string, string] => [
        counter.id,
        `${counter.restaurant.restaurantName} · ${counter.counterName}`,
      ]),
    ]);

    return (type, id) => byId.get(id) ?? typeLabels[type];
  }, [names]);
}

/** A location's page by type and id (searched by its code), or null until it is known. */
export function useLocationHrefs(
  hasPermission: (permission: string | string[]) => boolean,
): (type: InventoryLocationType, id: string) => string | null {
  const names = useQuery({ ...locationNamesQuery, enabled: hasPermission(anyLocationView) }).data;

  return useMemo(() => {
    const searches = new Map<string, string>([
      ...(names?.stores ?? []).map((store): [string, string] => [
        store.id,
        store.storeCode || store.storeName,
      ]),
      ...(names?.kitchens ?? []).map((kitchen): [string, string] => [
        kitchen.id,
        kitchen.kitchenCode || kitchen.kitchenName,
      ]),
      ...(names?.restaurants ?? []).map((restaurant): [string, string] => [
        restaurant.id,
        restaurant.restaurantCode || restaurant.restaurantName,
      ]),
    ]);

    return (type, id) => {
      const search = searches.get(id);

      return search ? locationHref(type, search) : null;
    };
  }, [names]);
}
