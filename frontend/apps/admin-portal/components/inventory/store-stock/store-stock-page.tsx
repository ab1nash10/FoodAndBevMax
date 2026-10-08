'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type {
  ItemType,
  SortOrder,
  StockBalanceStatus,
  StoreStockBatchSummary,
  StoreStockSummary,
} from '@aahar/api-client';
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

const stockItemTypes: ItemType[] = ['MRP', 'READYMADE', 'LIVE'];

export function StoreStockPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
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
  const itemOptionsQuery = useItems(itemTypeFilter || undefined, hospitalFilter);

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

  const items = stockQuery.data?.items ?? [];
  const meta = stockQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  function toggleSummary(summary: StoreStockSummary) {
    const key = `${summary.storeId}:${summary.itemId}`;

    setExpandedRows((current) =>
      current.includes(key) ? current.filter((rowKey) => rowKey !== key) : [...current, key],
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader
        subtitle="Current store stock summarized by store and item, with batch details on expand."
        title="Store Stock"
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
              setStoreFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <StoreSelect
            disabled={!hospitalFilter}
            onChange={(value) => {
              setStoreFilter(value);
              setPage(1);
            }}
            stores={storesQuery.data ?? []}
            value={storeFilter}
          />
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
          <Input
            onChange={(event) => {
              setBatchFilter(event.target.value);
              setPage(1);
            }}
            placeholder="Batch number"
            value={batchFilter}
          />
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="lastUpdatedOn">Last updated</option>
            <option value="availableQty">Available qty</option>
            <option value="expiryDate">Expiry date</option>
          </Select>
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
          <Button onClick={() => void stockQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[6%] px-4 py-2.5">View</th>
                <th className="w-[18%] px-4 py-2.5">Store</th>
                <th className="w-[20%] px-4 py-2.5">Item</th>
                <th className="w-[14%] px-4 py-2.5">Category</th>
                <th className="w-[12%] px-4 py-2.5">Total Available</th>
                <th className="w-[12%] px-4 py-2.5">Reserved Qty</th>
                <th className="w-[10%] px-4 py-2.5">Batches</th>
                <th className="w-[14%] px-4 py-2.5">Nearest Expiry</th>
                <th className="w-[12%] px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((summary: StoreStockSummary) => {
                  const rowKey = `${summary.storeId}:${summary.itemId}`;
                  const isExpanded = expandedRows.includes(rowKey);

                  return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-ds-subtle">
                        <td className="px-4 py-3">
                          <Button
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse batches' : 'Expand batches'}
                            onClick={() => toggleSummary(summary)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <RecordLink
                            className="block font-medium text-ds-text"
                            href={locationHref('STORE', summary.storeCode || summary.storeName)}
                          >
                            {summary.storeName}
                          </RecordLink>
                          <p className="text-xs text-ds-muted">{summary.storeCode ?? '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <RecordLink
                            className="block font-medium text-ds-text"
                            href={recordHref('/masters/items', { id: summary.itemId })}
                          >
                            {summary.itemName}
                          </RecordLink>
                          <p className="text-xs text-ds-muted">{summary.itemCode}</p>
                        </td>
                        <td className="px-4 py-3 text-ds-text-3">{summary.categoryName ?? '-'}</td>
                        <td className="px-4 py-3">
                          <p className="text-lg font-semibold text-ds-text">
                            {formatQuantity(summary.totalAvailableQty)}
                          </p>
                          <p className="text-xs text-ds-muted">{formatEnum(summary.itemType)}</p>
                        </td>
                        <td className="px-4 py-3 text-ds-text-3">
                          {formatQuantity(summary.totalReservedQty)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                            {summary.batchCount}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                          {formatDateOnly(summary.nearestExpiryDate)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={summary.status} />
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${rowKey}:batches`} className="bg-ds-subtle/70">
                          <td className="px-4 py-3" colSpan={9}>
                            <div className="rounded-lg border bg-white p-3 shadow-xs">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-ds-text">
                                    Batch-wise stock
                                  </p>
                                  <p className="text-xs text-ds-muted">
                                    Internal stock remains batch-wise for GRN and transfers.
                                  </p>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-ds-divider text-sm">
                                  <thead className="text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
                                    <tr>
                                      <th className="px-3 py-2">Batch Number</th>
                                      <th className="px-3 py-2">Expiry Date</th>
                                      <th className="px-3 py-2">Available Qty</th>
                                      <th className="px-3 py-2">Reserved Qty</th>
                                      <th className="px-3 py-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-ds-divider">
                                    {summary.batches.map((batch: StoreStockBatchSummary) => (
                                      <tr key={batch.stockBalanceId}>
                                        <td className="px-3 py-3 font-medium text-ds-text">
                                          {batch.batchNumber ?? '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-ds-text-3">
                                          {formatDateOnly(batch.expiryDate)}
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-ds-text">
                                          {formatQuantity(batch.availableQty)}
                                        </td>
                                        <td className="px-3 py-3 text-ds-text-3">
                                          {formatQuantity(batch.reservedQty)}
                                        </td>
                                        <td className="px-3 py-3">
                                          <StatusChip status={batch.status} />
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
                  colSpan={9}
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
