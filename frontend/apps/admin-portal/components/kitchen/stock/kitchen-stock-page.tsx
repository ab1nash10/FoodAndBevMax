'use client';

import {
  DiscardBatchButton,
  DiscardStockDialog,
  type DiscardableBatch,
} from '@/components/inventory/discard-stock-dialog';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Item, ItemType, SortOrder, StockBalanceStatus } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import {
  AppPageHeader,
  DateTimeCell,
  RecordAvatar,
  StatStrip,
  StatusChip,
  tableStyles,
} from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel, Select } from '@/components/ui';
import { FilterSearch } from '@/components/ui-controls';
import { organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { locationHref, recordHref } from '@/lib/navigation';
import {
  HospitalSelect,
  KitchenSelect,
  PaginationControls,
} from '@/components/kitchen/shared/components';
import {
  formatDate,
  listLimit,
  useHospitals,
  useKitchens,
} from '@/components/kitchen/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { QueryState } from '@/components/location-empty-states';
import { useIsPhone } from '@/lib/use-is-phone';
import { cn } from '@/lib/utils';

const kitchenStockStatuses: StockBalanceStatus[] = ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'];

const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return dateOnlyFormatter.format(new Date(value));
}

function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function useItems(itemType?: ItemType) {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        itemType,
        limit: 100,
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.itemOptions('kitchen-stock', itemType ?? 'all'),
  });
}

