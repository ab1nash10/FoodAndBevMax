'use client';

import type {
  ApiList,
  ApiResponse,
  HospitalSummary,
  KitchenProduction,
  StockBalance,
  Transfer,
} from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { useEntityTotal } from '@/components/organization/shared/hooks';
import { organizationApi } from '@/lib/api';
import {
  dashboardMode,
  insights,
  locationRows,
  pendingStats,
  periodWindow,
  setupSteps,
  transferStats,
  vendorRows,
  wastageStats,
  type Period,
} from '@/lib/dashboard-stats';
import { canOpenPath } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';

/** Period stats change slowly; the work queue keeps the app's default 30s. */
const STATS_STALE_MS = 60_000;
/** ponytail: up to 10 pages of 100 per source; a summary endpoint when a period outgrows it. */
const MAX_PAGES = 10;
const EXPIRY_WINDOW_DAYS = 7;

interface Fetched<T> {
  items: T[];
  /** More records exist than were fetched (MAX_PAGES), so the numbers are a lower bound. */
  truncated: boolean;
}

/** Page 1, then the remaining pages in parallel (one round trip after the first). */
async function fetchAll<T>(
  fetchPage: (page: number) => Promise<ApiResponse<ApiList<T>>>,
): Promise<Fetched<T>> {
  const first = (await fetchPage(1)).data;
  const pages = Math.min(first.meta.totalPages, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      fetchPage(index + 2).then((response) => response.data.items),
    ),
  );
  const items = [first.items, ...rest].flat();

  return { items, truncated: first.meta.total > items.length };
}

function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const iso = (time: number) => new Date(time).toISOString();

/**
 * Everything the dashboard shows for a period, scoped to the top-bar location. Each source is
 * one query (keys under ['dashboard'], so the app's invalidation after a GRN, transfer or
 * production refreshes it), fired in parallel and only when the user may view it; the numbers
 * are derived with useMemo from the fetched records.
 */
