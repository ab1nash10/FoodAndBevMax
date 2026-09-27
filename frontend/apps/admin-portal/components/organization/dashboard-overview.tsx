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
  const hospitalsQuery = useEntityTotal('hospitals', () =>
    organizationApi.listHospitals({ limit: 1 }),
  );
  const storesQuery = useEntityTotal(['stores', scopedHospitalId ?? 'all'], () =>
    organizationApi.listStores({ hospitalId: scopedHospitalId, limit: 1 }),
  );
  const kitchensQuery = useEntityTotal(['kitchens', scopedHospitalId ?? 'all'], () =>
    organizationApi.listKitchens({ hospitalId: scopedHospitalId, limit: 1 }),
  );
  const restaurantsQuery = useEntityTotal(['restaurants', scopedHospitalId ?? 'all'], () =>
    organizationApi.listRestaurants({ hospitalId: scopedHospitalId, limit: 1 }),
  );
  const itemsQuery = useEntityTotal('items', () => organizationApi.listItems({ limit: 1 }));
  const employeesQuery = useEntityTotal('employees', () =>
    organizationApi.listEmployees({ limit: 1 }),
  );
  const recentGrnsQuery = useQuery({
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
    },
    {
      href: '/masters/stores',
      icon: Store,
      label: 'Stores',
      query: storesQuery,
      tone: 'emerald' as const,
    },
    {
      href: '/masters/kitchens',
      icon: ChefHat,
      label: 'Kitchens',
      query: kitchensQuery,
      tone: 'amber' as const,
    },
    {
      href: '/masters/restaurants',
      icon: Utensils,
      label: 'Restaurants',
      query: restaurantsQuery,
      tone: 'violet' as const,
    },
    {
      href: '/masters/items',
      icon: PackageOpen,
      label: 'Items',
      query: itemsQuery,
      tone: 'blue' as const,
    },
    {
      href: '/masters/employees',
      icon: UsersRound,
      label: 'Employees',
      query: employeesQuery,
      tone: 'rose' as const,
    },
  ];

  return (
    <section className="space-y-6">
      <AppPageHeader
        action={
          <Button asChild>
            <Link href="/inventory/transfers">
              <ArrowRightLeft className="h-4 w-4" />
              Review Transfers
            </Link>
          </Button>
        }
        description="Monitor location food operations, inventory movements, and pending restaurant acknowledgements."
        eyebrow={isAllLocations ? 'Overview - All Locations' : `Overview - ${locationLabel}`}
        icon={Building2}
        title="Dashboard"
      />

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

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <ChartCard
          description="Placeholder trend for upcoming restaurant operations and POS modules."
          title="Food Operations Trend"
        />
        <ChartCard description="Work that needs operational attention." title="Pending Actions">
          <div className="grid gap-3">
            <MetricTile
              icon={ClipboardList}
              label="Pending Acknowledgements"
              value={
                pendingTransfersQuery.isLoading
                  ? '...'
                  : (pendingTransfersQuery.data?.meta.total ?? 0)
              }
            />
            <MetricTile
              icon={ArrowRightLeft}
              label="Recent Transfers"
              value={
                recentTransfersQuery.isLoading ? '...' : (recentTransfersQuery.data?.length ?? 0)
              }
            />
            <MetricTile
              icon={PackageOpen}
              label="Recent GRNs"
              value={recentGrnsQuery.isLoading ? '...' : (recentGrnsQuery.data?.length ?? 0)}
            />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
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
                    <p className="font-medium text-slate-950 dark:text-white">{grn.grnNumber}</p>
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
      </div>
    </section>
  );
}
