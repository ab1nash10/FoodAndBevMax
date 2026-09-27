'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CookingPot, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  Hospital,
  Item,
  ItemType,
  Kitchen,
  KitchenItem,
  KitchenProduction,
  KitchenProductionInput,
  KitchenProductionStatus,
  SortOrder,
  StockBalanceStatus,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';

const listLimit = 10;
const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
const productionStatuses: KitchenProductionStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];
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

function statusVariant(status: string): 'danger' | 'neutral' | 'success' {
  if (status === 'POSTED' || status === 'AVAILABLE') {
    return 'success';
  }

  if (status === 'CANCELLED' || status === 'OUT_OF_STOCK') {
    return 'danger';
  }

  return 'neutral';
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 place-items-center rounded-lg border border-emerald-100 bg-brand-mint text-brand-teal">
          <CookingPot className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-brand-teal">
            Kitchen Operations
          </p>
          <h1 className="text-2xl font-semibold tracking-normal text-brand-navy">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function SearchInput({
  onChange,
  value,
}: Readonly<{ onChange: (value: string) => void; value: string }>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
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
            <td className="px-4 py-4" colSpan={colSpan}>
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
        <td className="px-4 py-8 text-center text-sm text-red-600" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-10 text-center" colSpan={colSpan}>
        <p className="font-medium text-slate-700">No {label} found</p>
        <p className="text-sm text-slate-500">Adjust filters or create a new record.</p>
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
        limit: 200,
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

function itemOptionLabel(mapping: KitchenItem): string {
  return `${mapping.item.itemCode} - ${mapping.item.itemName}`;
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

export function KitchenProductionsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | KitchenProductionStatus>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const kitchensQuery = useKitchens(hospitalFilter);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setPage(1);
  }, [scopedHospitalId]);

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

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button onClick={() => router.push('/kitchen/productions/new')} type="button">
            <Plus className="h-4 w-4" />
            New Production
          </Button>
        }
        subtitle="Produce mapped READYMADE items and post accepted quantity into kitchen stock."
        title="Kitchen Production"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
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
              setStatusFilter(event.target.value as '' | KitchenProductionStatus);
              setPage(1);
            }}
            value={statusFilter}
          >
            <option value="">All statuses</option>
            {productionStatuses.map((status) => (
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
          <Button onClick={() => void productionsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[14%] px-4 py-3">Production</th>
                <th className="w-[18%] px-4 py-3">Kitchen</th>
                <th className="w-[13%] px-4 py-3">Business Date</th>
                <th className="w-[17%] px-4 py-3">Quantities</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[12%] px-4 py-3">Updated</th>
                <th className="w-[24%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {productions.length > 0 ? (
                productions.map((production) => {
                  const totals = productionTotals(production);

                  return (
                    <tr className="hover:bg-slate-50" key={production.id}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-950">
                          {production.productionNumber}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(production.productionDate)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-950">
                          {production.kitchen.kitchenName}
                        </p>
                        <p className="text-xs text-slate-500">{production.hospital.hospitalName}</p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatDateOnly(production.businessDate)}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        <p>Produced {totals.produced.toFixed(3)}</p>
                        <p className="text-xs text-slate-500">
                          Accepted {totals.accepted.toFixed(3)} / Wastage{' '}
                          {totals.wastage.toFixed(3)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={statusVariant(production.status)}>
                          {formatEnum(production.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatDate(production.updatedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={production.status !== 'DRAFT' || postMutation.isPending}
                            onClick={() => postMutation.mutate(production.id)}
                            size="sm"
                            type="button"
                          >
                            Post
                          </Button>
                          <Button
                            disabled={production.status !== 'DRAFT' || cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(production.id)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Cancel
                          </Button>
                          <Button
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            disabled={production.status !== 'DRAFT' || deleteMutation.isPending}
                            onClick={() => deleteProduction(production)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={7}
                  error={productionsQuery.error}
                  isError={productionsQuery.isError}
                  isLoading={productionsQuery.isLoading}
                  label="kitchen productions"
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

export function CreateKitchenProductionPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<ProductionLineDraft[]>([emptyProductionLine()]);
  const [formError, setFormError] = useState('');
  const [createdProduction, setCreatedProduction] = useState<KitchenProduction | null>(null);
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
  const mappedItems = itemsQuery.data ?? [];
  const itemMap = useMemo(
    () => new Map(mappedItems.map((mapping) => [mapping.itemId, mapping])),
    [mappedItems],
  );
  const isReadOnly =
    createdProduction?.status === 'POSTED' || createdProduction?.status === 'CANCELLED';

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('kitchenId', '', { shouldValidate: true });
      setLines([emptyProductionLine()]);
      setCreatedProduction(null);
    }
  }, [form, scopedHospitalId]);

  const saveMutation = useMutation({
    mutationFn: (body: KitchenProductionInput) => organizationApi.createKitchenProduction(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Production was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedProduction(response.data);
      invalidateKitchenProductionQueries(queryClient);
      showToast({
        description: response.data.productionNumber,
        title: 'Production saved',
        variant: 'success',
      });
    },
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
      setCreatedProduction(response.data);
      invalidateKitchenProductionQueries(queryClient);
      showToast({ title: 'Production posted', variant: 'success' });
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
    onSuccess(response) {
      setCreatedProduction(response.data);
      invalidateKitchenProductionQueries(queryClient);
      showToast({ title: 'Production cancelled', variant: 'success' });
    },
  });

  function resetCreated() {
    setCreatedProduction(null);
  }

  function addLine() {
    setLines((current) => [...current, emptyProductionLine()]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    resetCreated();
  }

  function updateLine(index: number, patch: Partial<ProductionLineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        const next = { ...line, ...patch };

        if ('producedQty' in patch || 'wastageQty' in patch) {
          next.acceptedQty = acceptedFrom(next.producedQty, next.wastageQty);
        }

        return next;
      }),
    );
    resetCreated();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

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

    const payload: KitchenProductionInput = {
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
    };

    saveMutation.mutate(payload);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        subtitle="Create a draft production entry for READYMADE items mapped to a kitchen."
        title="Create Kitchen Production"
      />

      {createdProduction ? (
        <Panel className="flex flex-col gap-3 border-teal-200 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-900">
              Production {createdProduction.productionNumber} is{' '}
              {formatEnum(createdProduction.status)}
            </p>
            <p className="text-sm text-teal-800">
              Post production when accepted quantities are ready for kitchen stock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={createdProduction.status !== 'DRAFT' || postMutation.isPending}
              onClick={() => postMutation.mutate(createdProduction.id)}
              type="button"
            >
              {postMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CookingPot className="h-4 w-4" />
              )}
              Post Production
            </Button>
            <Button
              disabled={createdProduction.status !== 'DRAFT' || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(createdProduction.id)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => router.push('/kitchen/productions')}
              type="button"
              variant="outline"
            >
              View Productions
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">
              Production Header
            </h2>
            <p className="text-sm text-slate-500">Select location, kitchen, and business date.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              error={form.formState.errors.hospitalId?.message}
              label="Location"
              name="hospitalId"
            >
              <HospitalSelect
                disabled={isLocationSelectorLocked || isReadOnly}
                hospitals={hospitalsQuery.data ?? []}
                onChange={(value) => {
                  form.setValue('hospitalId', value, { shouldValidate: true });
                  form.setValue('kitchenId', '', { shouldValidate: true });
                  setLines([emptyProductionLine()]);
                  resetCreated();
                }}
                value={selectedHospitalId}
              />
            </Field>
            <Field
              error={form.formState.errors.kitchenId?.message}
              label="Kitchen"
              name="kitchenId"
            >
              <KitchenSelect
                disabled={!selectedHospitalId || isReadOnly}
                kitchens={kitchensQuery.data ?? []}
                onChange={(value) => {
                  form.setValue('kitchenId', value, { shouldValidate: true });
                  setLines([emptyProductionLine()]);
                  resetCreated();
                }}
                value={selectedKitchenId}
              />
            </Field>
            <Field
              error={form.formState.errors.productionDate?.message}
              label="Production Date"
              name="productionDate"
            >
              <Input
                disabled={isReadOnly}
                type="datetime-local"
                {...form.register('productionDate')}
              />
            </Field>
            <Field
              error={form.formState.errors.businessDate?.message}
              label="Business Date"
              name="businessDate"
            >
              <Input disabled={isReadOnly} type="date" {...form.register('businessDate')} />
            </Field>
            <Field label="Remarks" name="remarks">
              <Input disabled={isReadOnly} placeholder="Optional" {...form.register('remarks')} />
            </Field>
          </div>

          <div className="rounded-lg border bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">
                  Production Lines
                </h2>
                <p className="text-sm text-slate-500">
                  Choose mapped READYMADE items and enter produced/wastage quantities.
                </p>
              </div>
              <Button
                disabled={!selectedKitchenId || isReadOnly}
                onClick={addLine}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                Add Line
              </Button>
            </div>

            {!selectedKitchenId ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Select a location and kitchen before adding production lines.
              </div>
            ) : null}

            {selectedKitchenId && mappedItems.length === 0 && !itemsQuery.isLoading ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Map a READYMADE item to this kitchen before creating production.
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              {lines.map((line, index) => (
                <div
                  className="grid gap-3 rounded-lg border bg-white p-4 lg:grid-cols-[minmax(0,1.2fr)_120px_120px_120px_minmax(0,1fr)_auto]"
                  key={line.clientId}
                >
                  <Field label="Item" name={`production-line-${line.clientId}-item`}>
                    <Select
                      disabled={!selectedKitchenId || isReadOnly}
                      onChange={(event) => updateLine(index, { itemId: event.target.value })}
                      value={line.itemId}
                    >
                      <option value="">Select item</option>
                      {mappedItems.map((mapping) => (
                        <option key={mapping.id} value={mapping.itemId}>
                          {itemOptionLabel(mapping)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Produced Qty" name={`production-line-${line.clientId}-produced`}>
                    <Input
                      disabled={isReadOnly}
                      min="0"
                      onChange={(event) => updateLine(index, { producedQty: event.target.value })}
                      placeholder="0"
                      type="number"
                      value={line.producedQty}
                    />
                  </Field>
                  <Field label="Wastage Qty" name={`production-line-${line.clientId}-wastage`}>
                    <Input
                      disabled={isReadOnly}
                      min="0"
                      onChange={(event) => updateLine(index, { wastageQty: event.target.value })}
                      placeholder="0"
                      type="number"
                      value={line.wastageQty}
                    />
                  </Field>
                  <Field label="Accepted Qty" name={`production-line-${line.clientId}-accepted`}>
                    <Input readOnly type="number" value={line.acceptedQty} />
                  </Field>
                  <Field label="Remarks" name={`production-line-${line.clientId}-remarks`}>
                    <Input
                      disabled={isReadOnly}
                      onChange={(event) => updateLine(index, { remarks: event.target.value })}
                      placeholder="Optional"
                      value={line.remarks}
                    />
                  </Field>
                  <Button
                    className="self-end border-red-200 text-red-700 hover:bg-red-50"
                    disabled={lines.length === 1 || isReadOnly}
                    onClick={() => removeLine(index)}
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => router.push('/kitchen/productions')}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            <Button
              disabled={saveMutation.isPending || Boolean(createdProduction) || isReadOnly}
              type="submit"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
          </div>
        </form>
      </Panel>
    </section>
  );
}

export function KitchenStockPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [businessDateFilter, setBusinessDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | StockBalanceStatus>('');
  const [sortBy, setSortBy] = useState('lastUpdatedOn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const kitchensQuery = useKitchens(hospitalFilter);
  const itemOptionsQuery = useItems('READYMADE');

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setPage(1);
  }, [scopedHospitalId]);

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
    <section className="space-y-6">
      <PageHeader
        subtitle="Current READYMADE stock posted from kitchen production entries."
        title="Kitchen Stock"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_170px_170px_180px_150px_150px_160px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[20%] px-4 py-3">Kitchen</th>
                <th className="w-[22%] px-4 py-3">Item</th>
                <th className="w-[14%] px-4 py-3">Available Qty</th>
                <th className="w-[14%] px-4 py-3">Reserved Qty</th>
                <th className="w-[14%] px-4 py-3">Business Date</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[16%] px-4 py-3">Created / Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((stock) => (
                  <tr className="hover:bg-slate-50" key={stock.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{stock.location.name}</p>
                      <p className="text-xs text-slate-500">{stock.location.code}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{stock.item.itemName}</p>
                      <p className="text-xs text-slate-500">{stock.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{stock.reservedQty.toFixed(3)}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDateOnly(stock.businessDate)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(stock.status)}>
                        {formatEnum(stock.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <p>{formatDate(stock.createdAt)}</p>
                      <p className="text-xs text-slate-500">{formatDate(stock.updatedAt)}</p>
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
