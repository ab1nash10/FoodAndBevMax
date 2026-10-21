'use client';

import { useQueryClient, type FetchQueryOptions } from '@tanstack/react-query';
import { useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { todayInIndia } from '@/components/point-of-sale/shared';
import { organizationApi } from '@/lib/api';
import { canOpenPath } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';

// The first page each busy list opens on: the same key and request as the page's own useQuery
// with no filters in the URL, so a prefetch fills exactly the entry the page reads. Keep each
// in step with its page. Only the cheap first page: never stats, rows or records.
// Skipped: the dashboard and Stock Levels load a whole period or location rather than a page,
// and POS Orders depends on the counter picked on this device.
const listLimit = 10;

type FirstView = (scopedHospitalId: string | undefined) => FetchQueryOptions;

const firstViews: Record<string, FirstView> = {
  '/inventory/grns': (scopedHospitalId) => {
    const hospitalId = scopedHospitalId ?? '';

    return {
      queryFn: async () =>
        (
          await organizationApi.listGrns({
            hospitalId,
            limit: listLimit,
            page: 1,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          })
        ).data,
      queryKey: queryKeys.grns(1, '', hospitalId, '', '', 'desc'),
    };
  },
  '/inventory/store-stock': (scopedHospitalId) => {
    const hospitalId = scopedHospitalId ?? '';

    return {
      queryFn: async () =>
        (
          await organizationApi.listStoreStockSummaries({
            hospitalId,
            limit: listLimit,
            locationType: 'STORE',
            page: 1,
            sortBy: 'lastUpdatedOn',
            sortOrder: 'desc',
          })
        ).data,
      queryKey: queryKeys.stockBalances(
        1,
        '',
        hospitalId,
        '',
        '',
        '',
        '',
        '',
        'lastUpdatedOn',
        'desc',
      ),
    };
  },
  '/inventory/transfers': (scopedHospitalId) => {
    const hospitalId = scopedHospitalId ?? '';

    return {
      queryFn: async () =>
        (
          await organizationApi.listTransfers({
            destinationType: 'RESTAURANT',
            hospitalId: hospitalId || undefined,
            limit: listLimit,
            page: 1,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          })
        ).data,
      queryKey: queryKeys.transfers(1, '', hospitalId, '', '', '', '', '', '', 'desc'),
    };
  },
  '/kitchen/productions': (scopedHospitalId) => {
    const hospitalId = scopedHospitalId ?? '';

    return {
      queryFn: async () =>
        (
          await organizationApi.listKitchenProductions({
            hospitalId,
            limit: listLimit,
            page: 1,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          })
        ).data,
      queryKey: queryKeys.kitchenProductions(1, '', hospitalId, '', '', 'desc'),
    };
  },
  '/masters/employees': (scopedHospitalId) => ({
    queryFn: async () =>
      (
        await organizationApi.listEmployees({
          hospitalId: scopedHospitalId,
          limit: listLimit,
          page: 1,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: queryKeys.employees({
      activeFilter: '',
      discountFilter: '',
      page: 1,
      scope: scopedHospitalId ?? 'all',
      search: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
  }),
  // Items are not scoped to a location, and open 25 rows at a time.
  '/masters/items': () => ({
    queryFn: async () =>
      (
        await organizationApi.listItems({
          limit: 25,
          page: 1,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: queryKeys.items({
      activeFilter: '',
      foodTypeFilter: '',
      kindFilter: '',
      page: 1,
      pageSize: 25,
      search: '',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
  }),
  // Today's bills, as Bill History opens.
  '/pos/history': (scopedHospitalId) => {
    const today = todayInIndia();

    return {
      queryFn: async () =>
        (
          await organizationApi.listPosBills({
            from: today,
            hospitalId: scopedHospitalId,
            limit: listLimit,
            page: 1,
            sortBy: 'placedAt',
            sortOrder: 'desc',
            to: today,
          })
        ).data,
      queryKey: queryKeys.posBills(
        false,
        scopedHospitalId,
        '',
        today,
        today,
        '',
        '',
        '',
        '',
        1,
        'placedAt',
        'desc',
      ),
    };
  },
};

const intentDelayMs = 100;

/**
 * Props for a menu link that start loading its page's first view on intent: the pointer resting
 * on it for 100 ms (passing over does nothing) or keyboard focus. Only pages the user may open,
 * and a list still fresh in the cache (its staleTime) is not asked for again.
 */
export function usePrefetchOnIntent() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const timer = useRef<number | undefined>(undefined);

  return (href: string) => {
    const firstView = firstViews[href];

    if (!firstView) {
      return {};
    }

    // Until the location is known the page's key is not either.
    const prefetch = () => {
      if (!isLoadingLocations && canOpenPath(href, hasPermission)) {
        void queryClient.prefetchQuery(firstView(scopedHospitalId));
      }
    };

    return {
      onFocus: prefetch,
      onPointerEnter: () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(prefetch, intentDelayMs);
      },
      onPointerLeave: () => window.clearTimeout(timer.current),
    };
  };
}
