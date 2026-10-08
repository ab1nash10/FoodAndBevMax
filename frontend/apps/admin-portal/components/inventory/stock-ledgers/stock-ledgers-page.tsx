'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  InventoryLocationType,
  SortOrder,
  StockLedger,
  StockReferenceType,
  StockTransactionType,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { Badge, Input, Panel, Select } from '@/components/ui';
import { RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import { organizationApi } from '@/lib/api';
import { useOnScopeChange, useUrlNumberParam, useUrlSearchParam } from '@/lib/use-url-state';
import {
  HospitalSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/inventory/shared/components';
import {
  formatDate,
  formatDateOnly,
  formatEnum,
  listLimit,
  useHospitals,
  useItems,
  useKitchens,
  useRestaurants,
  useStores,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

const stockLedgerLocationTypes: InventoryLocationType[] = ['STORE', 'KITCHEN', 'RESTAURANT'];

const stockReferenceTypes: StockReferenceType[] = [
  'GRN',
  'KITCHEN_PRODUCTION',
  'TRANSFER',
  'TRANSFER_ACKNOWLEDGEMENT',
];

const stockTransactionTypes: StockTransactionType[] = [
  'GRN_IN',
  'KITCHEN_PRODUCTION_IN',
  'KITCHEN_TRANSFER_OUT',
  'RESTAURANT_TRANSFER_IN',
  'RESTAURANT_RECEIVE_IN',
  'STORE_TO_RESTAURANT_OUT',
  'TRANSFER_REJECTED_RETURN_IN',
];

export function StockLedgersPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [locationTypeFilter, setLocationTypeFilter] = useState<'' | InventoryLocationType>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'' | StockTransactionType>('');
  const [referenceTypeFilter, setReferenceTypeFilter] = useState<'' | StockReferenceType>('');
  const [businessDateFilter, setBusinessDateFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('transactionDateTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const kitchensQuery = useKitchens(hospitalFilter);
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const itemOptionsQuery = useItems();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setLocationTypeFilter('');
    setLocationFilter('');
    setPage(1);
  });

  const locationOptions =
    locationTypeFilter === 'STORE'
      ? storesQuery.data?.map((store) => ({
          code: store.storeCode,
          id: store.id,
          name: store.storeName,
        }))
      : locationTypeFilter === 'KITCHEN'
        ? kitchensQuery.data?.map((kitchen) => ({
            code: kitchen.kitchenCode,
            id: kitchen.id,
            name: kitchen.kitchenName,
          }))
        : locationTypeFilter === 'RESTAURANT'
          ? restaurantsQuery.data?.map((restaurant) => ({
              code: restaurant.restaurantCode,
              id: restaurant.id,
              name: restaurant.restaurantName,
            }))
          : [];

  const ledgersQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStockLedgers({
        businessDate: businessDateFilter || undefined,
        fromDate: fromDateFilter || undefined,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        limit: listLimit,
        locationId: locationFilter,
        locationType: locationTypeFilter || undefined,
        page,
        referenceType: referenceTypeFilter || undefined,
        search,
        sortBy,
        sortOrder,
        toDate: toDateFilter || undefined,
        transactionType: transactionTypeFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.stockLedgers(
      page,
      search,
      hospitalFilter,
      locationTypeFilter,
      locationFilter,
      itemFilter,
      transactionTypeFilter,
      referenceTypeFilter,
      businessDateFilter,
      fromDateFilter,
      toDateFilter,
      sortBy,
      sortOrder,
    ),
  });

  const ledgers = ledgersQuery.data?.items ?? [];
  const meta = ledgersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  return (
    <section className="space-y-5">
      <PageHeader
        subtitle="Read-only movement history across store, kitchen, and restaurant stock."
        title="Stock Ledgers"
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
          <HospitalSelect
            disabled={Boolean(scopedHospitalId)}
            hospitals={hospitalsQuery.data ?? []}
            onChange={(value) => {
              setHospitalFilter(value);
              setLocationFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            onChange={(event) => {
              setLocationTypeFilter(event.target.value as '' | InventoryLocationType);
              setLocationFilter('');
              setPage(1);
            }}
            value={locationTypeFilter}
          >
            <option value="">All location types</option>
            {stockLedgerLocationTypes.map((locationType) => (
              <option key={locationType} value={locationType}>
                {formatEnum(locationType)}
              </option>
            ))}
          </Select>
          <Select
            disabled={!locationTypeFilter || !hospitalFilter}
            onChange={(event) => {
              setLocationFilter(event.target.value);
              setPage(1);
            }}
            value={locationFilter}
          >
            <option value="">All locations</option>
            {locationOptions?.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
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
          <Select
            onChange={(event) => {
              setTransactionTypeFilter(event.target.value as '' | StockTransactionType);
              setPage(1);
            }}
            value={transactionTypeFilter}
          >
            <option value="">All transaction types</option>
            {stockTransactionTypes.map((transactionType) => (
              <option key={transactionType} value={transactionType}>
                {formatEnum(transactionType)}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setReferenceTypeFilter(event.target.value as '' | StockReferenceType);
              setPage(1);
            }}
            value={referenceTypeFilter}
          >
            <option value="">All reference types</option>
            {stockReferenceTypes.map((referenceType) => (
              <option key={referenceType} value={referenceType}>
                {formatEnum(referenceType)}
              </option>
            ))}
          </Select>
          <Input
            onChange={(event) => {
              setBusinessDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={businessDateFilter}
          />
          <Input
            onChange={(event) => {
              setFromDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={fromDateFilter}
          />
          <Input
            onChange={(event) => {
              setToDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={toDateFilter}
          />
          <Select
            onChange={(event) => {
              setSortOrder(event.target.value as SortOrder);
              setPage(1);
            }}
            value={sortOrder}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
          <Button onClick={() => void ledgersQuery.refetch()} type="button" variant="outline">
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
            <option value="transactionDateTime">Transaction date</option>
            <option value="businessDate">Business date</option>
            <option value="createdAt">Created date</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[16%] px-4 py-2.5">Location</th>
                <th className="w-[16%] px-4 py-2.5">Item</th>
                <th className="w-[11%] px-4 py-2.5">Transaction</th>
                <th className="w-[11%] px-4 py-2.5">Reference</th>
                <th className="w-[10%] px-4 py-2.5">Qty In</th>
                <th className="w-[10%] px-4 py-2.5">Qty Out</th>
                <th className="w-[10%] px-4 py-2.5">Balance</th>
                <th className="w-[12%] px-4 py-2.5">Batch</th>
                <th className="w-[12%] px-4 py-2.5">Business Date</th>
                <th className="w-[15%] px-4 py-2.5">Transaction Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {ledgers.length > 0 ? (
                ledgers.map((ledger: StockLedger) => (
                  <tr className="hover:bg-ds-subtle" key={ledger.id}>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          ledger.locationType,
                          ledger.location.code || ledger.location.name,
                        )}
                      >
                        {ledger.location.name}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">
                        {formatEnum(ledger.locationType)} - {ledger.location.code ?? '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: ledger.item.id })}
                      >
                        {ledger.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{ledger.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {formatEnum(ledger.transactionType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {ledger.referenceType ? formatEnum(ledger.referenceType) : '-'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-teal-text">
                      {ledger.qtyIn.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-status-bad-fg">
                      {ledger.qtyOut.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {ledger.balanceAfter.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{ledger.batchNumber ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(ledger.businessDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(ledger.transactionDateTime)}
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={10}
                  error={ledgersQuery.error}
                  isError={ledgersQuery.isError}
                  isLoading={ledgersQuery.isLoading}
                  label="stock ledgers"
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
