'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChefHat, Clock, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { KitchenProduction, KitchenProductionStatus, SortOrder } from '@aahar/api-client';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select, Skeleton } from '@/components/ui';
import { useAuth } from '@/components/auth-provider';
import { FilterTabs } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import {
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { canOpenPath, locationHref, recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { formatProductionQuantity } from '@/components/kitchen/productions/shared';
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

// The entry form (and zod with it) loads only when a production is opened from the list. Until
// then it shows the same skeleton the form shows while it fetches the production.
const ProductionEntryPageClient = dynamic(
  () =>
    import('@/components/kitchen/productions/production-entry-page').then(
      (module) => module.ProductionEntryPageClient,
    ),
  {
    loading: () => (
      <section className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    ),
  },
);

function productionTotals(production: KitchenProduction) {
  return production.lines.reduce(
    (totals, line) => ({
      accepted: totals.accepted + line.acceptedQty,
      produced: totals.produced + line.producedQty,
      wastage: totals.wastage + line.wastageQty,
    }),
    { accepted: 0, produced: 0, wastage: 0 },
  );
}

// Board columns from the kitchen concept, one per production status.
const productionColumns: Array<{ dot: string; label: string; status: KitchenProductionStatus }> = [
  { dot: 'bg-ds-stage-preparing', label: 'Draft', status: 'DRAFT' },
  { dot: 'bg-ds-stage-ready', label: 'Posted', status: 'POSTED' },
  { dot: 'bg-ds-stage-queued', label: 'Cancelled', status: 'CANCELLED' },
];

function personInitials(name: string): string {
  return name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function KitchenProductionsPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // ?id= opens that production (from the dashboard, the palette or the board).
  const selectedProductionId = searchParams.get('id');
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const hrefWith = useHrefWith();
  // The page's Location filter (shown on All locations) lives in the URL, so a dashboard link
  // can open one location's list; the top-bar location wins whenever one is chosen.
  const [hospitalParam, setHospitalFilter] = useUrlParam('hospital');
  const hospitalFilter = scopedHospitalId ?? hospitalParam;
  const [kitchenFilter, setKitchenFilter] = useUrlParam('kitchen');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | KitchenProductionStatus>(
    'view',
    '',
    productionColumns.map((column) => column.status),
  );
  const [sortOrder, setSortOrder] = useUrlParam<SortOrder>('sort', 'desc', ['asc', 'desc']);
  const hospitalsQuery = useHospitals();
  const kitchensQuery = useKitchens(hospitalFilter);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setHospitalFilter('');
    setKitchenFilter('');
    setPage(1);
  });

  const productionsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listKitchenProductions({
        hospitalId: hospitalFilter,
        kitchenId: kitchenFilter,
        limit: listLimit,
        page,
        search,
        sortBy: 'createdAt',
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.kitchenProductions(
      page,
      search,
      hospitalFilter,
      kitchenFilter,
      statusFilter,
      sortOrder,
    ),
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => organizationApi.postKitchenProduction(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Production was not posted',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateKitchenProductionQueries(queryClient);
      showToast({
        description: response.data.productionNumber,
        title: 'Production posted',
        variant: 'success',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => organizationApi.cancelKitchenProduction(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Production was not cancelled',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenProductionQueries(queryClient);
      showToast({ title: 'Production cancelled', variant: 'success' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteKitchenProduction(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Production was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenProductionQueries(queryClient);
      showToast({ title: 'Production deleted', variant: 'success' });
    },
  });

  const productions = productionsQuery.data?.items ?? [];
  const meta = productionsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  function deleteProduction(production: KitchenProduction) {
    if (window.confirm(`Delete ${production.productionNumber}?`)) {
      deleteMutation.mutate(production.id);
    }
  }

  const visibleColumns = productionColumns.filter(
    (column) => !statusFilter || column.status === statusFilter,
  );
  const notPostedCount = productions.filter((production) => production.status === 'DRAFT').length;
  const selectedKitchen = (kitchensQuery.data ?? []).find(
    (kitchen) => kitchen.id === kitchenFilter,
  );

  if (selectedProductionId) {
    return (
      <ProductionEntryPageClient key={selectedProductionId} productionId={selectedProductionId} />
    );
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <>
            <FilterTabs
              label="Production status"
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={[
                { label: 'All', value: '' as const },
                ...productionColumns.map((column) => ({
                  label: column.label,
                  value: column.status,
                })),
              ]}
              value={statusFilter}
            />
            {canOpenPath('/kitchen/productions/new', hasPermission) ? (
              <Button asChild className="h-cta px-5">
                <Link href="/kitchen/productions/new">
                  <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
                  New production
                </Link>
              </Button>
            ) : null}
          </>
        }
        subtitle="Produce mapped READYMADE items and post accepted quantity into kitchen stock."
        title="Production board"
      />

      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-ds-divider p-4">
          <div className="min-w-[220px] flex-1">
            <SearchInput
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              value={searchInput}
            />
          </div>
          <div className="w-full sm:w-48">
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
          </div>
          <div className="w-full sm:w-48">
            <KitchenSelect
              disabled={!hospitalFilter}
              kitchens={kitchensQuery.data ?? []}
              onChange={(value) => {
                setKitchenFilter(value);
                setPage(1);
              }}
              value={kitchenFilter}
            />
          </div>
          <div className="w-full sm:w-36">
            <Select
              aria-label="Sort order"
              onChange={(event) => {
                setSortOrder(event.target.value as SortOrder);
                setPage(1);
              }}
              value={sortOrder}
            >
              <option value="desc">Newest</option>
              <option value="asc">Oldest</option>
            </Select>
          </div>
          <Button
            aria-label="Refresh productions"
            onClick={() => void productionsQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm text-ds-text-3">
          <span className="inline-flex items-center gap-2">
            <ChefHat aria-hidden="true" className="h-4 w-4 text-ds-teal-text" strokeWidth={1.8} />
            <span className="font-semibold text-ds-text">
              {selectedKitchen?.kitchenName ?? 'All kitchens'}
            </span>
          </span>
          <span aria-live="polite">
            {productionsQuery.isLoading ? (
              <Skeleton
                aria-label="Loading productions"
                className="inline-block h-4 w-36 align-middle"
              />
            ) : (
              `${meta.total} production${meta.total === 1 ? '' : 's'} on the board`
            )}
          </span>
          {notPostedCount > 0 ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ds-status-bad-bg px-3 py-1 text-xs font-semibold text-ds-status-bad-fg">
              <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
              {notPostedCount} not posted yet
            </span>
          ) : null}
        </div>
      </Panel>

      {productionsQuery.isError ? (
        <p className="rounded-tile bg-ds-status-bad-bg px-4 py-6 text-center text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(productionsQuery.error)}
        </p>
      ) : (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 nav:mx-0 nav:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
          {visibleColumns.map((column) => {
            const columnProductions = productions.filter(
              (production) => production.status === column.status,
            );

            return (
              <section
                aria-label={`${column.label} productions`}
                className="flex w-[300px] shrink-0 flex-col rounded-card bg-ds-subtle p-3 lg:w-auto lg:min-w-0"
                key={column.status}
              >
                <header className="flex items-center justify-between gap-2 px-1 pb-3">
                  <h2 className="flex items-center gap-2 font-bold text-ds-text">
                    <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-xs', column.dot)} />
                    {column.label}
                  </h2>
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-ds-surface px-2 text-xs font-bold text-ds-text-3 ring-1 ring-ds-border">
                    {productionsQuery.isLoading ? '–' : columnProductions.length}
                  </span>
                </header>
                <div className="space-y-3">
                  {productionsQuery.isLoading ? (
                    <>
                      <Skeleton className="h-40 rounded-tile" />
                      <Skeleton className="h-40 rounded-tile" />
                    </>
                  ) : columnProductions.length > 0 ? (
                    columnProductions.map((production) => {
                      const totals = productionTotals(production);
                      const [firstLine, ...otherLines] = production.lines;

                      return (
                        <article
                          className="rounded-tile border border-ds-border bg-ds-surface p-4 shadow-card"
                          key={production.id}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              className="rounded-sm text-xs font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                              href={hrefWith({ id: production.id })}
                              prefetch={false}
                            >
                              {production.productionNumber}
                            </Link>
                            <span className="inline-flex items-center gap-1 rounded-full bg-ds-subtle px-2 py-0.5 text-xs font-semibold text-ds-text-3">
                              <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                              {formatDate(production.productionDate)}
                            </span>
                          </div>
                          <h3 className="mt-2 font-bold leading-5 text-ds-text">
                            {firstLine ? (
                              <RecordLink
                                href={recordHref('/masters/items', { id: firstLine.item.id })}
                              >
                                {firstLine.item.itemName}
                              </RecordLink>
                            ) : (
                              'No items'
                            )}
                            {otherLines.length ? (
                              <span className="font-semibold text-ds-muted">
                                {' '}
                                + {otherLines.length} more
                              </span>
                            ) : null}
                          </h3>
                          <p className="mt-0.5 text-sm text-ds-text-3">
                            Produced {formatProductionQuantity(totals.produced)} · Accepted{' '}
                            {formatProductionQuantity(totals.accepted)}
                            {totals.wastage
                              ? ` · Wastage ${formatProductionQuantity(totals.wastage)}`
                              : ''}
                          </p>
                          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ds-muted">
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              <RecordLink
                                href={locationHref(
                                  'KITCHEN',
                                  production.kitchen.kitchenCode || production.kitchen.kitchenName,
                                )}
                              >
                                {production.kitchen.kitchenName}
                              </RecordLink>{' '}
                              · {production.hospital.hospitalName}
                            </span>
                          </p>
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ds-divider pt-3">
                            <span className="flex min-w-0 items-center gap-2 text-[13px] text-ds-text-2">
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ds-teal-soft text-[11px] font-bold text-ds-teal-text">
                                {production.chef ? personInitials(production.chef.name) : '?'}
                              </span>
                              <span className="truncate">
                                {production.chef?.name ?? 'No chef assigned'}
                              </span>
                            </span>
                            {production.status === 'POSTED' ? (
                              <StatusChip label="Posted to stock" status="POSTED" />
                            ) : production.status === 'CANCELLED' ? (
                              <StatusChip status="CANCELLED" />
                            ) : null}
                          </div>
                          {production.status === 'DRAFT' ? (
                            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                              <Button
                                disabled={postMutation.isPending}
                                onClick={() => postMutation.mutate(production.id)}
                                type="button"
                              >
                                Post
                              </Button>
                              <Button
                                disabled={cancelMutation.isPending}
                                onClick={() => cancelMutation.mutate(production.id)}
                                type="button"
                                variant="outline"
                              >
                                Cancel
                              </Button>
                              <Button
                                aria-label={`Delete ${production.productionNumber}`}
                                className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteProduction(production)}
                                size="icon"
                                type="button"
                                variant="outline"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <p className="rounded-tile border border-dashed border-ds-border px-4 py-8 text-center text-sm text-ds-muted">
                      No {column.label.toLowerCase()} productions
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Panel className="[&>div]:border-t-0">
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
