'use client';

import type { DashboardSetup, HospitalSummary, StockBalance } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
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
const EXPIRY_WINDOW_DAYS = 7;

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
    items: hasPermission('ITEM_VIEW'),
    kitchenItems: hasPermission('KITCHEN_ITEM_VIEW'),
    kitchens: hasPermission('KITCHEN_VIEW'),
    menus: hasPermission('RESTAURANT_MENU_VIEW'),
    productions: hasPermission('KITCHEN_PRODUCTION_VIEW'),
    restaurants: hasPermission('RESTAURANT_VIEW'),
    stock: hasPermission('STOCK_VIEW'),
    storeItems: hasPermission('STORE_ITEM_VIEW'),
    stores: hasPermission('STORE_VIEW'),
    transfers: hasPermission(['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW']),
  };

  // ---- Period records: this period and the one before (for deltas). One request returns the
  // transfers, posted productions and posted GRNs the user may view, with only the fields the
  // numbers below read.
  const recordsQuery = useQuery({
    enabled: can.transfers || can.productions || can.grns,
    queryFn: async () => {
      const window = periodWindow(period, new Date());

      return (
        await organizationApi.getDashboardRecords({ fromDate: iso(window.prevStart), hospitalId })
      ).data;
    },
    queryKey: queryKeys.dashboardStats('records', period, scope),
    staleTime: STATS_STALE_MS,
  });
  const records = recordsQuery.data;

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

  // ---- Master data totals and the setup checklist: one request with every count the user may
  // see (each counted by its list endpoint) and the first posted GRN and acknowledged transfer.
  const setupQuery = useQuery({
    enabled: Object.values(can).some(Boolean),
    queryFn: async () => (await organizationApi.getDashboardSetup({ hospitalId })).data,
    queryKey: queryKeys.dashboardSetup('counts', scope),
  });
  const setup = setupQuery.data;
  // Shaped like the queries the Master data card used to get, one per count.
  const countOf = (key: keyof DashboardSetup['counts'], allowed: boolean) => ({
    data: allowed ? setup?.counts[key] : undefined,
    isLoading: allowed && setupQuery.isLoading,
  });
  const masters = {
    employees: countOf('employees', can.employees),
    hospitals: countOf('hospitals', can.hospitals),
    items: countOf('items', can.items),
    kitchens: countOf('kitchens', can.kitchens),
    restaurants: countOf('restaurants', can.restaurants),
    stores: countOf('stores', can.stores),
  };

  // ---- Derived numbers. The window follows the fetch, so buckets match the records.
  const window = useMemo(
    () => periodWindow(period, new Date(recordsQuery.dataUpdatedAt || Date.now())),
    [period, recordsQuery.dataUpdatedAt],
  );
  const transfers = useMemo(
    () => (records?.transfers ? transferStats(records.transfers.items, window) : undefined),
    [records, window],
  );
  const wastage = useMemo(
    () => (records?.productions ? wastageStats(records.productions.items, window) : undefined),
    [records, window],
  );
  const vendors = useMemo(
    () => (records?.grns ? vendorRows(records.grns.items, window) : undefined),
    [records, window],
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

    (records?.transfers?.items ?? []).forEach((transfer) => remember(transfer.hospital));
    (pendingTransfersQuery.data?.items ?? []).forEach((transfer) => remember(transfer.hospital));
    (records?.productions?.items ?? []).forEach((production) => remember(production.hospital));

    return locationRows(transfers, pending, wastage, names);
  }, [pending, pendingTransfersQuery.data, records, transfers, wastage]);
  const cards = useMemo(
    () => insights({ pending, period, transfers, vendors, wastage }),
    [pending, period, transfers, vendors, wastage],
  );

  const setupLoading = setupQuery.isLoading;
  const steps = useMemo(() => {
    const count = (key: keyof DashboardSetup['counts'], allowed: boolean) =>
      allowed ? setup?.counts[key] : undefined;

    return setupSteps(
      {
        employees: count('employees', can.employees),
        // At one location the checklist is about that location, as the Master data card is.
        hospitals: hospitalId && can.hospitals ? 1 : count('hospitals', can.hospitals),
        items: count('items', can.items),
        kitchenItems: count('kitchenItems', can.kitchenItems),
        kitchens: count('kitchens', can.kitchens),
        menus: count('menus', can.menus),
        restaurants: count('restaurants', can.restaurants),
        storeItems: count('storeItems', can.storeItems),
        stores: count('stores', can.stores),
      },
      {
        grn: can.grns ? setup?.firstGrn : undefined,
        transfer: can.transfers ? setup?.firstTransfer : undefined,
      },
      (href) => canOpenPath(href, hasPermission),
    );
  }, [
    can.employees,
    can.grns,
    can.hospitals,
    can.items,
    can.kitchenItems,
    can.kitchens,
    can.menus,
    can.restaurants,
    can.storeItems,
    can.stores,
    can.transfers,
    hasPermission,
    hospitalId,
    setup,
  ]);
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
    grns: { ...recordsQuery, truncated: records?.grns?.truncated ?? false },
    insights: cards,
    isModeKnown,
    locations,
    masters,
    mode,
    pending: { ...pendingTransfersQuery, stats: pending },
    period,
    productions: { ...recordsQuery, truncated: records?.productions?.truncated ?? false },
    queue: {
      grns: grnsToVerifyQuery,
      productions: draftProductionsQuery,
      transfers: pendingTransfersQuery,
    },
    setup: { isLoading: setupLoading, steps },
    transfers: {
      ...recordsQuery,
      stats: transfers,
      truncated: records?.transfers?.truncated ?? false,
    },
    vendors,
    wastage,
    window,
  };
}

export type DashboardStats = ReturnType<typeof useDashboardStats>;
