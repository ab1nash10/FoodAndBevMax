'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  Grn,
  GrnInput,
  GrnStatus,
  Hospital,
  InventoryLocationType,
  Item,
  ItemType,
  Kitchen,
  Restaurant,
  SortOrder,
  StockBalance,
  StockBalanceStatus,
  StockLedger,
  StockReferenceType,
  StockTransactionType,
  Store,
  StoreStockBatchSummary,
  StoreStockSummary,
  StoreItem,
  Transfer,
  TransferAcknowledgementLineInput,
  TransferInput,
  TransferStatus,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateGrnQueries, invalidateTransferQueries } from '@/lib/query-invalidation';

const listLimit = 10;
const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
const grnStatuses: GrnStatus[] = [
  'DRAFT',
  'POSTED_TO_STOCK',
  'CANCELLED',
  'UNDER_VERIFICATION',
  'PARTIALLY_ACCEPTED',
  'ACCEPTED',
  'REJECTED',
];
const stockStatuses: StockBalanceStatus[] = ['AVAILABLE', 'NEAR_EXPIRY', 'EXPIRED', 'OUT_OF_STOCK'];
const stockItemTypes: ItemType[] = ['MRP', 'READYMADE', 'LIVE'];
const stockLedgerLocationTypes: InventoryLocationType[] = ['STORE', 'KITCHEN', 'RESTAURANT'];
const stockReferenceTypes: StockReferenceType[] = [
  'GRN',
  'KITCHEN_PRODUCTION',
  'TRANSFER',
  'TRANSFER_ACKNOWLEDGEMENT',
];
const stockTransactionTypes: StockTransactionType[] = [
  'GRN_IN',
  'KITCHEN_PRODUCTION_IN',
  'KITCHEN_TRANSFER_OUT',
  'RESTAURANT_TRANSFER_IN',
  'RESTAURANT_RECEIVE_IN',
  'STORE_TO_RESTAURANT_OUT',
  'TRANSFER_REJECTED_RETURN_IN',
];
const transferStatuses: TransferStatus[] = [
  'DRAFT',
  'PENDING_ACKNOWLEDGEMENT',
  'ACKNOWLEDGED',
  'CANCELLED',
];

const headerSchema = z.object({
  hospitalId: z.string().uuid('Select a hospital.'),
  invoiceNumber: z.string().trim(),
  poNumber: z.string().trim(),
  receivedBy: z.string().trim().min(1, 'Received by is required.').max(255),
  receivedDate: z.string().trim().min(1, 'Received date is required.'),
  remarks: z.string().trim(),
  storeId: z.string().uuid('Select a store.'),
  vendorName: z.string().trim(),
});

const grnBatchSchema = z
  .object({
    acceptedQty: z.coerce.number().min(0, 'Accepted quantity cannot be negative.'),
    batchNumber: z.string().trim().min(1, 'Batch number is required.').max(100),
    expiryDate: z.string().trim().min(1, 'Expiry date is required.'),
    manufacturingDate: z.string().trim(),
    receivedQty: z.coerce.number().min(0.001, 'Received quantity must be greater than zero.'),
    rejectionReason: z.string().trim(),
  })
  .superRefine((batch, context) => {
    if (batch.acceptedQty > batch.receivedQty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted quantity cannot exceed received quantity.',
        path: ['acceptedQty'],
      });
    }
  });

const grnLineSchema = z.object({
  batches: z.array(grnBatchSchema).min(1, 'Add at least one batch.'),
  itemId: z.string().uuid('Select an item.'),
  orderedQty: z.string().trim(),
  rejectionReason: z.string().trim(),
  remarks: z.string().trim(),
});

const grnLinesSchema = z.array(grnLineSchema).min(1, 'Add at least one GRN line.');

interface GrnHeaderFormValues {
  hospitalId: string;
  invoiceNumber: string;
  poNumber: string;
  receivedBy: string;
  receivedDate: string;
  remarks: string;
  storeId: string;
  vendorName: string;
}

interface BatchDraft {
  acceptedQty: string;
  batchNumber: string;
  clientId: string;
  expiryDate: string;
  manufacturingDate: string;
  receivedQty: string;
  rejectionReason: string;
}

interface LineDraft {
  batches: BatchDraft[];
  clientId: string;
  itemId: string;
  orderedQty: string;
  rejectionReason: string;
  remarks: string;
}

type ItemTypeFilter = '' | ItemType;

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function clientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function defaultReceivedDate(): string {
  const now = new Date();

  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  return now.toISOString().slice(0, 16);
}

function emptyBatch(): BatchDraft {
  return {
    acceptedQty: '',
    batchNumber: '',
    clientId: clientId('batch'),
    expiryDate: '',
    manufacturingDate: '',
    receivedQty: '',
    rejectionReason: '',
  };
}

function emptyLine(): LineDraft {
  return {
    batches: [emptyBatch()],
    clientId: clientId('line'),
    itemId: '',
    orderedQty: '',
    rejectionReason: '',
    remarks: '',
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

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

function toDateOnlyValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
}

function formatEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

interface QuantityDraft {
  acceptedQty: number | string;
  receivedQty: number | string;
}

function quantity(value: number | string): number {
  return Number(value || 0);
}

function rejectedQty(batch: QuantityDraft): number {
  return Math.max(quantity(batch.receivedQty) - quantity(batch.acceptedQty), 0);
}

function lineTotals(line: { batches: QuantityDraft[] }) {
  return line.batches.reduce(
    (totals, batch) => ({
      accepted: totals.accepted + quantity(batch.acceptedQty),
      received: totals.received + quantity(batch.receivedQty),
      rejected: totals.rejected + rejectedQty(batch),
    }),
    { accepted: 0, received: 0, rejected: 0 },
  );
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

function statusVariant(status: string): 'danger' | 'neutral' | 'success' {
  if (status === 'POSTED_TO_STOCK' || status === 'AVAILABLE' || status === 'ACKNOWLEDGED') {
    return 'success';
  }

  if (
    status === 'CANCELLED' ||
    status === 'EXPIRED' ||
    status === 'OUT_OF_STOCK' ||
    status === 'REJECTED_FULL'
  ) {
    return 'danger';
  }

  return 'neutral';
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
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
          <PackageCheck className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-normal text-brand-teal">
            Store Inventory
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
        Showing page {page} of {Math.max(totalPages, 1)} · {total} records · {limit} per page
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
    queryKey: ['inventory-hospitals'],
  });
}

function useStores(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listStores({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'storeName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['inventory-stores', hospitalId],
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
    queryKey: ['inventory-items', itemType ?? 'all'],
  });
}

