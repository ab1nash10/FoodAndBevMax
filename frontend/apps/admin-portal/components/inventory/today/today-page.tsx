'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarClock,
  PackagePlus,
  Store as StoreIcon,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, StatusChip } from '@/components/design-system';
import { LoadError, useLocationName } from '@/components/location-empty-states';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen } from '@/components/record-link';
import { Panel, Skeleton } from '@/components/ui';
import { daysFromToday, formatQuantity, plural } from '@/components/inventory/shared/utils';
import {
  coverLabel,
  EXPIRING_DAYS,
  expiryLabel,
  expiryTone,
} from '@/components/inventory/stock-levels/levels';
import { MovementBars } from '@/components/inventory/stock-levels/movement-bars';
import { Chip, CoverBar, toneChip } from '@/components/inventory/stock-levels/parts';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const longDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
});
const clock = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
});

const tones = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
};

/** One of the three "what needs you" cards: a titled list with a way to act on it. */
function ActionCard({
  actions,
  children,
  count,
  icon: Icon,
  title,
  tone,
}: Readonly<{
  actions: ReactNode;
  children: ReactNode;
  count: string;
  icon: LucideIcon;
  title: string;
  tone: keyof typeof tones;
}>) {
  return (
    <Panel
      aria-label={title}
      className="flex flex-col overflow-hidden transition duration-200 hover:shadow-card-hover"
      role="region"
    >
      <header className="flex items-center gap-3 px-5 pb-3 pt-5">
        <span
          aria-hidden="true"
          className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', tones[tone])}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
        <h2 className="text-base font-semibold text-ds-text">{title}</h2>
        <span className="ml-auto text-[13px] text-ds-muted">{count}</span>
      </header>
      <div className="flex flex-1 flex-col px-5 pb-4">{children}</div>
      <footer className="flex items-center gap-3 border-t border-ds-divider bg-ds-subtle-2 px-5 py-3">
        {actions}
      </footer>
    </Panel>
  );
}

function Nothing({ children }: Readonly<{ children: string }>) {
  return <p className="py-6 text-center text-sm text-ds-muted">{children}</p>;
}

/**
 * A store keeper's start of the day: what is running low, what expires first, which
 * restaurant shelves are empty, how stock moved over two weeks and what happened today.
 */
