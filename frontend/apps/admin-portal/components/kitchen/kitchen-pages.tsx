'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChefHat,
  Clock,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  Hospital,
  Item,
  ItemType,
  Kitchen,
  KitchenProduction,
  KitchenProductionInput,
  KitchenProductionStatus,
  SortOrder,
  StockBalanceStatus,
} from '@aahar/api-client';
import { AppPageHeader, StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input, Panel, Select, Skeleton } from '@/components/ui';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { FilterTabs } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import {
  useDebouncedValue,
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
} from '@/lib/use-url-state';
import { canOpenPath, locationHref, recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';

const listLimit = 10;
const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
const kitchenStockStatuses: StockBalanceStatus[] = ['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'];

const headerSchema = z.object({
  businessDate: z.string().trim().min(1, 'Business date is required.'),
  hospitalId: z.string().uuid('Select a hospital.'),
  kitchenId: z.string().uuid('Select a kitchen.'),
  productionDate: z.string().trim().min(1, 'Production date is required.'),
  remarks: z.string().trim(),
});

const lineSchema = z
  .object({
    acceptedQty: z.coerce.number().min(0, 'Accepted quantity cannot be negative.'),
    itemId: z.string().uuid('Select an item.'),
    producedQty: z.coerce.number().min(0.001, 'Produced quantity must be greater than zero.'),
    remarks: z.string().trim(),
    wastageQty: z.coerce.number().min(0, 'Wastage quantity cannot be negative.'),
  })
  .superRefine((line, context) => {
    if (line.acceptedQty > line.producedQty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted quantity cannot exceed produced quantity.',
        path: ['acceptedQty'],
      });
    }

    if (line.wastageQty > line.producedQty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wastage quantity cannot exceed produced quantity.',
        path: ['wastageQty'],
      });
    }

    if (line.acceptedQty + line.wastageQty > line.producedQty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted plus wastage quantity cannot exceed produced quantity.',
        path: ['acceptedQty'],
      });
    }
  });

const linesSchema = z.array(lineSchema).min(1, 'Add at least one production line.');

interface ProductionHeaderFormValues {
  businessDate: string;
  hospitalId: string;
  kitchenId: string;
  productionDate: string;
  remarks: string;
}

interface ProductionLineDraft {
  acceptedQty: string;
  clientId: string;
  itemId: string;
  producedQty: string;
  remarks: string;
  wastageQty: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
const shortDateFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function clientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function defaultDateTimeLocal(): string {
  const now = new Date();

  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  return now.toISOString().slice(0, 16);
}

function defaultDateOnly(): string {
  const now = new Date();

  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  return now.toISOString().slice(0, 10);
}

function emptyProductionLine(): ProductionLineDraft {
  return {
    acceptedQty: '',
    clientId: clientId('production-line'),
    itemId: '',
    producedQty: '',
    remarks: '',
    wastageQty: '',
  };
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }

  return dateFormatter.format(new Date(value));
}

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

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function quantity(value: string): number {
  return Number(value || 0);
}

function acceptedFrom(producedQty: string, wastageQty: string): string {
  const acceptedQty = Math.max(quantity(producedQty) - quantity(wastageQty), 0);

  return producedQty ? String(Number(acceptedQty.toFixed(3))) : '';
}

function PageHeader({
  action,
  subtitle,
  title,
}: Readonly<{ action?: ReactNode; subtitle: string; title: string }>) {
  return (
    <AppPageHeader
      action={action}
      description={subtitle}
      eyebrow="Kitchen Operations"
      title={title}
    />
  );
}

function SearchInput({
  onChange,
  value,
}: Readonly<{ onChange: (value: string) => void; value: string }>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        value={value}
      />
    </div>
  );
}