function useMappedStoreItems(storeId?: string) {
  return useQuery({
    enabled: Boolean(storeId),
    queryFn: async () => {
      const response = await organizationApi.listStoreItems({
        isActive: true,
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'asc',
        storeId,
      });

      return response.data.items;
    },
    queryKey: ['inventory-store-items', storeId],
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

function StoreSelect({
  disabled,
  onChange,
  stores,
  value,
}: Readonly<{
  disabled?: boolean;
  onChange: (value: string) => void;
  stores: Store[];
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select store</option>
      {stores.map((store) => (
        <option key={store.id} value={store.id}>
          {store.storeName}
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

export function GrnsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | GrnStatus>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setPage(1);
  }, [scopedHospitalId]);

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
    queryKey: ['grns', page, search, hospitalFilter, storeFilter, statusFilter, sortOrder],
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => organizationApi.postGrnToStock(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not posted',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateGrnQueries(queryClient);
      showToast({
        description: response.data.grnNumber,
        title: 'GRN posted to stock',
        variant: 'success',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => organizationApi.cancelGrn(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not cancelled',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN cancelled', variant: 'success' });
    },
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

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button onClick={() => router.push('/inventory/grns/new')} type="button">
            <Plus className="h-4 w-4" />
            New GRN
          </Button>
        }
        subtitle="Receive mapped MRP items into store stock through manual GRN entry."
        title="GRNs"
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[14%] px-4 py-3">GRN Number</th>
                <th className="w-[16%] px-4 py-3">Store</th>
                <th className="w-[16%] px-4 py-3">Vendor / PO</th>
                <th className="w-[16%] px-4 py-3">Received Date</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[12%] px-4 py-3">Lines</th>
                <th className="w-[24%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {grns.length > 0 ? (
                grns.map((grn) => (
                  <tr className="hover:bg-slate-50" key={grn.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{grn.grnNumber}</p>
                      <p className="text-xs text-slate-500">{grn.hospital.hospitalName}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{grn.store.storeName}</p>
                      <p className="text-xs text-slate-500">{grn.store.storeCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      <p>{grn.vendorName || '-'}</p>
                      <p className="text-xs text-slate-500">{grn.poNumber || 'No PO'}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(grn.receivedDate)}</td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(grn.status)}>{formatEnum(grn.status)}</Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{grn.lines.length}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={
                            grn.status !== 'DRAFT' ||
                            postMutation.isPending ||
                            cancelMutation.isPending
                          }
                          onClick={() => postMutation.mutate(grn.id)}
                          size="sm"
                          type="button"
                        >
                          Post
                        </Button>
                        <Button
                          disabled={grn.status !== 'DRAFT' || cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(grn.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={grn.status !== 'DRAFT' || deleteMutation.isPending}
                          onClick={() => deleteGrn(grn)}
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

export function CreateGrnPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [formError, setFormError] = useState('');
  const [createdGrn, setCreatedGrn] = useState<Grn | null>(null);
  const form = useForm<GrnHeaderFormValues>({
    defaultValues: {
      hospitalId: scopedHospitalId ?? '',
      invoiceNumber: '',
      poNumber: '',
      receivedBy: 'Super Admin',
      receivedDate: defaultReceivedDate(),
      remarks: '',
      storeId: '',
      vendorName: '',
    },
  });
  const selectedHospitalId = form.watch('hospitalId');
  const selectedStoreId = form.watch('storeId');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(selectedHospitalId);
  const mappedItemsQuery = useMappedStoreItems(selectedStoreId);
  const isReadOnly = createdGrn?.status === 'POSTED_TO_STOCK' || createdGrn?.status === 'CANCELLED';

  const itemOptions = mappedItemsQuery.data ?? [];
  const itemNameMap = useMemo(
    () => new Map(itemOptions.map((mapping) => [mapping.itemId, mapping.item.itemName] as const)),
    [itemOptions],
  );

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('storeId', '', { shouldValidate: true });
      setCreatedGrn(null);
    }
  }, [form, scopedHospitalId]);

  const saveMutation = useMutation({
    mutationFn: (body: GrnInput) => organizationApi.createGrn(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedGrn(response.data);
      invalidateGrnQueries(queryClient);
      showToast({
        description: response.data.grnNumber,
        title: 'Draft GRN saved',
        variant: 'success',
      });
    },
  });

  const postMutation = useMutation({
    mutationFn: (id: string) => organizationApi.postGrnToStock(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not posted',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedGrn(response.data);
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN posted to stock', variant: 'success' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => organizationApi.cancelGrn(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not cancelled',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedGrn(response.data);
      invalidateGrnQueries(queryClient);
      showToast({ title: 'GRN cancelled', variant: 'success' });
    },
  });

  function updateLine(lineIndex: number, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line, index) => (index === lineIndex ? { ...line, ...patch } : line)),
    );
  }

  function updateBatch(lineIndex: number, batchIndex: number, patch: Partial<BatchDraft>) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? {
              ...line,
              batches: line.batches.map((batch, currentBatchIndex) =>
                currentBatchIndex === batchIndex ? { ...batch, ...patch } : batch,
              ),
            }
          : line,
      ),
    );
  }

  function addBatch(lineIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex ? { ...line, batches: [...line.batches, emptyBatch()] } : line,
      ),
    );
  }

  function removeBatch(lineIndex: number, batchIndex: number) {
    setLines((current) =>
      current.map((line, index) =>
        index === lineIndex && line.batches.length > 1
          ? {
              ...line,
              batches: line.batches.filter(
                (_, currentBatchIndex) => currentBatchIndex !== batchIndex,
              ),
            }
          : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(lineIndex: number) {
    setLines((current) =>
      current.length > 1 ? current.filter((_, index) => index !== lineIndex) : current,
    );
  }

  const handleSubmit = form.handleSubmit((values) => {
    setFormError('');
    const header = headerSchema.safeParse(values);
    const parsedLines = grnLinesSchema.safeParse(lines);

    if (!header.success) {
      const firstIssue = header.error.issues[0];
      setFormError(firstIssue?.message ?? 'Check GRN header details.');
      return;
    }

    if (!parsedLines.success) {
      const firstIssue = parsedLines.error.issues[0];
      setFormError(firstIssue?.message ?? 'Check GRN line details.');
      return;
    }

    const items = parsedLines.data.map((line) => {
      const totals = lineTotals(line);

      return {
        acceptedQty: Number(totals.accepted.toFixed(3)),
        batches: line.batches.map((batch) => ({
          acceptedQty: Number(quantity(batch.acceptedQty).toFixed(3)),
          batchNumber: batch.batchNumber.trim(),
          expiryDate: batch.expiryDate,
          manufacturingDate: optionalValue(batch.manufacturingDate),
          receivedQty: Number(quantity(batch.receivedQty).toFixed(3)),
          rejectedQty: Number(rejectedQty(batch).toFixed(3)),
          rejectionReason: optionalValue(batch.rejectionReason),
        })),
        itemId: line.itemId,
        orderedQty: line.orderedQty ? Number(quantity(line.orderedQty).toFixed(3)) : undefined,
        receivedQty: Number(totals.received.toFixed(3)),
        rejectedQty: Number(totals.rejected.toFixed(3)),
        rejectionReason: optionalValue(line.rejectionReason),
        remarks: optionalValue(line.remarks),
      };
    });

    saveMutation.mutate({
      hospitalId: header.data.hospitalId,
      invoiceNumber: optionalValue(header.data.invoiceNumber),
      items,
      poNumber: optionalValue(header.data.poNumber),
      receivedBy: header.data.receivedBy,
      receivedDate: new Date(header.data.receivedDate).toISOString(),
      remarks: optionalValue(header.data.remarks),
      storeId: header.data.storeId,
      vendorName: optionalValue(header.data.vendorName),
    });
  });

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button onClick={() => router.push('/inventory/grns')} type="button" variant="outline">
            Back to GRNs
          </Button>
        }
        subtitle="Create a manual goods receipt note for mapped MRP items."
        title="Create GRN"
      />

      {createdGrn ? (
        <Panel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-sm font-semibold text-slate-500">Generated GRN</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xl font-semibold text-slate-950">{createdGrn.grnNumber}</p>
              <Badge variant={statusVariant(createdGrn.status)}>
                {formatEnum(createdGrn.status)}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              disabled={createdGrn.status !== 'DRAFT' || postMutation.isPending}
              onClick={() => postMutation.mutate(createdGrn.id)}
              type="button"
            >
              {postMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post to Stock
            </Button>
            <Button
              disabled={createdGrn.status !== 'DRAFT' || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(createdGrn.id)}
              type="button"
              variant="outline"
            >
              Cancel
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
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">GRN Header</h2>
            <p className="text-sm text-slate-500">
              Select the location and store before adding item batches.
            </p>
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
                  form.setValue('storeId', '', { shouldValidate: true });
                  setCreatedGrn(null);
                }}
                value={selectedHospitalId}
              />
            </Field>
            <Field error={form.formState.errors.storeId?.message} label="Store" name="storeId">
              <StoreSelect
                disabled={!selectedHospitalId || isReadOnly}
                onChange={(value) => {
                  form.setValue('storeId', value, { shouldValidate: true });
                  setCreatedGrn(null);
                }}
                stores={storesQuery.data ?? []}
                value={selectedStoreId}
              />
            </Field>
            <Field
              error={form.formState.errors.receivedDate?.message}
              label="Received Date"
              name="receivedDate"
            >
              <Input
                disabled={isReadOnly}
                type="datetime-local"
                {...form.register('receivedDate')}
              />
            </Field>
            <Field
              error={form.formState.errors.receivedBy?.message}
              label="Received By"
              name="receivedBy"
            >
              <Input disabled={isReadOnly} {...form.register('receivedBy')} />
            </Field>
            <Field label="Vendor Name" name="vendorName">
              <Input
                disabled={isReadOnly}
                placeholder="Optional"
                {...form.register('vendorName')}
              />
            </Field>
            <Field label="PO Number" name="poNumber">
              <Input disabled={isReadOnly} placeholder="Optional" {...form.register('poNumber')} />
            </Field>
            <Field label="Invoice Number" name="invoiceNumber">
              <Input
                disabled={isReadOnly}
                placeholder="Optional"
                {...form.register('invoiceNumber')}
              />
            </Field>
            <Field label="Remarks" name="remarks">
              <Input disabled={isReadOnly} placeholder="Optional" {...form.register('remarks')} />
            </Field>
          </div>

          <div className="rounded-lg border bg-slate-50/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">GRN Lines</h2>
                <p className="text-sm text-slate-500">
                  Only MRP items mapped to the selected store are available.
                </p>
              </div>
              <Button
                disabled={!selectedStoreId || isReadOnly}
                onClick={addLine}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                Add Line
              </Button>
            </div>

            {!selectedStoreId ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Select a location and store before adding GRN lines.
              </div>
            ) : null}

            {selectedStoreId && itemOptions.length === 0 && !mappedItemsQuery.isLoading ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Map MRP items to this store before creating a GRN.
              </div>
            ) : null}

            <div className="mt-5 space-y-5">
              {lines.map((line, lineIndex) => {
                const totals = lineTotals(line);

                return (
                  <div className="rounded-lg border bg-white p-4" key={line.clientId}>
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_140px_140px_auto]">
                      <Field label="Item" name={`line-${line.clientId}-item`}>
                        <Select
                          disabled={!selectedStoreId || isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { itemId: event.target.value })
                          }
                          value={line.itemId}
                        >
                          <option value="">Select mapped item</option>
                          {itemOptions.map((mapping: StoreItem) => (
                            <option key={mapping.id} value={mapping.itemId}>
                              {mapping.item.itemName} ({mapping.item.itemCode})
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Ordered Qty" name={`line-${line.clientId}-ordered`}>
                        <Input
                          disabled={isReadOnly}
                          min="0"
                          onChange={(event) =>
                            updateLine(lineIndex, { orderedQty: event.target.value })
                          }
                          type="number"
                          value={line.orderedQty}
                        />
                      </Field>
                      <div className="rounded-md border bg-slate-50 p-3 text-sm">
                        <p className="text-slate-500">Received</p>
                        <p className="font-semibold text-slate-950">{totals.received.toFixed(3)}</p>
                      </div>
                      <div className="rounded-md border bg-slate-50 p-3 text-sm">
                        <p className="text-slate-500">Accepted</p>
                        <p className="font-semibold text-slate-950">{totals.accepted.toFixed(3)}</p>
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={lines.length === 1 || isReadOnly}
                          onClick={() => removeLine(lineIndex)}
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Rejection Reason" name={`line-${line.clientId}-reason`}>
                        <Input
                          disabled={isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { rejectionReason: event.target.value })
                          }
                          placeholder="Optional"
                          value={line.rejectionReason}
                        />
                      </Field>
                      <Field label="Remarks" name={`line-${line.clientId}-remarks`}>
                        <Input
                          disabled={isReadOnly}
                          onChange={(event) =>
                            updateLine(lineIndex, { remarks: event.target.value })
                          }
                          placeholder="Optional"
                          value={line.remarks}
                        />
                      </Field>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700">
                          Batches for {itemNameMap.get(line.itemId) ?? 'selected item'}
                        </p>
                        <Button
                          disabled={isReadOnly}
                          onClick={() => addBatch(lineIndex)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Plus className="h-4 w-4" />
                          Add Batch
                        </Button>
                      </div>
                      {line.batches.map((batch, batchIndex) => (
                        <div
                          className="grid gap-3 rounded-md border bg-slate-50 p-3 lg:grid-cols-[1fr_150px_150px_130px_130px_130px_1fr_auto]"
                          key={batch.clientId}
                        >
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                batchNumber: event.target.value,
                              })
                            }
                            placeholder="Batch number"
                            value={batch.batchNumber}
                          />
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                manufacturingDate: event.target.value,
                              })
                            }
                            type="date"
                            value={batch.manufacturingDate}
                          />
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, { expiryDate: event.target.value })
                            }
                            type="date"
                            value={batch.expiryDate}
                          />
                          <Input
                            disabled={isReadOnly}
                            min="0"
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                receivedQty: event.target.value,
                              })
                            }
                            placeholder="Received"
                            type="number"
                            value={batch.receivedQty}
                          />
                          <Input
                            disabled={isReadOnly}
                            min="0"
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                acceptedQty: event.target.value,
                              })
                            }
                            placeholder="Accepted"
                            type="number"
                            value={batch.acceptedQty}
                          />
                          <div className="rounded-md border bg-white px-3 py-2 text-sm">
                            <p className="text-xs text-slate-500">Rejected</p>
                            <p className="font-semibold text-slate-950">
                              {rejectedQty(batch).toFixed(3)}
                            </p>
                          </div>
                          <Input
                            disabled={isReadOnly}
                            onChange={(event) =>
                              updateBatch(lineIndex, batchIndex, {
                                rejectionReason: event.target.value,
                              })
                            }
                            placeholder="Reason"
                            value={batch.rejectionReason}
                          />
                          <Button
                            className="border-red-200 text-red-700 hover:bg-red-50"
                            disabled={line.batches.length === 1 || isReadOnly}
                            onClick={() => removeBatch(lineIndex, batchIndex)}
                            type="button"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => router.push('/inventory/grns')} type="button" variant="outline">
              Close
            </Button>
            <Button
              disabled={saveMutation.isPending || Boolean(createdGrn) || isReadOnly}
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

