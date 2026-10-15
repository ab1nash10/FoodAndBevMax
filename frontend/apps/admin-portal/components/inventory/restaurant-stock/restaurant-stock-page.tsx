'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Restaurant, SortOrder, StockBalanceStatus } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Badge, Input, Panel, Select } from '@/components/ui';
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
} from '@/components/inventory/shared/components';
import type { ItemTypeFilter } from '@/components/inventory/shared/types';
import {
  formatDateOnly,
  formatEnum,
  listLimit,
  stockStatuses,
  useHospitals,
  useItems,
  useRestaurants,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
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

  return (
    <section className="space-y-5">
      <PageHeader
        subtitle="Current restaurant stock received from acknowledged transfers."
        title="Restaurant Stock"
      />
      <Panel>
        <ListToolbar>
          <SearchInput
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
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[18%] px-4 py-2.5">Restaurant</th>
                <th className="w-[12%] px-4 py-2.5">Source</th>
                <th className="w-[20%] px-4 py-2.5">Item</th>
                <th className="w-[14%] px-4 py-2.5">Batch</th>
                <th className="w-[14%] px-4 py-2.5">Expiry / Date</th>
                <th className="w-[12%] px-4 py-2.5">Available Qty</th>
                <th className="w-[10%] px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((stock) => (
                  <tr className="hover:bg-ds-subtle" key={stock.id}>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          stock.location.type,
                          stock.location.code || stock.location.name,
                        )}
                      >
                        {stock.location.name}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{stock.location.code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {stock.itemType === 'READYMADE' ? 'Kitchen' : 'Store'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: stock.item.id })}
                      >
                        {stock.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{stock.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{stock.batchNumber ?? 'No batch'}</td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {stock.itemType === 'READYMADE'
                        ? formatDateOnly(stock.businessDate)
                        : formatDateOnly(stock.expiryDate)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={stock.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
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