export function useDashboardStats(period: Period) {
  const { scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const scope = scopedHospitalId ?? 'all';
  const hospitalId = scopedHospitalId;
  // Each part shows only for the view permission its API requires (the backend's @Permissions),
  // so a hidden part is never fetched and a role without it never gets 403s or stuck zeros.
  const can = {
    employees: hasPermission('EMPLOYEE_VIEW'),
    grns: hasPermission('GRN_VIEW'),
    hospitals: hasPermission('HOSPITAL_VIEW'),
    itemPrices: hasPermission('ITEM_PRICE_VIEW'),
    items: hasPermission('ITEM_VIEW'),
    kitchenItems: hasPermission('KITCHEN_ITEM_VIEW'),
    kitchens: hasPermission('KITCHEN_VIEW'),
    menus: hasPermission('RESTAURANT_MENU_VIEW'),
    productions: hasPermission('KITCHEN_PRODUCTION_VIEW'),
    restaurants: hasPermission('RESTAURANT_VIEW'),
    stock: hasPermission('STOCK_VIEW'),
    storeItems: hasPermission('STORE_ITEM_VIEW'),
    stores: hasPermission('STORE_VIEW'),
    timeSlots: hasPermission('TIME_SLOT_VIEW'),
    transfers: hasPermission(['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW']),
  };

  // ---- Period records: this period and the one before (for deltas).
  const transfersQuery = useQuery({
    enabled: can.transfers,
    queryFn: () => {
      const window = periodWindow(period, new Date());

      return fetchAll((page) =>
        organizationApi.listTransfers({
          fromDate: iso(window.prevStart),
          hospitalId,
          limit: 100,
          page,
          sortBy: 'transferDate',
          sortOrder: 'desc',
        }),
      );
    },
    queryKey: queryKeys.dashboardStats('transfers', period, scope),
    staleTime: STATS_STALE_MS,
  });
  const productionsQuery = useQuery({
    enabled: can.productions,
    queryFn: () => {
      const window = periodWindow(period, new Date());

      return fetchAll((page) =>
        organizationApi.listKitchenProductions({
          fromDate: iso(window.prevStart),
          hospitalId,
          limit: 100,
          page,
          sortBy: 'productionDate',
          sortOrder: 'desc',
          status: 'POSTED',
        }),
      );
    },
    queryKey: queryKeys.dashboardStats('productions', period, scope),
    staleTime: STATS_STALE_MS,
  });
  const grnsQuery = useQuery({
    enabled: can.grns,
    queryFn: () => {
      const window = periodWindow(period, new Date());

      return fetchAll((page) =>
        organizationApi.listGrns({
          fromDate: iso(window.start),
          hospitalId,
          limit: 100,
          page,
          sortBy: 'receivedDate',
          sortOrder: 'desc',
          status: 'POSTED_TO_STOCK',
        }),
      );
    },
    queryKey: queryKeys.dashboardStats('grns', period, scope),
    staleTime: STATS_STALE_MS,
  });

  // ---- Right now: the work queue (oldest first), recent activity and expiring stock.
  const pendingTransfersQuery = useQuery({
    enabled: can.transfers,
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          hospitalId,
          limit: 50,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          status: 'PENDING_ACKNOWLEDGEMENT',
        })
      ).data,
    queryKey: queryKeys.dashboardQueue('transfers', scope),
  });
  const grnsToVerifyQuery = useQuery({
    enabled: can.grns,
    queryFn: async () =>
      (
        await organizationApi.listGrns({
          hospitalId,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          // GRNs stay DRAFT until verified and posted; the API never sets UNDER_VERIFICATION.
          status: 'DRAFT',
        })
      ).data,
    queryKey: queryKeys.dashboardQueue('grns-to-verify', scope),
  });
  const draftProductionsQuery = useQuery({
    enabled: can.productions,
    queryFn: async () =>
      (
        await organizationApi.listKitchenProductions({
          hospitalId,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          status: 'DRAFT',
        })
      ).data,
    queryKey: queryKeys.dashboardQueue('productions', scope),
  });
  // TODO(api): no audit-log endpoint yet, so activity shows what changed but not who changed it.
  const activityQuery = useQuery({
    enabled: can.transfers || can.grns || can.productions,
    queryFn: async () => {
      const recent = { hospitalId, limit: 6, sortBy: 'updatedAt', sortOrder: 'desc' } as const;
      const [transfers, grns, productions] = await Promise.all([
        can.transfers ? organizationApi.listTransfers(recent).then((r) => r.data.items) : [],
        can.grns ? organizationApi.listGrns(recent).then((r) => r.data.items) : [],
        can.productions
          ? organizationApi.listKitchenProductions(recent).then((r) => r.data.items)
          : [],
      ]);

      return { grns, productions, transfers };
    },
    queryKey: queryKeys.dashboardActivity(scope),
  });
  const expiringQuery = useQuery({
    enabled: can.stock,
    queryFn: async () =>
      (
        await organizationApi.listStockBalances({
          hospitalId,
          limit: 20,
          sortBy: 'expiryDate',
          sortOrder: 'asc',
          status: 'NEAR_EXPIRY',
        })
      ).data.items.filter(
        (balance): balance is StockBalance & { expiryDate: string } =>
          balance.expiryDate !== null && daysUntil(balance.expiryDate) <= EXPIRY_WINDOW_DAYS,
      ),
    queryKey: queryKeys.dashboardExpiring(scope),
  });

  // ---- Master data totals (the existing keys) and the setup checklist's counts.
  const masters = {
    employees: useEntityTotal(
      'employees',
      () => organizationApi.listEmployees({ limit: 1 }),
      can.employees,
    ),
    hospitals: useEntityTotal(
      'hospitals',
      () => organizationApi.listHospitals({ limit: 1 }),
      can.hospitals,
    ),
    items: useEntityTotal('items', () => organizationApi.listItems({ limit: 1 }), can.items),
    kitchens: useEntityTotal(
      ['kitchens', scope],
      () => organizationApi.listKitchens({ hospitalId, limit: 1 }),
      can.kitchens,
    ),
    restaurants: useEntityTotal(
      ['restaurants', scope],
      () => organizationApi.listRestaurants({ hospitalId, limit: 1 }),
      can.restaurants,
    ),
    stores: useEntityTotal(
      ['stores', scope],
      () => organizationApi.listStores({ hospitalId, limit: 1 }),
      can.stores,
    ),
  };
  const setupTotals = {
    itemPrices: useEntityTotal(
      ['setup', 'item-prices', scope],
      () => organizationApi.listItemPrices({ hospitalId, limit: 1 }),
      can.itemPrices,
    ),
    kitchenItems: useEntityTotal(
      ['setup', 'kitchen-items', scope],
      () => organizationApi.listKitchenItems({ hospitalId, limit: 1 }),
      can.kitchenItems,
    ),
    menus: useEntityTotal(
      ['setup', 'restaurant-menus', scope],
      () => organizationApi.listRestaurantMenus({ hospitalId, limit: 1 }),
      can.menus,
    ),
    storeItems: useEntityTotal(
      ['setup', 'store-items', scope],
      () => organizationApi.listStoreItems({ hospitalId, limit: 1 }),
      can.storeItems,
    ),
    timeSlots: useEntityTotal(
      ['setup', 'time-slots'],
      () => organizationApi.listTimeSlots({ limit: 1 }),
      can.timeSlots,
    ),
  };
  const firstGrnQuery = useQuery({
    enabled: can.grns,
    queryFn: async () =>
      (
        await organizationApi.listGrns({
          hospitalId,
          limit: 1,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          status: 'POSTED_TO_STOCK',
        })
      ).data.items[0] ?? null,
    queryKey: queryKeys.dashboardSetup('first-grn', scope),
    staleTime: STATS_STALE_MS,
  });
  const firstTransferQuery = useQuery({
    enabled: can.transfers,
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          hospitalId,
          limit: 1,
          sortBy: 'createdAt',
          sortOrder: 'asc',
          status: 'ACKNOWLEDGED',
        })
      ).data.items[0] ?? null,
    queryKey: queryKeys.dashboardSetup('first-transfer', scope),
    staleTime: STATS_STALE_MS,
  });

  // ---- Derived numbers. The window follows the fetch, so buckets match the records.
  const window = useMemo(
    () => periodWindow(period, new Date(transfersQuery.dataUpdatedAt || Date.now())),
    [period, transfersQuery.dataUpdatedAt],
  );
  const transfers = useMemo(
    () => (transfersQuery.data ? transferStats(transfersQuery.data.items, window) : undefined),
    [transfersQuery.data, window],
  );
  const wastage = useMemo(
    () => (productionsQuery.data ? wastageStats(productionsQuery.data.items, window) : undefined),
    [productionsQuery.data, window],
  );
  const vendors = useMemo(
    () => (grnsQuery.data ? vendorRows(grnsQuery.data.items, window) : undefined),
    [grnsQuery.data, window],
  );
  const pending = useMemo(
    () =>
      pendingTransfersQuery.data
        ? pendingStats(
            pendingTransfersQuery.data.items,
            pendingTransfersQuery.data.meta.total,
            pendingTransfersQuery.dataUpdatedAt,
          )
        : undefined,
    [pendingTransfersQuery.data, pendingTransfersQuery.dataUpdatedAt],
  );
  const locations = useMemo(() => {
    const names = new Map<string, { code: string; name: string }>();
    const remember = (hospital: HospitalSummary) =>
      names.set(hospital.id, {
        code: hospital.hospitalCode,
        name: hospital.displayName || hospital.hospitalName,
      });

    (transfersQuery.data?.items ?? []).forEach((transfer: Transfer) => remember(transfer.hospital));
    (pendingTransfersQuery.data?.items ?? []).forEach((transfer) => remember(transfer.hospital));
    (productionsQuery.data?.items ?? []).forEach((production: KitchenProduction) =>
      remember(production.hospital),
    );

    return locationRows(transfers, pending, wastage, names);
  }, [
    pending,
    pendingTransfersQuery.data,
    productionsQuery.data,
    transfers,
    transfersQuery.data,
    wastage,
  ]);
  const cards = useMemo(
    () => insights({ pending, period, transfers, vendors, wastage }),
    [pending, period, transfers, vendors, wastage],
  );

  const total = (query: { data?: number }, allowed: boolean) => (allowed ? query.data : undefined);
  const setupQueries = [
    ...Object.values(masters),
    ...Object.values(setupTotals),
    firstGrnQuery,
    firstTransferQuery,
  ];
  const setupLoading = setupQueries.some((query) => query.isLoading);
  const steps = useMemo(
    () =>
      setupSteps(
        {
          employees: total(masters.employees, can.employees),
          hospitals: total(masters.hospitals, can.hospitals),
          itemPrices: total(setupTotals.itemPrices, can.itemPrices),
          items: total(masters.items, can.items),
          kitchenItems: total(setupTotals.kitchenItems, can.kitchenItems),
          kitchens: total(masters.kitchens, can.kitchens),
          menus: total(setupTotals.menus, can.menus),
          restaurants: total(masters.restaurants, can.restaurants),
          storeItems: total(setupTotals.storeItems, can.storeItems),
          stores: total(masters.stores, can.stores),
          timeSlots: total(setupTotals.timeSlots, can.timeSlots),
        },
        {
          grn: can.grns ? firstGrnQuery.data : undefined,
          transfer: can.transfers ? firstTransferQuery.data : undefined,
        },
        (href) => canOpenPath(href, hasPermission),
      ),
    // The counts are plain numbers; list them rather than the query objects.
    [
      can.employees,
      can.grns,
      can.hospitals,
      can.itemPrices,
      can.items,
      can.kitchenItems,
      can.kitchens,
      can.menus,
      can.restaurants,
      can.storeItems,
      can.stores,
      can.timeSlots,
      can.transfers,
      firstGrnQuery.data,
      firstTransferQuery.data,
      hasPermission,
      masters.employees.data,
      masters.hospitals.data,
      masters.items.data,
      masters.kitchens.data,
      masters.restaurants.data,
      masters.stores.data,
      setupTotals.itemPrices.data,
      setupTotals.kitchenItems.data,
      setupTotals.menus.data,
      setupTotals.storeItems.data,
      setupTotals.timeSlots.data,
    ],
  );
  // The mode is known once the period's transfers and the setup counts are in.
  const isModeKnown = !can.transfers || (Boolean(transfers) && !setupLoading);
  const mode = dashboardMode({
    canSeeTransfers: can.transfers && Boolean(transfers),
    steps,
    transfersInPeriod: transfers?.count ?? 0,
  });

  return {
    activity: activityQuery,
    can,
    expiring: expiringQuery,
    grns: { ...grnsQuery, truncated: grnsQuery.data?.truncated ?? false },
    insights: cards,
    isModeKnown,
    locations,
    masters,
    mode,
    pending: { ...pendingTransfersQuery, stats: pending },
    period,
    productions: { ...productionsQuery, truncated: productionsQuery.data?.truncated ?? false },
    queue: {
      grns: grnsToVerifyQuery,
      productions: draftProductionsQuery,
      transfers: pendingTransfersQuery,
    },
    setup: { isLoading: setupLoading, steps },
    transfers: {
      ...transfersQuery,
      stats: transfers,
      truncated: transfersQuery.data?.truncated ?? false,
    },
    vendors,
    wastage,
    window,
  };
}

export type DashboardStats = ReturnType<typeof useDashboardStats>;