export function StoreStockPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | StockBalanceStatus>('');
  const [sortBy, setSortBy] = useState('lastUpdatedOn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const itemOptionsQuery = useItems(itemTypeFilter || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setPage(1);
  }, [scopedHospitalId]);

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
    queryKey: [
      'stock-balances',
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
    ],
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
    <section className="space-y-6">
      <PageHeader
        subtitle="Current store stock summarized by store and item, with batch details on expand."
        title="Store Stock"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_170px_170px_160px_180px_150px_160px_150px_130px_auto]">
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[6%] px-4 py-3">View</th>
                <th className="w-[18%] px-4 py-3">Store</th>
                <th className="w-[20%] px-4 py-3">Item</th>
                <th className="w-[14%] px-4 py-3">Category</th>
                <th className="w-[12%] px-4 py-3">Total Available</th>
                <th className="w-[12%] px-4 py-3">Reserved Qty</th>
                <th className="w-[10%] px-4 py-3">Batches</th>
                <th className="w-[14%] px-4 py-3">Nearest Expiry</th>
                <th className="w-[12%] px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((summary: StoreStockSummary) => {
                  const rowKey = `${summary.storeId}:${summary.itemId}`;
                  const isExpanded = expandedRows.includes(rowKey);

                  return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-4 py-4">
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
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-950">{summary.storeName}</p>
                          <p className="text-xs text-slate-500">{summary.storeCode ?? '-'}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-950">{summary.itemName}</p>
                          <p className="text-xs text-slate-500">{summary.itemCode}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{summary.categoryName ?? '-'}</td>
                        <td className="px-4 py-4">
                          <p className="text-lg font-semibold text-slate-950">
                            {formatQuantity(summary.totalAvailableQty)}
                          </p>
                          <p className="text-xs text-slate-500">{formatEnum(summary.itemType)}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {formatQuantity(summary.totalReservedQty)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                            {summary.batchCount}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {formatDateOnly(summary.nearestExpiryDate)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={statusVariant(summary.status)}>
                            {formatEnum(summary.status)}
                          </Badge>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${rowKey}:batches`} className="bg-slate-50/70">
                          <td className="px-4 py-4" colSpan={9}>
                            <div className="rounded-lg border bg-white p-3 shadow-sm">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">
                                    Batch-wise stock
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Internal stock remains batch-wise for GRN and transfers.
                                  </p>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                  <thead className="text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2">Batch Number</th>
                                      <th className="px-3 py-2">Expiry Date</th>
                                      <th className="px-3 py-2">Available Qty</th>
                                      <th className="px-3 py-2">Reserved Qty</th>
                                      <th className="px-3 py-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {summary.batches.map((batch: StoreStockBatchSummary) => (
                                      <tr key={batch.stockBalanceId}>
                                        <td className="px-3 py-3 font-medium text-slate-950">
                                          {batch.batchNumber ?? '-'}
                                        </td>
                                        <td className="px-3 py-3 text-slate-600">
                                          {formatDateOnly(batch.expiryDate)}
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-slate-950">
                                          {formatQuantity(batch.availableQty)}
                                        </td>
                                        <td className="px-3 py-3 text-slate-600">
                                          {formatQuantity(batch.reservedQty)}
                                        </td>
                                        <td className="px-3 py-3">
                                          <Badge variant={statusVariant(batch.status)}>
                                            {formatEnum(batch.status)}
                                          </Badge>
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

interface TransferHeaderFormValues {
  businessDate: string;
  hospitalId: string;
  remarks: string;
  restaurantId: string;
  sourceId: string;
  sourceType: InventoryLocationType;
  transferDate: string;
}

interface TransferLineDraft {
  clientId: string;
  itemId: string;
  remarks: string;
  sentQty: string;
  stockBalanceId: string;
}

interface AcknowledgementLineDraft {
  acceptedQty: string;
  rejectedQty: string;
  rejectionReason: string;
  remarks: string;
  transferLineId: string;
}

const transferHeaderSchema = z.object({
  businessDate: z.string().trim(),
  hospitalId: z.string().uuid('Select a hospital.'),
  remarks: z.string().trim(),
  restaurantId: z.string().uuid('Select a restaurant.'),
  sourceId: z.string().uuid('Select a source.'),
  sourceType: z.enum(['STORE', 'KITCHEN']),
  transferDate: z.string().trim().min(1, 'Transfer date is required.'),
});

const transferLinesSchema = z
  .array(
    z.object({
      remarks: z.string().trim(),
      sentQty: z.coerce.number().min(0.001, 'Transfer quantity must be greater than zero.'),
      stockBalanceId: z.string().uuid('Select source stock.'),
    }),
  )
  .min(1, 'Add at least one transfer line.');

function emptyTransferLine(): TransferLineDraft {
  return {
    clientId: clientId('transfer-line'),
    itemId: '',
    remarks: '',
    sentQty: '',
    stockBalanceId: '',
  };
}

function defaultTransferDate(): string {
  return defaultReceivedDate();
}

function useRestaurants(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['inventory-restaurants', hospitalId],
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
    queryKey: ['inventory-kitchens', hospitalId],
  });
}

function useAllStores() {
  return useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStores({
        isActive: true,
        limit: 100,
        sortBy: 'storeName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['inventory-all-stores'],
  });
}

function useAllKitchens() {
  return useQuery({
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['inventory-all-kitchens'],
  });
}

function useAllRestaurants() {
  return useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['inventory-all-restaurants'],
  });
}

function useStoreStock(storeId?: string) {
  return useQuery({
    enabled: Boolean(storeId),
    queryFn: async () => {
      const response = await organizationApi.listStockBalances({
        itemType: 'MRP',
        limit: 100,
        locationId: storeId,
        locationType: 'STORE',
        sortBy: 'expiryDate',
        sortOrder: 'asc',
      });

      return response.data.items.filter((stock) => stock.availableQty > 0);
    },
    queryKey: ['transfer-store-stock', storeId],
  });
}

function useKitchenStock(kitchenId?: string, businessDate?: string) {
  return useQuery({
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const businessDateFilter = optionalValue(businessDate ?? '');
      const response = await organizationApi.listKitchenStock({
        ...(businessDateFilter ? { businessDate: businessDateFilter } : {}),
        itemType: 'READYMADE',
        limit: 100,
        locationId: kitchenId,
        sortBy: 'lastUpdatedOn',
        sortOrder: 'desc',
      });

      return response.data.items.filter((stock) => stock.availableQty > 0);
    },
    queryKey: ['transfer-kitchen-stock', kitchenId, optionalValue(businessDate ?? '')],
  });
}

function useSourceStock(
  sourceType: InventoryLocationType,
  sourceId?: string,
  businessDate?: string,
) {
  const storeStock = useStoreStock(sourceType === 'STORE' ? sourceId : undefined);
  const kitchenStock = useKitchenStock(
    sourceType === 'KITCHEN' ? sourceId : undefined,
    businessDate,
  );

  return sourceType === 'KITCHEN' ? kitchenStock : storeStock;
}

function RestaurantSelect({
  disabled,
  onChange,
  restaurants,
  value,
}: Readonly<{
  disabled?: boolean;
  onChange: (value: string) => void;
  restaurants: Restaurant[];
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select restaurant</option>
      {restaurants.map((restaurant) => (
        <option key={restaurant.id} value={restaurant.id}>
          {restaurant.restaurantName}
        </option>
      ))}
    </Select>
  );
}

function stockOptionLabel(stock: StockBalance): string {
  const sourceDate =
    stock.itemType === 'READYMADE'
      ? `Business ${formatDateOnly(stock.businessDate)}`
      : `${stock.batchNumber ?? 'No batch'} - ${formatDateOnly(stock.expiryDate)}`;

  return `${stock.item.itemName} (${stock.item.itemCode}) - ${sourceDate} - ${stock.availableQty.toFixed(3)} available`;
}

interface TransferItemGroup {
  batchCount: number;
  businessDate: string | null;
  itemCode: string;
  itemId: string;
  itemName: string;
  key: string;
  nearestExpiryDate: string | null;
  status: StockBalanceStatus;
  stocks: StockBalance[];
  totalAvailableQty: number;
}

interface AllocationPreviewLine {
  allocatedQty: number;
  stock: StockBalance;
}

interface PreparedTransferLine {
  remarks?: string;
  sentQty: number;
  stock: StockBalance;
}

function compareStockForAllocation(
  left: StockBalance,
  right: StockBalance,
  sourceType: InventoryLocationType,
): number {
  const leftDate = sourceType === 'KITCHEN' ? left.businessDate : left.expiryDate;
  const rightDate = sourceType === 'KITCHEN' ? right.businessDate : right.expiryDate;

  if (!leftDate && !rightDate) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }

  if (!leftDate) {
    return 1;
  }

  if (!rightDate) {
    return -1;
  }

  const dateCompare = new Date(leftDate).getTime() - new Date(rightDate).getTime();

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function getTransferGroupKey(stock: StockBalance, sourceType: InventoryLocationType): string {
  if (sourceType === 'KITCHEN') {
    return `${stock.itemId}:${toDateOnlyValue(stock.businessDate)}`;
  }

  return stock.itemId;
}

function getStockSummaryStatus(stocks: StockBalance[]): StockBalanceStatus {
  const totalAvailableQty = stocks.reduce((total, stock) => total + stock.availableQty, 0);
  const availableStocks = stocks.filter((stock) => stock.availableQty > 0);

  if (totalAvailableQty <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (availableStocks.length > 0 && availableStocks.every((stock) => stock.status === 'EXPIRED')) {
    return 'EXPIRED';
  }

  if (availableStocks.some((stock) => stock.status === 'NEAR_EXPIRY')) {
    return 'NEAR_EXPIRY';
  }

  return 'AVAILABLE';
}

function buildTransferItemGroups(
  stocks: StockBalance[],
  sourceType: InventoryLocationType,
): TransferItemGroup[] {
  const groups = new Map<string, StockBalance[]>();

  stocks.forEach((stock) => {
    const key = getTransferGroupKey(stock, sourceType);
    groups.set(key, [...(groups.get(key) ?? []), stock]);
  });

  return Array.from(groups.entries())
    .map(([key, groupStocks]) => {
      const sortedStocks = [...groupStocks].sort((left, right) =>
        compareStockForAllocation(left, right, sourceType),
      );
      const firstStock = sortedStocks[0];
      const nearestExpiryDate =
        sourceType === 'KITCHEN'
          ? toDateOnlyValue(firstStock?.businessDate)
          : toDateOnlyValue(firstStock?.expiryDate);

      return {
        batchCount: sortedStocks.length,
        businessDate: sourceType === 'KITCHEN' ? toDateOnlyValue(firstStock?.businessDate) : null,
        itemCode: firstStock?.item.itemCode ?? '',
        itemId: firstStock?.itemId ?? '',
        itemName: firstStock?.item.itemName ?? '',
        key,
        nearestExpiryDate: nearestExpiryDate || null,
        status: getStockSummaryStatus(sortedStocks),
        stocks: sortedStocks,
        totalAvailableQty: Number(
          sortedStocks.reduce((total, stock) => total + stock.availableQty, 0).toFixed(3),
        ),
      };
    })
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
}

function allocateFefo(
  stocks: StockBalance[],
  requestedQty: number,
  sourceType: InventoryLocationType,
  remainingByStockId?: Map<string, number>,
): AllocationPreviewLine[] {
  let remainingQty = requestedQty;
  const allocations: AllocationPreviewLine[] = [];

  for (const stock of [...stocks].sort((left, right) =>
    compareStockForAllocation(left, right, sourceType),
  )) {
    if (remainingQty <= 0) {
      break;
    }

    const availableQty = remainingByStockId?.get(stock.id) ?? stock.availableQty;

    if (availableQty <= 0) {
      continue;
    }

    const allocatedQty = Math.min(availableQty, remainingQty);

    allocations.push({
      allocatedQty: Number(allocatedQty.toFixed(3)),
      stock,
    });
    remainingQty = Number((remainingQty - allocatedQty).toFixed(3));

    if (remainingByStockId) {
      remainingByStockId.set(stock.id, Number((availableQty - allocatedQty).toFixed(3)));
    }
  }

  return allocations;
}

export function TransfersPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'' | InventoryLocationType>('');
  const [storeFilter, setStoreFilter] = useState('');
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | TransferStatus>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [partialTransfer, setPartialTransfer] = useState<Transfer | null>(null);
  const [partialRemarks, setPartialRemarks] = useState('');
  const [partialLines, setPartialLines] = useState<AcknowledgementLineDraft[]>([]);
  const [partialError, setPartialError] = useState('');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const kitchensQuery = useKitchens(hospitalFilter);
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const allStoresQuery = useAllStores();
  const allKitchensQuery = useAllKitchens();
  const allRestaurantsQuery = useAllRestaurants();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setSourceTypeFilter('');
    setStoreFilter('');
    setKitchenFilter('');
    setRestaurantFilter('');
    setPage(1);
  }, [scopedHospitalId]);

  const storeMap = useMemo(
    () => new Map((allStoresQuery.data ?? []).map((store) => [store.id, store])),
    [allStoresQuery.data],
  );
  const restaurantMap = useMemo(
    () =>
      new Map((allRestaurantsQuery.data ?? []).map((restaurant) => [restaurant.id, restaurant])),
    [allRestaurantsQuery.data],
  );
  const kitchenMap = useMemo(
    () => new Map((allKitchensQuery.data ?? []).map((kitchen) => [kitchen.id, kitchen])),
    [allKitchensQuery.data],
  );

  const transfersQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listTransfers({
        destinationId: restaurantFilter,
        destinationType: 'RESTAURANT',
        hospitalId: hospitalFilter,
        limit: listLimit,
        page,
        search,
        sortBy: 'createdAt',
        sortOrder,
        sourceId:
          sourceTypeFilter === 'STORE'
            ? storeFilter
            : sourceTypeFilter === 'KITCHEN'
              ? kitchenFilter
              : undefined,
        sourceType: sourceTypeFilter || undefined,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: [
      'transfers',
      page,
      search,
      hospitalFilter,
      sourceTypeFilter,
      storeFilter,
      kitchenFilter,
      restaurantFilter,
      statusFilter,
      sortOrder,
    ],
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (body: {
      items: TransferAcknowledgementLineInput[];
      remarks?: string;
      transferId: string;
    }) => organizationApi.createTransferAcknowledgement(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not acknowledged',
        variant: 'error',
      });
    },
    onSuccess() {
      setPartialTransfer(null);
      setPartialRemarks('');
      setPartialLines([]);
      invalidateTransferQueries(queryClient);
      showToast({ title: 'Transfer acknowledged', variant: 'success' });
    },
  });

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

  const transfers = transfersQuery.data?.items ?? [];
  const meta = transfersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  function acknowledgementItems(
    transfer: Transfer,
    mode: 'ACCEPT_FULL' | 'REJECT_FULL',
  ): TransferAcknowledgementLineInput[] {
    return transfer.lines.map((line) => ({
      acceptedQty: mode === 'ACCEPT_FULL' ? line.sentQty : 0,
      batchNumber: line.batchNumber ?? undefined,
      expiryDate: line.expiryDate ?? undefined,
      itemId: line.itemId,
      rejectedQty: mode === 'REJECT_FULL' ? line.sentQty : 0,
      rejectionReason: mode === 'REJECT_FULL' ? 'Rejected at restaurant' : undefined,
      sentQty: line.sentQty,
      transferLineId: line.id,
    }));
  }

  function startPartial(transfer: Transfer) {
    setPartialTransfer(transfer);
    setPartialRemarks('');
    setPartialError('');
    setPartialLines(
      transfer.lines.map((line) => ({
        acceptedQty: String(line.sentQty),
        rejectedQty: '0',
        rejectionReason: '',
        remarks: '',
        transferLineId: line.id,
      })),
    );
  }

  function updatePartialLine(index: number, patch: Partial<AcknowledgementLineDraft>) {
    setPartialLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function submitPartial() {
    if (!partialTransfer) {
      return;
    }

    const transferLineMap = new Map(partialTransfer.lines.map((line) => [line.id, line]));
    const items: TransferAcknowledgementLineInput[] = [];

    for (const line of partialLines) {
      const transferLine = transferLineMap.get(line.transferLineId);
      const acceptedQty = Number(line.acceptedQty || 0);
      const rejectedQty = Number(line.rejectedQty || 0);

      if (!transferLine) {
        setPartialError('Unable to find transfer line.');
        return;
      }

      if (Math.abs(acceptedQty + rejectedQty - transferLine.sentQty) >= 0.0005) {
        setPartialError('Accepted plus rejected quantity must equal sent quantity.');
        return;
      }

      if (rejectedQty > 0 && !line.rejectionReason.trim()) {
        setPartialError('Rejection reason is required for rejected quantity.');
        return;
      }

      items.push({
        acceptedQty,
        batchNumber: transferLine.batchNumber ?? undefined,
        expiryDate: transferLine.expiryDate ?? undefined,
        itemId: transferLine.itemId,
        rejectedQty,
        rejectionReason: optionalValue(line.rejectionReason),
        remarks: optionalValue(line.remarks),
        sentQty: transferLine.sentQty,
        transferLineId: transferLine.id,
      });
    }

    acknowledgeMutation.mutate({
      items,
      remarks: optionalValue(partialRemarks),
      transferId: partialTransfer.id,
    });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button onClick={() => router.push('/inventory/transfers/new')} type="button">
            <Plus className="h-4 w-4" />
            New Transfer
          </Button>
        }
        subtitle="Move Store MRP stock or Kitchen READYMADE stock to restaurants with acknowledgement."
        title="Transfers"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(0,1fr)_160px_140px_170px_170px_170px_120px_auto]">
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
              setSourceTypeFilter('');
              setStoreFilter('');
              setKitchenFilter('');
              setRestaurantFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            disabled={!hospitalFilter}
            onChange={(event) => {
              setSourceTypeFilter(event.target.value as '' | InventoryLocationType);
              setStoreFilter('');
              setKitchenFilter('');
              setPage(1);
            }}
            value={sourceTypeFilter}
          >
            <option value="">All sources</option>
            <option value="STORE">Store</option>
            <option value="KITCHEN">Kitchen</option>
          </Select>
          {sourceTypeFilter === 'KITCHEN' ? (
            <KitchenSelect
              disabled={!hospitalFilter}
              kitchens={kitchensQuery.data ?? []}
              onChange={(value) => {
                setKitchenFilter(value);
                setPage(1);
              }}
              value={kitchenFilter}
            />
          ) : (
            <StoreSelect
              disabled={!hospitalFilter || sourceTypeFilter === ''}
              onChange={(value) => {
                setStoreFilter(value);
                setPage(1);
              }}
              stores={storesQuery.data ?? []}
              value={storeFilter}
            />
          )}
          <RestaurantSelect
            disabled={!hospitalFilter}
            onChange={(value) => {
              setRestaurantFilter(value);
              setPage(1);
            }}
            restaurants={restaurantsQuery.data ?? []}
            value={restaurantFilter}
          />
          <Select
            onChange={(event) => {
              setStatusFilter(event.target.value as '' | TransferStatus);
              setPage(1);
            }}
            value={statusFilter}
          >
            <option value="">All statuses</option>
            {transferStatuses.map((status) => (
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
          <Button onClick={() => void transfersQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[13%] px-4 py-3">Transfer</th>
                <th className="w-[15%] px-4 py-3">Source</th>
                <th className="w-[15%] px-4 py-3">Restaurant</th>
                <th className="w-[14%] px-4 py-3">Transfer Date</th>
                <th className="w-[12%] px-4 py-3">Status</th>
                <th className="w-[9%] px-4 py-3">Lines</th>
                <th className="w-[22%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {transfers.length > 0 ? (
                transfers.map((transfer) => (
                  <tr className="hover:bg-slate-50" key={transfer.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-slate-950">{transfer.transferNumber}</p>
                      <p className="text-xs text-slate-500">{transfer.hospital.hospitalName}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {transfer.sourceType === 'KITCHEN'
                          ? (kitchenMap.get(transfer.sourceId)?.kitchenName ?? transfer.sourceId)
                          : (storeMap.get(transfer.sourceId)?.storeName ?? transfer.sourceId)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {transfer.sourceType === 'KITCHEN'
                          ? (kitchenMap.get(transfer.sourceId)?.kitchenCode ?? 'Kitchen')
                          : (storeMap.get(transfer.sourceId)?.storeCode ?? 'Store')}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {restaurantMap.get(transfer.destinationId)?.restaurantName ??
                          transfer.destinationId}
                      </p>
                      <p className="text-xs text-slate-500">
                        {restaurantMap.get(transfer.destinationId)?.restaurantCode ?? 'Restaurant'}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDate(transfer.transferDate)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(transfer.status)}>
                        {formatEnum(transfer.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{transfer.lines.length}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={transfer.status !== 'DRAFT' || dispatchMutation.isPending}
                          onClick={() => dispatchMutation.mutate(transfer.id)}
                          size="sm"
                          type="button"
                        >
                          Dispatch
                        </Button>
                        <Button
                          disabled={
                            transfer.status !== 'PENDING_ACKNOWLEDGEMENT' ||
                            acknowledgeMutation.isPending
                          }
                          onClick={() =>
                            acknowledgeMutation.mutate({
                              items: acknowledgementItems(transfer, 'ACCEPT_FULL'),
                              transferId: transfer.id,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Accept Full
                        </Button>
                        <Button
                          disabled={
                            transfer.status !== 'PENDING_ACKNOWLEDGEMENT' ||
                            acknowledgeMutation.isPending
                          }
                          onClick={() => startPartial(transfer)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Partial
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={
                            transfer.status !== 'PENDING_ACKNOWLEDGEMENT' ||
                            acknowledgeMutation.isPending
                          }
                          onClick={() =>
                            acknowledgeMutation.mutate({
                              items: acknowledgementItems(transfer, 'REJECT_FULL'),
                              transferId: transfer.id,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Reject Full
                        </Button>
                        <Button
                          disabled={transfer.status !== 'DRAFT' || cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(transfer.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
                  error={transfersQuery.error}
                  isError={transfersQuery.isError}
                  isLoading={transfersQuery.isLoading}
                  label="transfers"
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

      {partialTransfer ? (
        <Panel className="p-5">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">
                Accept Partial - {partialTransfer.transferNumber}
              </h2>
              <p className="text-sm text-slate-500">
                Accepted plus rejected quantity must equal sent quantity for each line.
              </p>
            </div>
            <Button onClick={() => setPartialTransfer(null)} type="button" variant="outline">
              Close
            </Button>
          </div>
          <div className="space-y-3">
            {partialTransfer.lines.map((line, index) => (
              <div
                className="grid gap-3 rounded-lg border bg-slate-50 p-3 lg:grid-cols-[1fr_110px_130px_130px_1fr]"
                key={line.id}
              >
                <div>
                  <p className="font-medium text-slate-950">{line.item.itemName}</p>
                  <p className="text-xs text-slate-500">
                    {line.batchNumber ?? 'No batch'} - {formatDateOnly(line.expiryDate)} - Sent{' '}
                    {line.sentQty.toFixed(3)}
                  </p>
                </div>
                <Input disabled value={line.sentQty.toFixed(3)} />
                <Input
                  min="0"
                  onChange={(event) =>
                    updatePartialLine(index, { acceptedQty: event.target.value })
                  }
                  placeholder="Accepted"
                  type="number"
                  value={partialLines[index]?.acceptedQty ?? ''}
                />
                <Input
                  min="0"
                  onChange={(event) =>
                    updatePartialLine(index, { rejectedQty: event.target.value })
                  }
                  placeholder="Rejected"
                  type="number"
                  value={partialLines[index]?.rejectedQty ?? ''}
                />
                <Input
                  onChange={(event) =>
                    updatePartialLine(index, { rejectionReason: event.target.value })
                  }
                  placeholder="Rejection reason"
                  value={partialLines[index]?.rejectionReason ?? ''}
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Field label="Remarks" name="partialRemarks">
              <Input
                onChange={(event) => setPartialRemarks(event.target.value)}
                placeholder="Optional"
                value={partialRemarks}
              />
            </Field>
          </div>
          {partialError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {partialError}
            </div>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button disabled={acknowledgeMutation.isPending} onClick={submitPartial} type="button">
              {acknowledgeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
              Submit Acknowledgement
            </Button>
          </div>
        </Panel>
      ) : null}
    </section>
  );
}

export function CreateTransferPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<TransferLineDraft[]>([emptyTransferLine()]);
  const [formError, setFormError] = useState('');
  const [createdTransfer, setCreatedTransfer] = useState<Transfer | null>(null);
  const [manualBatchMode, setManualBatchMode] = useState(false);
  const form = useForm<TransferHeaderFormValues>({
    defaultValues: {
      businessDate: '',
      hospitalId: scopedHospitalId ?? '',
      remarks: '',
      restaurantId: '',
      sourceId: '',
      sourceType: 'STORE',
      transferDate: defaultTransferDate(),
    },
  });
  const selectedHospitalId = form.watch('hospitalId');
  const selectedSourceId = form.watch('sourceId');
  const selectedSourceType = form.watch('sourceType');
  const selectedBusinessDate = form.watch('businessDate');
  const selectedRestaurantId = form.watch('restaurantId');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(selectedHospitalId);
  const kitchensQuery = useKitchens(selectedHospitalId);
  const restaurantsQuery = useRestaurants(selectedHospitalId);
  const stockQuery = useSourceStock(selectedSourceType, selectedSourceId, selectedBusinessDate);
  const stockOptions = stockQuery.data ?? [];
  const stockMap = useMemo(
    () => new Map(stockOptions.map((stock) => [stock.id, stock])),
    [stockOptions],
  );
  const stockGroups = useMemo(
    () => buildTransferItemGroups(stockOptions, selectedSourceType),
    [selectedSourceType, stockOptions],
  );
  const stockGroupMap = useMemo(
    () => new Map(stockGroups.map((group) => [group.key, group])),
    [stockGroups],
  );
  const isReadOnly = createdTransfer?.status !== undefined && createdTransfer.status !== 'DRAFT';

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('sourceId', '', { shouldValidate: true });
      form.setValue('restaurantId', '', { shouldValidate: true });
      setLines([emptyTransferLine()]);
      resetCreated();
    }
  }, [form, scopedHospitalId]);

  const saveMutation = useMutation({
    mutationFn: (body: TransferInput) => organizationApi.createTransfer(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedTransfer(response.data);
      invalidateTransferQueries(queryClient);
      showToast({
        description: response.data.transferNumber,
        title: 'Transfer saved',
        variant: 'success',
      });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: (id: string) => organizationApi.dispatchTransfer(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not dispatched',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setCreatedTransfer(response.data);
      invalidateTransferQueries(queryClient);
      showToast({ title: 'Transfer dispatched', variant: 'success' });
    },
  });

  function resetCreated() {
    setCreatedTransfer(null);
  }

  function addLine() {
    setLines((current) => [...current, emptyTransferLine()]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    resetCreated();
  }

  function updateLine(index: number, patch: Partial<TransferLineDraft>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
    resetCreated();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const header = transferHeaderSchema.safeParse(form.getValues());

    if (!header.success) {
      const issue = header.error.issues[0];
      const fieldName = (issue?.path[0] ?? 'hospitalId') as keyof TransferHeaderFormValues;
      const message = issue?.message ?? 'Check transfer header.';
      form.setError(fieldName, {
        message,
      });
      setFormError(message);
      return;
    }

    const selectedStocks: StockBalance[] = [];
    let preparedLines: PreparedTransferLine[] = [];
    const totals = new Map<string, number>();

    if (manualBatchMode) {
      const parsedLines = transferLinesSchema.safeParse(lines);

      if (!parsedLines.success) {
        setFormError(parsedLines.error.issues[0]?.message ?? 'Check transfer lines.');
        return;
      }

      const nextPreparedLines: PreparedTransferLine[] = [];

      for (const line of lines) {
        const stock = stockMap.get(line.stockBalanceId);
        const sentQty = Number(line.sentQty || 0);

        if (!stock) {
          setFormError('Select valid source stock for every line.');
          return;
        }

        nextPreparedLines.push({
          remarks: optionalValue(line.remarks),
          sentQty,
          stock,
        });
      }

      preparedLines = nextPreparedLines;
    } else {
      const remainingByStockId = new Map(
        stockOptions.map((stock) => [stock.id, stock.availableQty] as const),
      );

      for (const line of lines) {
        const group = stockGroupMap.get(line.itemId);
        const sentQty = Number(line.sentQty || 0);

        if (!line.itemId || !group) {
          setFormError('Select an item for every transfer line.');
          return;
        }

        if (!Number.isFinite(sentQty) || sentQty <= 0) {
          setFormError('Transfer quantity must be greater than zero.');
          return;
        }

        if (sentQty > group.totalAvailableQty) {
          setFormError(
            `Available quantity for ${group.itemName} is ${formatQuantity(
              group.totalAvailableQty,
            )}. Please enter quantity up to ${formatQuantity(group.totalAvailableQty)}.`,
          );
          return;
        }

        const allocations = allocateFefo(
          group.stocks,
          sentQty,
          header.data.sourceType,
          remainingByStockId,
        );
        const allocatedQty = allocations.reduce(
          (total, allocation) => total + allocation.allocatedQty,
          0,
        );

        if (allocatedQty < sentQty) {
          setFormError(
            `Available quantity for ${group.itemName} is ${formatQuantity(
              allocatedQty,
            )}. Please enter quantity up to ${formatQuantity(allocatedQty)}.`,
          );
          return;
        }

        preparedLines.push(
          ...allocations.map((allocation) => ({
            remarks: optionalValue(line.remarks),
            sentQty: allocation.allocatedQty,
            stock: allocation.stock,
          })),
        );
      }
    }

    for (const line of preparedLines) {
      selectedStocks.push(line.stock);
      totals.set(line.stock.id, (totals.get(line.stock.id) ?? 0) + line.sentQty);
    }

    for (const [stockId, requestedQty] of totals.entries()) {
      const stock = stockMap.get(stockId);

      if (!stock || requestedQty > stock.availableQty) {
        setFormError('Transfer quantity cannot exceed available source quantity.');
        return;
      }
    }

    const businessDateFilter = optionalValue(header.data.businessDate);
    let transferBusinessDate = businessDateFilter;

    if (header.data.sourceType === 'KITCHEN') {
      const stockBusinessDates = new Set(
        selectedStocks.map((stock) => toDateOnlyValue(stock.businessDate)).filter(Boolean),
      );

      if (stockBusinessDates.size === 0) {
        setFormError('Selected kitchen stock is missing a business date.');
        return;
      }

      if (businessDateFilter) {
        const mismatchedStock = selectedStocks.find(
          (stock) => toDateOnlyValue(stock.businessDate) !== businessDateFilter,
        );

        if (mismatchedStock) {
          setFormError('Selected kitchen stock does not match the chosen business date.');
          return;
        }
      } else if (stockBusinessDates.size > 1) {
        setFormError('Select kitchen stock from one business date per transfer.');
        return;
      } else {
        transferBusinessDate = [...stockBusinessDates][0];
      }
    }

    const payload: TransferInput = {
      destinationId: header.data.restaurantId,
      destinationType: 'RESTAURANT',
      ...(transferBusinessDate ? { businessDate: transferBusinessDate } : {}),
      hospitalId: header.data.hospitalId,
      items: preparedLines.map((line) => ({
        batchNumber:
          header.data.sourceType === 'STORE' ? (line.stock.batchNumber ?? '') : undefined,
        expiryDate:
          header.data.sourceType === 'STORE' ? toDateOnlyValue(line.stock.expiryDate) : undefined,
        itemId: line.stock.itemId,
        remarks: line.remarks,
        sentQty: line.sentQty,
      })),
      remarks: optionalValue(header.data.remarks),
      sourceId: header.data.sourceId,
      sourceType: header.data.sourceType,
      transferDate: new Date(header.data.transferDate).toISOString(),
    };

    saveMutation.mutate(payload);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        subtitle="Create a Store or Kitchen to Restaurant stock transfer from available source stock."
        title="Create Transfer"
      />

      {createdTransfer ? (
        <Panel className="flex flex-col gap-3 border-teal-200 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-900">
              Transfer {createdTransfer.transferNumber} is {formatEnum(createdTransfer.status)}
            </p>
            <p className="text-sm text-teal-800">
              Dispatch when the stock physically leaves the selected source.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={createdTransfer.status !== 'DRAFT' || dispatchMutation.isPending}
              onClick={() => dispatchMutation.mutate(createdTransfer.id)}
              type="button"
            >
              {dispatchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              Dispatch
            </Button>
            <Button
              onClick={() => router.push('/inventory/transfers')}
              type="button"
              variant="outline"
            >
              View Transfers
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
              Transfer Header
            </h2>
            <p className="text-sm text-slate-500">
              Select location, source type, source, and receiving restaurant.
            </p>
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
                  form.setValue('sourceId', '', { shouldValidate: true });
                  form.setValue('restaurantId', '', { shouldValidate: true });
                  setLines([emptyTransferLine()]);
                  resetCreated();
                }}
                value={selectedHospitalId}
              />
            </Field>
            <Field
              error={form.formState.errors.sourceType?.message}
              label="Source Type"
              name="sourceType"
            >
              <Select
                disabled={!selectedHospitalId || isReadOnly}
                onChange={(event) => {
                  form.setValue('sourceType', event.target.value as InventoryLocationType, {
                    shouldValidate: true,
                  });
                  form.setValue('sourceId', '', { shouldValidate: true });
                  setLines([emptyTransferLine()]);
                  resetCreated();
                }}
                value={selectedSourceType}
              >
                <option value="STORE">Store</option>
                <option value="KITCHEN">Kitchen</option>
              </Select>
            </Field>
            <Field error={form.formState.errors.sourceId?.message} label="Source" name="sourceId">
              {selectedSourceType === 'KITCHEN' ? (
                <KitchenSelect
                  disabled={!selectedHospitalId || isReadOnly}
                  kitchens={kitchensQuery.data ?? []}
                  onChange={(value) => {
                    form.setValue('sourceId', value, { shouldValidate: true });
                    setLines([emptyTransferLine()]);
                    resetCreated();
                  }}
                  value={selectedSourceId}
                />
              ) : (
                <StoreSelect
                  disabled={!selectedHospitalId || isReadOnly}
                  onChange={(value) => {
                    form.setValue('sourceId', value, { shouldValidate: true });
                    setLines([emptyTransferLine()]);
                    resetCreated();
                  }}
                  stores={storesQuery.data ?? []}
                  value={selectedSourceId}
                />
              )}
            </Field>
            <Field
              error={form.formState.errors.restaurantId?.message}
              label="Restaurant"
              name="restaurantId"
            >
              <RestaurantSelect
                disabled={!selectedHospitalId || isReadOnly}
                onChange={(value) => {
                  form.setValue('restaurantId', value, { shouldValidate: true });
                  resetCreated();
                }}
                restaurants={restaurantsQuery.data ?? []}
                value={selectedRestaurantId}
              />
            </Field>
            <Field
              error={form.formState.errors.transferDate?.message}
              label="Transfer Date"
              name="transferDate"
            >
              <Input
                disabled={isReadOnly}
                type="datetime-local"
                {...form.register('transferDate')}
              />
            </Field>
            <Field
              error={form.formState.errors.businessDate?.message}
              label="Business Date Filter"
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
                  Transfer Lines
                </h2>
                <p className="text-sm text-slate-500">
                  Select an item and quantity. Batches are allocated by FEFO before saving.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    checked={manualBatchMode}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    disabled={isReadOnly}
                    onChange={(event) => {
                      setManualBatchMode(event.target.checked);
                      setLines([emptyTransferLine()]);
                      resetCreated();
                    }}
                    type="checkbox"
                  />
                  Manual batch selection
                </label>
                <Button
                  disabled={!selectedSourceId || isReadOnly}
                  onClick={addLine}
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  Add Line
                </Button>
              </div>
            </div>

            {!selectedSourceId ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                Select a location and source before adding transfer lines.
              </div>
            ) : null}

            {selectedSourceId && stockOptions.length === 0 && !stockQuery.isLoading ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                {selectedSourceType === 'KITCHEN'
                  ? selectedBusinessDate
                    ? 'No available READYMADE kitchen stock found for this kitchen and business date.'
                    : 'No available READYMADE kitchen stock found for this kitchen.'
                  : 'No available MRP store stock found for this store.'}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              {lines.map((line, index) => {
                const stock = stockMap.get(line.stockBalanceId);
                const group = stockGroupMap.get(line.itemId);
                const requestedQty = Number(line.sentQty || 0);
                const previewQty =
                  Number.isFinite(requestedQty) && requestedQty > 0 ? requestedQty : 0;
                const allocationPreview = group
                  ? allocateFefo(group.stocks, previewQty, selectedSourceType)
                  : [];
                const previewAllocatedQty = allocationPreview.reduce(
                  (total, allocation) => total + allocation.allocatedQty,
                  0,
                );
                const isOverAvailable =
                  Boolean(group) && previewQty > 0 && previewQty > (group?.totalAvailableQty ?? 0);

                if (manualBatchMode) {
                  return (
                    <div
                      className="grid gap-3 rounded-lg border bg-white p-4 lg:grid-cols-[minmax(0,1fr)_130px_130px_130px_1fr_auto]"
                      key={line.clientId}
                    >
                      <Field label="Source Stock" name={`transfer-line-${line.clientId}-stock`}>
                        <Select
                          disabled={!selectedSourceId || isReadOnly}
                          onChange={(event) =>
                            updateLine(index, { stockBalanceId: event.target.value })
                          }
                          value={line.stockBalanceId}
                        >
                          <option value="">Select stock</option>
                          {stockOptions.map((stockOption) => (
                            <option key={stockOption.id} value={stockOption.id}>
                              {stockOptionLabel(stockOption)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <div className="rounded-md border bg-slate-50 p-3 text-sm">
                        <p className="text-slate-500">Batch</p>
                        <p className="font-semibold text-slate-950">
                          {stock?.batchNumber ?? 'No batch'}
                        </p>
                      </div>
                      <div className="rounded-md border bg-slate-50 p-3 text-sm">
                        <p className="text-slate-500">
                          {selectedSourceType === 'KITCHEN' ? 'Business Date' : 'Expiry'}
                        </p>
                        <p className="font-semibold text-slate-950">
                          {selectedSourceType === 'KITCHEN'
                            ? formatDateOnly(stock?.businessDate)
                            : formatDateOnly(stock?.expiryDate)}
                        </p>
                      </div>
                      <div className="rounded-md border bg-slate-50 p-3 text-sm">
                        <p className="text-slate-500">Available</p>
                        <p className="font-semibold text-slate-950">
                          {stock ? formatQuantity(stock.availableQty) : '-'}
                        </p>
                      </div>
                      <Field label="Transfer Qty" name={`transfer-line-${line.clientId}-qty`}>
                        <Input
                          disabled={isReadOnly}
                          min="0"
                          onChange={(event) => updateLine(index, { sentQty: event.target.value })}
                          placeholder="Qty"
                          type="number"
                          value={line.sentQty}
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
                  );
                }

                return (
                  <div className="space-y-4 rounded-lg border bg-white p-4" key={line.clientId}>
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]">
                      <Field label="Item" name={`transfer-line-${line.clientId}-item`}>
                        <Select
                          disabled={!selectedSourceId || isReadOnly}
                          onChange={(event) =>
                            updateLine(index, {
                              itemId: event.target.value,
                              stockBalanceId: '',
                            })
                          }
                          value={line.itemId}
                        >
                          <option value="">Select item</option>
                          {stockGroups.map((itemGroup) => (
                            <option key={itemGroup.key} value={itemGroup.key}>
                              {itemGroup.itemName} ({itemGroup.itemCode}) - Available{' '}
                              {formatQuantity(itemGroup.totalAvailableQty)} - {itemGroup.batchCount}{' '}
                              {itemGroup.batchCount === 1 ? 'batch' : 'batches'}
                              {selectedSourceType === 'KITCHEN' && itemGroup.businessDate
                                ? ` - Business ${formatDateOnly(itemGroup.businessDate)}`
                                : ''}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Transfer Qty" name={`transfer-line-${line.clientId}-qty`}>
                        <Input
                          disabled={isReadOnly}
                          min="0"
                          onChange={(event) => updateLine(index, { sentQty: event.target.value })}
                          placeholder="Qty"
                          type="number"
                          value={line.sentQty}
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

                    {group ? (
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-md border bg-slate-50 p-3 text-sm">
                          <p className="text-slate-500">Total Available</p>
                          <p className="font-semibold text-slate-950">
                            {formatQuantity(group.totalAvailableQty)}
                          </p>
                        </div>
                        <div className="rounded-md border bg-slate-50 p-3 text-sm">
                          <p className="text-slate-500">
                            {selectedSourceType === 'KITCHEN' ? 'Business Date' : 'Nearest Expiry'}
                          </p>
                          <p className="font-semibold text-slate-950">
                            {formatDateOnly(group.nearestExpiryDate)}
                          </p>
                        </div>
                        <div className="rounded-md border bg-slate-50 p-3 text-sm">
                          <p className="text-slate-500">Batches</p>
                          <p className="font-semibold text-slate-950">{group.batchCount}</p>
                        </div>
                        <div className="rounded-md border bg-slate-50 p-3 text-sm">
                          <p className="text-slate-500">Status</p>
                          <Badge variant={statusVariant(group.status)}>
                            {formatEnum(group.status)}
                          </Badge>
                        </div>
                      </div>
                    ) : null}

                    {isOverAvailable && group ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                        Available quantity for {group.itemName} is{' '}
                        {formatQuantity(group.totalAvailableQty)}. Please enter quantity up to{' '}
                        {formatQuantity(group.totalAvailableQty)}.
                      </div>
                    ) : null}

                    {group && previewQty > 0 ? (
                      <div className="rounded-lg border">
                        <div className="flex flex-col gap-1 border-b bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              FEFO Batch Allocation Preview
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatQuantity(previewAllocatedQty)} of {formatQuantity(previewQty)}{' '}
                              planned from earliest available stock.
                            </p>
                          </div>
                          <Badge variant={isOverAvailable ? 'danger' : 'success'}>
                            {isOverAvailable ? 'Insufficient Qty' : 'Ready'}
                          </Badge>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-white text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                              <tr>
                                <th className="px-4 py-3">Batch Number</th>
                                <th className="px-4 py-3">
                                  {selectedSourceType === 'KITCHEN'
                                    ? 'Business Date'
                                    : 'Expiry Date'}
                                </th>
                                <th className="px-4 py-3">Allocated Qty</th>
                                <th className="px-4 py-3">Available Qty</th>
                                <th className="px-4 py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {allocationPreview.map((allocation) => (
                                <tr key={allocation.stock.id}>
                                  <td className="px-4 py-3 font-medium text-slate-950">
                                    {allocation.stock.batchNumber ?? 'No batch'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {selectedSourceType === 'KITCHEN'
                                      ? formatDateOnly(allocation.stock.businessDate)
                                      : formatDateOnly(allocation.stock.expiryDate)}
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-950">
                                    {formatQuantity(allocation.allocatedQty)}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {formatQuantity(allocation.stock.availableQty)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={statusVariant(allocation.stock.status)}>
                                      {formatEnum(allocation.stock.status)}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {formError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              onClick={() => router.push('/inventory/transfers')}
              type="button"
              variant="outline"
            >
              Close
            </Button>
            <Button
              disabled={saveMutation.isPending || Boolean(createdTransfer) || isReadOnly}
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

export function RestaurantStockPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'KITCHEN' | 'STORE'>('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | StockBalanceStatus>('');
  const [sortBy, setSortBy] = useState('lastUpdatedOn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const effectiveItemType =
    itemTypeFilter ||
    (sourceFilter === 'STORE' ? 'MRP' : sourceFilter === 'KITCHEN' ? 'READYMADE' : '');
  const itemOptionsQuery = useItems(effectiveItemType || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setRestaurantFilter('');
    setPage(1);
  }, [scopedHospitalId]);

  const stockQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurantStock({
        batchNumber: batchFilter,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        itemType: effectiveItemType || undefined,
        limit: listLimit,
        locationId: restaurantFilter,
        page,
        search,
        sortBy,
        sortOrder,
        status: statusFilter || undefined,
      });

      return response.data;
    },
    queryKey: [
      'restaurant-stock',
      page,
      search,
      hospitalFilter,
      restaurantFilter,
      sourceFilter,
      itemFilter,
      itemTypeFilter,
      batchFilter,
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
        subtitle="Current restaurant stock received from acknowledged transfers."
        title="Restaurant Stock"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_170px_170px_140px_150px_180px_150px_160px_150px_130px_auto]">
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
              setRestaurantFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <RestaurantSelect
            disabled={!hospitalFilter}
            onChange={(value) => {
              setRestaurantFilter(value);
              setPage(1);
            }}
            restaurants={restaurantsQuery.data ?? []}
            value={restaurantFilter}
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
              setSourceFilter(event.target.value as '' | 'KITCHEN' | 'STORE');
              setItemFilter('');
              setPage(1);
            }}
            value={sourceFilter}
          >
            <option value="">All sources</option>
            <option value="STORE">Store</option>
            <option value="KITCHEN">Kitchen</option>
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
            <option value="MRP">MRP</option>
            <option value="READYMADE">READYMADE</option>
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[18%] px-4 py-3">Restaurant</th>
                <th className="w-[12%] px-4 py-3">Source</th>
                <th className="w-[20%] px-4 py-3">Item</th>
                <th className="w-[14%] px-4 py-3">Batch</th>
                <th className="w-[14%] px-4 py-3">Expiry / Date</th>
                <th className="w-[12%] px-4 py-3">Available Qty</th>
                <th className="w-[10%] px-4 py-3">Status</th>
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
                      <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                        {stock.itemType === 'READYMADE' ? 'Kitchen' : 'Store'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{stock.item.itemName}</p>
                      <p className="text-xs text-slate-500">{stock.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{stock.batchNumber ?? 'No batch'}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {stock.itemType === 'READYMADE'
                        ? formatDateOnly(stock.businessDate)
                        : formatDateOnly(stock.expiryDate)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant(stock.status)}>
                        {formatEnum(stock.status)}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
                  error={stockQuery.error}
                  isError={stockQuery.isError}
                  isLoading={stockQuery.isLoading}
                  label="restaurant stock"
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

export function StockLedgersPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [locationTypeFilter, setLocationTypeFilter] = useState<'' | InventoryLocationType>('');
  const [locationFilter, setLocationFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'' | StockTransactionType>('');
  const [referenceTypeFilter, setReferenceTypeFilter] = useState<'' | StockReferenceType>('');
  const [businessDateFilter, setBusinessDateFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [sortBy, setSortBy] = useState('transactionDateTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const kitchensQuery = useKitchens(hospitalFilter);
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const itemOptionsQuery = useItems();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setLocationTypeFilter('');
    setLocationFilter('');
    setPage(1);
  }, [scopedHospitalId]);

  const locationOptions =
    locationTypeFilter === 'STORE'
      ? storesQuery.data?.map((store) => ({
          code: store.storeCode,
          id: store.id,
          name: store.storeName,
        }))
      : locationTypeFilter === 'KITCHEN'
        ? kitchensQuery.data?.map((kitchen) => ({
            code: kitchen.kitchenCode,
            id: kitchen.id,
            name: kitchen.kitchenName,
          }))
        : locationTypeFilter === 'RESTAURANT'
          ? restaurantsQuery.data?.map((restaurant) => ({
              code: restaurant.restaurantCode,
              id: restaurant.id,
              name: restaurant.restaurantName,
            }))
          : [];

  const ledgersQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStockLedgers({
        businessDate: businessDateFilter || undefined,
        fromDate: fromDateFilter || undefined,
        hospitalId: hospitalFilter,
        itemId: itemFilter,
        limit: listLimit,
        locationId: locationFilter,
        locationType: locationTypeFilter || undefined,
        page,
        referenceType: referenceTypeFilter || undefined,
        search,
        sortBy,
        sortOrder,
        toDate: toDateFilter || undefined,
        transactionType: transactionTypeFilter || undefined,
      });

      return response.data;
    },
    queryKey: [
      'stock-ledgers',
      page,
      search,
      hospitalFilter,
      locationTypeFilter,
      locationFilter,
      itemFilter,
      transactionTypeFilter,
      referenceTypeFilter,
      businessDateFilter,
      fromDateFilter,
      toDateFilter,
      sortBy,
      sortOrder,
    ],
  });

  const ledgers = ledgersQuery.data?.items ?? [];
  const meta = ledgersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

  return (
    <section className="space-y-6">
      <PageHeader
        subtitle="Read-only movement history across store, kitchen, and restaurant stock."
        title="Stock Ledgers"
      />
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_170px_150px_170px_180px_170px_160px_150px_150px_150px_130px_auto]">
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
              setLocationFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            onChange={(event) => {
              setLocationTypeFilter(event.target.value as '' | InventoryLocationType);
              setLocationFilter('');
              setPage(1);
            }}
            value={locationTypeFilter}
          >
            <option value="">All location types</option>
            {stockLedgerLocationTypes.map((locationType) => (
              <option key={locationType} value={locationType}>
                {formatEnum(locationType)}
              </option>
            ))}
          </Select>
          <Select
            disabled={!locationTypeFilter || !hospitalFilter}
            onChange={(event) => {
              setLocationFilter(event.target.value);
              setPage(1);
            }}
            value={locationFilter}
          >
            <option value="">All locations</option>
            {locationOptions?.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
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
          <Select
            onChange={(event) => {
              setTransactionTypeFilter(event.target.value as '' | StockTransactionType);
              setPage(1);
            }}
            value={transactionTypeFilter}
          >
            <option value="">All transaction types</option>
            {stockTransactionTypes.map((transactionType) => (
              <option key={transactionType} value={transactionType}>
                {formatEnum(transactionType)}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setReferenceTypeFilter(event.target.value as '' | StockReferenceType);
              setPage(1);
            }}
            value={referenceTypeFilter}
          >
            <option value="">All reference types</option>
            {stockReferenceTypes.map((referenceType) => (
              <option key={referenceType} value={referenceType}>
                {formatEnum(referenceType)}
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
          <Input
            onChange={(event) => {
              setFromDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={fromDateFilter}
          />
          <Input
            onChange={(event) => {
              setToDateFilter(event.target.value);
              setPage(1);
            }}
            type="date"
            value={toDateFilter}
          />
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
          <Button onClick={() => void ledgersQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="transactionDateTime">Transaction date</option>
            <option value="businessDate">Business date</option>
            <option value="createdAt">Created date</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[16%] px-4 py-3">Location</th>
                <th className="w-[16%] px-4 py-3">Item</th>
                <th className="w-[11%] px-4 py-3">Transaction</th>
                <th className="w-[11%] px-4 py-3">Reference</th>
                <th className="w-[10%] px-4 py-3">Qty In</th>
                <th className="w-[10%] px-4 py-3">Qty Out</th>
                <th className="w-[10%] px-4 py-3">Balance</th>
                <th className="w-[12%] px-4 py-3">Batch</th>
                <th className="w-[12%] px-4 py-3">Business Date</th>
                <th className="w-[15%] px-4 py-3">Transaction Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {ledgers.length > 0 ? (
                ledgers.map((ledger: StockLedger) => (
                  <tr className="hover:bg-slate-50" key={ledger.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{ledger.location.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatEnum(ledger.locationType)} - {ledger.location.code ?? '-'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{ledger.item.itemName}</p>
                      <p className="text-xs text-slate-500">{ledger.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                        {formatEnum(ledger.transactionType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {ledger.referenceType ? formatEnum(ledger.referenceType) : '-'}
                    </td>
                    <td className="px-4 py-4 font-semibold text-emerald-700">
                      {ledger.qtyIn.toFixed(3)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-red-700">
                      {ledger.qtyOut.toFixed(3)}
                    </td>
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {ledger.balanceAfter.toFixed(3)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{ledger.batchNumber ?? '-'}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDateOnly(ledger.businessDate)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDate(ledger.transactionDateTime)}
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={10}
                  error={ledgersQuery.error}
                  isError={ledgersQuery.isError}
                  isLoading={ledgersQuery.isLoading}
                  label="stock ledgers"
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
