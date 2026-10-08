'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, IndianRupee, Pencil, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ItemPrice, SortOrder } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Input, Panel, Select } from '@/components/ui';
import { DetailsModal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { invalidateItemPriceQueries } from '@/lib/query-invalidation';
import {
  formatLocationOption,
  useHospitalOptions,
  useRestaurantOptions,
  type RateTypeFilter,
} from '@/components/master-data/item-prices/options';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
} from '@/components/master-data/shared/components';
import type { ActiveFilter, ItemTypeFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  formatDate,
  formatDateOnly,
  formatEnum,
  itemTypeValues,
  listLimit,
  optionalValue,
  rateTypeValues,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { itemPriceDetailQuery, prefetchOnIntent } from '@/lib/detail-queries';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

export function ItemPricesPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [rateTypeFilter, setRateTypeFilter] = useState<RateTypeFilter>('');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewingPrice, setViewingPrice] = useState<ItemPrice | null>(null);
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setRestaurantFilter('');
    setPage(1);
  });

  const itemPricesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listItemPrices({
        effectiveDate: optionalValue(effectiveDate),
        hospitalId: hospitalFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        itemType: itemTypeFilter || undefined,
        limit: listLimit,
        page,
        rateType: rateTypeFilter || undefined,
        restaurantId: restaurantFilter || undefined,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: queryKeys.itemPrices({
      activeFilter,
      effectiveDate,
      hospitalFilter,
      itemTypeFilter,
      page,
      rateTypeFilter,
      restaurantFilter,
      search,
      sortBy,
      sortOrder,
    }),
  });

  const toggleItemPriceStatusMutation = useMutation({
    mutationFn: ({ isActive, price }: { isActive: boolean; price: ItemPrice }) =>
      organizationApi.updateItemPrice(price.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item price status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemPriceQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Item price activated' : 'Item price marked inactive',
        variant: 'success',
      });
    },
  });

  const items = itemPricesQuery.data?.items ?? [];
  const meta = itemPricesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  function toggleItemPriceStatus(price: ItemPrice) {
    const nextIsActive = !price.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this price inactive will prevent it from being used by future restaurant operations and POS. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleItemPriceStatusMutation.mutate({ isActive: nextIsActive, price });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/item-prices/new">
            <Button asChild>
              <Link href="/masters/item-prices/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Master Data"
        icon={IndianRupee}
        subtitle="Define sale pricing by location, restaurant, item, and rate type."
        title="Item Prices"
      />

      <Panel>
        <div className="grid gap-3 border-b border-ds-divider p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:[&>*:first-child]:col-span-2 [&>button]:justify-self-start">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <Select
            disabled={Boolean(scopedHospitalId)}
            onChange={(event) => {
              setHospitalFilter(event.target.value);
              setRestaurantFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          >
            <option value="">All locations</option>
            {hospitalsQuery.data?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
          <Select
            disabled={!hospitalFilter}
            onChange={(event) => {
              setRestaurantFilter(event.target.value);
              setPage(1);
            }}
            value={restaurantFilter}
          >
            <option value="">All restaurants</option>
            {restaurantsQuery.data?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setItemTypeFilter(event.target.value as ItemTypeFilter);
              setPage(1);
            }}
            value={itemTypeFilter}
          >
            <option value="">All item types</option>
            {itemTypeValues.map((itemType) => (
              <option key={itemType} value={itemType}>
                {formatEnum(itemType)}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setRateTypeFilter(event.target.value as RateTypeFilter);
              setPage(1);
            }}
            value={rateTypeFilter}
          >
            <option value="">All rate types</option>
            {rateTypeValues.map((rateType) => (
              <option key={rateType} value={rateType}>
                {formatEnum(rateType)}
              </option>
            ))}
          </Select>
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <Input
            onChange={(event) => {
              setEffectiveDate(event.target.value);
              setPage(1);
            }}
            type="date"
            value={effectiveDate}
          />
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void itemPricesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="price">Price</option>
            <option value="rateType">Rate type</option>
            <option value="effectiveFrom">Effective from</option>
            <option value="effectiveTo">Effective to</option>
            <option value="isActive">Status</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[17%] px-4 py-2.5">Location</th>
                <th className="w-[14%] px-4 py-2.5">Restaurant</th>
                <th className="w-[16%] px-4 py-2.5">Item</th>
                <th className="w-[11%] px-4 py-2.5">Item Type</th>
                <th className="w-[10%] px-4 py-2.5">Rate Type</th>
                <th className="w-[10%] px-4 py-2.5">Price</th>
                <th className="w-[10%] px-4 py-2.5">Tax Inclusive</th>
                <th className="w-[9%] px-4 py-2.5">GST %</th>
                <th className="w-[12%] px-4 py-2.5">Effective From</th>
                <th className="w-[12%] px-4 py-2.5">Effective To</th>
                <th className="w-[9%] px-4 py-2.5">Status</th>
                <th className="w-[13%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[15%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[16%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((price) => (
                  <tr className="hover:bg-ds-subtle" key={price.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ds-text">
                        {price.hospital.displayName ?? price.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-ds-muted">{price.hospital.hospitalCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {price.restaurant ? (
                        <RecordLink
                          href={locationHref(
                            'RESTAURANT',
                            price.restaurant.restaurantCode || price.restaurant.restaurantName,
                          )}
                        >
                          {price.restaurant.restaurantName}
                        </RecordLink>
                      ) : (
                        'All restaurants'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: price.item.id })}
                      >
                        {price.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{price.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{formatEnum(price.item.itemType)}</td>
                    <td className="px-4 py-3">
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {formatEnum(price.rateType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {formatCurrency(price.price)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={price.isTaxInclusive ? 'success' : 'neutral'}>
                        {price.isTaxInclusive ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {price.gstPercent === null ? '-' : `${price.gstPercent}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(price.effectiveFrom)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(price.effectiveTo)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={price.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        ariaLabel={`${price.item.itemName} ${formatEnum(price.rateType)} price active`}
                        checked={price.isActive}
                        disabled={toggleItemPriceStatusMutation.isPending}
                        onChange={() => toggleItemPriceStatus(price)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(price.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(price.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <IfCanOpen href={`/masters/item-prices/${price.id}/edit`}>
                          <Button asChild size="sm" type="button" variant="outline">
                            <Link
                              href={`/masters/item-prices/${price.id}/edit`}
                              {...prefetchOnIntent(() =>
                                queryClient.prefetchQuery(itemPriceDetailQuery(price.id)),
                              )}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </Button>
                        </IfCanOpen>
                        <Button
                          onClick={() => setViewingPrice(price)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={15}
                  error={itemPricesQuery.error}
                  isError={itemPricesQuery.isError}
                  isLoading={itemPricesQuery.isLoading}
                  label="item prices"
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
      <DetailsModal
        onClose={() => setViewingPrice(null)}
        rows={
          viewingPrice && [
            [
              'Location',
              `${viewingPrice.hospital.displayName ?? viewingPrice.hospital.hospitalName} (${viewingPrice.hospital.hospitalCode})`,
            ],
            ['Restaurant', viewingPrice.restaurant?.restaurantName ?? 'All restaurants'],
            ['Item', `${viewingPrice.item.itemName} (${viewingPrice.item.itemCode})`],
            ['Item Type', formatEnum(viewingPrice.item.itemType)],
            ['Rate Type', formatEnum(viewingPrice.rateType)],
            ['Price', formatCurrency(viewingPrice.price)],
            ['Tax Inclusive', viewingPrice.isTaxInclusive ? 'Yes' : 'No'],
            ['GST %', viewingPrice.gstPercent === null ? '-' : `${viewingPrice.gstPercent}%`],
            ['Effective From', formatDateOnly(viewingPrice.effectiveFrom)],
            ['Effective To', formatDateOnly(viewingPrice.effectiveTo)],
            ['Status', <StatusBadge isActive={viewingPrice.isActive} key="status" />],
            ['Created', formatDate(viewingPrice.createdAt)],
            ['Updated', formatDate(viewingPrice.updatedAt)],
          ]
        }
        title="Item Price"
      />
    </section>
  );
}
