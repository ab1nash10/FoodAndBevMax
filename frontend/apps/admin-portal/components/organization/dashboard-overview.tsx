'use client';

import Link from 'next/link';
import type { InventoryLocationType } from '@aahar/api-client';
import {
  AppPageHeader,
  ChartCard,
  EmptyState,
  KpiCard,
  LoadingSkeleton,
  StatusBadge as DesignStatusBadge,
} from '@/components/design-system';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { Skeleton } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChefHat,
  ChevronRight,
  ClipboardList,
  MapPin,
  PackageOpen,
  Store,
  UsersRound,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, useEntityTotal } from './shared';

function greeting(): string {
  const hour = new Date().getHours();

  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function locationTypeLabel(type: InventoryLocationType): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

const attentionTones = {
  pending: {
    chip: 'bg-ds-pending-bg text-ds-pending-fg dark:bg-amber-950 dark:text-amber-300',
    tile: 'bg-ds-pending-bg text-ds-pending-fg dark:bg-amber-950 dark:text-amber-300',
  },
  received: {
    chip: 'bg-ds-received-bg text-ds-received-fg dark:bg-emerald-950 dark:text-emerald-300',
    tile: 'bg-ds-received-bg text-ds-received-fg dark:bg-emerald-950 dark:text-emerald-300',
  },
  transit: {
    chip: 'bg-ds-transit-bg text-ds-transit-fg dark:bg-blue-950 dark:text-blue-300',
    tile: 'bg-ds-transit-bg text-ds-transit-fg dark:bg-blue-950 dark:text-blue-300',
  },
};

/** Attention card from the concepts: icon tile and chip, label, large value, one-line context. */
function AttentionCard({
  chip,
  detail,
  href,
  icon: Icon,
  label,
  loading,
  tone,
  value,
}: Readonly<{
  chip: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  label: string;
  loading: boolean;
  tone: keyof typeof attentionTones;
  value: number;
}>) {
  return (
    <Link
      className="group block rounded-card border border-ds-border bg-ds-surface p-4 shadow-sm shadow-ds-text/[0.04] transition hover:border-ds-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary dark:shadow-none"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'grid h-10 w-10 place-items-center rounded-control-lg',
            attentionTones[tone].tile,
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            attentionTones[tone].chip,
          )}
        >
          {chip}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-ds-text-2">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-14" />
      ) : (
        <p className="mt-0.5 text-[28px] font-extrabold leading-tight text-ds-text">{value}</p>
      )}
      <p className="mt-1 text-[13px] text-ds-muted">{detail}</p>
    </Link>
  );
}

function ViewAllLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-semibold text-ds-link hover:bg-ds-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      {children}
      <ChevronRight aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

