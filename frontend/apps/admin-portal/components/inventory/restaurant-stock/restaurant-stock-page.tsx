'use client';

import {
  DiscardBatchButton,
  DiscardStockDialog,
  type DiscardableBatch,
} from '@/components/inventory/discard-stock-dialog';
import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  LocationStockLevel,
  Restaurant,
  SortOrder,
  StockBalanceStatus,
} from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { RecordAvatar, StatStrip, StatusChip, tableStyles } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel, Select } from '@/components/ui';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { Chip, levelChip } from '@/components/inventory/stock-levels/parts';
import { sendFromStoreHref } from '@/components/inventory/transfers/transfer-prefill';
import { locationHref, recordHref } from '@/lib/navigation';
import { organizationApi } from '@/lib/api';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import {
  HospitalSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/inventory/shared/components';
import type { ItemTypeFilter } from '@/components/inventory/shared/types';
import {
  formatDateOnly,
  formatEnum,
  listLimit,
  plural,
  stockStatuses,
  useHospitals,
  useItems,
  useRestaurants,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { useIsPhone } from '@/lib/use-is-phone';
import { cn } from '@/lib/utils';

function RestaurantSelect({
  disabled,
  onChange,
  restaurants,
  value,
}: Readonly<{
  disabled?: boolean;
  onChange: (value: string) => void;
  restaurants: Restaurant[];
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select restaurant</option>
      {restaurants.map((restaurant) => (
        <option key={restaurant.id} value={restaurant.id}>
          {restaurant.restaurantName}
        </option>
      ))}
    </Select>
  );
}

export function RestaurantStockPageClient() {
  const [discarding, setDiscarding] = useState<DiscardableBatch | null>(null);
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  // Phones show three of the seven columns; a row that spans them all has to say so.
  const columns = useIsPhone() ? 3 : 7;
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'KITCHEN' | 'STORE'>('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | StockBalanceStatus>('view', '', [
    'AVAILABLE',
    'NEAR_EXPIRY',
    'EXPIRED',
    'LOW_STOCK',
    'OUT_OF_STOCK',
  ]);
  const [sortBy, setSortBy] = useState('lastUpdatedOn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const effectiveItemType =
    itemTypeFilter ||
    (sourceFilter === 'STORE' ? 'MRP' : sourceFilter === 'KITCHEN' ? 'READYMADE' : '');
  const itemOptionsQuery = useItems(effectiveItemType || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setRestaurantFilter('');
    setPage(1);
  });

  const stockQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurantStock({
        batchNumber: batchFilter,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        itemType: effectiveItemType || undefined,
        limit: listLimit,
        locationId: restaurantFilter,
        page,
        search,
        sortBy,
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.restaurantStock(
      page,
      search,
      hospitalFilter,
      restaurantFilter,
      sourceFilter,
      itemFilter,
      itemTypeFilter,
      batchFilter,
      statusFilter,
      sortBy,
      sortOrder,
    ),
  });

  // The strip's numbers: every restaurant batch at the location, then each that needs a look.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (status?: StockBalanceStatus) =>
        (
          await organizationApi.listRestaurantStock({
            hospitalId: hospitalFilter,
            limit: 0,
            status,
          })
        ).data.meta.total;
      const [all, nearExpiry, expired, outOfStock] = await Promise.all([
        count(),
        count('NEAR_EXPIRY'),
        count('EXPIRED'),
        count('OUT_OF_STOCK'),
      ]);

      return { all, expired, nearExpiry, outOfStock };
    },
    queryKey: queryKeys.restaurantStock('stats', hospitalFilter),
  });
  const stats = statsQuery.data;
  // Store items running low or out at each restaurant, by Stock levels' days-of-cover rule.
  const levelsQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listRestaurantStockLevels({
          hospitalId: hospitalFilter,
          locationId: restaurantFilter,
        })
      ).data,
    queryKey: queryKeys.restaurantStock('levels', hospitalFilter, restaurantFilter),
  });
  const coverDays = levelsQuery.data?.lowCoverDays ?? 3;
  const lowLevels = (levelsQuery.data?.items ?? []).filter((level) => level.level !== 'OK');
  const lowByKey = new Map(
    lowLevels.map((level) => [`${level.locationId}:${level.itemId}`, level]),
  );
  // One "send them all" link per restaurant: a transfer goes to one.
  const lowByRestaurant = [
    ...lowLevels
      .reduce(
        (groups, level) =>
          groups.set(level.locationId, [...(groups.get(level.locationId) ?? []), level]),
        new Map<string, LocationStockLevel[]>(),
      )
      .values(),
  ];
  const items = stockQuery.data?.items ?? [];
  const meta = stockQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    restaurantFilter ||
    statusFilter ||
    sourceFilter ||
    itemTypeFilter ||
    itemFilter ||
    batchFilter,
  );

  function clearFilters() {
    setSearch('');
    setHospitalFilter(scopedHospitalId ?? '');
    setRestaurantFilter('');
    setStatusFilter('');
    setSourceFilter('');
    setItemTypeFilter('');
    setItemFilter('');
    setBatchFilter('');
    setPage(1);
  }

  /** A stat's status alone; picking the one in force goes back to all stock. */
  function showStatus(status: '' | StockBalanceStatus) {
    setStatusFilter((current) => (current === status ? '' : status));
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <DiscardStockDialog batch={discarding} onClose={() => setDiscarding(null)} />
      <PageHeader
        count={stats?.all}
        subtitle="Current restaurant stock received from acknowledged transfers."
        title="Restaurant Stock"
      />
      <StatStrip
        label="Restaurant stock at a glance"
        stats={[
          {
            active: !statusFilter,
            label: 'All batches',
            onSelect: () => showStatus(''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: statusFilter === 'NEAR_EXPIRY',
            label: 'Expiring in 30 days',
            onSelect: () => showStatus('NEAR_EXPIRY'),
            share: stats?.all ? stats.nearExpiry / stats.all : undefined,
            tone: 'pending',
            value: stats?.nearExpiry ?? '–',
          },
          {
            active: statusFilter === 'EXPIRED',
            label: 'Expired',
            onSelect: () => showStatus('EXPIRED'),
            share: stats?.all ? stats.expired / stats.all : undefined,
            tone: 'bad',
            value: stats?.expired ?? '–',
          },
          {
            active: statusFilter === 'OUT_OF_STOCK',
            label: 'Out of stock',
            onSelect: () => showStatus('OUT_OF_STOCK'),
            share: stats?.all ? stats.outOfStock / stats.all : undefined,
            tone: 'bad',
            value: stats?.outOfStock ?? '–',
          },
        ]}
      />
      <Panel aria-label="Restaurant stock list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search restaurant stock"
            placeholder="Item name or code, batch or location"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [
                hospitalFilter !== (scopedHospitalId ?? ''),
                restaurantFilter,
                statusFilter,
                sourceFilter,
                itemTypeFilter,
                itemFilter,
                batchFilter,
              ].filter(Boolean).length
            }
          >
            <FilterField label="Location">
              <HospitalSelect
                disabled={Boolean(scopedHospitalId)}
                hospitals={hospitalsQuery.data ?? []}
                onChange={(value) => {
                  setHospitalFilter(value);
                  setRestaurantFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              />
            </FilterField>
            <FilterField label="Restaurant">
              <RestaurantSelect
                disabled={!hospitalFilter}
                onChange={(value) => {
                  setRestaurantFilter(value);
                  setPage(1);
                }}
                restaurants={restaurantsQuery.data ?? []}
                value={restaurantFilter}
              />
            </FilterField>
            <FilterField label="Status">
              <Select
                onChange={(event) => {
                  setStatusFilter(event.target.value as '' | StockBalanceStatus);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="">All statuses</option>
                {stockStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnum(status)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Source">
              <Select
                onChange={(event) => {
                  setSourceFilter(event.target.value as '' | 'KITCHEN' | 'STORE');
                  setItemFilter('');
                  setPage(1);
                }}
                value={sourceFilter}
              >
                <option value="">All sources</option>
                <option value="STORE">Store</option>
                <option value="KITCHEN">Kitchen</option>
              </Select>
            </FilterField>
            <FilterField label="Item type">
              <Select
                onChange={(event) => {
                  setItemTypeFilter(event.target.value as ItemTypeFilter);
                  setItemFilter('');
                  setPage(1);
                }}
                value={itemTypeFilter}
              >
                <option value="">All item types</option>
                <option value="MRP">MRP</option>
                <option value="READYMADE">READYMADE</option>
              </Select>
            </FilterField>
            <FilterField label="Item">
              <Select
                onChange={(event) => {
                  setItemFilter(event.target.value);
                  setPage(1);
                }}
                value={itemFilter}
              >
                <option value="">All items</option>
                {itemOptionsQuery.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemName}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Batch">
              <Input
                onChange={(event) => {
                  setBatchFilter(event.target.value);
                  setPage(1);
                }}
                placeholder="Batch number"
                value={batchFilter}
              />
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Last updated', value: 'lastUpdatedOn' },
              { label: 'Available qty', value: 'availableQty' },
              { label: 'Expiry date', value: 'expiryDate' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void stockQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        {lowLevels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ds-divider bg-ds-status-pending-bg/40 px-5 py-2.5">
            <span className="mr-auto text-[13px] text-ds-status-pending-fg">
              <span className="font-semibold">
                {plural(lowLevels.length, 'item')} running low or out.
              </span>{' '}
              A transfer from the store tops each up to {plural(coverDays, 'day')} of its usual use.
            </span>
            <IfCanOpen href="/inventory/transfers/new">
              {lowByRestaurant.map((group) => (
                <Button asChild key={group[0]!.locationId} size="sm" variant="outline">
                  <Link href={sendFromStoreHref('RESTAURANT', group, coverDays)}>
                    <ArrowRightLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                    {lowByRestaurant.length > 1
                      ? `Send from store · ${group[0]!.locationName}`
                      : 'Send all from store'}
                  </Link>
                </Button>
              ))}
            </IfCanOpen>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed sm:min-w-[900px]')}>
            <thead className={tableStyles.head}>
              {/* Phones: only item, available and status; the item names its batch and restaurant. */}
              <tr>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[19%]')}>
                  Restaurant
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[10%]')}>Source</th>
                <th className={cn(tableStyles.th, 'sm:w-[23%]')}>Item</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[14%]')}>Batch</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[12%]')}>
                  Expiry / date
                </th>
                <th className={cn(tableStyles.th, 'w-24 text-right sm:w-[10%]')}>Available</th>
                <th className={cn(tableStyles.th, 'w-[120px] sm:w-[12%]')}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((stock) => {
                  const low = lowByKey.get(`${stock.locationId}:${stock.itemId}`);

                  return (
                    <tr
                      className="row-accent border-t border-ds-divider transition-colors hover:bg-ds-selected"
                      data-record-id={stock.id}
                      key={stock.id}
                    >
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <RecordLink
                          className={cn('block truncate', tableStyles.title)}
                          href={locationHref(
                            stock.location.type,
                            stock.location.code || stock.location.name,
                          )}
                        >
                          {stock.location.name}
                        </RecordLink>
                        <p className={cn('truncate', tableStyles.code)}>{stock.location.code}</p>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className="inline-flex h-6 items-center rounded-full bg-ds-status-info-bg px-2.5 text-xs font-medium text-ds-status-info-fg">
                          {stock.itemType === 'READYMADE' ? 'Kitchen' : 'Store'}
                        </span>
                      </td>
                      <td className={tableStyles.td}>
                        <span className="flex items-start gap-3">
                          <RecordAvatar foodType={stock.item.type} name={stock.item.itemName} />
                          <span className="min-w-0 flex-1">
                            <RecordLink
                              className={cn('block break-words sm:truncate', tableStyles.title)}
                              href={recordHref('/masters/items', { id: stock.item.id })}
                            >
                              {stock.item.itemName}
                            </RecordLink>
                            <p className={cn('truncate', tableStyles.code)}>
                              {stock.item.itemCode}
                            </p>
                            <p className="truncate text-[12px] text-ds-muted sm:hidden">
                              {stock.batchNumber ?? 'No batch'} · {stock.location.name}
                            </p>
                            {low ? (
                              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Chip className={levelChip[low.level].className}>
                                  {levelChip[low.level].label}
                                </Chip>
                                <IfCanOpen href="/inventory/transfers/new">
                                  <Link
                                    className="text-xs font-semibold text-ds-link hover:underline"
                                    href={sendFromStoreHref('RESTAURANT', [low], coverDays)}
                                  >
                                    Send from store
                                  </Link>
                                </IfCanOpen>
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.code,
                          tableStyles.phoneHidden,
                          'truncate',
                        )}
                      >
                        {stock.batchNumber ?? 'No batch'}
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.phoneHidden,
                          'whitespace-nowrap text-ds-muted',
                        )}
                      >
                        {stock.itemType === 'READYMADE'
                          ? formatDateOnly(stock.businessDate)
                          : formatDateOnly(stock.expiryDate)}
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.num,
                          'text-right font-semibold text-ds-text',
                        )}
                      >
                        {stock.availableQty.toFixed(3)}
                      </td>
                      <td className={tableStyles.td}>
                        <StatusChip status={stock.status} />
                        <span className="mt-1 block">
                          <DiscardBatchButton
                            batch={{
                              availableQty: stock.availableQty,
                              batchNumber: stock.batchNumber,
                              expiryDate: stock.expiryDate,
                              itemName: stock.item.itemName,
                              locationName: stock.location.name,
                              stockBalanceId: stock.id,
                            }}
                            onDiscard={setDiscarding}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={columns}
                  error={stockQuery.error}
                  isError={stockQuery.isError}
                  isLoading={stockQuery.isLoading}
                  hint="Stock arrives when a restaurant acknowledges a transfer, or nothing matches the filters."
                  label="restaurant stock"
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