function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: Readonly<{
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}>) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-ds-muted sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing page {page} of {Math.max(totalPages, 1)} / {total} records / {limit} per page
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function QueryState({
  colSpan,
  error,
  isError,
  isLoading,
  label,
}: Readonly<{
  colSpan: number;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  label: string;
}>) {
  if (isLoading) {
    return (
      <>
        {skeletonRows.map((row) => (
          <tr key={row}>
            <td className="px-4 py-3" colSpan={colSpan}>
              <Skeleton className="h-10 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-8 text-center text-sm text-ds-status-bad-fg" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-10 text-center" colSpan={colSpan}>
        <p className="font-medium text-ds-text-2">No {label} found</p>
        <p className="text-sm text-ds-muted">Adjust filters or create a new record.</p>
      </td>
    </tr>
  );
}

function useHospitals() {
  return useQuery({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'hospitalName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['kitchen-hospitals'],
  });
}

function useKitchens(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['kitchen-kitchens', hospitalId],
  });
}

function useItems(itemType?: ItemType) {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        itemType,
        limit: 100,
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['kitchen-stock-items', itemType ?? 'all'],
  });
}

function useMappedKitchenItems(kitchenId?: string) {
  return useQuery({
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const response = await organizationApi.listKitchenItems({
        isActive: true,
        kitchenId,
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });

      return response.data.items.filter((mapping) => mapping.item.itemType === 'READYMADE');
    },
    queryKey: ['kitchen-production-items', kitchenId],
  });
}

function HospitalSelect({
  disabled = false,
  hospitals,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  hospitals: Hospital[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select location</option>
      {hospitals.map((hospital) => (
        <option key={hospital.id} value={hospital.id}>
          {hospital.hospitalName}
        </option>
      ))}
    </Select>
  );
}

function KitchenSelect({
  disabled,
  kitchens,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  kitchens: Kitchen[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select kitchen</option>
      {kitchens.map((kitchen) => (
        <option key={kitchen.id} value={kitchen.id}>
          {kitchen.kitchenName}
        </option>
      ))}
    </Select>
  );
}

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

function formatProductionQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

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
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
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
    queryKey: [
      'kitchen-productions',
      page,
      search,
      hospitalFilter,
      kitchenFilter,
      statusFilter,
      sortOrder,
    ],
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
            {productionsQuery.isLoading
              ? 'Loading productions…'
              : `${meta.total} production${meta.total === 1 ? '' : 's'} on the board`}
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

/** Lines wasting more than this share of what was produced are highlighted. */
const WASTAGE_ALERT_PERCENT = 5;
/** How many mapped items are offered as one-tap chips before the rest go in a select. */
const productionChipCount = 6;

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

  return date.toISOString().slice(0, 16);
}

function wastePercent(produced: number, wasted: number): number {
  return produced > 0 ? (wasted / produced) * 100 : 0;
}

const timeOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
});

/**
 * Record what a kitchen produced and wasted, then post the accepted quantity to kitchen
 * stock. Without an id it creates a production; with one it opens it (drafts stay editable).
 */