export function DashboardOverview() {
  const { isAllLocations, locationLabel, scopedHospitalId } = useLocationContext();
  const { currentUser, hasPermission } = useAuth();
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
  const pendingCount = pendingTransfersQuery.data?.meta.total ?? 0;
  const showSideColumn = can.transfers || can.grns;
  const userName = currentUser?.name?.trim();

  return (
    <section className="space-y-5">
      <AppPageHeader
        action={
          can.transfers ? (
            <Button asChild className="h-cta px-5">
              <Link href="/inventory/transfers">
                <ArrowRightLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
                Review Transfers
                {pendingCount > 0 ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white/20 px-1.5 text-xs font-bold text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          ) : undefined
        }
        description="Monitor location food operations, inventory movements and pending restaurant acknowledgements."
        eyebrow={isAllLocations ? 'Overview · All locations' : `Overview · ${locationLabel}`}
        title={userName ? `${greeting()}, ${userName}` : 'Dashboard'}
      />

      {can.transfers || can.grns ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {can.transfers ? (
            <AttentionCard
              chip={pendingCount > 0 ? 'Action needed' : 'All clear'}
              detail="Awaiting restaurant acknowledgement"
              href="/inventory/transfers"
              icon={ClipboardList}
              label="Pending acknowledgements"
              loading={pendingTransfersQuery.isLoading}
              tone={pendingCount > 0 ? 'pending' : 'received'}
              value={pendingCount}
            />
          ) : null}
          {can.transfers ? (
            <AttentionCard
              chip="Latest"
              detail="Most recent stock movements"
              href="/inventory/transfers"
              icon={ArrowRightLeft}
              label="Recent transfers"
              loading={recentTransfersQuery.isLoading}
              tone="transit"
              value={recentTransfersQuery.data?.length ?? 0}
            />
          ) : null}
          {can.grns ? (
            <AttentionCard
              chip="Latest"
              detail="Most recent goods received"
              href="/inventory/grns"
              icon={PackageOpen}
              label="Recent GRNs"
              loading={recentGrnsQuery.isLoading}
              tone="received"
              value={recentGrnsQuery.data?.length ?? 0}
            />
          ) : null}
        </div>
      ) : null}

      {cards.length > 0 ? (
        <ChartCard
          description={
            isAllLocations
              ? 'Configured records across the organization'
              : `Configured records at ${locationLabel}`
          }
          title="Master data"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => (
              <KpiCard
                href={card.href}
                icon={card.icon}
                key={card.href}
                label={card.label}
                loading={card.query.isLoading}
                tone={card.tone}
                value={card.valueOverride ?? card.query.data ?? 0}
              />
            ))}
          </div>
        </ChartCard>
      ) : (
        <EmptyState
          description="Your role has no dashboard data yet. Ask an administrator if you expected to see something here."
          title="Nothing to show on your dashboard"
        />
      )}

      {showSideColumn ? (
        <div
          // grid-cols-1 (minmax(0, 1fr)) lets the table scroll inside its card on phones
          // instead of widening the page.
          className={cn(
            'grid grid-cols-1 gap-5',
            can.transfers && 'xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]',
          )}
        >
          {can.transfers ? (
            <ChartCard
              action={<ViewAllLink href="/inventory/transfers">View all</ViewAllLink>}
              className="min-w-0"
              description="Latest movements between stores, kitchens and restaurants"
              title="Recent transfers"
            >
              {recentTransfersQuery.isLoading ? (
                <LoadingSkeleton rows={5} />
              ) : recentTransfersQuery.data && recentTransfersQuery.data.length > 0 ? (
                // Bleeds to the card edges, as in the concepts.
                <div className="-mx-4 -mb-4 overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
                    <thead className="bg-ds-subtle text-left">
                      <tr>
                        <th className="px-5 py-2.5">Transfer</th>
                        <th className="px-3 py-2.5">Route</th>
                        <th className="px-3 py-2.5">Items</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-5 py-2.5">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentTransfersQuery.data.map((transfer) => (
                        <tr key={transfer.id}>
                          <td className="px-5 py-2.5">
                            <Link
                              className="font-bold text-ds-text hover:text-ds-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
                              href="/inventory/transfers"
                            >
                              {transfer.transferNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold text-ds-text">
                              {locationTypeLabel(transfer.sourceType)} →{' '}
                              {locationTypeLabel(transfer.destinationType)}
                            </p>
                            <p className="text-xs text-ds-muted">
                              {transfer.hospital.hospitalName}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-ds-text-3">
                            {transfer.lines.length} item{transfer.lines.length === 1 ? '' : 's'}
                          </td>
                          <td className="px-3 py-2.5">
                            <DesignStatusBadge status={transfer.status} />
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-ds-muted">
                            {formatDate(transfer.transferDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  description="Dispatched transfers will appear here."
                  title="No recent transfers"
                />
              )}
            </ChartCard>
          ) : null}

          <div className="grid grid-cols-1 content-start gap-5">
            {can.transfers ? (
              <ChartCard
                action={
                  <span className="rounded-full bg-ds-pending-bg px-2.5 py-1 text-xs font-semibold text-ds-pending-fg dark:bg-amber-950 dark:text-amber-300">
                    {pendingCount} pending
                  </span>
                }
                title="Pending acknowledgements"
              >
                {pendingTransfersQuery.isLoading ? (
                  <LoadingSkeleton rows={3} />
                ) : pendingTransfersQuery.data?.items.length ? (
                  <ul className="-my-1 divide-y divide-slate-100">
                    {pendingTransfersQuery.data.items.map((transfer) => (
                      <li key={transfer.id}>
                        <Link
                          className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-ds-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
                          href="/inventory/transfers"
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold text-ds-text">
                              {transfer.transferNumber}
                            </span>
                            <span className="block truncate text-xs text-ds-muted">
                              {transfer.hospital.hospitalName} · Awaiting restaurant acknowledgement
                            </span>
                          </span>
                          <DesignStatusBadge status={transfer.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    description="Restaurant acknowledgement tasks are clear."
                    title="No pending acknowledgements"
                  />
                )}
              </ChartCard>
            ) : null}

            {can.grns ? (
              <ChartCard
                action={<ViewAllLink href="/inventory/grns">View all</ViewAllLink>}
                title="Recent GRNs"
              >
                {recentGrnsQuery.isLoading ? (
                  <LoadingSkeleton rows={3} />
                ) : recentGrnsQuery.data && recentGrnsQuery.data.length > 0 ? (
                  <ul className="-my-1 divide-y divide-slate-100">
                    {recentGrnsQuery.data.map((grn) => (
                      <li key={grn.id}>
                        <Link
                          className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-ds-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary"
                          href="/inventory/grns"
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold text-ds-text">
                              {grn.grnNumber}
                            </span>
                            <span className="block truncate text-xs text-ds-muted">
                              {grn.store.storeName} · {formatDate(grn.receivedDate)}
                            </span>
                          </span>
                          <DesignStatusBadge status={grn.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState description="Posted GRNs will appear here." title="No recent GRNs" />
                )}
              </ChartCard>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
