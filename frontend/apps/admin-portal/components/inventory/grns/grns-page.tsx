'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Grn, GrnStatus, SortOrder } from '@aahar/api-client';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { useAuth } from '@/components/auth-provider';
import { RecordLink } from '@/components/record-link';
import { canOpenPath, locationHref } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import {
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
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
  const [hospitalFilter, setHospitalFilter] = useState('');
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteGrn(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN deleted', variant: 'success' });
    },
  });

  const grns = grnsQuery.data?.items ?? [];
  const meta = grnsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  function deleteGrn(grn: Grn) {
    if (window.confirm(`Delete ${grn.grnNumber}?`)) {
      deleteMutation.mutate(grn.id);
    }
  }

  if (selectedGrnId) {
    return <GrnVerificationView grnId={selectedGrnId} key={selectedGrnId} />;
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          canOpenPath('/inventory/grns/new', hasPermission) ? (
            <Button asChild>
              <Link href="/inventory/grns/new">
                <Plus aria-hidden="true" className="h-4 w-4" />
                New GRN
              </Link>
            </Button>
          ) : undefined
        }
        subtitle="Receive mapped MRP items into store stock through manual GRN entry."
        title="GRNs"
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
          <Select
            onChange={(event) => {
              setSortOrder(event.target.value as SortOrder);
              setPage(1);
            }}
            value={sortOrder}
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </Select>
          <Button onClick={() => void grnsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-[13px]">
            <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
              <tr>
                <th className="w-[15%] px-4 py-2.5 font-semibold">GRN</th>
                <th className="w-[17%] px-3 py-2.5 font-semibold">Store</th>
                <th className="w-[19%] px-3 py-2.5 font-semibold">Vendor / PO</th>
                <th className="w-[17%] px-3 py-2.5 font-semibold">Received</th>
                <th className="w-[13%] px-3 py-2.5 font-semibold">Status</th>
                <th className="w-[7%] px-3 py-2.5 text-right font-semibold">Lines</th>
                <th className="w-[12%] px-4 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grns.length > 0 ? (
                grns.map((grn) => (
                  <tr
                    className="border-b border-ds-divider transition hover:bg-ds-subtle"
                    key={grn.id}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        className="rounded-sm font-extrabold tabular-nums text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                        href={hrefWith({ id: grn.id })}
                        prefetch={false}
                      >
                        {grn.grnNumber}
                      </Link>
                      <p className="truncate text-[11.5px] text-ds-muted">
                        {grn.hospital.hospitalName}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <RecordLink
                        className="block truncate font-bold text-ds-text"
                        href={locationHref('STORE', grn.store.storeCode || grn.store.storeName)}
                      >
                        {grn.store.storeName}
                      </RecordLink>
                      <p className="truncate text-[11.5px] text-ds-muted">{grn.store.storeCode}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="truncate text-ds-text-2">{grn.vendorName || '—'}</p>
                      <p className="truncate text-[11.5px] text-ds-muted">
                        {grn.poNumber || 'No PO'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ds-text-3">
                      {formatWhen(grn.receivedDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChip status={grn.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ds-text">
                      {grn.lines.length}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          asChild
                          className="h-8 px-3 text-[12.5px]"
                          variant={grn.status === 'DRAFT' ? 'default' : 'outline'}
                        >
                          <Link href={hrefWith({ id: grn.id })} prefetch={false}>
                            {grn.status === 'DRAFT' ? 'Verify' : 'View'}
                          </Link>
                        </Button>
                        {grn.status === 'DRAFT' ? (
                          <Button
                            aria-label={`Delete ${grn.grnNumber}`}
                            className="h-8 w-8 text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteGrn(grn)}
                            size="icon"
                            title="Delete draft"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
                  error={grnsQuery.error}
                  isError={grnsQuery.isError}
                  isLoading={grnsQuery.isLoading}
                  label="GRNs"
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
