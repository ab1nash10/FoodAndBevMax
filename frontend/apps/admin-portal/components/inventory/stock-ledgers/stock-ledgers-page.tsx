'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  InventoryLocationType,
  SortOrder,
  StockLedger,
  StockReferenceType,
  StockTransactionType,
} from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { DateTimeCell, StatStrip, tableStyles } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel, Select } from '@/components/ui';
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
import { cn } from '@/lib/utils';

const stockLedgerLocationTypes: InventoryLocationType[] = [
  'STORE',
  'KITCHEN',
  'RESTAURANT',
  'COUNTER',
];

const stockReferenceTypes: StockReferenceType[] = [
  'GRN',
  'KITCHEN_PRODUCTION',
  'TRANSFER',
  'TRANSFER_ACKNOWLEDGEMENT',
  'ORDER',
];

const stockTransactionTypes: StockTransactionType[] = [
  'GRN_IN',
  'KITCHEN_PRODUCTION_IN',
  'KITCHEN_TRANSFER_OUT',
  'RESTAURANT_TRANSFER_IN',
  'RESTAURANT_RECEIVE_IN',
  'STORE_TO_RESTAURANT_OUT',
  'TRANSFER_REJECTED_RETURN_IN',
  'COUNTER_RECEIVE_IN',
  'SALE_OUT',
  'SALE_CANCEL_IN',
];

// The filter's names, which have to tell every type apart.
const transactionLabels: Partial<Record<StockTransactionType, string>> = {
  COUNTER_RECEIVE_IN: 'Counter receipt',
  GRN_IN: 'GRN receipt',
  KITCHEN_PRODUCTION_IN: 'Kitchen production',
  KITCHEN_TRANSFER_OUT: 'Kitchen transfer out',
  RESTAURANT_RECEIVE_IN: 'Restaurant receipt',
  RESTAURANT_TRANSFER_IN: 'Restaurant transfer in',
  SALE_CANCEL_IN: 'Sale cancelled',
  SALE_OUT: 'Sale',
  STORE_TO_RESTAURANT_OUT: 'Store transfer out',
  TRANSFER_REJECTED_RETURN_IN: 'Rejected transfer return',
};

// The table's names, one line each: the Location column already says store, kitchen or restaurant.
const shortTransactionLabels: Partial<Record<StockTransactionType, string>> = {
  COUNTER_RECEIVE_IN: 'Received',
  KITCHEN_PRODUCTION_IN: 'Production',
  KITCHEN_TRANSFER_OUT: 'Transfer out',
  RESTAURANT_RECEIVE_IN: 'Received',
  RESTAURANT_TRANSFER_IN: 'Transfer in',
  STORE_TO_RESTAURANT_OUT: 'Transfer out',
  TRANSFER_REJECTED_RETURN_IN: 'Returned',
};

const referenceLabels: Partial<Record<StockReferenceType, string>> = {
  GRN: 'GRN',
  KITCHEN_PRODUCTION: 'Production',
  ORDER: 'Bill',
  TRANSFER: 'Transfer',
  TRANSFER_ACKNOWLEDGEMENT: 'Acknowledged',
};

// The page that opens a row's document (an acknowledgement comes as its transfer, a sale as
// its bill).
const referencePages: Record<NonNullable<StockLedger['referenceDocument']>['type'], string> = {
  GRN: '/inventory/grns',
  KITCHEN_PRODUCTION: '/kitchen/productions',
  ORDER: '/pos/history',
  TRANSFER: '/inventory/transfers',
};

function transactionLabel(type: StockTransactionType): string {
  return transactionLabels[type] ?? formatEnum(type);
}

function referenceLabel(type: StockReferenceType): string {
  return referenceLabels[type] ?? formatEnum(type);
}