export function KitchenStockPageClient() {
  const [discarding, setDiscarding] = useState<DiscardableBatch | null>(null);
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  // Phones show three of the seven columns; a row that spans them all has to say so.
  const columns = useIsPhone() ? 3 : 7;
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [businessDateFilter, setBusinessDateFilter] = useState('');
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
  const kitchensQuery = useKitchens(hospitalFilter);
  const itemOptionsQuery = useItems('READYMADE');

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setKitchenFilter('');
    setPage(1);
  });

  const stockQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listKitchenStock({
        businessDate: businessDateFilter || undefined,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        itemType: 'READYMADE',
        limit: listLimit,
        locationId: kitchenFilter,
        page,
        search,
        sortBy,
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.kitchenStock(
      page,
      search,
      hospitalFilter,
      kitchenFilter,
      itemFilter,
      businessDateFilter,
      statusFilter,
      sortBy,
      sortOrder,
    ),
  });

  // Every status's total at the chosen location and kitchen, whatever the list shows now.
  const statsQuery = useQuery({
    queryFn: async () => {
      const { meta } = (
        await organizationApi.listKitchenStock({
          hospitalId: hospitalFilter,
          itemType: 'READYMADE',
          limit: 0,
          locationId: kitchenFilter,
          statusCounts: true,
        })
      ).data;
      const count = (status: StockBalanceStatus) => meta.statusCounts?.[status] ?? 0;

      return {
        all: meta.total,
        AVAILABLE: count('AVAILABLE'),
        LOW_STOCK: count('LOW_STOCK'),
        OUT_OF_STOCK: count('OUT_OF_STOCK'),
      };
    },
    queryKey: queryKeys.kitchenStock('stats', hospitalFilter, kitchenFilter),
  });
  const stats = statsQuery.data;
  const items = stockQuery.data?.items ?? [];
  const meta = stockQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    kitchenFilter ||
    statusFilter ||
    itemFilter ||
    businessDateFilter,
  );

  function clearFilters() {
    setSearch('');
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setStatusFilter('');
    setItemFilter('');
    setBusinessDateFilter('');
    setPage(1);
  }

  function showStatus(status: '' | StockBalanceStatus) {
    setStatusFilter(status);
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <DiscardStockDialog batch={discarding} onClose={() => setDiscarding(null)} />
      <AppPageHeader
        count={stats?.all}
        description="Current READYMADE stock posted from kitchen production entries."
        title="Kitchen Stock"
      />
      <StatStrip
        label="Kitchen stock at a glance"
        stats={[
          {
            active: !statusFilter,
            label: 'All stock lines',
            onSelect: () => showStatus(''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: statusFilter === 'AVAILABLE',
            label: 'Available',
            onSelect: () => showStatus('AVAILABLE'),
            share: stats?.all ? stats.AVAILABLE / stats.all : undefined,
            tone: 'ok',
            value: stats?.AVAILABLE ?? '–',
          },
          {
            active: statusFilter === 'LOW_STOCK',
            label: 'Low stock',
            onSelect: () => showStatus('LOW_STOCK'),
            share: stats?.all ? stats.LOW_STOCK / stats.all : undefined,
            tone: 'pending',
            value: stats?.LOW_STOCK ?? '–',
          },
          {
            active: statusFilter === 'OUT_OF_STOCK',
            label: 'Out of stock',
            onSelect: () => showStatus('OUT_OF_STOCK'),
            share: stats?.all ? stats.OUT_OF_STOCK / stats.all : undefined,
            tone: 'bad',
            value: stats?.OUT_OF_STOCK ?? '–',
          },
        ]}
      />
      <Panel className="overflow-hidden">
        <ListToolbar>
          <FilterSearch
            label="Search kitchen stock"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Item name or code, batch or location"
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [
                hospitalFilter !== (scopedHospitalId ?? ''),
                kitchenFilter,
                statusFilter,
                itemFilter,
                businessDateFilter,
              ].filter(Boolean).length
            }
          >
            <FilterField label="Location">
              <HospitalSelect
                disabled={Boolean(scopedHospitalId)}
                hospitals={hospitalsQuery.data ?? []}
                onChange={(value) => {
                  setHospitalFilter(value);
                  setKitchenFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              />
            </FilterField>
            <FilterField label="Kitchen">
              <KitchenSelect
                disabled={!hospitalFilter}
                kitchens={kitchensQuery.data ?? []}
                onChange={(value) => {
                  setKitchenFilter(value);
                  setPage(1);
                }}
                value={kitchenFilter}
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
                {kitchenStockStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnum(status)}
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
            <FilterField label="Business date">
              <Input
                onChange={(event) => {
                  setBusinessDateFilter(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={businessDateFilter}
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
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton
            onClick={() => {
              void stockQuery.refetch();
              void statsQuery.refetch();
            }}
          />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed sm:min-w-[880px]')}>
            <thead className={tableStyles.head}>
              {/* Phones: only item, available and status; the item names its day and kitchen. */}
              <tr>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[18%]')}>Kitchen</th>
                <th className={cn(tableStyles.th, 'sm:w-[20%]')}>Item</th>
                <th className={cn(tableStyles.th, 'w-24 text-right sm:w-[12%]')}>Available qty</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[11%] text-right')}>
                  Reserved qty
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[13%]')}>
                  Business date
                </th>
                <th className={cn(tableStyles.th, 'w-[120px] sm:w-[12%]')}>Status</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[14%]')}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((stock) => (
                  // A stock line has no panel of its own: its kitchen and item link to theirs.
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
                          <p className={cn('truncate', tableStyles.code)}>{stock.item.itemCode}</p>
                          <p className="truncate text-[12px] text-ds-muted sm:hidden">
                            {formatDateOnly(stock.businessDate)} · {stock.location.name}
                          </p>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right text-ds-text')}>
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.num,
                        tableStyles.phoneHidden,
                        'text-right text-ds-text-3',
                      )}
                    >
                      {stock.reservedQty.toFixed(3)}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.phoneHidden,
                        'whitespace-nowrap text-ds-text-3',
                      )}
                    >
                      {formatDateOnly(stock.businessDate)}
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
                    <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                      <DateTimeCell
                        title={`Created ${formatDate(stock.createdAt)}`}
                        value={stock.updatedAt}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={columns}
                  error={stockQuery.error}
                  isError={stockQuery.isError}
                  isLoading={stockQuery.isLoading}
                  hint="Stock arrives when a production is posted, or nothing matches the filters."
                  label="kitchen stock"
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          noun="stock line"
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
