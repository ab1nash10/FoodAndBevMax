'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type {
  ItemType,
  SortOrder,
  StockBalanceStatus,
  StoreStockBatchSummary,
  StoreStockSummary,
} from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import {
  InlineProgress,
  RecordAvatar,
  RowAction,
  StatStrip,
  StatusChip,
  tableStyles,
} from '@/components/design-system';
import { todayInIndia } from '@/lib/today-in-india';
import {
  DiscardBatchButton,
  DiscardStockDialog,
  type DiscardableBatch,
} from '@/components/inventory/discard-stock-dialog';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel, Select } from '@/components/ui';
import { RecordLink } from '@/components/record-link';
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
  StoreSelect,
} from '@/components/inventory/shared/components';
import type { ItemTypeFilter } from '@/components/inventory/shared/types';
import {
  formatDateOnly,
  formatEnum,
  formatQuantity,
  listLimit,
  stockStatuses,
  useHospitals,
  useItems,
  useStores,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { useIsPhone } from '@/lib/use-is-phone';
import { cn } from '@/lib/utils';

const stockItemTypes: ItemType[] = ['MRP', 'READYMADE', 'LIVE'];

/** Days over which the expiry bar runs from full to empty. */
const expiryWindowDays = 30;

/**
 * Days left before the nearest batch expires, as a bar that runs down over a month: green, then
 * amber inside a week, red inside three days or once expired.
 */
function ExpiryProgress({ date }: Readonly<{ date: string }>) {
  const days = Math.round(
    (Date.parse(date.slice(0, 10)) - Date.parse(todayInIndia())) / 86_400_000,
  );

  return (
    <InlineProgress
      label={
        days < 0
          ? 'Expired'
          : days === 0
            ? 'Expires today'
            : `${days} day${days === 1 ? '' : 's'} left`
      }
      tone={days <= 3 ? 'bad' : days <= 7 ? 'pending' : 'ok'}
      value={Math.max(days, 0) / expiryWindowDays}
    />
  );
}

export function StoreStockPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  // Phones show four of the nine columns; a row that spans them all has to say so.
  const columns = useIsPhone() ? 4 : 9;
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [discarding, setDiscarding] = useState<DiscardableBatch | null>(null);
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [storeFilter, setStoreFilter] = useState('');
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
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const itemOptionsQuery = useItems(itemTypeFilter || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setStoreFilter('');
    setPage(1);
  });

  const stockQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStoreStockSummaries({
        batchNumber: batchFilter,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        itemType: itemTypeFilter || undefined,
        limit: listLimit,
        locationId: storeFilter,
        locationType: 'STORE',
        page,
        search,
        sortBy,
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.stockBalances(
      page,
      search,
      hospitalFilter,
      storeFilter,
      itemFilter,
      itemTypeFilter,
      batchFilter,
      statusFilter,
      sortBy,
      sortOrder,
    ),
  });

  // The strip's numbers: every item held in a store at the location, then each that needs a look.
  const statsQuery = useQuery({
    queryFn: async () => {
      // One load of the location's stock answers every tab (each was a full load of its own).
      const { meta } = (
        await organizationApi.listStoreStockSummaries({
          hospitalId: hospitalFilter,
          limit: 0,
          locationType: 'STORE',
          statusCounts: true,
        })
      ).data;
      const count = (status: StockBalanceStatus) => meta.statusCounts?.[status] ?? 0;

      return {
        all: meta.total,
        expired: count('EXPIRED'),
        nearExpiry: count('NEAR_EXPIRY'),
        outOfStock: count('OUT_OF_STOCK'),
      };
    },
    queryKey: queryKeys.stockBalances('stats', hospitalFilter),
  });
  const stats = statsQuery.data;
  const items = stockQuery.data?.items ?? [];
  const meta = stockQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    storeFilter ||
    statusFilter ||
    itemTypeFilter ||
    itemFilter ||
    batchFilter,
  );

  function clearFilters() {
    setSearch('');
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setStatusFilter('');
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

  function toggleSummary(summary: StoreStockSummary) {
    const key = `${summary.storeId}:${summary.itemId}`;

    setExpandedRows((current) =>
      current.includes(key) ? current.filter((rowKey) => rowKey !== key) : [...current, key],
    );
  }

  return (
    <section className="space-y-4">
      <DiscardStockDialog batch={discarding} onClose={() => setDiscarding(null)} />
      <PageHeader
        count={stats?.all}
        subtitle="Current store stock summarized by store and item, with batch details on expand."
        title="Store Stock"
      />
      <StatStrip
        label="Store stock at a glance"
        stats={[
          {
            active: !statusFilter,
            label: 'All items',
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
      <Panel aria-label="Store stock list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search store stock"
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
                storeFilter,
                statusFilter,
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
                  setStoreFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              />
            </FilterField>
            <FilterField label="Store">
              <StoreSelect
                disabled={!hospitalFilter}
                onChange={(value) => {
                  setStoreFilter(value);
                  setPage(1);
                }}
                stores={storesQuery.data ?? []}
                value={storeFilter}
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
                {stockItemTypes.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {formatEnum(itemType)}
                  </option>
                ))}
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
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed sm:min-w-[960px]')}>
            <thead className={tableStyles.head}>
              {/* Phones: only the button, item, available and status, at fixed widths for the
                  button, number and chip; the item takes the rest and names its store. */}
              <tr>
                <th className={cn(tableStyles.th, 'w-12 pr-0 sm:w-[5%]')}>
                  <span className="sr-only">Batches</span>
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[15%]')}>Store</th>
                <th className={cn(tableStyles.th, 'sm:w-[19%]')}>Item</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[11%]')}>Category</th>
                <th className={cn(tableStyles.th, 'w-20 text-right sm:w-[11%]')}>Available</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[9%] text-right')}>
                  Reserved
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[7%] text-right')}>
                  Batches
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[10%]')}>
                  Nearest expiry
                </th>
                <th className={cn(tableStyles.th, 'w-[120px] sm:w-[13%]')}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((summary: StoreStockSummary) => {
                  const rowKey = `${summary.storeId}:${summary.itemId}`;
                  const isExpanded = expandedRows.includes(rowKey);

                  return (
                    <Fragment key={rowKey}>
                      {/* The whole row shows its batches; the store and item links go to those. */}
                      <tr
                        className={cn(tableStyles.row, isExpanded && 'bg-ds-subtle')}
                        data-record-id={rowKey}
                        onClick={(event) => {
                          if (!(event.target as HTMLElement).closest('a, button')) {
                            toggleSummary(summary);
                          }
                        }}
                      >
                        <td className={cn(tableStyles.td, 'pr-0')}>
                          <RowAction
                            aria-expanded={isExpanded}
                            icon={isExpanded ? ChevronDown : ChevronRight}
                            label={isExpanded ? 'Collapse batches' : 'Expand batches'}
                            onClick={() => toggleSummary(summary)}
                          />
                        </td>
                        <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                          <span className="flex min-w-0 items-center gap-2.5">
                            <RecordAvatar name={summary.storeName} size="sm" />
                            <span className="min-w-0">
                              <RecordLink
                                className={cn('block truncate', tableStyles.title)}
                                href={locationHref('STORE', summary.storeCode || summary.storeName)}
                              >
                                {summary.storeName}
                              </RecordLink>
                              <p className={cn('truncate', tableStyles.code)}>
                                {summary.storeCode ?? '—'}
                              </p>
                            </span>
                          </span>
                        </td>
                        <td className={tableStyles.td}>
                          <span className="flex items-start gap-3">
                            <RecordAvatar name={summary.itemName} />
                            <span className="min-w-0 flex-1">
                              <RecordLink
                                className={cn('block break-words sm:truncate', tableStyles.title)}
                                href={recordHref('/masters/items', { id: summary.itemId })}
                              >
                                {summary.itemName}
                              </RecordLink>
                              <p className={cn('truncate', tableStyles.code)}>{summary.itemCode}</p>
                              {/* Phones have no Store column. */}
                              <p className="truncate text-[12px] text-ds-muted sm:hidden">
                                {summary.storeName}
                              </p>
                            </span>
                          </span>
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.phoneHidden,
                            'truncate text-ds-text-2',
                          )}
                        >
                          {summary.categoryName ?? '—'}
                        </td>
                        <td className={cn(tableStyles.td, 'text-right')}>
                          <p className={cn(tableStyles.num, 'font-semibold text-ds-text')}>
                            {formatQuantity(summary.totalAvailableQty)}
                          </p>
                          <p className="text-[12px] text-ds-muted">
                            {formatEnum(summary.itemType)}
                          </p>
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            tableStyles.phoneHidden,
                            'text-right text-ds-text-2',
                          )}
                        >
                          {formatQuantity(summary.totalReservedQty)}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.num,
                            tableStyles.phoneHidden,
                            'text-right text-ds-text-2',
                          )}
                        >
                          {summary.batchCount}
                        </td>
                        <td
                          className={cn(
                            tableStyles.td,
                            tableStyles.phoneHidden,
                            'whitespace-nowrap text-ds-muted',
                          )}
                        >
                          {formatDateOnly(summary.nearestExpiryDate)}
                          {summary.nearestExpiryDate ? (
                            <ExpiryProgress date={summary.nearestExpiryDate} />
                          ) : null}
                        </td>
                        <td className={tableStyles.td}>
                          <StatusChip status={summary.status} />
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="bg-ds-subtle">
                          <td className="px-4 pb-4 pt-1" colSpan={columns}>
                            <div className="overflow-hidden rounded-card border border-ds-border bg-ds-surface">
                              <div className="px-4 py-3">
                                <p className="text-[13.5px] font-semibold text-ds-text">
                                  Batch-wise stock
                                </p>
                                <p className="text-[12px] text-ds-muted">
                                  Internal stock remains batch-wise for GRN and transfers.
                                </p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className={cn(tableStyles.table, 'min-w-[560px]')}>
                                  <thead className="border-y border-ds-divider bg-ds-subtle text-left text-[12px] text-ds-muted">
                                    <tr>
                                      <th className={tableStyles.th}>Batch</th>
                                      <th className={tableStyles.th}>Expiry</th>
                                      <th className={cn(tableStyles.th, 'text-right')}>
                                        Available
                                      </th>
                                      <th className={cn(tableStyles.th, 'text-right')}>Reserved</th>
                                      <th className={tableStyles.th}>Status</th>
                                      <th className={tableStyles.th}>
                                        <span className="sr-only">Actions</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {summary.batches.map((batch: StoreStockBatchSummary) => (
                                      <tr
                                        className="border-t border-ds-divider first:border-t-0"
                                        key={batch.stockBalanceId}
                                      >
                                        <td className={cn('px-4 py-2.5', tableStyles.code)}>
                                          {batch.batchNumber ?? '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-ds-muted">
                                          {formatDateOnly(batch.expiryDate)}
                                        </td>
                                        <td
                                          className={cn(
                                            'px-4 py-2.5 text-right font-semibold text-ds-text',
                                            tableStyles.num,
                                          )}
                                        >
                                          {formatQuantity(batch.availableQty)}
                                        </td>
                                        <td
                                          className={cn(
                                            'px-4 py-2.5 text-right text-ds-text-2',
                                            tableStyles.num,
                                          )}
                                        >
                                          {formatQuantity(batch.reservedQty)}
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <StatusChip status={batch.status} />
                                        </td>
                                        <td className="px-2 py-1.5 text-right">
                                          <DiscardBatchButton
                                            batch={{
                                              availableQty: batch.availableQty,
                                              batchNumber: batch.batchNumber,
                                              expiryDate: batch.expiryDate,
                                              itemName: summary.itemName,
                                              locationName: summary.storeName,
                                              stockBalanceId: batch.stockBalanceId,
                                            }}
                                            onDiscard={setDiscarding}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <QueryState
                  colSpan={columns}
                  error={stockQuery.error}
                  isError={stockQuery.isError}
                  isLoading={stockQuery.isLoading}
                  hint="Stock arrives when a GRN is posted to a store, or nothing matches the filters."
                  label="store stock"
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
