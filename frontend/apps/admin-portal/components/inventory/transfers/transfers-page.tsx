'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ClipboardCheck, Download, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { InventoryLocationType, SortOrder, Transfer, TransferStatus } from '@aahar/api-client';
import { EmptyState, StatusChip, TypeTag } from '@/components/design-system';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import {
  BulkActionBar,
  DetailPanel,
  FilterBar,
  FilterSearch,
  FilterSelect,
  SavedViewTabs,
} from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { downloadCsv } from '@/lib/csv';
import { transferOutcome } from '@/lib/dashboard-stats';
import { useLocationHrefs, useLocationNames } from '@/components/inventory/use-locations';
import { RecordLink } from '@/components/record-link';
import { canOpenPath } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import {
  openRowLink,
  setUrlParams,
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { invalidateTransferQueries } from '@/lib/query-invalidation';
import { QueryState } from '@/components/inventory/shared/components';
import {
  formatDate,
  formatWhen,
  listLimit,
  useHospitals,
  useKitchens,
  useRestaurants,
  useStores,
} from '@/components/inventory/shared/utils';
import { longStatus } from '@/components/inventory/transfers/shared';
import { TransferDetails } from '@/components/inventory/transfers/transfer-details';
import { queryKeys } from '@/lib/query-keys';
import { prefetchOnIntent, transferDetailQuery } from '@/lib/detail-queries';

const transferStatuses: TransferStatus[] = [
  'DRAFT',
  'PENDING_ACKNOWLEDGEMENT',
  'ACKNOWLEDGED',
  'CANCELLED',
];

type TransferView = '' | TransferStatus;

type TransferDateRange = '' | '2d' | '7d' | '30d' | '90d' | 'today';

const transferDateRanges: Array<{
  days: number;
  label: string;
  value: Exclude<TransferDateRange, ''>;
}> = [
  { days: 1, label: 'Today', value: 'today' },
  { days: 2, label: 'Last 2 days', value: '2d' },
  { days: 7, label: 'Last 7 days', value: '7d' },
  { days: 30, label: 'Last 30 days', value: '30d' },
  { days: 90, label: 'Last 90 days', value: '90d' },
];

function dateRangeStart(range: TransferDateRange): string | undefined {
  const days = transferDateRanges.find((option) => option.value === range)?.days;

  if (!days) {
    return undefined;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  return start.toISOString();
}

/** How an acknowledged transfer was received, read from its lines' accepted / rejected totals. */
const outcomeText: Record<StatusTone, string> = {
  bad: 'text-ds-status-bad-fg',
  info: 'text-ds-status-info-fg',
  neutral: 'text-ds-muted',
  ok: 'text-ds-status-ok-fg',
  pending: 'text-ds-status-pending-fg',
};

function transferSubtext(transfer: Transfer): { className: string; text: string } | null {
  const outcome = transferOutcome(transfer);

  if (outcome) {
    const presentation = statusPresentation(outcome);

    return {
      className: outcomeText[presentation.tone],
      text: presentation.long ?? presentation.label,
    };
  }

  if (transfer.status === 'PENDING_ACKNOWLEDGEMENT') {
    return { className: 'text-ds-muted', text: 'Waiting on restaurant' };
  }

  if (transfer.status === 'DRAFT') {
    return { className: 'text-ds-muted', text: 'Not dispatched' };
  }

  return transfer.remarks ? { className: 'text-ds-muted', text: transfer.remarks } : null;
}

export function TransfersPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Filters, view, page and the open record live in the URL so refresh, links and back work.
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  // The page's Location filter (shown on All locations) lives in the URL, so a dashboard link
  // can open one location's list; the top-bar location wins whenever one is chosen.
  const [hospitalParam, setHospitalFilter] = useUrlParam('hospital');
  const hospitalFilter = scopedHospitalId ?? hospitalParam;
  const [sourceTypeFilter, setSourceTypeFilter] = useUrlParam<'' | InventoryLocationType>(
    'from',
    '',
    ['STORE', 'KITCHEN'],
  );
  const [storeFilter, setStoreFilter] = useUrlParam('store');
  const [kitchenFilter, setKitchenFilter] = useUrlParam('kitchen');
  const [restaurantFilter, setRestaurantFilter] = useUrlParam('to');
  const [statusFilter, setStatusFilter] = useUrlParam<TransferView>('view', '', transferStatuses);
  const [dateRange, setDateRange] = useUrlParam<TransferDateRange>('date', '', [
    'today',
    '2d',
    '7d',
    '30d',
    '90d',
  ]);
  const [sortOrder, setSortOrder] = useUrlParam<SortOrder>('sort', 'desc', ['asc', 'desc']);
  const hrefWith = useHrefWith();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  // The open transfer lives in the URL (?id=), so it survives a reload and can be linked to.
  const selectedTransferId = searchParams.get('id');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const kitchensQuery = useKitchens(hospitalFilter);
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const locationName = useLocationNames(hasPermission);
  const locationLink = useLocationHrefs(hasPermission);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setHospitalFilter('');
    setSourceTypeFilter('');
    setStoreFilter('');
    setKitchenFilter('');
    setRestaurantFilter('');
    setPage(1);
  });

  // Ticked rows belong to the list they were ticked in.
  useEffect(() => {
    setCheckedIds(new Set());
  }, [
    dateRange,
    hospitalFilter,
    kitchenFilter,
    page,
    restaurantFilter,
    search,
    sortOrder,
    sourceTypeFilter,
    statusFilter,
    storeFilter,
  ]);

  const listFilters = {
    destinationId: restaurantFilter || undefined,
    destinationType: 'RESTAURANT' as const,
    fromDate: dateRangeStart(dateRange),
    hospitalId: hospitalFilter || undefined,
    search: search || undefined,
    sourceId:
      sourceTypeFilter === 'STORE'
        ? storeFilter || undefined
        : sourceTypeFilter === 'KITCHEN'
          ? kitchenFilter || undefined
          : undefined,
    sourceType: sourceTypeFilter || undefined,
  };
  const filterKey = [
    search,
    hospitalFilter,
    sourceTypeFilter,
    storeFilter,
    kitchenFilter,
    restaurantFilter,
    dateRange,
  ];

  const transfersQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listTransfers({
        ...listFilters,
        limit: listLimit,
        page,
        sortBy: 'createdAt',
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.transfers(page, ...filterKey, statusFilter, sortOrder),
  });

  // One count per saved view, under the same filters.
  const viewCountsQuery = useQuery({
    queryFn: async () => {
      const counts = await Promise.all(
        (['', ...transferStatuses] as TransferView[]).map((status) =>
          organizationApi
            .listTransfers({ ...listFilters, limit: 1, status: status || undefined })
            .then((response) => [status, response.data.meta.total] as const),
        ),
      );

      return Object.fromEntries(counts) as Record<TransferView, number>;
    },
    queryKey: queryKeys.transfersViewCounts(...filterKey),
  });

  const transfers = transfersQuery.data?.items ?? [];
  const meta = transfersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const listedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId);
  // A linked transfer that is not on this page (another page, other filters) is fetched alone.
  const linkedTransferQuery = useQuery({
    enabled: Boolean(selectedTransferId) && !listedTransfer && !transfersQuery.isLoading,
    queryFn: async () => (await organizationApi.getTransfer(selectedTransferId ?? '')).data,
    queryKey: queryKeys.transfers('detail', selectedTransferId),
  });
  const selectedTransfer = listedTransfer ?? linkedTransferQuery.data;
  useBreadcrumbLabel(
    selectedTransferId,
    selectedTransfer?.transferNumber ?? (linkedTransferQuery.isError ? 'Not found' : undefined),
  );

  function closeTransfer() {
    const id = selectedTransferId;
    setUrlParams({ id: null });
    // Back to the row the details were opened from.
    window.requestAnimationFrame(() => document.getElementById(`transfer-open-${id}`)?.focus());
  }

  // On narrow screens the details sit under the list; bring them into view when opened.
  useEffect(() => {
    if (!selectedTransfer) {
      return;
    }

    const panel = document.getElementById('transfer-detail-panel');

    if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedTransfer]);

  const dispatchMutation = useMutation({
    mutationFn: (id: string) => organizationApi.dispatchTransfer(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not dispatched',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateTransferQueries(queryClient);
      showToast({ title: 'Transfer dispatched', variant: 'success' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => organizationApi.cancelTransfer(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not cancelled',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateTransferQueries(queryClient);
      showToast({ title: 'Transfer cancelled', variant: 'success' });
    },
  });

  function sourceName(transfer: Transfer): string {
    return locationName(transfer.sourceType, transfer.sourceId);
  }

  function restaurantName(transfer: Transfer): string {
    return locationName(transfer.destinationType, transfer.destinationId);
  }

  function exportTransfers(rows: Transfer[]) {
    downloadCsv(`transfers-${new Date().toLocaleDateString('en-CA')}.csv`, [
      ['Transfer', 'Date', 'From type', 'From', 'To', 'Lines', 'Status', 'Outcome', 'Remarks'],
      ...rows.map((transfer) => {
        const outcome = transferOutcome(transfer);

        return [
          transfer.transferNumber,
          formatDate(transfer.transferDate),
          transfer.sourceType,
          sourceName(transfer),
          restaurantName(transfer),
          transfer.lines.length,
          longStatus(transfer.status),
          outcome ? longStatus(outcome) : '',
          transfer.remarks ?? '',
        ];
      }),
    ]);
  }

  const visibleIds = transfers.map((transfer) => transfer.id);
  const checkedOnPage = visibleIds.filter((id) => checkedIds.has(id));
  const allChecked = visibleIds.length > 0 && checkedOnPage.length === visibleIds.length;
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">Transfers</h1>
          <p className="text-[13.5px] text-ds-muted">
            Stock sent from stores and kitchens to restaurants.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={transfers.length === 0}
            onClick={() => exportTransfers(transfers)}
            title="Download this page as CSV"
            type="button"
            variant="outline"
          >
            <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            Export
          </Button>
          {canOpenPath('/inventory/transfers/new', hasPermission) ? (
            <Button asChild>
              <Link href="/inventory/transfers/new">
                <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                New transfer
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label="Transfer list"
          className="min-w-0 flex-[1_1_560px] overflow-hidden"
          role="region"
        >
          <SavedViewTabs<TransferView>
            label="Saved views"
            onChange={(value) => changeFilter(() => setStatusFilter(value))}
            value={statusFilter}
            views={(['', ...transferStatuses] as TransferView[]).map((status) => ({
              count: viewCountsQuery.data?.[status],
              label: status ? longStatus(status) : 'All',
              value: status,
            }))}
          />

          {checkedOnPage.length > 0 ? (
            <BulkActionBar count={checkedOnPage.length} onClear={() => setCheckedIds(new Set())}>
              <Button
                className="h-[34px] bg-ds-surface px-3 text-[12.5px]"
                onClick={() =>
                  exportTransfers(transfers.filter((transfer) => checkedIds.has(transfer.id)))
                }
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                Export CSV
              </Button>
            </BulkActionBar>
          ) : (
            <FilterBar>
              <FilterSearch
                label="Search transfers"
                onChange={(value) => changeFilter(() => setSearch(value))}
                placeholder="Transfer no., item, remarks…"
                value={searchInput}
              />
              {!scopedHospitalId ? (
                <FilterSelect
                  label="Location"
                  onChange={(value) =>
                    changeFilter(() => {
                      setHospitalFilter(value);
                      setStoreFilter('');
                      setKitchenFilter('');
                      setRestaurantFilter('');
                    })
                  }
                  value={hospitalFilter}
                >
                  <option value="">All locations</option>
                  {(hospitalsQuery.data ?? []).map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.hospitalName}
                    </option>
                  ))}
                </FilterSelect>
              ) : null}
              <FilterSelect
                label="From"
                onChange={(value) =>
                  changeFilter(() => {
                    setSourceTypeFilter(value as '' | InventoryLocationType);
                    setStoreFilter('');
                    setKitchenFilter('');
                  })
                }
                value={sourceTypeFilter}
              >
                <option value="">Any source</option>
                <option value="STORE">Stores</option>
                <option value="KITCHEN">Kitchens</option>
              </FilterSelect>
              {sourceTypeFilter && hospitalFilter ? (
                <FilterSelect
                  label={sourceTypeFilter === 'KITCHEN' ? 'Kitchen' : 'Store'}
                  onChange={(value) =>
                    changeFilter(() =>
                      sourceTypeFilter === 'KITCHEN'
                        ? setKitchenFilter(value)
                        : setStoreFilter(value),
                    )
                  }
                  value={sourceTypeFilter === 'KITCHEN' ? kitchenFilter : storeFilter}
                >
                  <option value="">
                    {sourceTypeFilter === 'KITCHEN' ? 'Any kitchen' : 'Any store'}
                  </option>
                  {sourceTypeFilter === 'KITCHEN'
                    ? (kitchensQuery.data ?? []).map((kitchen) => (
                        <option key={kitchen.id} value={kitchen.id}>
                          {kitchen.kitchenName}
                        </option>
                      ))
                    : (storesQuery.data ?? []).map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.storeName}
                        </option>
                      ))}
                </FilterSelect>
              ) : null}
              <FilterSelect
                disabled={!hospitalFilter}
                label="To"
                onChange={(value) => changeFilter(() => setRestaurantFilter(value))}
                value={restaurantFilter}
              >
                <option value="">
                  {hospitalFilter ? 'Any restaurant' : 'Choose a location first'}
                </option>
                {(restaurantsQuery.data ?? []).map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Date"
                onChange={(value) => changeFilter(() => setDateRange(value as TransferDateRange))}
                value={dateRange}
              >
                <option value="">Any time</option>
                {transferDateRanges.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Sort"
                onChange={(value) => changeFilter(() => setSortOrder(value as SortOrder))}
                value={sortOrder}
              >
                <option value="desc">Newest</option>
                <option value="asc">Oldest</option>
              </FilterSelect>
              <Button
                aria-label="Refresh transfers"
                className="h-9 w-9"
                onClick={() => {
                  void transfersQuery.refetch();
                  void viewCountsQuery.refetch();
                }}
                size="icon"
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </Button>
            </FilterBar>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-[13px]">
              <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                <tr>
                  <th className="w-10 py-2.5 pl-4">
                    <input
                      aria-label="Select all transfers on this page"
                      checked={allChecked}
                      className="h-4 w-4 accent-ds-primary"
                      disabled={visibleIds.length === 0}
                      onChange={() => setCheckedIds(allChecked ? new Set() : new Set(visibleIds))}
                      ref={(input) => {
                        if (input) {
                          input.indeterminate = checkedOnPage.length > 0 && !allChecked;
                        }
                      }}
                      type="checkbox"
                    />
                  </th>
                  <th className="w-[130px] px-3 py-2.5 font-semibold">Transfer</th>
                  <th className="px-3 py-2.5 font-semibold">Route</th>
                  <th className="w-16 px-3 py-2.5 text-right font-semibold">Lines</th>
                  <th className="w-[180px] px-3 py-2.5 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length > 0 ? (
                  transfers.map((transfer) => {
                    const isSelected = transfer.id === selectedTransfer?.id;
                    const isChecked = checkedIds.has(transfer.id);
                    const subtext = transferSubtext(transfer);

                    return (
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-ds-divider transition',
                          isSelected
                            ? 'bg-ds-selected'
                            : isChecked
                              ? 'bg-ds-primary-soft'
                              : 'hover:bg-ds-subtle',
                        )}
                        key={transfer.id}
                        onClick={openRowLink}
                      >
                        <td className="py-2 pl-4" onClick={(event) => event.stopPropagation()}>
                          <input
                            aria-label={`Select ${transfer.transferNumber}`}
                            checked={isChecked}
                            className="h-4 w-4 accent-ds-primary"
                            onChange={() => toggleChecked(transfer.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            aria-current={isSelected ? 'true' : undefined}
                            className="rounded-sm text-[13px] font-extrabold tabular-nums text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                            data-row-link=""
                            href={hrefWith({ id: transfer.id })}
                            id={`transfer-open-${transfer.id}`}
                            prefetch={false}
                            scroll={false}
                          >
                            {transfer.transferNumber}
                          </Link>
                          <span className="block text-[11.5px] text-ds-muted">
                            {formatWhen(transfer.transferDate)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TypeTag type={transfer.sourceType} />
                            <RecordLink
                              className="truncate font-bold text-ds-text"
                              href={locationLink(transfer.sourceType, transfer.sourceId)}
                            >
                              {sourceName(transfer)}
                            </RecordLink>
                          </span>
                          <span className="mt-[3px] flex min-w-0 items-center gap-1.5">
                            <TypeTag type={transfer.destinationType} />
                            <RecordLink
                              className="truncate text-ds-text-2"
                              href={locationLink(transfer.destinationType, transfer.destinationId)}
                            >
                              {restaurantName(transfer)}
                            </RecordLink>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-ds-text">
                          {transfer.lines.length}
                        </td>
                        <td className="px-3 py-2 pr-4">
                          <StatusChip status={transfer.status} />
                          {subtext ? (
                            <span
                              className={cn(
                                'mt-[3px] block truncate text-[11.5px] font-semibold',
                                subtext.className,
                              )}
                              title={subtext.text}
                            >
                              {subtext.text}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <QueryState
                    colSpan={5}
                    error={transfersQuery.error}
                    isError={transfersQuery.isError}
                    isLoading={transfersQuery.isLoading}
                    label="transfers"
                  />
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-ds-muted">
            <span>
              Showing{' '}
              <strong className="font-bold text-ds-text">
                {firstRow}–{lastRow}
              </strong>{' '}
              of {meta.total}
            </span>
            <span className="flex gap-1.5">
              <Button
                aria-label="Previous page"
                className="h-[34px] w-[34px]"
                disabled={meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
              <Button
                aria-label="Next page"
                className="h-[34px] w-[34px]"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </span>
          </div>
        </Panel>

        {selectedTransferId ? (
          selectedTransfer ? (
            <DetailPanel
              className="min-w-[300px] flex-[0_1_420px]"
              footer={
                selectedTransfer.status === 'DRAFT' ? (
                  <>
                    <Button
                      className="flex-[1_1_140px]"
                      disabled={dispatchMutation.isPending}
                      onClick={() => dispatchMutation.mutate(selectedTransfer.id)}
                      type="button"
                    >
                      Dispatch
                    </Button>
                    <Button
                      className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(selectedTransfer.id)}
                      type="button"
                      variant="ghost"
                    >
                      Cancel transfer
                    </Button>
                  </>
                ) : selectedTransfer.status === 'PENDING_ACKNOWLEDGEMENT' ? (
                  <Button asChild className="flex-1">
                    <Link
                      href={`/inventory/transfers/${selectedTransfer.id}/acknowledge`}
                      {...prefetchOnIntent(() =>
                        queryClient.prefetchQuery(transferDetailQuery(selectedTransfer.id)),
                      )}
                    >
                      <ClipboardCheck aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                      Acknowledge
                    </Link>
                  </Button>
                ) : undefined
              }
              id="transfer-detail-panel"
              label={`Transfer ${selectedTransfer.transferNumber}`}
              meta={`Created ${formatWhen(selectedTransfer.createdAt)} · ${selectedTransfer.hospital.hospitalName}`}
              onClose={closeTransfer}
              status={
                <StatusChip
                  long
                  status={transferOutcome(selectedTransfer) ?? selectedTransfer.status}
                />
              }
              title={selectedTransfer.transferNumber}
            >
              <TransferDetails
                destinationHref={locationLink(
                  selectedTransfer.destinationType,
                  selectedTransfer.destinationId,
                )}
                destinationName={restaurantName(selectedTransfer)}
                sourceHref={locationLink(selectedTransfer.sourceType, selectedTransfer.sourceId)}
                sourceName={sourceName(selectedTransfer)}
                transfer={selectedTransfer}
              />
            </DetailPanel>
          ) : (
            <Panel className="min-w-[300px] flex-[0_1_420px] p-4">
              {linkedTransferQuery.isError ? (
                <EmptyState
                  action={
                    <Button
                      onClick={() => setUrlParams({ id: null })}
                      type="button"
                      variant="outline"
                    >
                      Close
                    </Button>
                  }
                  description="It may have been deleted, or it belongs to a location you can't view."
                  title="Transfer not found"
                />
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </Panel>
          )
        ) : null}
      </div>
    </section>
  );
}
