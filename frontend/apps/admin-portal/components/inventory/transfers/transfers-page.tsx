'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Download,
  FilePen,
  Plus,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { InventoryLocationType, SortOrder, Transfer, TransferStatus } from '@aahar/api-client';
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
  EmptyState,
  InlineProgress,
  ListPager,
  StatStrip,
  StatusChip,
  tableStyles,
  TypeTag,
} from '@/components/design-system';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { useConfirm } from '@/components/confirm-provider';
import { Panel, Select, Skeleton } from '@/components/ui';
import { BulkActionBar, FilterSearch } from '@/components/ui-controls';
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

/**
 * How many of a sent transfer's items arrived, from its own lines (a line counts once anything
 * of it was accepted). None for drafts and cancelled ones.
 */
function transferReceipt(
  transfer: Transfer,
): { label: string; tone: 'default' | 'ok' | 'pending'; value: number } | null {
  const total = transfer.lines.length;

  if (total === 0 || transfer.status === 'DRAFT' || transfer.status === 'CANCELLED') return null;
  const received =
    transfer.status === 'ACKNOWLEDGED'
      ? transfer.lines.filter((line) => line.acceptedQty > 0).length
      : 0;

  return {
    label: `${received} of ${total} received`,
    tone: transfer.status !== 'ACKNOWLEDGED' ? 'default' : received === total ? 'ok' : 'pending',
    value: received / total,
  };
}

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
  const canAcknowledge = hasPermission(['TRANSFER_ACKNOWLEDGE', 'RESTAURANT_TRANSFER_RECEIVE']);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
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
    ['STORE', 'KITCHEN', 'RESTAURANT'],
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
            .listTransfers({ ...listFilters, limit: 0, status: status || undefined })
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
    // Back to the row (or, on phones, the card) the details were opened from.
    window.requestAnimationFrame(() =>
      [`transfer-open-${id}`, `transfer-card-${id}`]
        .map((elementId) => document.getElementById(elementId))
        .find((element) => element?.offsetParent)
        ?.focus(),
    );
  }

  const dispatchMutation = useMutation({
    mutationFn: (id: string) => organizationApi.dispatchTransfer(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not dispatched',
        variant: 'error',
      });
    },
    onSuccess(_response, id) {
      invalidateTransferQueries(queryClient);
      showToast({ recordId: id, title: 'Transfer dispatched', variant: 'success' });
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
    onSuccess(_response, id) {
      invalidateTransferQueries(queryClient);
      showToast({ recordId: id, title: 'Transfer cancelled', variant: 'success' });
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

  const hasFilters = Boolean(
    searchInput ||
    hospitalParam ||
    sourceTypeFilter ||
    storeFilter ||
    kitchenFilter ||
    restaurantFilter ||
    statusFilter ||
    dateRange,
  );

  function clearFilters() {
    changeFilter(() => {
      setSearch('');
      setHospitalFilter('');
      setSourceTypeFilter('');
      setStoreFilter('');
      setKitchenFilter('');
      setRestaurantFilter('');
      setStatusFilter('');
      setDateRange('');
    });
  }

  /** A stat's status alone; picking the one in force goes back to every transfer. */
  function showStatus(status: TransferStatus) {
    changeFilter(() => setStatusFilter((current) => (current === status ? '' : status)));
  }

  const viewCounts = viewCountsQuery.data;
  const statTones: Partial<Record<TransferStatus, 'bad' | 'ok' | 'pending'>> = {
    ACKNOWLEDGED: 'ok',
    CANCELLED: 'bad',
    PENDING_ACKNOWLEDGEMENT: 'pending',
  };
  const statIcons: Partial<Record<TransferStatus, LucideIcon>> = {
    ACKNOWLEDGED: CircleCheck,
    CANCELLED: CircleX,
    DRAFT: FilePen,
    PENDING_ACKNOWLEDGEMENT: Truck,
  };

  // An open transfer gets the whole page, as a GRN does; the back link returns to the list.
  if (selectedTransferId) {
    if (!selectedTransfer) {
      return linkedTransferQuery.isError ? (
        <Panel className="p-6">
          <EmptyState
            action={
              <Button onClick={() => setUrlParams({ id: null })} type="button" variant="outline">
                Back to transfers
              </Button>
            }
            description="It may have been deleted, or it belongs to a location you can't view."
            title="Transfer not found"
          />
        </Panel>
      ) : (
        <section className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
        </section>
      );
    }

    return (
      <TransferDetails
        actions={
          selectedTransfer.status === 'DRAFT' ? (
            <>
              <Button
                className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  void confirm({
                    confirmLabel: 'Cancel transfer',
                    description: 'Nothing was sent yet, so no stock moves. This can’t be undone.',
                    title: `Cancel ${selectedTransfer.transferNumber}?`,
                    tone: 'danger',
                  }).then((ok) => {
                    if (ok) cancelMutation.mutate(selectedTransfer.id);
                  });
                }}
                type="button"
                variant="ghost"
              >
                Cancel transfer
              </Button>
              <Button
                disabled={dispatchMutation.isPending}
                onClick={() => dispatchMutation.mutate(selectedTransfer.id)}
                type="button"
              >
                Dispatch
              </Button>
            </>
          ) : selectedTransfer.status === 'PENDING_ACKNOWLEDGEMENT' ? (
            <Button asChild>
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
        backHref={hrefWith({ id: null })}
        destinationHref={locationLink(
          selectedTransfer.destinationType,
          selectedTransfer.destinationId,
        )}
        destinationName={restaurantName(selectedTransfer)}
        onBack={closeTransfer}
        sourceHref={locationLink(selectedTransfer.sourceType, selectedTransfer.sourceId)}
        sourceName={sourceName(selectedTransfer)}
        transfer={selectedTransfer}
      />
    );
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <>
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
          </>
        }
        count={viewCounts?.['']}
        description="Stock sent from stores and kitchens to restaurants, and leftovers between restaurants."
        title="Transfers"
      />

      {/* One count per status under the list's other filters; the title's count is all of them. */}
      <StatStrip
        label="Transfers by status"
        rich
        stats={transferStatuses.map((status) => ({
          active: statusFilter === status,
          icon: statIcons[status],
          label: longStatus(status),
          onSelect: () => showStatus(status),
          tone: statTones[status],
          value: viewCounts?.[status] ?? '–',
        }))}
      />

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label="Transfer list"
          className="min-w-0 flex-[1_1_560px] overflow-hidden"
          role="region"
        >
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
            <ListToolbar>
              <FilterSearch
                label="Search transfers"
                onChange={(value) => changeFilter(() => setSearch(value))}
                placeholder="Transfer no., item or remarks"
                value={searchInput}
              />
              <FiltersMenu
                activeCount={
                  [
                    hospitalParam,
                    sourceTypeFilter,
                    storeFilter,
                    kitchenFilter,
                    restaurantFilter,
                    dateRange,
                  ].filter(Boolean).length
                }
              >
                {!scopedHospitalId ? (
                  <FilterField label="Location">
                    <Select
                      onChange={(event) =>
                        changeFilter(() => {
                          setHospitalFilter(event.target.value);
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
                    </Select>
                  </FilterField>
                ) : null}
                <FilterField label="From">
                  <Select
                    onChange={(event) =>
                      changeFilter(() => {
                        setSourceTypeFilter(event.target.value as '' | InventoryLocationType);
                        setStoreFilter('');
                        setKitchenFilter('');
                      })
                    }
                    value={sourceTypeFilter}
                  >
                    <option value="">Any source</option>
                    <option value="STORE">Stores</option>
                    <option value="KITCHEN">Kitchens</option>
                    <option value="RESTAURANT">Restaurants (leftovers)</option>
                  </Select>
                </FilterField>
                {sourceTypeFilter && sourceTypeFilter !== 'RESTAURANT' && hospitalFilter ? (
                  <FilterField label={sourceTypeFilter === 'KITCHEN' ? 'Kitchen' : 'Store'}>
                    <Select
                      onChange={(event) =>
                        changeFilter(() =>
                          sourceTypeFilter === 'KITCHEN'
                            ? setKitchenFilter(event.target.value)
                            : setStoreFilter(event.target.value),
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
                    </Select>
                  </FilterField>
                ) : null}
                <FilterField label="To">
                  <Select
                    disabled={!hospitalFilter}
                    onChange={(event) =>
                      changeFilter(() => setRestaurantFilter(event.target.value))
                    }
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
                  </Select>
                </FilterField>
                <FilterField label="Date">
                  <Select
                    onChange={(event) =>
                      changeFilter(() => setDateRange(event.target.value as TransferDateRange))
                    }
                    value={dateRange}
                  >
                    <option value="">Any time</option>
                    {transferDateRanges.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </FilterField>
              </FiltersMenu>
              <SortControl
                onOrderChange={(value) => changeFilter(() => setSortOrder(value))}
                options={[{ label: 'Created date', value: 'createdAt' }]}
                order={sortOrder}
                sortBy="createdAt"
              />
              <RefreshButton
                onClick={() => {
                  void transfersQuery.refetch();
                  void viewCountsQuery.refetch();
                }}
              />
              <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
            </ListToolbar>
          )}

          {transfers.length > 0 ? (
            // Phones: one card per transfer instead of a table that scrolls sideways.
            <ul aria-label="Transfers" className="divide-y divide-ds-divider sm:hidden">
              {transfers.map((transfer) => {
                const isSelected = transfer.id === selectedTransfer?.id;
                const isChecked = checkedIds.has(transfer.id);
                const subtext = transferSubtext(transfer);

                return (
                  <li
                    className={cn(
                      'flex cursor-pointer gap-3 px-4 py-3 transition-colors',
                      isSelected
                        ? 'bg-ds-selected'
                        : isChecked
                          ? 'bg-ds-primary-soft'
                          : 'hover:bg-ds-selected',
                    )}
                    data-record-id={transfer.id}
                    key={transfer.id}
                    // openRowLink only reads the target and the link inside; it is typed for table rows.
                    onClick={(event) =>
                      openRowLink(event as unknown as Parameters<typeof openRowLink>[0])
                    }
                  >
                    <input
                      aria-label={`Select ${transfer.transferNumber}`}
                      checked={isChecked}
                      className="mt-1 h-4 w-4 shrink-0 accent-ds-primary"
                      onChange={() => toggleChecked(transfer.id)}
                      type="checkbox"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            aria-current={isSelected ? 'true' : undefined}
                            className="rounded-sm font-mono text-[13px] font-semibold text-ds-text hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                            data-row-link=""
                            href={hrefWith({ id: transfer.id })}
                            id={`transfer-card-${transfer.id}`}
                            prefetch={false}
                            scroll={false}
                          >
                            {transfer.transferNumber}
                          </Link>
                          <span className="block text-[11.5px] text-ds-muted">
                            {formatWhen(transfer.transferDate)}
                          </span>
                        </div>
                        <StatusChip status={transfer.status} />
                      </div>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <TypeTag type={transfer.sourceType} />
                        <RecordLink
                          className="truncate font-bold text-ds-text"
                          href={locationLink(transfer.sourceType, transfer.sourceId)}
                        >
                          {sourceName(transfer)}
                        </RecordLink>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden="true" className="text-ds-muted">
                          →
                        </span>
                        <span className="sr-only">to</span>
                        <TypeTag type={transfer.destinationType} />
                        <RecordLink
                          className="truncate text-ds-text-2"
                          href={locationLink(transfer.destinationType, transfer.destinationId)}
                        >
                          {restaurantName(transfer)}
                        </RecordLink>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold">
                        <span className="shrink-0 text-ds-text-2">
                          <span className="font-mono">{transfer.lines.length}</span>{' '}
                          {transfer.lines.length === 1 ? 'line' : 'lines'}
                        </span>
                        {subtext ? (
                          <>
                            <span aria-hidden="true" className="text-ds-muted">
                              ·
                            </span>
                            <span
                              className={cn('truncate', subtext.className)}
                              title={subtext.text}
                            >
                              {subtext.text}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className={cn('overflow-x-auto', transfers.length > 0 && 'hidden sm:block')}>
            <table className={cn(tableStyles.table, 'min-w-[760px] table-fixed')}>
              <thead className={tableStyles.head}>
                <tr>
                  <th className={cn(tableStyles.th, 'w-10 pr-0')}>
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
                  <th className={cn(tableStyles.th, 'w-[140px]')}>Transfer</th>
                  <th className={tableStyles.th}>Route</th>
                  <th className={cn(tableStyles.th, 'w-16 text-right')}>Lines</th>
                  <th className={cn(tableStyles.th, 'w-[180px]')}>Status</th>
                  <th className={cn(tableStyles.th, 'w-[132px]')}>
                    <span className="sr-only">Next step</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers.length > 0 ? (
                  transfers.map((transfer) => {
                    const isSelected = transfer.id === selectedTransfer?.id;
                    const isChecked = checkedIds.has(transfer.id);
                    const subtext = transferSubtext(transfer);
                    const receipt = transferReceipt(transfer);

                    return (
                      <tr
                        className={cn(
                          tableStyles.row,
                          isSelected ? 'bg-ds-selected' : isChecked && 'bg-ds-primary-soft',
                        )}
                        data-record-id={transfer.id}
                        key={transfer.id}
                        onClick={openRowLink}
                      >
                        <td
                          className={cn(tableStyles.td, 'pr-0')}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            aria-label={`Select ${transfer.transferNumber}`}
                            checked={isChecked}
                            className="h-4 w-4 accent-ds-primary"
                            onChange={() => toggleChecked(transfer.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className={tableStyles.td}>
                          <Link
                            aria-current={isSelected ? 'true' : undefined}
                            className={cn(
                              tableStyles.num,
                              'rounded-sm text-[13px] font-semibold text-ds-text hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                            )}
                            data-row-link=""
                            href={hrefWith({ id: transfer.id })}
                            id={`transfer-open-${transfer.id}`}
                            prefetch={false}
                            scroll={false}
                          >
                            {transfer.transferNumber}
                          </Link>
                          <span className="block text-[12px] text-ds-muted">
                            {formatWhen(transfer.transferDate)}
                          </span>
                        </td>
                        <td className={tableStyles.td}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TypeTag type={transfer.sourceType} />
                            <RecordLink
                              className={cn('truncate', tableStyles.title)}
                              href={locationLink(transfer.sourceType, transfer.sourceId)}
                            >
                              {sourceName(transfer)}
                            </RecordLink>
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5">
                            <TypeTag type={transfer.destinationType} />
                            <RecordLink
                              className="truncate text-ds-text-2"
                              href={locationLink(transfer.destinationType, transfer.destinationId)}
                            >
                              {restaurantName(transfer)}
                            </RecordLink>
                          </span>
                        </td>
                        <td
                          className={cn(tableStyles.td, tableStyles.num, 'text-right text-ds-text')}
                        >
                          {transfer.lines.length}
                        </td>
                        <td className={tableStyles.td}>
                          <StatusChip status={transfer.status} />
                          {receipt ? <InlineProgress {...receipt} /> : null}
                          {subtext ? (
                            <span
                              className={cn(
                                'mt-1 block truncate text-[12px] font-medium',
                                subtext.className,
                              )}
                              title={subtext.text}
                            >
                              {subtext.text}
                            </span>
                          ) : null}
                        </td>
                        <td className={cn(tableStyles.td, 'pr-3 text-right')}>
                          {/* What the row waits on, in plain view: the receiver acknowledges it. */}
                          {transfer.status === 'PENDING_ACKNOWLEDGEMENT' && canAcknowledge ? (
                            <Link
                              aria-label={`Acknowledge ${transfer.transferNumber}`}
                              className="inline-flex h-8 items-center rounded-full bg-ds-primary-soft px-3 text-[12.5px] font-semibold whitespace-nowrap text-ds-link transition-colors duration-150 hover:bg-ds-primary hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                              href={`/inventory/transfers/${transfer.id}/acknowledge`}
                            >
                              Acknowledge
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <QueryState
                    colSpan={6}
                    error={transfersQuery.error}
                    isError={transfersQuery.isError}
                    isLoading={transfersQuery.isLoading}
                    label="transfers"
                  />
                )}
              </tbody>
            </table>
          </div>
          <ListPager
            limit={meta.limit}
            noun="transfer"
            onPageChange={setPage}
            page={meta.page}
            total={meta.total}
            totalPages={meta.totalPages}
          />
        </Panel>
      </div>
    </section>
  );
}