export function ProductionEntryPageClient({ productionId }: Readonly<{ productionId?: string }>) {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<ProductionLineDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const initializedFor = useRef<string | null>(null);
  const form = useForm<ProductionHeaderFormValues>({
    defaultValues: {
      businessDate: defaultDateOnly(),
      hospitalId: scopedHospitalId ?? '',
      kitchenId: '',
      productionDate: defaultDateTimeLocal(),
      remarks: '',
    },
  });
  const selectedHospitalId = form.watch('hospitalId');
  const selectedKitchenId = form.watch('kitchenId');
  const hospitalsQuery = useHospitals();
  const kitchensQuery = useKitchens(selectedHospitalId);
  const itemsQuery = useMappedKitchenItems(selectedKitchenId);
  const mappedItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const itemMap = useMemo(
    () => new Map(mappedItems.map((mapping) => [mapping.itemId, mapping])),
    [mappedItems],
  );
  const productionQuery = useQuery({
    enabled: Boolean(productionId),
    queryFn: async () => (await organizationApi.getKitchenProduction(productionId ?? '')).data,
    queryKey: ['kitchen-productions', 'detail', productionId],
    retry: false,
  });
  const production = productionQuery.data;
  useBreadcrumbLabel(
    productionId,
    production?.productionNumber ?? (productionQuery.isError ? 'Not found' : undefined),
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listKitchenProductions({
          fromDate: todayStart.toISOString(),
          hospitalId: scopedHospitalId,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data.items,
    queryKey: [
      'kitchen-productions',
      'today',
      scopedHospitalId ?? 'all',
      todayStart.toDateString(),
    ],
  });
  const isExisting = Boolean(productionId);
  const isEditable = !isExisting || production?.status === 'DRAFT';
  const canSave =
    isEditable &&
    hasPermission(isExisting ? 'KITCHEN_PRODUCTION_UPDATE' : 'KITCHEN_PRODUCTION_CREATE');
  const canPost = isEditable && hasPermission('KITCHEN_PRODUCTION_POST');

  useEffect(() => {
    if (scopedHospitalId && !isExisting) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('kitchenId', '', { shouldValidate: true });
      setLines([]);
    }
  }, [form, isExisting, scopedHospitalId]);

  // Fill the form from the saved production once, so a refetch keeps what was typed.
  useEffect(() => {
    if (!production || initializedFor.current === production.id) {
      return;
    }

    initializedFor.current = production.id;
    form.reset({
      businessDate: production.businessDate.slice(0, 10),
      hospitalId: production.hospitalId,
      kitchenId: production.kitchenId,
      productionDate: toDateTimeLocal(production.productionDate),
      remarks: production.remarks ?? '',
    });
    setLines(
      production.lines.map((line) => ({
        acceptedQty: String(line.acceptedQty),
        clientId: clientId('production-line'),
        itemId: line.itemId,
        producedQty: String(line.producedQty),
        remarks: line.remarks ?? '',
        wastageQty: String(line.wastageQty),
      })),
    );
  }, [form, production]);

  const saveMutation = useMutation({
    mutationFn: async ({ body, post }: { body: KitchenProductionInput; post: boolean }) => {
      const saved = (
        isExisting && productionId
          ? await organizationApi.updateKitchenProduction(productionId, body)
          : await organizationApi.createKitchenProduction(body)
      ).data;

      return post ? (await organizationApi.postKitchenProduction(saved.id)).data : saved;
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Production was not saved',
        variant: 'error',
      });
    },
    onSuccess(saved) {
      const href = recordHref('/kitchen/productions', { id: saved.id });
      invalidateKitchenProductionQueries(queryClient);
      showToast({
        action: { href, label: `View ${saved.productionNumber}` },
        description: saved.productionNumber,
        title: saved.status === 'POSTED' ? 'Posted to kitchen stock' : 'Draft saved',
        variant: 'success',
      });

      if (!isExisting) {
        router.replace(href);
      }
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

  function addItem(itemId: string) {
    if (!itemId || lines.some((line) => line.itemId === itemId)) {
      return;
    }

    const line = { ...emptyProductionLine(), itemId };
    setLines((current) => [...current, line]);
    window.requestAnimationFrame(() =>
      document.getElementById(`produced-${line.clientId}`)?.focus(),
    );
  }

  function updateLine(id: string, patch: Partial<ProductionLineDraft>) {
    setLines((current) =>
      current.map((line) => {
        if (line.clientId !== id) {
          return line;
        }

        const next = { ...line, ...patch };
        next.acceptedQty = acceptedFrom(next.producedQty, next.wastageQty);

        return next;
      }),
    );
  }

  const rows = lines.map((line) => {
    const produced = quantity(line.producedQty);
    const wasted = quantity(line.wastageQty);
    const percent = wastePercent(produced, wasted);
    const error =
      line.producedQty !== '' && (!Number.isFinite(produced) || produced <= 0)
        ? 'Produced quantity must be greater than zero.'
        : wasted < 0
          ? 'Wastage cannot be negative.'
          : wasted > produced && produced > 0
            ? 'Wastage cannot be more than what was produced.'
            : hasTriedSave && line.producedQty === ''
              ? 'Enter the produced quantity.'
              : null;

    return {
      accepted: Math.max(produced - wasted, 0),
      error,
      isHigh: percent > WASTAGE_ALERT_PERCENT,
      line,
      mapping: itemMap.get(line.itemId),
      percent,
      produced,
      wasted,
    };
  });
  const totalProduced = rows.reduce((total, row) => total + row.produced, 0);
  const totalWasted = rows.reduce((total, row) => total + row.wasted, 0);
  const overallPercent = wastePercent(totalProduced, totalWasted);
  const flagged = rows.filter((row) => row.isHigh).length;
  const addedIds = new Set(lines.map((line) => line.itemId));
  const available = mappedItems.filter((mapping) => !addedIds.has(mapping.itemId));
  const kitchenName =
    (kitchensQuery.data ?? []).find((kitchen) => kitchen.id === selectedKitchenId)?.kitchenName ??
    production?.kitchen.kitchenName ??
    'this kitchen';

  function save(post: boolean) {
    setFormError('');
    setHasTriedSave(true);

    const header = headerSchema.safeParse(form.getValues());
    const parsedLines = linesSchema.safeParse(lines);

    if (!header.success) {
      const issue = header.error.issues[0];
      const fieldName = (issue?.path[0] ?? 'hospitalId') as keyof ProductionHeaderFormValues;
      const message = issue?.message ?? 'Check production header.';

      form.setError(fieldName, { message });
      setFormError(message);
      return;
    }

    if (!parsedLines.success) {
      setFormError(parsedLines.error.issues[0]?.message ?? 'Check production lines.');
      return;
    }

    for (const line of parsedLines.data) {
      if (!itemMap.has(line.itemId)) {
        setFormError('Every production line must use a mapped READYMADE kitchen item.');
        return;
      }
    }

    saveMutation.mutate({
      body: {
        businessDate: header.data.businessDate,
        hospitalId: header.data.hospitalId,
        items: parsedLines.data.map((line) => ({
          acceptedQty: line.acceptedQty,
          itemId: line.itemId,
          producedQty: line.producedQty,
          remarks: optionalValue(line.remarks),
          wastageQty: line.wastageQty,
        })),
        kitchenId: header.data.kitchenId,
        productionDate: new Date(header.data.productionDate).toISOString(),
        remarks: optionalValue(header.data.remarks),
      },
      post,
    });
  }

  if (isExisting && productionQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (isExisting && !production) {
    return (
      <Panel className="p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-bold text-ds-text">Production not found</p>
          <p className="text-sm text-ds-muted">
            It may have been deleted, or it belongs to a location you can't view.
          </p>
          <Button asChild variant="outline">
            <Link href="/kitchen/productions">Back to production</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  const isBusy = saveMutation.isPending || cancelMutation.isPending;
  const errors = form.formState.errors;
  const fieldLabel = 'flex flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2';
  const selectClass =
    'h-control w-full rounded-control border border-ds-input bg-ds-surface px-2.5 text-[13.5px] font-semibold text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted';
  const qtyClass =
    'h-9 w-full rounded-control border-[1.5px] bg-ds-surface px-2 text-[13px] font-extrabold tabular-nums text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:bg-ds-subtle disabled:text-ds-muted';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tabular-nums tracking-[-0.01em] text-ds-text">
              {production?.productionNumber ?? 'New production'}
            </h1>
            <StatusChip
              label={production?.status === 'POSTED' ? 'Posted to stock' : undefined}
              status={production?.status ?? 'DRAFT'}
            />
          </div>
          <p className="text-[13.5px] text-ds-muted">
            {[
              selectedKitchenId ? kitchenName : null,
              production?.hospital.hospitalName,
              production?.chef ? `chef ${production.chef.name}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Choose the kitchen, then add what it produced.'}
          </p>
        </div>
        {isEditable ? (
          <div className="flex flex-wrap gap-2">
            {isExisting && production && hasPermission('KITCHEN_PRODUCTION_UPDATE') ? (
              <Button
                className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                disabled={isBusy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Cancel ${production.productionNumber}? Nothing is added to stock.`,
                    )
                  ) {
                    cancelMutation.mutate(production.id);
                  }
                }}
                type="button"
                variant="ghost"
              >
                Cancel production
              </Button>
            ) : null}
            {canSave ? (
              <Button disabled={isBusy} onClick={() => save(false)} type="button" variant="outline">
                Save draft
              </Button>
            ) : null}
            {canPost && (isExisting || hasPermission('KITCHEN_PRODUCTION_CREATE')) ? (
              <Button disabled={isBusy} onClick={() => save(true)} type="button">
                {saveMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                )}
                Post to kitchen stock
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <nav
          aria-labelledby="production-today"
          className="max-w-full flex-[1_1_240px] overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
        >
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
            <h2 className="text-sm font-extrabold text-ds-text" id="production-today">
              Today · {shortDateFormatter.format(new Date())}
            </h2>
            <Link
              aria-label="New production"
              className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-ds-border text-ds-link transition hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
              href="/kitchen/productions/new"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
            </Link>
          </div>
          {todayQuery.isLoading ? (
            <div className="space-y-2 px-4 pb-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (todayQuery.data ?? []).length === 0 ? (
            <p className="border-t border-ds-divider px-4 py-4 text-[12.5px] text-ds-muted">
              Nothing recorded yet today.
            </p>
          ) : (
            (todayQuery.data ?? []).map((entry) => {
              const isCurrent = entry.id === productionId;

              return (
                <Link
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 border-t border-ds-divider px-4 py-2.5 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                    isCurrent ? 'bg-ds-selected' : 'hover:bg-ds-subtle',
                  )}
                  href={`/kitchen/productions?id=${entry.id}`}
                  key={entry.id}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        'text-[13px] font-extrabold tabular-nums',
                        isCurrent ? 'text-ds-link' : 'text-ds-text',
                      )}
                    >
                      {entry.productionNumber}
                    </span>
                    <span className="truncate text-[11.5px] text-ds-muted">
                      {entry.kitchen.kitchenName} ·{' '}
                      {entry.status === 'POSTED'
                        ? `posted ${timeOnlyFormatter.format(new Date(entry.updatedAt))}`
                        : timeOnlyFormatter.format(new Date(entry.productionDate))}
                    </span>
                  </span>
                  <StatusChip status={entry.status} />
                </Link>
              );
            })
          )}
        </nav>

        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <Panel
            aria-label="Production details"
            className="grid gap-3 px-[18px] py-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
            role="region"
          >
            {!isLocationSelectorLocked && !isExisting ? (
              <label className={fieldLabel}>
                Location
                <select
                  className={selectClass}
                  disabled={isBusy}
                  onChange={(event) => {
                    form.setValue('hospitalId', event.target.value, {
                      shouldValidate: hasTriedSave,
                    });
                    form.setValue('kitchenId', '');
                    setLines([]);
                  }}
                  value={selectedHospitalId}
                >
                  <option value="">Select location</option>
                  {(hospitalsQuery.data ?? []).map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.hospitalName}
                    </option>
                  ))}
                </select>
                {errors.hospitalId ? <FieldError>{errors.hospitalId.message}</FieldError> : null}
              </label>
            ) : null}
            <label className={fieldLabel}>
              Kitchen
              <select
                className={selectClass}
                disabled={!selectedHospitalId || !isEditable || isBusy}
                onChange={(event) => {
                  form.setValue('kitchenId', event.target.value, { shouldValidate: hasTriedSave });
                  setLines([]);
                }}
                value={selectedKitchenId}
              >
                <option value="">
                  {selectedHospitalId ? 'Select kitchen' : 'Choose a location first'}
                </option>
                {(kitchensQuery.data ?? []).map((kitchen) => (
                  <option key={kitchen.id} value={kitchen.id}>
                    {kitchen.kitchenName}
                  </option>
                ))}
              </select>
              {errors.kitchenId ? <FieldError>{errors.kitchenId.message}</FieldError> : null}
            </label>
            <label className={fieldLabel}>
              Produced at
              <Input
                disabled={!isEditable || isBusy}
                type="datetime-local"
                {...form.register('productionDate')}
              />
              {errors.productionDate ? (
                <FieldError>{errors.productionDate.message}</FieldError>
              ) : null}
            </label>
            <label className={fieldLabel}>
              Business date
              <Input
                disabled={!isEditable || isBusy}
                type="date"
                {...form.register('businessDate')}
              />
              {errors.businessDate ? <FieldError>{errors.businessDate.message}</FieldError> : null}
            </label>
            <label className={fieldLabel}>
              Remarks
              <Input
                disabled={!isEditable || isBusy}
                placeholder="Optional"
                {...form.register('remarks')}
              />
            </label>
          </Panel>

          <Panel aria-labelledby="production-lines" className="overflow-hidden" role="region">
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
              <h2 className="text-[15px] font-extrabold text-ds-text" id="production-lines">
                Produced items · {lines.length}
              </h2>
              <span className="text-[12.5px] text-ds-muted">
                Accepted = produced − wastage. Only items mapped to this kitchen can be added.
              </span>
            </div>
            {lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] table-fixed text-[13px]">
                  <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                    <tr>
                      <th className="py-2 pl-[18px] font-semibold">Item</th>
                      <th className="w-[124px] px-2 py-2 font-semibold">Produced</th>
                      <th className="w-[124px] px-2 py-2 font-semibold">Wastage</th>
                      <th className="w-[92px] px-2 py-2 text-right font-semibold">Accepted</th>
                      <th className="w-[76px] px-2 py-2 text-right font-semibold">Waste</th>
                      <th className="w-12 py-2 pr-[18px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Fragment key={row.line.clientId}>
                        <tr
                          className={cn(
                            'border-b border-ds-divider align-middle',
                            row.isHigh && 'bg-ds-status-pending-bg/30',
                          )}
                        >
                          <td className="py-2 pl-[18px]">
                            <span className="block truncate text-[13.5px] font-bold text-ds-text">
                              {row.mapping?.item.itemName ??
                                production?.lines.find((line) => line.itemId === row.line.itemId)
                                  ?.item.itemName ??
                                'Item'}
                            </span>
                            <span className="block truncate text-[11.5px] text-ds-muted">
                              {row.mapping?.item.itemCode ??
                                production?.lines.find((line) => line.itemId === row.line.itemId)
                                  ?.item.itemCode}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              aria-invalid={row.error ? true : undefined}
                              aria-label={`Produced quantity for ${row.mapping?.item.itemName ?? 'item'}`}
                              className={cn(
                                qtyClass,
                                row.error ? 'border-ds-status-bad-fg' : 'border-ds-input',
                              )}
                              disabled={!isEditable || isBusy}
                              id={`produced-${row.line.clientId}`}
                              inputMode="decimal"
                              min="0"
                              onChange={(event) =>
                                updateLine(row.line.clientId, { producedQty: event.target.value })
                              }
                              placeholder="0"
                              step="any"
                              type="number"
                              value={row.line.producedQty}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              aria-label={`Wastage for ${row.mapping?.item.itemName ?? 'item'}`}
                              className={cn(
                                qtyClass,
                                row.isHigh ? 'border-ds-status-pending-fg' : 'border-ds-input',
                              )}
                              disabled={!isEditable || isBusy}
                              inputMode="decimal"
                              min="0"
                              onChange={(event) =>
                                updateLine(row.line.clientId, { wastageQty: event.target.value })
                              }
                              placeholder="0"
                              step="any"
                              type="number"
                              value={row.line.wastageQty}
                            />
                          </td>
                          <td className="px-2 py-2 text-right text-[13.5px] font-extrabold tabular-nums text-ds-status-ok-fg">
                            {formatProductionQuantity(Number(row.accepted.toFixed(3)))}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className={cn(
                                'rounded-full px-[7px] py-0.5 text-[11.5px] font-bold tabular-nums',
                                row.isHigh
                                  ? 'bg-ds-status-pending-bg text-ds-status-pending-fg'
                                  : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                              )}
                              title={
                                row.isHigh ? `Above the ${WASTAGE_ALERT_PERCENT}% limit` : undefined
                              }
                            >
                              {row.percent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 pr-[18px]">
                            {isEditable ? (
                              <button
                                aria-label={`Remove ${row.mapping?.item.itemName ?? 'line'}`}
                                className="grid h-8 w-8 place-items-center rounded-lg text-ds-muted transition hover:bg-ds-status-bad-bg hover:text-ds-status-bad-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                                disabled={isBusy}
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter((line) => line.clientId !== row.line.clientId),
                                  )
                                }
                                type="button"
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {row.error ? (
                          <tr className="border-b border-ds-divider">
                            <td className="pb-2 pl-[18px] pr-[18px]" colSpan={6}>
                              <span
                                className="flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                                role="alert"
                              >
                                <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
                                {row.error}
                              </span>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border-t border-ds-divider px-[18px] py-6 text-center text-[13px] text-ds-muted">
                {!selectedKitchenId
                  ? 'Choose a kitchen to see the items mapped to it.'
                  : itemsQuery.isLoading
                    ? 'Loading kitchen items…'
                    : mappedItems.length === 0
                      ? 'Map a READYMADE item to this kitchen before recording production.'
                      : 'Add what the kitchen produced from the items below.'}
              </p>
            )}
            {isEditable && available.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-ds-divider px-[18px] py-3">
                <span className="text-xs font-semibold text-ds-muted">
                  Add from {kitchenName} items:
                </span>
                {available.slice(0, productionChipCount).map((mapping) => (
                  <button
                    className="inline-flex h-[30px] items-center gap-1 rounded-full border border-dashed border-ds-input px-2.5 text-xs font-bold text-ds-text-2 transition hover:border-ds-primary hover:text-ds-link focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                    key={mapping.id}
                    onClick={() => addItem(mapping.itemId)}
                    type="button"
                  >
                    <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
                    {mapping.item.itemName}
                  </button>
                ))}
                {available.length > productionChipCount ? (
                  <select
                    aria-label="Add another item"
                    className="h-[30px] rounded-full border border-dashed border-ds-input bg-ds-surface px-2.5 text-xs font-bold text-ds-text-2"
                    onChange={(event) => addItem(event.target.value)}
                    value=""
                  >
                    <option value="">+ {available.length - productionChipCount} more…</option>
                    {available.slice(productionChipCount).map((mapping) => (
                      <option key={mapping.id} value={mapping.itemId}>
                        {mapping.item.itemName}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
            <dl className="grid gap-px bg-ds-divider grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
              {[
                { label: 'Items', tone: 'text-ds-text', value: String(lines.length) },
                {
                  label: 'Overall wastage',
                  tone:
                    overallPercent > WASTAGE_ALERT_PERCENT
                      ? 'text-ds-status-pending-fg'
                      : 'text-ds-status-ok-fg',
                  value: `${overallPercent.toFixed(1)}%`,
                },
                {
                  label: `Above ${WASTAGE_ALERT_PERCENT}% limit`,
                  tone: flagged ? 'text-ds-status-pending-fg' : 'text-ds-status-ok-fg',
                  value: String(flagged),
                },
              ].map((total) => (
                <div
                  className="flex flex-col gap-0.5 bg-ds-subtle px-[18px] py-3"
                  key={total.label}
                >
                  <dt className="text-[11.5px] text-ds-muted">{total.label}</dt>
                  <dd className={cn('text-base font-extrabold tabular-nums', total.tone)}>
                    {total.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          {formError ? (
            <p
              className="rounded-control bg-ds-status-bad-bg p-3 text-sm font-semibold text-ds-status-bad-fg"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div
            aria-label="Posting note"
            className="flex gap-2.5 rounded-card bg-ds-status-info-bg px-4 py-3.5 text-[12.5px] font-semibold text-ds-status-info-fg"
            role="note"
          >
            <Info aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
            {production?.status === 'POSTED'
              ? `Posted: the accepted quantities are in ${kitchenName} stock and can be sent to restaurants with a transfer.`
              : `Posting adds the accepted quantities to ${kitchenName} stock. Once posted, they can be sent to restaurants with a transfer.`}
          </div>
        </div>
      </div>
    </section>
  );
}

export function KitchenStockPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [hospitalFilter, setHospitalFilter] = useState('');
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
  const itemOptionsQuery = useItems('READYMADE');

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
    queryKey: [
      'kitchen-stock',
      page,
      search,
      hospitalFilter,
      kitchenFilter,
      itemFilter,
      businessDateFilter,
      statusFilter,
      sortBy,
      sortOrder,
    ],
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
