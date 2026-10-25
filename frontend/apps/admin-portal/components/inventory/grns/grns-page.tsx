'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Grn, GrnStatus, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { useConfirm } from '@/components/confirm-provider';
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
  RowOpen,
  StatStrip,
  StatusChip,
  tableStyles,
} from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { useAuth } from '@/components/auth-provider';
import { RecordLink } from '@/components/record-link';
import { canOpenPath, locationHref } from '@/lib/navigation';
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
import { useIsPhone } from '@/lib/use-is-phone';
import { cn } from '@/lib/utils';
import { invalidateGrnQueries } from '@/lib/query-invalidation';
import { GrnVerificationView } from '@/components/inventory/grns/grn-verification-view';
import {
  HospitalSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  StoreSelect,
} from '@/components/inventory/shared/components';
import {
  formatEnum,
  formatWhen,
  listLimit,
  useHospitals,
  useStores,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

const grnStatuses: GrnStatus[] = [
  'DRAFT',
  'POSTED_TO_STOCK',
  'CANCELLED',
  'UNDER_VERIFICATION',
  'PARTIALLY_ACCEPTED',
  'ACCEPTED',
  'REJECTED',
];

export function GrnsPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  // Phones show three of the seven columns; a row that spans them all has to say so.
  const columns = useIsPhone() ? 3 : 7;
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // ?id= opens that GRN for verification.
  const selectedGrnId = searchParams.get('id');
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const hrefWith = useHrefWith();
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [storeFilter, setStoreFilter] = useUrlParam('store');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | GrnStatus>('view', '', grnStatuses);
  const [sortOrder, setSortOrder] = useUrlParam<SortOrder>('sort', 'desc', ['asc', 'desc']);
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setStoreFilter('');
    setPage(1);
  });

  const grnsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listGrns({
        hospitalId: hospitalFilter,
        limit: listLimit,
        page,
        search,
        sortBy: 'createdAt',
        sortOrder,
        status: statusFilter || undefined,
        storeId: storeFilter,
      });

      return response.data;
    },
    queryKey: queryKeys.grns(page, search, hospitalFilter, storeFilter, statusFilter, sortOrder),
  });

  // The strip's numbers: every GRN at the location, then each status a GRN actually reaches.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (status?: GrnStatus) =>
        (await organizationApi.listGrns({ hospitalId: hospitalFilter, limit: 0, status })).data.meta
          .total;
      const [all, drafts, posted, cancelled] = await Promise.all([
        count(),
        count('DRAFT'),
        count('POSTED_TO_STOCK'),
        count('CANCELLED'),
      ]);

      return { all, cancelled, drafts, posted };
    },
    queryKey: queryKeys.grns('stats', hospitalFilter),
  });
  const stats = statsQuery.data;

  const deleteMutation = useMutation({
    mutationFn: (grn: Grn) => organizationApi.deleteGrn(grn.id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not deleted',
        variant: 'error',
      });
    },
    onSuccess(_response, grn) {
      invalidateGrnQueries(queryClient);
      showToast({ title: `${grn.grnNumber} deleted`, variant: 'success' });
    },
  });
  const confirm = useConfirm();

  const grns = grnsQuery.data?.items ?? [];
  const meta = grnsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(
    searchInput || hospitalFilter !== (scopedHospitalId ?? '') || storeFilter || statusFilter,
  );

  function clearFilters() {
    setSearch('');
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setStatusFilter('');
    setPage(1);
  }

  /** A stat's status alone; picking the one in force goes back to every GRN. */
  function showStatus(status: '' | GrnStatus) {
    setStatusFilter(status);
    setPage(1);
  }

  function openGrn(grn: Grn) {
    setUrlParams({ id: grn.id }, 'push');
  }

  // Only a draft can be deleted; nothing of it is in stock yet.
  async function deleteGrn(grn: Grn) {
    const confirmed = await confirm({
      confirmLabel: 'Delete',
      description: 'The draft and its lines are removed. This can’t be undone.',
      title: `Delete ${grn.grnNumber}?`,
      tone: 'danger',
    });

    if (confirmed) deleteMutation.mutate(grn);
  }

  if (selectedGrnId) {
    return <GrnVerificationView grnId={selectedGrnId} key={selectedGrnId} />;
  }

  return (
    <section className="space-y-4">
      <PageHeader
        action={
          canOpenPath('/inventory/grns/new', hasPermission) ? (
            <Button asChild>
              <Link href="/inventory/grns/new">
                <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                Receive a delivery
              </Link>
            </Button>
          ) : undefined
        }
        count={stats?.all}
        subtitle="Deliveries from vendors (GRNs): check what arrived, then add it to store stock."
        title="Deliveries (GRN)"
      />
      <StatStrip
        label="GRNs at a glance"
        stats={[
          {
            active: !statusFilter,
            label: 'All deliveries',
            onSelect: () => showStatus(''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: statusFilter === 'DRAFT',
            label: 'Drafts to verify',
            onSelect: () => showStatus(statusFilter === 'DRAFT' ? '' : 'DRAFT'),
            share: stats?.all ? stats.drafts / stats.all : undefined,
            tone: 'pending',
            value: stats?.drafts ?? '–',
          },
          {
            active: statusFilter === 'POSTED_TO_STOCK',
            label: 'Added to stock',
            onSelect: () => showStatus(statusFilter === 'POSTED_TO_STOCK' ? '' : 'POSTED_TO_STOCK'),
            share: stats?.all ? stats.posted / stats.all : undefined,
            tone: 'ok',
            value: stats?.posted ?? '–',
          },
          {
            active: statusFilter === 'CANCELLED',
            label: 'Cancelled',
            onSelect: () => showStatus(statusFilter === 'CANCELLED' ? '' : 'CANCELLED'),
            share: stats?.all ? stats.cancelled / stats.all : undefined,
            tone: 'bad',
            value: stats?.cancelled ?? '–',
          },
        ]}
      />
      <Panel aria-label="GRN list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search GRNs"
            placeholder="GRN, invoice or PO no., vendor or store"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [hospitalFilter !== (scopedHospitalId ?? ''), storeFilter, statusFilter].filter(
                Boolean,
              ).length
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
                  setStatusFilter(event.target.value as '' | GrnStatus);
                  setPage(1);
                }}
                value={statusFilter}
              >
                <option value="">All statuses</option>
                {grnStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnum(status)}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            options={[{ label: 'Created date', value: 'createdAt' }]}
            order={sortOrder}
            sortBy="createdAt"
          />
          <RefreshButton onClick={() => void grnsQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'table-fixed sm:min-w-[800px]')}>
            <thead className={tableStyles.head}>
              {/* Phones: the GRN (with its store and when), its status and the row buttons. */}
              <tr>
                <th className={cn(tableStyles.th, 'sm:w-[16%]')}>GRN</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[18%]')}>Store</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[19%]')}>
                  Vendor / PO
                </th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[16%]')}>Received</th>
                <th className={cn(tableStyles.th, 'w-[148px] sm:w-[14%]')}>Status</th>
                <th className={cn(tableStyles.th, tableStyles.phoneHidden, 'w-[7%] text-right')}>
                  Lines
                </th>
                <th className={cn(tableStyles.th, 'w-24 sm:w-[10%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grns.length > 0 ? (
                grns.map((grn) => {
                  const isDraft = grn.status === 'DRAFT';
                  // How much of what came in was accepted: known once the GRN has been checked.
                  const received = grn.lines.reduce((sum, line) => sum + line.receivedQty, 0);
                  const acceptedShare =
                    isDraft || grn.status === 'CANCELLED' || received <= 0
                      ? null
                      : grn.lines.reduce((sum, line) => sum + line.acceptedQty, 0) / received;

                  return (
                    // The whole row opens the GRN (its number is the link it follows).
                    <tr
                      className={tableStyles.row}
                      data-record-id={grn.id}
                      key={grn.id}
                      onClick={openRowLink}
                    >
                      <td className={tableStyles.td}>
                        <Link
                          className={cn(
                            tableStyles.num,
                            'rounded-sm text-[13px] font-semibold text-ds-text hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                          )}
                          data-row-link=""
                          href={hrefWith({ id: grn.id })}
                          prefetch={false}
                        >
                          {grn.grnNumber}
                        </Link>
                        <p className="hidden truncate text-[12px] text-ds-muted sm:block">
                          {grn.hospital.hospitalName}
                        </p>
                        <p className="text-[12px] text-ds-muted sm:hidden">
                          {grn.store.storeName} · {formatWhen(grn.receivedDate)}
                        </p>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <RecordAvatar name={grn.store.storeName} size="sm" />
                          <span className="min-w-0">
                            <RecordLink
                              className={cn('block truncate', tableStyles.title)}
                              href={locationHref(
                                'STORE',
                                grn.store.storeCode || grn.store.storeName,
                              )}
                            >
                              {grn.store.storeName}
                            </RecordLink>
                            <p className={cn('truncate', tableStyles.code)}>
                              {grn.store.storeCode}
                            </p>
                          </span>
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, tableStyles.phoneHidden)}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          {grn.vendorName ? <RecordAvatar name={grn.vendorName} size="sm" /> : null}
                          <span className="min-w-0">
                            <p className="truncate text-ds-text-2">{grn.vendorName || '—'}</p>
                            <p className={cn('truncate', tableStyles.code)}>
                              {grn.poNumber || 'No PO'}
                            </p>
                          </span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.phoneHidden,
                          'whitespace-nowrap text-ds-muted',
                        )}
                      >
                        {formatWhen(grn.receivedDate)}
                      </td>
                      <td className={tableStyles.td}>
                        <StatusChip status={grn.status} />
                        {acceptedShare === null ? null : (
                          <InlineProgress
                            label={`${Math.round(acceptedShare * 100)}% accepted`}
                            tone={
                              acceptedShare >= 0.95
                                ? 'ok'
                                : acceptedShare >= 0.8
                                  ? 'pending'
                                  : 'bad'
                            }
                            value={acceptedShare}
                          />
                        )}
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.num,
                          tableStyles.phoneHidden,
                          'text-right text-ds-text',
                        )}
                      >
                        {grn.lines.length}
                      </td>
                      <td className={cn(tableStyles.td, 'pr-3')}>
                        <span className="flex items-center justify-end gap-0.5">
                          <RowOpen
                            label={`${isDraft ? 'Verify' : 'Open'} ${grn.grnNumber}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openGrn(grn);
                            }}
                            nextStep={isDraft}
                            text={isDraft ? 'Verify' : 'Open'}
                          />
                          {isDraft ? (
                            <RowAction
                              className="hover:text-ds-status-bad-fg"
                              disabled={deleteMutation.isPending}
                              icon={Trash2}
                              label={`Delete ${grn.grnNumber}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteGrn(grn);
                              }}
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={columns}
                  error={grnsQuery.error}
                  isError={grnsQuery.isError}
                  isLoading={grnsQuery.isLoading}
                  label="deliveries"
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
