'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Item, ItemType, SortOrder, StockBalanceStatus } from '@aahar/api-client';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Input, Panel, Select } from '@/components/ui';
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
  PageHeader,
  PaginationControls,
  SearchInput,
} from '@/components/kitchen/shared/components';
import {
  formatDate,
  listLimit,
  useHospitals,
  useKitchens,
} from '@/components/kitchen/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { QueryState } from '@/components/location-empty-states';

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

function useItems(itemType?: ItemType, hospitalId?: string) {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        hospitalId: hospitalId || undefined,
        itemType,
        limit: 100,
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.kitchenStockItems(itemType ?? 'all', hospitalId || 'all'),
  });
}

export function KitchenStockPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
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
  const itemOptionsQuery = useItems('READYMADE', hospitalFilter);

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

  const items = stockQuery.data?.items ?? [];
  const meta = stockQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  return (
    <section className="space-y-5">
      <PageHeader
        subtitle="Current READYMADE stock posted from kitchen production entries."
        title="Kitchen Stock"
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
              setKitchenFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <KitchenSelect
            disabled={!hospitalFilter}
            kitchens={kitchensQuery.data ?? []}
            onChange={(value) => {
              setKitchenFilter(value);
              setPage(1);
            }}
            value={kitchenFilter}
          />
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
              setBusinessDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={businessDateFilter}
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
                <th className="w-[20%] px-4 py-2.5">Kitchen</th>
                <th className="w-[22%] px-4 py-2.5">Item</th>
                <th className="w-[14%] px-4 py-2.5">Available Qty</th>
                <th className="w-[14%] px-4 py-2.5">Reserved Qty</th>
                <th className="w-[14%] px-4 py-2.5">Business Date</th>
                <th className="w-[12%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Created / Updated</th>
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
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: stock.item.id })}
                      >
                        {stock.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{stock.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{stock.reservedQty.toFixed(3)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(stock.businessDate)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={stock.status} />
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      <p>{formatDate(stock.createdAt)}</p>
                      <p className="text-xs text-ds-muted">{formatDate(stock.updatedAt)}</p>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
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
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