export function TodayPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const locationName = useLocationName();
  const now = new Date();
  // The device's own date (YYYY-MM-DD): the lists read "from today" in the site's time.
  const today = now.toLocaleDateString('en-CA');
  const scope = scopedHospitalId ?? 'all';
  const canSeeRestaurants = hasPermission('RESTAURANT_STOCK_VIEW');
  const canSeeGrns = hasPermission('GRN_VIEW');
  const canSeeTransfers = hasPermission(['TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW']);

  const levelsQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.listStoreStockLevels({ hospitalId: scopedHospitalId })).data,
    queryKey: queryKeys.stockBalances('levels', scope),
  });
  const movesQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.listStoreStockMovements({ days: 14, hospitalId: scopedHospitalId }))
        .data.days,
    queryKey: queryKeys.stockLedgers('movements', scope, 'all', 14),
  });
  const restaurantsQuery = useQuery({
    enabled: canSeeRestaurants,
    queryFn: async () =>
      (
        await organizationApi.listRestaurantStock({
          hospitalId: scopedHospitalId,
          limit: 5,
          status: 'OUT_OF_STOCK',
        })
      ).data,
    queryKey: queryKeys.restaurantStock('today-out', scope),
  });
  const grnsQuery = useQuery({
    enabled: canSeeGrns,
    queryFn: async () =>
      (await organizationApi.listGrns({ fromDate: today, hospitalId: scopedHospitalId, limit: 10 }))
        .data.items,
    queryKey: queryKeys.grns('today', scope, today),
  });
  const transfersQuery = useQuery({
    enabled: canSeeTransfers,
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          fromDate: today,
          hospitalId: scopedHospitalId,
          limit: 10,
        })
      ).data.items,
    queryKey: queryKeys.transfers('today', scope, today),
  });

  const items = levelsQuery.data?.items ?? [];
  const lowDays = levelsQuery.data?.lowCoverDays ?? 3;
  const running = items.filter((item) => item.level !== 'OK');
  const expiring = items
    .flatMap((item) =>
      item.batches.map((batch) => ({ ...batch, days: daysFromToday(batch.expiryDate), item })),
    )
    .filter((batch) => batch.days !== null && batch.days <= EXPIRING_DAYS)
    .sort((left, right) => (left.days ?? 0) - (right.days ?? 0));
  const emptyShelves = restaurantsQuery.data?.items ?? [];
  const events = [
    ...(grnsQuery.data ?? []).map((grn) => ({
      at: grn.receivedDate,
      href: `/inventory/grns?id=${grn.id}`,
      key: grn.id,
      number: grn.grnNumber,
      status: grn.status,
      text: `from ${grn.vendorName ?? grn.store.storeName}`,
    })),
    ...(transfersQuery.data ?? []).map((transfer) => ({
      at: transfer.transferDate,
      href: `/inventory/transfers?id=${transfer.id}`,
      key: transfer.id,
      number: transfer.transferNumber,
      status: transfer.status,
      text: `· ${plural(transfer.lines.length, 'line')}`,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));
  const moves = movesQuery.data ?? [];
  const sum = (pick: (day: { qtyIn: number; qtyOut: number }) => number) =>
    formatQuantity(moves.reduce((total, day) => total + pick(day), 0));

  const needs = [
    running.length ? plural(running.length, 'item') + ' running low or out' : null,
    expiring.length ? plural(expiring.length, 'batch', 'batches') + ' close to expiry' : null,
    emptyShelves.length
      ? plural(emptyShelves.length, 'restaurant shelf', 'restaurant shelves') + ' empty'
      : null,
  ].filter(Boolean);
  return (
    <section className="space-y-6">
      <AppPageHeader
        action={
          <>
            <IfCanOpen href="/inventory/transfers/new">
              <Button asChild variant="outline">
                <Link href="/inventory/transfers/new">
                  <ArrowRightLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  Send to restaurant
                </Link>
              </Button>
            </IfCanOpen>
            <IfCanOpen href="/inventory/grns/new">
              <Button asChild>
                <Link href="/inventory/grns/new">
                  <PackagePlus aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                  Receive delivery
                </Link>
              </Button>
            </IfCanOpen>
          </>
        }
        description={
          levelsQuery.isLoading
            ? ' '
            : needs.length
              ? `Needs you today: ${needs.join(', ')}.`
              : 'Nothing needs you right now: stock is healthy and nothing expires this week.'
        }
        eyebrow={[longDate.format(now), locationName].filter(Boolean).join(' · ')}
        title="Store Today"
      />

      {levelsQuery.isError ? (
        <Panel className="px-4 py-10">
          <LoadError error={levelsQuery.error} />
        </Panel>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <ActionCard
          actions={
            <>
              <Link
                className="text-sm font-semibold text-ds-link hover:underline"
                href="/inventory/stock-levels?filter=low"
              >
                All stock levels
              </Link>
              <IfCanOpen href="/inventory/grns/new">
                <Button asChild className="ml-auto" size="sm">
                  <Link href="/inventory/grns/new">Receive stock</Link>
                </Button>
              </IfCanOpen>
            </>
          }
          count={levelsQuery.isLoading ? '' : plural(running.length, 'item')}
          icon={TrendingDown}
          title="Running low"
          tone="pending"
        >
          {levelsQuery.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : running.length ? (
            <ul className="flex flex-col">
              {running.slice(0, 4).map((item) => (
                <li
                  className="flex flex-col gap-2 border-t border-ds-divider py-3 first:border-t-0"
                  key={`${item.storeId}:${item.itemId}`}
                >
                  <span className="flex items-baseline gap-2">
                    <Link
                      className="truncate text-sm font-semibold text-ds-text hover:text-ds-link hover:underline"
                      href={`/inventory/stock-levels?item=${item.storeId}:${item.itemId}`}
                    >
                      {item.itemName}
                    </Link>
                    <span className="truncate font-mono text-xs text-ds-muted">
                      {item.itemCode}
                    </span>
                    <span
                      className={cn(
                        'ml-auto shrink-0 text-[13px] font-semibold',
                        item.level === 'OUT'
                          ? 'text-ds-status-bad-fg'
                          : 'text-ds-status-pending-fg',
                      )}
                    >
                      {item.level === 'OUT'
                        ? 'Out of stock'
                        : `${formatQuantity(item.onHand)} · ${coverLabel(item)}`}
                    </span>
                  </span>
                  <CoverBar item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <Nothing>{`Every store item has more than ${lowDays} days of stock.`}</Nothing>
          )}
        </ActionCard>

        <ActionCard
          actions={
            <>
              <Link
                className="text-sm font-semibold text-ds-link hover:underline"
                href="/inventory/stock-levels?filter=expiring"
              >
                All batches
              </Link>
              <IfCanOpen href="/inventory/transfers/new">
                <Button asChild className="ml-auto" size="sm" variant="outline">
                  <Link href="/inventory/transfers/new">Send these out first</Link>
                </Button>
              </IfCanOpen>
            </>
          }
          count={levelsQuery.isLoading ? '' : `${expiring.length} this week`}
          icon={CalendarClock}
          title="Expiring soon"
          tone="bad"
        >
          {levelsQuery.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : expiring.length ? (
            <>
              <ul className="flex flex-col">
                {expiring.slice(0, 4).map((batch, index) => (
                  <li
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-ds-divider py-3 first:border-t-0"
                    key={`${batch.item.itemId}-${batch.batchNumber ?? index}`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-ds-text">
                        {batch.item.itemName}
                      </span>
                      <span className="truncate text-xs text-ds-muted">
                        Batch <span className="font-mono">{batch.batchNumber ?? '—'}</span> ·{' '}
                        {formatQuantity(batch.availableQty)} units
                      </span>
                    </span>
                    <Chip className={toneChip[expiryTone(batch.days)]}>
                      {expiryLabel(batch.days)}
                    </Chip>
                  </li>
                ))}
              </ul>
              <p className="mt-auto pt-2 text-xs text-ds-muted">
                Transfers send the earliest batch first.
              </p>
            </>
          ) : (
            <Nothing>{`No batch expires in the next ${EXPIRING_DAYS} days.`}</Nothing>
          )}
        </ActionCard>

        {canSeeRestaurants ? (
          <ActionCard
            actions={
              <>
                <Link
                  className="text-sm font-semibold text-ds-link hover:underline"
                  href="/inventory/restaurant-stock?view=OUT_OF_STOCK"
                >
                  Restaurant stock
                </Link>
                <IfCanOpen href="/inventory/transfers/new">
                  <Button asChild className="ml-auto" size="sm">
                    <Link href="/inventory/transfers/new">Send stock</Link>
                  </Button>
                </IfCanOpen>
              </>
            }
            count={
              restaurantsQuery.isLoading
                ? ''
                : plural(restaurantsQuery.data?.meta.total ?? 0, 'item')
            }
            icon={StoreIcon}
            title="Restaurants need stock"
            tone="info"
          >
            {restaurantsQuery.isLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : restaurantsQuery.isError ? (
              <LoadError error={restaurantsQuery.error} />
            ) : emptyShelves.length ? (
              <ul className="flex flex-col">
                {emptyShelves.slice(0, 4).map((stock) => (
                  <li
                    className="flex flex-col gap-0.5 border-t border-ds-divider py-3 first:border-t-0"
                    key={stock.id}
                  >
                    <span className="truncate text-sm font-semibold text-ds-text">
                      {stock.item.itemName}
                    </span>
                    <span className="truncate text-xs text-ds-muted">
                      Run out at {stock.location.name}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Nothing>No restaurant has run out of anything.</Nothing>
            )}
          </ActionCard>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel aria-label="Stock in and out" className="p-5" role="region">
          <header className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-3">
            <div>
              <h2 className="text-base font-semibold text-ds-text">Stock in and out</h2>
              <p className="text-[13px] text-ds-muted">Stores · last 14 days</p>
            </div>
            <dl className="ml-auto flex gap-6">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-ds-muted">
                  <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-ds-primary" />
                  Received
                </dt>
                <dd className="font-mono text-xl tabular-nums text-ds-text">
                  {movesQuery.isLoading ? '—' : sum((day) => day.qtyIn)}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-ds-muted">
                  <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-ds-chart-series/40" />
                  Sent out
                </dt>
                <dd className="font-mono text-xl tabular-nums text-ds-text">
                  {movesQuery.isLoading ? '—' : sum((day) => day.qtyOut)}
                </dd>
              </div>
            </dl>
          </header>
          {movesQuery.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : movesQuery.isError ? (
            <LoadError error={movesQuery.error} />
          ) : (
            <MovementBars days={moves} />
          )}
        </Panel>

        <Panel aria-label="Today" className="flex flex-col p-5" role="region">
          <header className="mb-2 flex items-center">
            <h2 className="text-base font-semibold text-ds-text">Today</h2>
            <Link
              className="ml-auto text-sm font-semibold text-ds-link hover:underline"
              href="/inventory/stock-ledgers"
            >
              Stock ledger
            </Link>
          </header>
          {grnsQuery.isLoading || transfersQuery.isLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : events.length ? (
            <ol className="flex flex-col">
              {events.slice(0, 6).map((event) => (
                <li
                  className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 border-t border-ds-divider py-3 first:border-t-0"
                  key={event.key}
                >
                  <span className="pt-0.5 font-mono text-[13px] text-ds-muted">
                    {clock.format(new Date(event.at))}
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="truncate text-sm text-ds-text">
                      <Link
                        className="font-mono font-semibold text-ds-link hover:underline"
                        href={event.href}
                      >
                        {event.number}
                      </Link>{' '}
                      {event.text}
                    </span>
                    <StatusChip status={event.status} />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Nothing>No GRN or transfer yet today.</Nothing>
          )}
        </Panel>
      </div>
    </section>
  );
}
