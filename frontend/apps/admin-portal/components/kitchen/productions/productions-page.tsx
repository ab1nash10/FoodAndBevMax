'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock, Plus, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';
import type { KitchenProduction, KitchenProductionStatus, SortOrder } from '@aahar/api-client';
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
  RowAction,
  StatStrip,
  StatusChip,
  tableStyles,
} from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { useAuth } from '@/components/auth-provider';
import { FilterSearch } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { LoadError } from '@/components/location-empty-states';
import { RecordLink } from '@/components/record-link';
import {
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { useUndoable } from '@/lib/use-undoable';
import { canOpenPath, locationHref, recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { formatProductionQuantity } from '@/components/kitchen/productions/shared';
import {
  HospitalSelect,
  KitchenSelect,
  PaginationControls,
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

// Board columns from the kitchen concept, one per production status; the stat strip above the
// board counts each one and filters the board to it.
const productionColumns: Array<{
  dot: string;
  label: string;
  status: KitchenProductionStatus;
  tone: 'bad' | 'ok' | 'pending';
}> = [
  { dot: 'bg-ds-stage-preparing', label: 'Draft', status: 'DRAFT', tone: 'pending' },
  { dot: 'bg-ds-stage-ready', label: 'Posted', status: 'POSTED', tone: 'ok' },
  { dot: 'bg-ds-stage-queued', label: 'Cancelled', status: 'CANCELLED', tone: 'bad' },
];

/** A click on a card's own link or button does that, not open the production. */
function isInnerControl(event: MouseEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest('a, button'));
}

function personInitials(name: string): string {
  return name
    .split(/\s+/)
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
  const router = useRouter();
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

  // Every status's total at the chosen location and kitchen, whatever the board shows now.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (status?: KitchenProductionStatus) =>
        (
          await organizationApi.listKitchenProductions({
            hospitalId: hospitalFilter,
            kitchenId: kitchenFilter,
            limit: 0,
            status,
          })
        ).data.meta.total;
      const [all, draft, posted, cancelled] = await Promise.all([
        count(),
        count('DRAFT'),
        count('POSTED'),
        count('CANCELLED'),
      ]);

      return { all, CANCELLED: cancelled, DRAFT: draft, POSTED: posted };
    },
    queryKey: queryKeys.kitchenProductions('stats', hospitalFilter, kitchenFilter),
  });
  const stats = statsQuery.data;

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
      // The Undo toast already said it was deleted.
      invalidateKitchenProductionQueries(queryClient);
    },
  });
  const undoable = useUndoable();

  const productions = (productionsQuery.data?.items ?? []).filter(
    (production) => !undoable.isChanged(production.id),
  );
  const meta = productionsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const hasFilters = Boolean(searchInput || hospitalParam || kitchenFilter || statusFilter);

  function clearFilters() {
    setSearch('');
    setHospitalFilter('');
    setKitchenFilter('');
    setStatusFilter('');
    setPage(1);
  }

  // Only a draft can be deleted, and nothing of it is in stock yet, so it can wait for Undo.
  function deleteProduction(production: KitchenProduction) {
    undoable.schedule({
      commit: () => deleteMutation.mutateAsync(production.id),
      id: production.id,
      title: `${production.productionNumber} deleted`,
    });
  }

  const visibleColumns = productionColumns.filter(
    (column) => !statusFilter || column.status === statusFilter,
  );
  const selectedKitchen = (kitchensQuery.data ?? []).find(
    (kitchen) => kitchen.id === kitchenFilter,
  );

  function showStatus(status: '' | KitchenProductionStatus) {
    setStatusFilter(status);
    setPage(1);
  }

  if (selectedProductionId) {
    return (
      <ProductionEntryPageClient key={selectedProductionId} productionId={selectedProductionId} />
    );
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          canOpenPath('/kitchen/productions/new', hasPermission) ? (
            <Button asChild>
              <Link href="/kitchen/productions/new">
                <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                New production
              </Link>
            </Button>
          ) : null
        }
        count={stats?.all}
        description="Produce mapped READYMADE items and post accepted quantity into kitchen stock."
        eyebrow={selectedKitchen?.kitchenName}
        title="Production board"
      />

      <StatStrip
        label="Productions at a glance"
        stats={[
          {
            active: !statusFilter,
            label: 'All productions',
            onSelect: () => showStatus(''),
            value: stats?.all ?? '–',
          },
          ...productionColumns.map((column) => ({
            active: statusFilter === column.status,
            label: column.label,
            onSelect: () => showStatus(column.status),
            tone: column.tone,
            value: stats?.[column.status] ?? '–',
          })),
        ]}
      />

      <Panel>
        <ListToolbar>
          <FilterSearch
            label="Search productions"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Number, item or kitchen"
            value={searchInput}
          />
          <FiltersMenu activeCount={[hospitalParam, kitchenFilter].filter(Boolean).length}>
            <FilterField label="Location">
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
            </FilterField>
            <FilterField label="Kitchen">
              <KitchenSelect
                disabled={!hospitalFilter}
                kitchens={kitchensQuery.data ?? []}
                onChange={(value) => {
                  setKitchenFilter(value);
                  setPage(1);
                }}
                value={kitchenFilter}
              />
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
          <RefreshButton
            onClick={() => {
              void productionsQuery.refetch();
              void statsQuery.refetch();
            }}
          />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
      </Panel>

      {productionsQuery.isError ? (
        <div className="rounded-tile bg-ds-status-bad-bg px-4 py-6">
          <LoadError error={productionsQuery.error} />
        </div>
      ) : (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 nav:mx-0 nav:grid nav:grid-cols-3 nav:overflow-visible nav:px-0">
          {visibleColumns.map((column) => {
            const columnProductions = productions.filter(
              (production) => production.status === column.status,
            );

            return (
              <section
                aria-label={`${column.label} productions`}
                className="flex w-75 shrink-0 flex-col rounded-card bg-ds-subtle p-3 nav:w-auto nav:min-w-0"
                key={column.status}
              >
                {/* Its total is in the stat strip above, so the header only names the column. */}
                <header className="px-1 pb-3">
                  <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ds-text">
                    <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-xs', column.dot)} />
                    {column.label}
                  </h2>
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
                        // The whole card opens the production; its links and buttons do their own.
                        <article
                          className="cursor-pointer rounded-tile border border-ds-border bg-ds-surface p-4 shadow-card transition hover:border-ds-primary/40"
                          key={production.id}
                          onClick={(event) => {
                            if (!isInnerControl(event)) {
                              router.push(hrefWith({ id: production.id }));
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              className={cn(
                                tableStyles.code,
                                'rounded-sm font-medium text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                              )}
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
                            Produced{' '}
                            <span className={tableStyles.num}>
                              {formatProductionQuantity(totals.produced)}
                            </span>{' '}
                            · Accepted{' '}
                            <span className={tableStyles.num}>
                              {formatProductionQuantity(totals.accepted)}
                            </span>
                            {totals.wastage ? (
                              <>
                                {' '}
                                · Wastage{' '}
                                <span className={tableStyles.num}>
                                  {formatProductionQuantity(totals.wastage)}
                                </span>
                              </>
                            ) : null}
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
                              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ds-selected text-[11px] font-bold text-ds-link">
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
                              <RowAction
                                className="h-9 w-9 hover:text-ds-status-bad-fg"
                                disabled={deleteMutation.isPending}
                                icon={Trash2}
                                label={`Delete ${production.productionNumber}`}
                                onClick={() => deleteProduction(production)}
                              />
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
          noun="production"
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