function referenceHref(ledger: StockLedger): string | null {
  const document = ledger.referenceDocument;

  return document ? recordHref(referencePages[document.type], { id: document.id }) : null;
}

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

  // The strip's numbers: every entry at the location, then the documents that move stock most.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (referenceType?: StockReferenceType) =>
        (
          await organizationApi.listStockLedgers({
            hospitalId: hospitalFilter,
            limit: 0,
            referenceType,
          })
        ).data.meta.total;
      const [all, grns, dispatched, acknowledged] = await Promise.all([
        count(),
        count('GRN'),
        count('TRANSFER'),
        count('TRANSFER_ACKNOWLEDGEMENT'),
      ]);

      return { acknowledged, all, dispatched, grns };
    },
    queryKey: queryKeys.stockLedgers('stats', hospitalFilter),
  });
  const stats = statsQuery.data;
  const ledgers = ledgersQuery.data?.items ?? [];
  const meta = ledgersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput ||
    hospitalFilter !== (scopedHospitalId ?? '') ||
    locationTypeFilter ||
    locationFilter ||
    itemFilter ||
    transactionTypeFilter ||
    referenceTypeFilter ||
    businessDateFilter ||
    fromDateFilter ||
    toDateFilter,
  );

  function clearFilters() {
    setSearch('');
    setHospitalFilter(scopedHospitalId ?? '');
    setLocationTypeFilter('');
    setLocationFilter('');
    setItemFilter('');
    setTransactionTypeFilter('');
    setReferenceTypeFilter('');
    setBusinessDateFilter('');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(1);
  }

  /** A stat's reference type alone; picking the one in force goes back to every entry. */
  function showReference(referenceType: '' | StockReferenceType) {
    setReferenceTypeFilter((current) => (current === referenceType ? '' : referenceType));
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <PageHeader
        count={stats?.all}
        subtitle="Read-only movement history across store, kitchen, restaurant and counter stock."
        title="Stock Ledgers"
      />
      <StatStrip
        label="Stock movements at a glance"
        stats={[
          {
            active: !referenceTypeFilter,
            label: 'All entries',
            onSelect: () => showReference(''),
            value: stats?.all ?? '–',
          },
          {
            active: referenceTypeFilter === 'GRN',
            label: 'GRN receipts · in',
            onSelect: () => showReference('GRN'),
            tone: 'ok',
            value: stats?.grns ?? '–',
          },
          {
            active: referenceTypeFilter === 'TRANSFER',
            label: 'Transfers dispatched · out',
            onSelect: () => showReference('TRANSFER'),
            tone: 'pending',
            value: stats?.dispatched ?? '–',
          },
          {
            active: referenceTypeFilter === 'TRANSFER_ACKNOWLEDGEMENT',
            label: 'Transfers acknowledged · in',
            onSelect: () => showReference('TRANSFER_ACKNOWLEDGEMENT'),
            tone: 'ok',
            value: stats?.acknowledged ?? '–',
          },
        ]}
      />
      <Panel aria-label="Stock ledger" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search stock ledgers"
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
                locationTypeFilter,
                locationFilter,
                itemFilter,
                transactionTypeFilter,
                referenceTypeFilter,
                businessDateFilter,
                fromDateFilter,
                toDateFilter,
              ].filter(Boolean).length
            }
          >
            <FilterField label="Location">
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
            </FilterField>
            <FilterField label="Location type">
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
            </FilterField>
            <FilterField label="Store / kitchen / restaurant">
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
            <FilterField label="Transaction type">
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
                    {transactionLabel(transactionType)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Reference type">
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
                    {referenceLabel(referenceType)}
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
            <FilterField label="From">
              <Input
                onChange={(event) => {
                  setFromDateFilter(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={fromDateFilter}
              />
            </FilterField>
            <FilterField label="To">
              <Input
                onChange={(event) => {
                  setToDateFilter(event.target.value);
                  setPage(1);
                }}
                type="date"
                value={toDateFilter}
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
              { label: 'Transaction date', value: 'transactionDateTime' },
              { label: 'Business date', value: 'businessDate' },
              { label: 'Created date', value: 'createdAt' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void ledgersQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[1040px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[16%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[16%]')}>Item</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Transaction</th>
                <th className={cn(tableStyles.th, 'w-[11%]')}>Reference</th>
                <th className={cn(tableStyles.th, 'w-[8%] text-right')}>Qty in</th>
                <th className={cn(tableStyles.th, 'w-[8%] text-right')}>Qty out</th>
                <th className={cn(tableStyles.th, 'w-[8%] text-right')}>Balance</th>
                <th className={cn(tableStyles.th, 'w-[8%]')}>Batch</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Date</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.length > 0 ? (
                ledgers.map((ledger: StockLedger) => (
                  <tr
                    className="border-t border-ds-divider transition-colors hover:bg-ds-selected"
                    key={ledger.id}
                  >
                    <td className={tableStyles.td}>
                      <RecordLink
                        className={cn('block truncate', tableStyles.title)}
                        href={locationHref(
                          ledger.locationType,
                          ledger.location.code || ledger.location.name,
                        )}
                      >
                        {ledger.location.name}
                      </RecordLink>
                      <p className="truncate text-[12px] text-ds-muted">
                        {formatEnum(ledger.locationType)} ·{' '}
                        <span className="font-mono">{ledger.location.code ?? '—'}</span>
                      </p>
                    </td>
                    <td className={tableStyles.td}>
                      <RecordLink
                        className={cn('block truncate', tableStyles.title)}
                        href={recordHref('/masters/items', { id: ledger.item.id })}
                      >
                        {ledger.item.itemName}
                      </RecordLink>
                      <p className={cn('truncate', tableStyles.code)}>{ledger.item.itemCode}</p>
                    </td>
                    <td className={tableStyles.td}>
                      <span
                        className="inline-flex min-h-6 max-w-full items-center rounded-full bg-ds-status-info-bg px-2.5 py-0.5 text-xs font-medium text-ds-status-info-fg"
                        title={transactionLabel(ledger.transactionType)}
                      >
                        <span className="truncate">
                          {shortTransactionLabels[ledger.transactionType] ??
                            transactionLabel(ledger.transactionType)}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                      {/* The document's number (GRN000002); its kind when the record is gone. */}
                      {ledger.referenceDocument ? (
                        <RecordLink
                          className="font-mono text-[12.5px] text-ds-link"
                          href={referenceHref(ledger)}
                        >
                          {ledger.referenceDocument.number}
                        </RecordLink>
                      ) : ledger.referenceType ? (
                        referenceLabel(ledger.referenceType)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.num,
                        'text-right',
                        ledger.qtyIn > 0 ? 'font-semibold text-ds-status-ok-fg' : 'text-ds-muted',
                      )}
                    >
                      {ledger.qtyIn.toFixed(3)}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.num,
                        'text-right',
                        ledger.qtyOut > 0 ? 'font-semibold text-ds-status-bad-fg' : 'text-ds-muted',
                      )}
                    >
                      {ledger.qtyOut.toFixed(3)}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.num,
                        'text-right font-semibold text-ds-text',
                      )}
                    >
                      {ledger.balanceAfter.toFixed(3)}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.code, 'truncate')}>
                      {ledger.batchNumber ?? '—'}
                    </td>
                    <td className={tableStyles.td}>
                      <DateTimeCell
                        // Only when it is not the transaction's own day, e.g. a backdated entry.
                        note={
                          formatDateOnly(ledger.businessDate) !==
                          formatDateOnly(ledger.transactionDateTime)
                            ? `business date ${formatDateOnly(ledger.businessDate)}`
                            : undefined
                        }
                        title={`Business date ${formatDateOnly(ledger.businessDate)}`}
                        value={ledger.transactionDateTime}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={10}
                  error={ledgersQuery.error}
                  isError={ledgersQuery.isError}
                  isLoading={ledgersQuery.isLoading}
                  hint="Every GRN, transfer and production posted here is recorded, or nothing matches the filters."
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
