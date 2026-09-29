'use client';

import Link from 'next/link';
import {
  AppPageHeader,
  ChartCard,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  MetricTile,
  StatusBadge as DesignStatusBadge,
} from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { organizationApi } from '@/lib/api';
import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Building2,
  ChefHat,
  ClipboardList,
  MapPin,
  PackageOpen,
  Store,
  UsersRound,
  Utensils,
} from 'lucide-react';
import { formatDate, useEntityTotal } from './shared';

export function DashboardOverview() {
  const { isAllLocations, locationLabel, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  // Each part of the dashboard shows only for the view permission its API requires (the same
  // codes the backend's @Permissions check), so it adapts to any role, including custom roles
  // and per-user overrides. A hidden part is never fetched, so a role without the permission
  // no longer gets 403s and tiles stuck at 0.
  const can = {
    employees: hasPermission('EMPLOYEE_VIEW'),
    grns: hasPermission('GRN_VIEW'),
    hospitals: hasPermission('HOSPITAL_VIEW'),
    items: hasPermission('ITEM_VIEW'),
    kitchens: hasPermission('KITCHEN_VIEW'),
    restaurants: hasPermission('RESTAURANT_VIEW'),
    stores: hasPermission('STORE_VIEW'),
    transfers: hasPermission(['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW']),
  };
  const hospitalsQuery = useEntityTotal(
    'hospitals',
    () => organizationApi.listHospitals({ limit: 1 }),
    can.hospitals,
  );
  const storesQuery = useEntityTotal(
    ['stores', scopedHospitalId ?? 'all'],
    () => organizationApi.listStores({ hospitalId: scopedHospitalId, limit: 1 }),
    can.stores,
  );
  const kitchensQuery = useEntityTotal(
    ['kitchens', scopedHospitalId ?? 'all'],
    () => organizationApi.listKitchens({ hospitalId: scopedHospitalId, limit: 1 }),
    can.kitchens,
  );
  const restaurantsQuery = useEntityTotal(
    ['restaurants', scopedHospitalId ?? 'all'],
    () => organizationApi.listRestaurants({ hospitalId: scopedHospitalId, limit: 1 }),
    can.restaurants,
  );
  const itemsQuery = useEntityTotal(
    'items',
    () => organizationApi.listItems({ limit: 1 }),
    can.items,
  );
  const employeesQuery = useEntityTotal(
    'employees',
    () => organizationApi.listEmployees({ limit: 1 }),
    can.employees,
  );
  const recentGrnsQuery = useQuery({
    enabled: can.grns,
    queryFn: async () => {
      const response = await organizationApi.listGrns({
        hospitalId: scopedHospitalId,
        limit: 5,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      return response.data.items;
    },
    queryKey: ['dashboard', 'recent-grns', scopedHospitalId ?? 'all'],
  });
  const recentTransfersQuery = useQuery({
    enabled: can.transfers,
    queryFn: async () => {
      const response = await organizationApi.listTransfers({
        hospitalId: scopedHospitalId,
        limit: 5,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      return response.data.items;
    },
    queryKey: ['dashboard', 'recent-transfers', scopedHospitalId ?? 'all'],
  });
  const pendingTransfersQuery = useQuery({
    enabled: can.transfers,
    queryFn: async () => {
      const response = await organizationApi.listTransfers({
        hospitalId: scopedHospitalId,
        limit: 5,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: 'PENDING_ACKNOWLEDGEMENT',
      });

      return response.data;
    },
    queryKey: ['dashboard', 'pending-acknowledgements', scopedHospitalId ?? 'all'],
  });

  const cards = [
    {
      href: '/masters/locations',
      icon: MapPin,
      label: 'Locations',
      query: hospitalsQuery,
      tone: 'teal' as const,
      valueOverride: isAllLocations ? undefined : 1,
      visible: can.hospitals,
    },
    {
      href: '/masters/stores',
      icon: Store,
      label: 'Stores',
      query: storesQuery,
      tone: 'emerald' as const,
      visible: can.stores,
    },
    {
      href: '/masters/kitchens',
      icon: ChefHat,
      label: 'Kitchens',
      query: kitchensQuery,
      tone: 'amber' as const,
      visible: can.kitchens,
    },
    {
      href: '/masters/restaurants',
      icon: Utensils,
      label: 'Restaurants',
      query: restaurantsQuery,
      tone: 'violet' as const,
      visible: can.restaurants,
    },
    {
      href: '/masters/items',
      icon: PackageOpen,
      label: 'Items',
      query: itemsQuery,
      tone: 'blue' as const,
      visible: can.items,
    },
    {
      href: '/masters/employees',
      icon: UsersRound,
      label: 'Employees',
      query: employeesQuery,
      tone: 'rose' as const,
      visible: can.employees,
    },
  ].filter((card) => card.visible);
  const showPendingActions = can.transfers || can.grns;
  const activityPanels = [can.grns, can.transfers, can.transfers].filter(Boolean).length;
  // Literal class names: Tailwind only ships classes it can find verbatim in the source.
  const activityColumns = ['', 'xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3'][
    activityPanels
  ];

  return (
    <section className="space-y-6">
      <AppPageHeader
        action={
          can.transfers ? (
            <Button asChild>
              <Link href="/inventory/transfers">
                <ArrowRightLeft className="h-4 w-4" />
                Review Transfers
              </Link>
            </Button>
          ) : undefined
        }
        description="Monitor location food operations, inventory movements, and pending restaurant acknowledgements."
        eyebrow={isAllLocations ? 'Overview - All Locations' : `Overview - ${locationLabel}`}
        icon={Building2}
        title="Dashboard"
      />

      {cards.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <KpiCard
              href={card.href}
              icon={card.icon}
              key={card.href}
              label={card.label}
              loading={card.query.isLoading}
              tone={card.tone}
              trend={isAllLocations ? 'Configured master data' : `Scoped to ${locationLabel}`}
              value={card.valueOverride ?? card.query.data ?? 0}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          description="Your role has no dashboard data yet. Ask an administrator if you expected to see something here."
          title="Nothing to show on your dashboard"
        />
      )}

      <div className={showPendingActions ? 'grid gap-4 xl:grid-cols-[1.3fr_0.7fr]' : 'grid gap-4'}>
        <ChartCard
          description="Placeholder trend for upcoming restaurant operations and POS modules."
          title="Food Operations Trend"
        />
        {showPendingActions ? (
          <ChartCard description="Work that needs operational attention." title="Pending Actions">
            <div className="grid gap-3">
              {can.transfers ? (
                <MetricTile
                  icon={ClipboardList}
                  label="Pending Acknowledgements"
                  value={
                    pendingTransfersQuery.isLoading
                      ? '...'
                      : (pendingTransfersQuery.data?.meta.total ?? 0)
                  }
                />
              ) : null}
              {can.transfers ? (
                <MetricTile
                  icon={ArrowRightLeft}
                  label="Recent Transfers"
                  value={
                    recentTransfersQuery.isLoading
                      ? '...'
                      : (recentTransfersQuery.data?.length ?? 0)
                  }
                />
              ) : null}
              {can.grns ? (
                <MetricTile
                  icon={PackageOpen}
                  label="Recent GRNs"
                  value={recentGrnsQuery.isLoading ? '...' : (recentGrnsQuery.data?.length ?? 0)}
                />
              ) : null}
            </div>
          </ChartCard>
        ) : null}
      </div>

      {activityPanels > 0 ? (
        <div className={`grid gap-4 ${activityColumns}`}>
          {can.grns ? (
            <ChartCard className="xl:col-span-1" title="Recent GRNs">
              {recentGrnsQuery.isLoading ? (
                <LoadingSkeleton rows={5} />
              ) : recentGrnsQuery.data && recentGrnsQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {recentGrnsQuery.data.map((grn) => (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                      href="/inventory/grns"
                      key={grn.id}
                    >
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">
                          {grn.grnNumber}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {grn.store.storeName} - {formatDate(grn.receivedDate)}
                        </p>
                      </div>
                      <DesignStatusBadge status={grn.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No recent GRNs" description="Posted GRNs will appear here." />
              )}
            </ChartCard>
          ) : null}

          {can.transfers ? (
            <ChartCard className="xl:col-span-1" title="Recent Transfers">
              {recentTransfersQuery.isLoading ? (
                <LoadingSkeleton rows={5} />
              ) : recentTransfersQuery.data && recentTransfersQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {recentTransfersQuery.data.map((transfer) => (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                      href="/inventory/transfers"
                      key={transfer.id}
                    >
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">
                          {transfer.transferNumber}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {transfer.sourceType} to {transfer.destinationType} -{' '}
                          {formatDate(transfer.transferDate)}
                        </p>
                      </div>
                      <DesignStatusBadge status={transfer.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent transfers"
                  description="Dispatched transfers will appear here."
                />
              )}
            </ChartCard>
          ) : null}

          {can.transfers ? (
            <ChartCard className="xl:col-span-1" title="Pending Acknowledgements">
              {pendingTransfersQuery.isLoading ? (
                <LoadingSkeleton rows={5} />
              ) : pendingTransfersQuery.data?.items.length ? (
                <div className="space-y-3">
                  {pendingTransfersQuery.data.items.map((transfer) => (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:hover:bg-amber-900"
                      href="/inventory/transfers"
                      key={transfer.id}
                    >
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">
                          {transfer.transferNumber}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Awaiting restaurant acknowledgement
                        </p>
                      </div>
                      <DesignStatusBadge status={transfer.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No pending acknowledgements"
                  description="Restaurant acknowledgement tasks are clear."
                />
              )}
            </ChartCard>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
