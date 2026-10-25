'use client';

import { Button } from '@aahar/ui';
import type { StoreStockLevel } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { AppPageHeader, EmptyState, RecordAvatar } from '@/components/design-system';
import { LoadError } from '@/components/location-empty-states';
import { useLocationContext } from '@/components/location-context';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { Panel, Select, Skeleton } from '@/components/ui';
import { FilterSearch, FilterTabs } from '@/components/ui-controls';
import {
  daysFromToday,
  formatDateOnly,
  formatQuantity,
  plural,
} from '@/components/inventory/shared/utils';
import { receivePrefillHref } from '@/components/inventory/grns/receive-prefill';
import { organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';
import { useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { coverLabel, expiryLabel, expiryTone, matchesFilter, type LevelFilter } from './levels';
import { Chip, CoverBar, levelChip, toneChip } from './parts';
import { MovementBars } from './movement-bars';

const filters: Array<{ label: string; value: LevelFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Running low', value: 'low' },
  { label: 'Expiring soon', value: 'expiring' },
  { label: 'Out of stock', value: 'out' },
];

const rowKey = (item: StoreStockLevel) => `${item.storeId}:${item.itemId}`;

/** Receive a delivery into these items' store (all in one), each added for counting. */
function receiveHref(items: StoreStockLevel[]): string {
  return receivePrefillHref({
    hospitalId: items[0]?.hospitalId ?? '',
    itemIds: items.map((item) => item.itemId),
    storeId: items[0]?.storeId ?? '',
  });
}

export function StockLevelsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [filter, setFilter] = useUrlParam<LevelFilter>('filter', 'all', [
    'all',
    'low',
    'expiring',
    'out',
  ]);
  const [storeId, setStoreId] = useUrlParam('store');
  const [selectedKey, setSelectedKey] = useUrlParam('item');
  const [search, setSearch, term] = useUrlSearchParam('q');
  const levelsQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.listStoreStockLevels({ hospitalId: scopedHospitalId })).data,
    queryKey: queryKeys.stockBalances('levels', scopedHospitalId ?? 'all'),
  });
  const levels = levelsQuery.data;
  const stores = useMemo(
    () => [
      ...new Map(
        (levels?.items ?? []).map((item) => [item.storeId, item.storeName] as const),
      ).entries(),
    ],
    [levels],
  );
  const inStore = (levels?.items ?? []).filter((item) => !storeId || item.storeId === storeId);
  const searchText = term.trim().toLowerCase();
  const matching = inStore.filter(
    (item) =>
      !searchText ||
      item.itemName.toLowerCase().includes(searchText) ||
      item.itemCode.toLowerCase().includes(searchText),
  );
  const shown = matching.filter((item) =>
    matchesFilter(item, filter, daysFromToday(item.nextExpiryDate)),
  );
  const selected = shown.find((item) => rowKey(item) === selectedKey) ?? shown[0] ?? undefined;
  // Running-low and out items per store, for one "receive them all" link each: a store tops up
  // from a delivery, not by sending its stock away.
  const lowByStore = [
    ...inStore
      .filter((item) => item.level !== 'OK')
      .reduce(
        (groups, item) => groups.set(item.storeId, [...(groups.get(item.storeId) ?? []), item]),
        new Map<string, StoreStockLevel[]>(),
      )
      .values(),
  ];
  const lowCount = lowByStore.reduce((total, group) => total + group.length, 0);
  const hasLowRow = shown.some((item) => item.level !== 'OK');

  return (
    <section className="space-y-5">
      <AppPageHeader
        action={
          <>
            {stores.length > 1 ? (
              <Select
                aria-label="Store"
                className="w-56"
                onChange={(event) => setStoreId(event.target.value)}
                value={storeId}
              >
                <option value="">All stores</option>
                {stores.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            ) : null}
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
        description="Every store item against how fast it goes out: what is on hand, how long it lasts and what expires first."
        title="Stock levels"
      />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <Panel className="min-w-0 flex-1 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-ds-divider p-4">
            <div className="flex min-w-[220px] flex-1 sm:max-w-xs">
              <FilterSearch
                label="Search items"
                onChange={setSearch}
                placeholder="Item name or code"
                value={search}
              />
            </div>
            <FilterTabs
              label="Show"
              onChange={setFilter}
              options={filters.map((option) => ({
                ...option,
                count: levels
                  ? matching.filter((item) =>
                      matchesFilter(item, option.value, daysFromToday(item.nextExpiryDate)),
                    ).length
                  : undefined,
              }))}
              value={filter}
            />
          </div>

          {lowCount > 0 ? (
            <IfCanOpen href="/inventory/grns/new">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ds-divider bg-ds-status-pending-bg/40 px-5 py-2.5">
                <span className="mr-auto text-[13px] text-ds-status-pending-fg">
                  <span className="font-semibold">
                    {plural(lowCount, 'item')} running low or out.
                  </span>{' '}
                  A delivery starts with each added, ready to count.
                </span>
                {lowByStore.map((group) => (
                  <Button asChild key={group[0]!.storeId} size="sm" variant="outline">
                    <Link href={receiveHref(group)}>
                      <PackagePlus aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                      {lowByStore.length > 1
                        ? `Receive a delivery · ${group[0]!.storeName}`
                        : 'Receive a delivery'}
                    </Link>
                  </Button>
                ))}
              </div>
            </IfCanOpen>
          ) : null}

          <div
            aria-hidden="true"
            className={cn(
              'hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_96px_120px_112px] gap-5 border-b border-ds-border bg-ds-surface py-3 pl-5 text-[12.5px] font-medium text-ds-muted md:grid',
              // Rows running low or out carry a receive link in a column of their own.
              hasLowRow ? 'pr-17' : 'pr-5',
            )}
          >
            <span>Item</span>
            <span>Cover</span>
            <span className="text-right">On hand</span>
            <span>Lasts</span>
            <span>Next expiry</span>
          </div>

          {levelsQuery.isError ? (
            <div className="px-4 py-12">
              <LoadError error={levelsQuery.error} />
            </div>
          ) : levelsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <span className="sr-only" role="status">
                Loading stock levels…
              </span>
              {['a', 'b', 'c', 'd', 'e'].map((row) => (
                <Skeleton className="h-12 w-full" key={row} />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="p-6">
              <EmptyState
                description={
                  inStore.length === 0
                    ? 'Store stock arrives with a GRN. Receive a delivery to start.'
                    : 'Nothing matches this search or filter.'
                }
                title={inStore.length === 0 ? 'No store stock yet' : 'No items here'}
              />
            </div>
          ) : (
            <ul aria-label="Store items">
              {shown.map((item) => {
                const isSelected = selected !== undefined && rowKey(item) === rowKey(selected);
                const expiryDays = daysFromToday(item.nextExpiryDate);

                return (
                  <li
                    className={cn(
                      'flex border-b border-ds-divider transition-colors last:border-b-0',
                      isSelected ? 'bg-ds-selected' : 'hover:bg-ds-subtle-2',
                    )}
                    key={rowKey(item)}
                  >
                    <button
                      aria-pressed={isSelected}
                      className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-5 py-3.5 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_96px_120px_112px]"
                      onClick={() => setSelectedKey(rowKey(item))}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={item.itemName} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold text-ds-text">
                            {item.itemName}
                          </span>
                          <span className="truncate font-mono text-xs text-ds-muted">
                            {item.itemCode}
                            {storeId ? null : ` · ${item.storeName}`}
                          </span>
                        </span>
                      </span>
                      <span className="hidden md:block">
                        <CoverBar item={item} />
                      </span>
                      <span className="text-right font-mono text-[15px] tabular-nums text-ds-text">
                        {formatQuantity(item.onHand)}
                      </span>
                      <span
                        className={cn(
                          'hidden text-[13px] md:block',
                          item.level === 'OK' ? 'text-ds-text-2' : 'font-semibold',
                          item.level === 'LOW' && 'text-ds-status-pending-fg',
                          item.level === 'OUT' && 'text-ds-status-bad-fg',
                        )}
                      >
                        {coverLabel(item)}
                      </span>
                      <span className="col-span-2 md:col-span-1">
                        <Chip className={toneChip[expiryTone(expiryDays)]}>
                          {expiryLabel(expiryDays)}
                        </Chip>
                      </span>
                    </button>
                    {hasLowRow ? (
                      <span className="grid w-12 shrink-0 place-items-center">
                        {item.level === 'OK' ? null : (
                          <IfCanOpen href="/inventory/grns/new">
                            <Link
                              aria-label={`Receive a delivery of ${item.itemName}`}
                              className="grid h-8 w-8 place-items-center rounded-lg text-ds-link transition hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                              href={receiveHref([item])}
                              title="Receive a delivery"
                            >
                              <PackagePlus
                                aria-hidden="true"
                                className="h-4 w-4"
                                strokeWidth={1.8}
                              />
                            </Link>
                          </IfCanOpen>
                        )}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-ds-divider px-5 py-3 text-xs text-ds-muted">
            Bar = days of stock, a full bar being two weeks. &ldquo;Lasts&rdquo; is on hand ÷ the
            average daily issue over the last {levels?.windowDays ?? 28} days.
          </p>
        </Panel>

        {selected ? <LevelDetail item={selected} key={rowKey(selected)} /> : null}
      </div>
    </section>
  );
}

function LevelDetail({ item }: Readonly<{ item: StoreStockLevel }>) {
  const movesQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listStoreStockMovements({
          days: 14,
          itemId: item.itemId,
          storeId: item.storeId,
        })
      ).data.days,
    queryKey: queryKeys.stockLedgers('movements', item.storeId, item.itemId, 14),
  });
  const moves = movesQuery.data ?? [];
  const chip = levelChip[item.level];

  return (
    <Panel
      aria-label={item.itemName}
      className="flex flex-col overflow-hidden xl:sticky xl:top-6 xl:w-[400px] xl:shrink-0"
      role="region"
    >
      <header className="flex flex-col gap-3 border-b border-ds-divider px-6 pb-5 pt-5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-ds-muted">{item.itemCode}</span>
          <span className="ml-auto">
            <Chip className={chip.className}>{chip.label}</Chip>
          </span>
        </div>
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ds-text">
          <RecordLink href={recordHref('/masters/items', { id: item.itemId })}>
            {item.itemName}
          </RecordLink>
        </h2>
        <p className="text-[13px] text-ds-muted">{item.storeName}</p>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-ds-muted">On hand</dt>
            <dd className="mt-1 font-mono text-[28px] leading-none tabular-nums text-ds-text">
              {formatQuantity(item.onHand)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ds-muted">Out in 28 days</dt>
            <dd className="mt-1 font-mono text-[28px] leading-none tabular-nums text-ds-text-3">
              {formatQuantity(item.issuedLast28Days)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ds-muted">Lasts</dt>
            <dd className="mt-2 text-base font-semibold text-ds-text">{coverLabel(item)}</dd>
          </div>
        </dl>
      </header>

      <section className="flex flex-col gap-3 border-b border-ds-divider px-6 py-5">
        <h3 className="text-[13px] font-semibold text-ds-text-2">Batches by expiry</h3>
        {item.batches.length ? (
          <ul className="flex flex-col">
            {item.batches.map((batch, index) => {
              const days = daysFromToday(batch.expiryDate);

              return (
                <li
                  className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-ds-divider py-2.5 first:border-t-0"
                  key={`${batch.batchNumber ?? 'none'}-${index}`}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      expiryTone(days) === 'bad'
                        ? 'bg-ds-status-bad-fg'
                        : expiryTone(days) === 'pending'
                          ? 'bg-ds-status-pending-fg'
                          : 'bg-ds-primary',
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-[13px] text-ds-text">
                      {batch.batchNumber ?? 'No batch'}
                    </span>
                    <span className="text-xs text-ds-muted">
                      Received {formatDateOnly(batch.receivedOn)}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums text-ds-text">
                    {formatQuantity(batch.availableQty)}
                  </span>
                  <Chip className={toneChip[expiryTone(days)]}>{expiryLabel(days)}</Chip>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-control bg-ds-status-bad-bg px-3 py-2.5 text-[13px] text-ds-status-bad-fg">
            Nothing on hand in this store.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 px-6 py-5">
        <div className="flex items-center gap-4">
          <h3 className="text-[13px] font-semibold text-ds-text-2">In and out · 14 days</h3>
          <span className="ml-auto flex items-center gap-3 text-xs text-ds-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-ds-primary" />
              In
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-xs bg-ds-chart-series/40" />
              Out
            </span>
          </span>
        </div>
        {movesQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : movesQuery.isError ? (
          <LoadError error={movesQuery.error} />
        ) : (
          <MovementBars days={moves} />
        )}
      </section>

      <footer className="mt-auto flex gap-3 border-t border-ds-divider px-6 py-4">
        <IfCanOpen href="/inventory/transfers/new">
          <Button asChild className="flex-1" variant="outline">
            <Link href="/inventory/transfers/new">Send to restaurant</Link>
          </Button>
        </IfCanOpen>
        <IfCanOpen href="/inventory/grns/new">
          <Button asChild className="flex-1">
            <Link href={receiveHref([item])}>Receive more</Link>
          </Button>
        </IfCanOpen>
      </footer>
    </Panel>
  );
}
