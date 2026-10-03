'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  Grn,
  GrnInput,
  GrnLineInput,
  GrnStatus,
  Hospital,
  InventoryLocationType,
  Item,
  ItemType,
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
import {
  AppPageHeader,
  EmptyState,
  StatusChip,
  FoodTypeMarker,
  KeyboardHint,
  Stepper,
  SummaryCard,
  Timeline,
  TypeTag,
  type StepItem,
} from '@/components/design-system';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, FieldError, Input, Panel, Select, Skeleton } from '@/components/ui';
import {
  BulkActionBar,
  DetailPanel,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Modal,
  QuantityStepper,
  SavedViewTabs,
  SegmentedControl,
} from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { downloadCsv } from '@/lib/csv';
import { transferOutcome } from '@/lib/dashboard-stats';
import { Textarea } from '@/components/organization/shared';
import { useLocationHrefs, useLocationNames } from '@/components/inventory/use-locations';
import { RecordLink } from '@/components/record-link';
import { canOpenPath, locationHref, recordHref } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import {
  openRowLink,
  setUrlParams,
  useDebouncedValue,
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
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

function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function PageHeader({
  action,
  subtitle,
  title,
}: Readonly<{ action?: ReactNode; subtitle: string; title: string }>) {
  return <AppPageHeader action={action} description={subtitle} eyebrow="Inventory" title={title} />;
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
        limit: 100,
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

const grnRejectionReasons = [
  'Short received',
  'Damaged packs',
  'Quality issue',
  'Near expiry',
  'Wrong item',
];
/** Batches expiring within this many days get a tag, and a FEFO note on the side. */
const grnNearExpiryDays = 7;
const grnChecks = [
  { hint: 'Quantities checked against the PO', key: 'invoice', label: 'Invoice matches PO' },
  { hint: 'Every line has at least one batch', key: 'batches', label: 'Batch & expiry captured' },
  { hint: 'Chilled items received at 4 °C or below', key: 'temp', label: 'Cold-chain check done' },
  { hint: 'Attach to the vendor note', key: 'photos', label: 'Rejected items photographed' },
];

/** Verify a draft GRN batch by batch, then post the accepted quantity to store stock. */
function GrnVerificationView({ grnId }: Readonly<{ grnId: string }>) {
  const queryClient = useQueryClient();
  // Back to the list keeps its filters (they are still in the URL).
  const listHref = useHrefWith()({ id: null });
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [openLines, setOpenLines] = useState<Set<string>>(() => new Set());
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const [confirming, setConfirming] = useState<'post' | 'reject' | null>(null);
  const initializedFor = useRef<string | null>(null);
  const grnQuery = useQuery({
    queryFn: async () => (await organizationApi.getGrn(grnId)).data,
    queryKey: ['grns', 'detail', grnId],
    retry: false,
  });
  const grn = grnQuery.data;
  useBreadcrumbLabel(grnId, grn?.grnNumber ?? (grnQuery.isError ? 'Not found' : undefined));

  // Start from what was recorded at receipt, once per GRN, so a refetch keeps edits.
  useEffect(() => {
    if (!grn || initializedFor.current === grn.id) {
      return;
    }

    initializedFor.current = grn.id;
    setAccepted(
      Object.fromEntries(
        grn.lines.flatMap((line) =>
          line.batches.length
            ? line.batches.map((batch) => [batch.id, String(batch.acceptedQty)])
            : [[`line:${line.id}`, String(line.acceptedQty)]],
        ),
      ),
    );
    setReasons(Object.fromEntries(grn.lines.map((line) => [line.id, line.rejectionReason ?? ''])));
    // Lines with more than one batch are edited per batch, so they start open.
    setOpenLines(
      new Set(grn.lines.filter((line) => line.batches.length > 1).map((line) => line.id)),
    );
  }, [grn]);

  const saveMutation = useMutation({
    mutationFn: async ({ items, post }: { items: GrnLineInput[]; post: boolean }) => {
      const saved = (await organizationApi.updateGrn(grnId, { items })).data;

      return post ? (await organizationApi.postGrnToStock(grnId)).data : saved;
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not saved',
        variant: 'error',
      });
    },
    onSuccess(saved) {
      invalidateGrnQueries(queryClient);
      showToast({
        description: saved.grnNumber,
        title: saved.status === 'POSTED_TO_STOCK' ? 'GRN posted to stock' : 'Verification saved',
        variant: 'success',
      });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () => organizationApi.cancelGrn(grnId),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'GRN was not rejected',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateGrnQueries(queryClient);
      showToast({
        description: response.data.grnNumber,
        title: 'GRN rejected',
        variant: 'success',
      });
    },
  });

  if (grnQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-80 w-full" />
      </section>
    );
  }

  if (!grn) {
    return (
      <Panel className="p-6">
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/inventory/grns">Back to GRNs</Link>
            </Button>
          }
          description="It may have been deleted, or it belongs to a location you can't view."
          title="GRN not found"
        />
      </Panel>
    );
  }

  const isEditable = grn.status === 'DRAFT';
  const canSave = isEditable && hasPermission('GRN_UPDATE');
  const canPost = canSave && hasPermission('GRN_POST');
  const lines = grn.lines.map((line) => {
    const units = (line.batches.length ? line.batches : [null]).map((batch) => {
      const key = batch ? batch.id : `line:${line.id}`;
      const received = batch ? batch.receivedQty : line.receivedQty;
      const raw = accepted[key] ?? String(batch ? batch.acceptedQty : line.acceptedQty);
      const value = Number(raw);
      const isNumber = raw.trim() !== '' && Number.isFinite(value);
      const acceptedQty = isNumber ? Math.min(Math.max(value, 0), received) : 0;
      const daysLeft = batch ? daysFromToday(batch.expiryDate) : null;
      const error = !isNumber
        ? 'Enter the accepted quantity.'
        : value < 0 || value > received + 0.0005
          ? `Accept between 0 and ${formatQuantity(received)}.`
          : daysLeft !== null && daysLeft < 0 && acceptedQty > 0
            ? `Batch ${batch?.batchNumber} has expired and can't be accepted.`
            : null;

      return {
        acceptedQty: Number(acceptedQty.toFixed(3)),
        batch,
        daysLeft,
        error,
        key,
        raw,
        received,
        rejectedQty: Number((received - acceptedQty).toFixed(3)),
      };
    });
    const acceptedQty = Number(
      units.reduce((total, unit) => total + unit.acceptedQty, 0).toFixed(3),
    );
    const rejectedQty = Number((line.receivedQty - acceptedQty).toFixed(3));
    const reason = reasons[line.id] ?? '';
    const shortBy =
      line.orderedQty !== null ? Number((line.orderedQty - line.receivedQty).toFixed(3)) : 0;
    const error =
      units.find((unit) => unit.error)?.error ??
      (rejectedQty > 0 && !reason && hasTriedSave ? 'Choose why the rest is rejected.' : null);

    return { acceptedQty, error, line, reason, rejectedQty, shortBy, units };
  });
  const totalAccepted = Number(lines.reduce((total, row) => total + row.acceptedQty, 0).toFixed(3));
  const totalRejected = Number(lines.reduce((total, row) => total + row.rejectedQty, 0).toFixed(3));
  const outcomeLabel =
    totalAccepted <= 0 ? 'Rejected' : totalRejected > 0 ? 'Partially accepted' : 'Accepted';
  const expiringSoon = lines
    .flatMap((row) => row.units)
    .filter(
      (unit) =>
        unit.acceptedQty > 0 &&
        unit.daysLeft !== null &&
        unit.daysLeft >= 0 &&
        unit.daysLeft <= grnNearExpiryDays,
    ).length;
  const uncheckedChecks = grnChecks.filter((check) => !checks[check.key]);
  const steps: StepItem[] = [
    { detail: `Created ${formatWhen(grn.createdAt)}`, label: 'Received', state: 'done' },
    {
      detail: grn.status === 'CANCELLED' ? 'GRN rejected' : isEditable ? 'In progress' : 'Checked',
      label: 'Verification',
      state: grn.status === 'CANCELLED' ? 'stopped' : isEditable ? 'current' : 'done',
    },
    {
      detail: totalRejected > 0 ? 'Some quantity rejected' : 'All lines accepted',
      label: outcomeLabel,
      state: grn.status === 'POSTED_TO_STOCK' ? 'done' : 'todo',
    },
    {
      detail: grn.status === 'POSTED_TO_STOCK' ? formatWhen(grn.updatedAt) : 'Adds to store stock',
      label: 'Posted to stock',
      state: grn.status === 'POSTED_TO_STOCK' ? 'done' : 'todo',
    },
  ];

  function buildItems(): GrnLineInput[] | null {
    setHasTriedSave(true);

    const invalid = lines.find((row) => row.error || (row.rejectedQty > 0 && !row.reason));

    if (invalid) {
      setOpenLines((current) => new Set(current).add(invalid.line.id));
      window.requestAnimationFrame(() =>
        document.getElementById(`grn-accepted-${invalid.units[0]?.key}`)?.focus(),
      );
      return null;
    }

    return lines.map((row) => ({
      acceptedQty: row.acceptedQty,
      batches: row.units.flatMap((unit) =>
        unit.batch
          ? [
              {
                acceptedQty: unit.acceptedQty,
                batchNumber: unit.batch.batchNumber,
                expiryDate: toDateOnlyValue(unit.batch.expiryDate),
                ...(unit.batch.manufacturingDate
                  ? { manufacturingDate: toDateOnlyValue(unit.batch.manufacturingDate) }
                  : {}),
                receivedQty: unit.received,
                rejectedQty: unit.rejectedQty,
                rejectionReason: unit.rejectedQty > 0 ? row.reason : undefined,
              },
            ]
          : [],
      ),
      itemId: row.line.itemId,
      ...(row.line.orderedQty !== null ? { orderedQty: row.line.orderedQty } : {}),
      receivedQty: row.line.receivedQty,
      rejectedQty: row.rejectedQty,
      rejectionReason: row.rejectedQty > 0 ? row.reason : undefined,
      remarks: row.line.remarks ?? undefined,
    }));
  }

  function save(post: boolean) {
    const items = buildItems();

    if (!items) {
      return;
    }

    if (post && uncheckedChecks.length > 0 && confirming !== 'post') {
      setConfirming('post');
      return;
    }

    setConfirming(null);
    saveMutation.mutate({ items, post });
  }

  function toggleLine(id: string) {
    setOpenLines((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  const isBusy = saveMutation.isPending || rejectMutation.isPending;
  const acceptedInputClass =
    'h-9 w-full rounded-control border-[1.5px] bg-ds-surface px-2 text-[13px] font-extrabold tabular-nums text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:bg-ds-subtle disabled:text-ds-muted';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            className="inline-flex min-h-6 items-center gap-1 self-start rounded-sm text-[12.5px] font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href={listHref}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            GRNs
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tabular-nums tracking-[-0.01em] text-ds-text">
              {grn.grnNumber}
            </h1>
            <StatusChip long status={grn.status} />
          </div>
          <p className="text-[13.5px] text-ds-muted">
            {[grn.vendorName, grn.store.storeName].filter(Boolean).join(' → ')} · received{' '}
            {formatWhen(grn.receivedDate)} by {grn.receivedBy}
          </p>
        </div>
        {canSave ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
              disabled={isBusy}
              onClick={() => setConfirming('reject')}
              type="button"
              variant="outline"
            >
              Reject GRN
            </Button>
            <Button disabled={isBusy} onClick={() => save(false)} type="button" variant="outline">
              Save verification
            </Button>
            {canPost ? (
              <Button disabled={isBusy} onClick={() => save(true)} type="button">
                {saveMutation.isPending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                )}
                {totalAccepted <= 0
                  ? 'Post (nothing accepted)'
                  : totalRejected > 0
                    ? 'Accept partially & post'
                    : 'Accept & post to stock'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Stepper label="GRN progress" steps={steps} />

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-labelledby="grn-lines"
          className="min-w-0 flex-[2_1_600px] overflow-hidden"
          role="region"
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
            <h2 className="text-[15px] font-extrabold text-ds-text" id="grn-lines">
              Lines · {grn.lines.length}
            </h2>
            <span className="text-[12.5px] text-ds-muted">
              Enter the accepted quantity; rejected is the rest of what was received.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-[13px]">
              <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                <tr>
                  <th className="w-12 py-2 pl-4" />
                  <th className="px-2 py-2 font-semibold">Item</th>
                  <th className="w-[76px] px-2 py-2 text-right font-semibold">Ordered</th>
                  <th className="w-[76px] px-2 py-2 text-right font-semibold">Received</th>
                  <th className="w-[120px] px-2 py-2 font-semibold">Accepted</th>
                  <th className="w-[76px] px-2 py-2 text-right font-semibold">Rejected</th>
                  <th className="w-[26%] py-2 pl-2 pr-4 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row) => {
                  const isOpen = openLines.has(row.line.id);
                  const single = row.units.length === 1 ? row.units[0] : undefined;

                  return (
                    <Fragment key={row.line.id}>
                      <tr
                        className={cn(
                          'border-b border-ds-divider align-middle',
                          row.rejectedQty > 0 && 'bg-ds-status-pending-bg/30',
                        )}
                      >
                        <td className="py-2 pl-4">
                          {row.line.batches.length ? (
                            <button
                              aria-controls={`grn-batches-${row.line.id}`}
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? 'Hide' : 'Show'} batches for ${row.line.item.itemName}`}
                              className="grid h-7 w-7 place-items-center rounded-[7px] border border-ds-border bg-ds-surface text-ds-text-3 transition hover:bg-ds-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                              onClick={() => toggleLine(row.line.id)}
                              type="button"
                            >
                              {isOpen ? (
                                <ChevronDown
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2.2}
                                />
                              ) : (
                                <ChevronRight
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2.2}
                                />
                              )}
                            </button>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <RecordLink
                            className="block truncate text-[13.5px] font-bold text-ds-text"
                            href={
                              isEditable
                                ? null
                                : recordHref('/masters/items', { id: row.line.item.id })
                            }
                          >
                            {row.line.item.itemName}
                          </RecordLink>
                          <span
                            className={cn(
                              'block truncate text-[11.5px]',
                              row.shortBy > 0
                                ? 'font-bold text-ds-status-pending-fg'
                                : 'text-ds-muted',
                            )}
                          >
                            {row.shortBy > 0
                              ? `${formatQuantity(row.shortBy)} short against PO`
                              : plural(row.line.batches.length, 'batch', 'batches')}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ds-text-3">
                          {row.line.orderedQty !== null ? formatQuantity(row.line.orderedQty) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums text-ds-text">
                          {formatQuantity(row.line.receivedQty)}
                        </td>
                        <td className="px-2 py-2">
                          {single ? (
                            <input
                              aria-invalid={single.error ? true : undefined}
                              aria-label={`Accepted quantity for ${row.line.item.itemName}`}
                              className={cn(
                                acceptedInputClass,
                                single.error ? 'border-ds-status-bad-fg' : 'border-ds-input',
                              )}
                              disabled={!canSave || isBusy}
                              id={`grn-accepted-${single.key}`}
                              inputMode="decimal"
                              max={single.received}
                              min="0"
                              onChange={(event) =>
                                setAccepted((current) => ({
                                  ...current,
                                  [single.key]: event.target.value,
                                }))
                              }
                              step="any"
                              type="number"
                              value={single.raw}
                            />
                          ) : (
                            <span
                              className="block text-[13px] font-extrabold tabular-nums text-ds-text"
                              title="Set per batch below"
                            >
                              {formatQuantity(row.acceptedQty)}
                              <span className="block text-[11px] font-medium text-ds-muted">
                                per batch
                              </span>
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-2 text-right tabular-nums',
                            row.rejectedQty > 0
                              ? 'font-extrabold text-ds-status-bad-fg'
                              : 'font-medium text-ds-muted',
                          )}
                        >
                          {formatQuantity(row.rejectedQty)}
                        </td>
                        <td className="py-2 pl-2 pr-4">
                          {row.rejectedQty > 0 ? (
                            <select
                              aria-invalid={hasTriedSave && !row.reason ? true : undefined}
                              aria-label={`Rejection reason for ${row.line.item.itemName}`}
                              className={cn(
                                'h-9 w-full rounded-control border-[1.5px] bg-ds-surface px-1.5 text-[12.5px] font-semibold text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary/15 disabled:bg-ds-subtle',
                                hasTriedSave && !row.reason
                                  ? 'border-ds-status-bad-fg'
                                  : 'border-ds-status-pending-fg',
                              )}
                              disabled={!canSave || isBusy}
                              onChange={(event) =>
                                setReasons((current) => ({
                                  ...current,
                                  [row.line.id]: event.target.value,
                                }))
                              }
                              value={row.reason}
                            >
                              <option value="">Choose a reason</option>
                              {[
                                ...new Set([
                                  ...grnRejectionReasons,
                                  ...(row.reason ? [row.reason] : []),
                                ]),
                              ].map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[12.5px] text-ds-muted">—</span>
                          )}
                        </td>
                      </tr>
                      {row.error ? (
                        <tr className="border-b border-ds-divider">
                          <td />
                          <td className="pb-2 pl-2 pr-4" colSpan={6}>
                            <span
                              className="flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                              role="alert"
                            >
                              <AlertTriangle
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                                strokeWidth={2}
                              />
                              {row.error}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                      {isOpen && row.line.batches.length ? (
                        <tr
                          className="border-b border-ds-divider bg-ds-subtle"
                          id={`grn-batches-${row.line.id}`}
                        >
                          <td />
                          <td className="pb-3 pr-4 pt-1" colSpan={6}>
                            <table className="w-full table-fixed text-[12.5px]">
                              <thead className="text-left text-[11.5px] text-ds-muted">
                                <tr>
                                  <th className="py-1.5 font-semibold">Batch</th>
                                  <th className="w-[100px] py-1.5 font-semibold">Mfg date</th>
                                  <th className="w-[150px] py-1.5 font-semibold">Expiry</th>
                                  <th className="w-[80px] py-1.5 text-right font-semibold">
                                    Received
                                  </th>
                                  <th className="w-[110px] py-1.5 pl-3 font-semibold">Accepted</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.units.map((unit) =>
                                  unit.batch ? (
                                    <tr className="border-t border-ds-divider" key={unit.key}>
                                      <td className="py-1.5 font-bold text-ds-text">
                                        {unit.batch.batchNumber}
                                      </td>
                                      <td className="py-1.5 text-ds-text-3">
                                        {unit.batch.manufacturingDate
                                          ? formatDateOnly(unit.batch.manufacturingDate)
                                          : '—'}
                                      </td>
                                      <td className="py-1.5">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                          <span
                                            className={cn(
                                              unit.daysLeft !== null && unit.daysLeft < 0
                                                ? 'font-bold text-ds-status-bad-fg'
                                                : unit.daysLeft !== null &&
                                                    unit.daysLeft <= grnNearExpiryDays
                                                  ? 'font-bold text-ds-status-pending-fg'
                                                  : 'text-ds-text-3',
                                            )}
                                          >
                                            {formatDateOnly(unit.batch.expiryDate)}
                                          </span>
                                          {unit.daysLeft !== null &&
                                          unit.daysLeft <= grnNearExpiryDays ? (
                                            <span
                                              className={cn(
                                                'rounded-[5px] px-1.5 py-px text-[10.5px] font-extrabold',
                                                unit.daysLeft < 0
                                                  ? 'bg-ds-status-bad-bg text-ds-status-bad-fg'
                                                  : 'bg-ds-status-pending-bg text-ds-status-pending-fg',
                                              )}
                                            >
                                              {unit.daysLeft < 0
                                                ? 'Expired'
                                                : unit.daysLeft === 0
                                                  ? 'Today'
                                                  : `In ${plural(unit.daysLeft, 'day')}`}
                                            </span>
                                          ) : null}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">
                                        {formatQuantity(unit.received)}
                                      </td>
                                      <td className="py-1.5 pl-3">
                                        {row.units.length > 1 ? (
                                          <input
                                            aria-invalid={unit.error ? true : undefined}
                                            aria-label={`Accepted quantity for ${row.line.item.itemName} batch ${unit.batch.batchNumber}`}
                                            className={cn(
                                              acceptedInputClass,
                                              'h-8',
                                              unit.error
                                                ? 'border-ds-status-bad-fg'
                                                : 'border-ds-input',
                                            )}
                                            disabled={!canSave || isBusy}
                                            id={`grn-accepted-${unit.key}`}
                                            inputMode="decimal"
                                            max={unit.received}
                                            min="0"
                                            onChange={(event) =>
                                              setAccepted((current) => ({
                                                ...current,
                                                [unit.key]: event.target.value,
                                              }))
                                            }
                                            step="any"
                                            type="number"
                                            value={unit.raw}
                                          />
                                        ) : (
                                          <span className="font-bold tabular-nums">
                                            {formatQuantity(unit.acceptedQty)}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ) : null,
                                )}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-end gap-6 bg-ds-subtle px-[18px] py-3 text-[12.5px] text-ds-muted">
            <span>
              Accepted{' '}
              <strong className="tabular-nums text-ds-status-ok-fg">
                {formatQuantity(totalAccepted)}
              </strong>
            </span>
            <span>
              Rejected{' '}
              <strong className="tabular-nums text-ds-status-bad-fg">
                {formatQuantity(totalRejected)}
              </strong>
            </span>
          </div>
        </Panel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Panel
            aria-labelledby="grn-receipt"
            className="flex flex-col gap-2.5 px-[18px] py-4"
            role="region"
          >
            <h2 className="text-[15px] font-extrabold text-ds-text" id="grn-receipt">
              Receipt details
            </h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
              {[
                [
                  'Store',
                  `${grn.store.storeName} · ${grn.hospital.hospitalName}`,
                  locationHref('STORE', grn.store.storeCode || grn.store.storeName),
                ],
                ['Vendor', grn.vendorName || '—'],
                ['PO number', grn.poNumber || '—'],
                ['Invoice', grn.invoiceNumber || '—'],
                ['Received', formatDate(grn.receivedDate)],
                ['Received by', grn.receivedBy],
              ].map(([label, value, href]) => (
                <Fragment key={label}>
                  <dt className="text-ds-muted">{label}</dt>
                  <dd className="truncate font-bold text-ds-text" title={value ?? undefined}>
                    <RecordLink href={href}>{value}</RecordLink>
                  </dd>
                </Fragment>
              ))}
            </dl>
          </Panel>

          {isEditable ? (
            <Panel
              aria-labelledby="grn-checks"
              className="flex flex-col gap-2 px-[18px] py-4"
              role="region"
            >
              <h2 className="mb-1 text-[15px] font-extrabold text-ds-text" id="grn-checks">
                Before you post
              </h2>
              {grnChecks.map((check) => (
                <label
                  className="flex min-h-9 cursor-pointer items-start gap-2.5 text-[13px] text-ds-text-2"
                  key={check.key}
                >
                  <input
                    checked={Boolean(checks[check.key])}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ds-primary"
                    onChange={() =>
                      setChecks((current) => ({ ...current, [check.key]: !current[check.key] }))
                    }
                    type="checkbox"
                  />
                  <span>
                    <span className="font-bold text-ds-text">{check.label}</span>
                    <span className="block text-xs text-ds-muted">{check.hint}</span>
                  </span>
                </label>
              ))}
            </Panel>
          ) : null}

          {expiringSoon > 0 ? (
            <div
              aria-label="Expiry warning"
              className="flex gap-2.5 rounded-card bg-ds-status-pending-bg px-4 py-3.5 text-[12.5px] font-semibold text-ds-status-pending-fg"
              role="note"
            >
              <AlertTriangle
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={2}
              />
              {plural(expiringSoon, 'batch', 'batches')} {expiringSoon === 1 ? 'expires' : 'expire'}{' '}
              within {grnNearExpiryDays} days. {expiringSoon === 1 ? 'It’ll' : 'They’ll'} be picked
              first for transfers (FEFO).
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setConfirming(null)} type="button" variant="outline">
              Go back
            </Button>
            {confirming === 'reject' ? (
              <Button
                className="bg-ds-status-bad-fg hover:bg-ds-status-bad-fg/90"
                disabled={rejectMutation.isPending}
                onClick={() => {
                  setConfirming(null);
                  rejectMutation.mutate();
                }}
                type="button"
              >
                Reject GRN
              </Button>
            ) : (
              <Button disabled={saveMutation.isPending} onClick={() => save(true)} type="button">
                Post anyway
              </Button>
            )}
          </div>
        }
        onClose={() => setConfirming(null)}
        open={confirming !== null}
        title={confirming === 'reject' ? `Reject ${grn.grnNumber}?` : 'Post with checks unticked?'}
      >
        {confirming === 'reject' ? (
          <p className="text-sm text-ds-text-2">
            Nothing from this GRN is added to stock, and it can no longer be edited.
          </p>
        ) : (
          <div className="space-y-2 text-sm text-ds-text-2">
            <p>These checks are not ticked yet:</p>
            <ul className="list-disc space-y-1 pl-5">
              {uncheckedChecks.map((check) => (
                <li key={check.key}>{check.label}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </section>
  );
}

export function GrnsPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // ?id= opens that GRN for verification.
  const selectedGrnId = searchParams.get('id');
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
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
    queryKey: ['grns', page, search, hospitalFilter, storeFilter, statusFilter, sortOrder],
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

export function CreateGrnPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
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
      const href = recordHref('/inventory/grns', { id: response.data.id });
      invalidateGrnQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.grnNumber}` },
        description: response.data.grnNumber,
        title: 'Draft GRN saved',
        variant: 'success',
      });

      // Verify and post from the GRN itself; without GRN_VIEW, stay here with the result below.
      if (canOpenPath(href, hasPermission)) {
        router.push(href);
      } else {
        setCreatedGrn(response.data);
      }
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
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild variant="outline">
            <Link href="/inventory/grns">Back to GRNs</Link>
          </Button>
        }
        subtitle="Create a manual goods receipt note for mapped MRP items."
        title="Create GRN"
      />

      {createdGrn ? (
        <Panel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className="text-sm font-semibold text-ds-muted">Generated GRN</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xl font-semibold text-ds-text">{createdGrn.grnNumber}</p>
              <StatusChip status={createdGrn.status} />
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

      <Panel className="p-4">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">GRN Header</h2>
            <p className="text-sm text-ds-muted">
              Select the location and store before adding item batches.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
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

          <div className="rounded-lg border bg-ds-subtle/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-ds-text">GRN Lines</h2>
                <p className="text-sm text-ds-muted">
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
              <div className="mt-4 rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg p-3 text-sm font-medium text-ds-status-pending-fg">
                Select a location and store before adding GRN lines.
              </div>
            ) : null}

            {selectedStoreId && itemOptions.length === 0 && !mappedItemsQuery.isLoading ? (
              <div className="mt-4 rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg p-3 text-sm font-medium text-ds-status-pending-fg">
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
                      <div className="rounded-md border bg-ds-subtle p-3 text-sm">
                        <p className="text-ds-muted">Received</p>
                        <p className="font-semibold text-ds-text">{totals.received.toFixed(3)}</p>
                      </div>
                      <div className="rounded-md border bg-ds-subtle p-3 text-sm">
                        <p className="text-ds-muted">Accepted</p>
                        <p className="font-semibold text-ds-text">{totals.accepted.toFixed(3)}</p>
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
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
                        <p className="text-sm font-semibold text-ds-text-2">
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
                          className="grid gap-3 rounded-md border bg-ds-subtle p-3 min-[1400px]:grid-cols-[1fr_150px_150px_130px_130px_130px_1fr_auto]"
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
                            <p className="text-xs text-ds-muted">Rejected</p>
                            <p className="font-semibold text-ds-text">
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
                            className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
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
            <div className="rounded-md border border-ds-status-bad-fg/25 bg-ds-status-bad-bg p-3 text-sm font-medium text-ds-status-bad-fg">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/inventory/grns">Close</Link>
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
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useUrlParam<'' | StockBalanceStatus>('view', '', [
    'AVAILABLE',
    'NEAR_EXPIRY',
    'EXPIRED',
    'LOW_STOCK',
    'OUT_OF_STOCK',
  ]);
  const [sortBy, setSortBy] = useState('lastUpdatedOn');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(hospitalFilter);
  const itemOptionsQuery = useItems(itemTypeFilter || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setStoreFilter('');
    setPage(1);
  });

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
    <section className="space-y-5">
      <PageHeader
        subtitle="Current store stock summarized by store and item, with batch details on expand."
        title="Store Stock"
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
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[6%] px-4 py-2.5">View</th>
                <th className="w-[18%] px-4 py-2.5">Store</th>
                <th className="w-[20%] px-4 py-2.5">Item</th>
                <th className="w-[14%] px-4 py-2.5">Category</th>
                <th className="w-[12%] px-4 py-2.5">Total Available</th>
                <th className="w-[12%] px-4 py-2.5">Reserved Qty</th>
                <th className="w-[10%] px-4 py-2.5">Batches</th>
                <th className="w-[14%] px-4 py-2.5">Nearest Expiry</th>
                <th className="w-[12%] px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((summary: StoreStockSummary) => {
                  const rowKey = `${summary.storeId}:${summary.itemId}`;
                  const isExpanded = expandedRows.includes(rowKey);

                  return (
                    <Fragment key={rowKey}>
                      <tr className="hover:bg-ds-subtle">
                        <td className="px-4 py-3">
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
                        <td className="px-4 py-3">
                          <RecordLink
                            className="block font-medium text-ds-text"
                            href={locationHref('STORE', summary.storeCode || summary.storeName)}
                          >
                            {summary.storeName}
                          </RecordLink>
                          <p className="text-xs text-ds-muted">{summary.storeCode ?? '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <RecordLink
                            className="block font-medium text-ds-text"
                            href={recordHref('/masters/items', { id: summary.itemId })}
                          >
                            {summary.itemName}
                          </RecordLink>
                          <p className="text-xs text-ds-muted">{summary.itemCode}</p>
                        </td>
                        <td className="px-4 py-3 text-ds-text-3">{summary.categoryName ?? '-'}</td>
                        <td className="px-4 py-3">
                          <p className="text-lg font-semibold text-ds-text">
                            {formatQuantity(summary.totalAvailableQty)}
                          </p>
                          <p className="text-xs text-ds-muted">{formatEnum(summary.itemType)}</p>
                        </td>
                        <td className="px-4 py-3 text-ds-text-3">
                          {formatQuantity(summary.totalReservedQty)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                            {summary.batchCount}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                          {formatDateOnly(summary.nearestExpiryDate)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip status={summary.status} />
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${rowKey}:batches`} className="bg-ds-subtle/70">
                          <td className="px-4 py-3" colSpan={9}>
                            <div className="rounded-lg border bg-white p-3 shadow-xs">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-ds-text">
                                    Batch-wise stock
                                  </p>
                                  <p className="text-xs text-ds-muted">
                                    Internal stock remains batch-wise for GRN and transfers.
                                  </p>
                                </div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-ds-divider text-sm">
                                  <thead className="text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
                                    <tr>
                                      <th className="px-3 py-2">Batch Number</th>
                                      <th className="px-3 py-2">Expiry Date</th>
                                      <th className="px-3 py-2">Available Qty</th>
                                      <th className="px-3 py-2">Reserved Qty</th>
                                      <th className="px-3 py-2">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-ds-divider">
                                    {summary.batches.map((batch: StoreStockBatchSummary) => (
                                      <tr key={batch.stockBalanceId}>
                                        <td className="px-3 py-3 font-medium text-ds-text">
                                          {batch.batchNumber ?? '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3 text-ds-text-3">
                                          {formatDateOnly(batch.expiryDate)}
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-ds-text">
                                          {formatQuantity(batch.availableQty)}
                                        </td>
                                        <td className="px-3 py-3 text-ds-text-3">
                                          {formatQuantity(batch.reservedQty)}
                                        </td>
                                        <td className="px-3 py-3">
                                          <StatusChip status={batch.status} />
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

const transferHeaderSchema = z.object({
  businessDate: z.string().trim(),
  hospitalId: z.string().uuid('Select a hospital.'),
  remarks: z.string().trim(),
  restaurantId: z.string().uuid('Select a restaurant.'),
  sourceId: z.string().uuid('Select a source.'),
  sourceType: z.enum(['STORE', 'KITCHEN']),
  transferDate: z.string().trim().min(1, 'Transfer date is required.'),
});

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

const clockFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
});
const shortDayFormatter = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/** "25m", "1h 05m" or "3d" since the given time. */
function formatAgeSince(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  return hours < 24
    ? `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
    : `${Math.floor(hours / 24)}d`;
}

/** "Today 11:45", "Yesterday 18:20" or "22 Sept, 12:26". */
function formatWhen(value: string): string {
  const date = new Date(value);
  const startOf = (day: Date) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const daysAgo = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  const time = clockFormatter.format(date);

  return daysAgo === 0
    ? `Today ${time}`
    : daysAgo === 1
      ? `Yesterday ${time}`
      : `${shortDayFormatter.format(date)}, ${time}`;
}

function longStatus(status: string): string {
  const presentation = statusPresentation(status);

  return presentation.long ?? presentation.label;
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

/** Expiry within this many days is flagged on lines still in transit. */
const expiryWarningDays = 3;

function TransferDetails({
  destinationHref,
  destinationName,
  sourceHref,
  sourceName,
  transfer,
}: Readonly<{
  destinationHref: string | null;
  destinationName: string;
  sourceHref: string | null;
  sourceName: string;
  transfer: Transfer;
}>) {
  const { status } = transfer;
  const outcome = transferOutcome(transfer);
  const isReceived = status === 'ACKNOWLEDGED';
  const warnBefore = Date.now() + expiryWarningDays * 86_400_000;
  const steps: StepItem[] = [
    { detail: formatWhen(transfer.createdAt), label: 'Created', state: 'done' },
    {
      detail:
        status === 'DRAFT'
          ? 'Not yet dispatched'
          : status === 'CANCELLED'
            ? undefined
            : `${transfer.sourceType === 'KITCHEN' ? 'Kitchen' : 'Store'} stock reserved at source`,
      label: 'Dispatched for acknowledgement',
      state: status === 'PENDING_ACKNOWLEDGEMENT' || isReceived ? 'done' : 'todo',
    },
    status === 'CANCELLED'
      ? {
          detail: [formatWhen(transfer.updatedAt), transfer.remarks].filter(Boolean).join(' · '),
          label: 'Cancelled',
          state: 'stopped',
        }
      : outcome
        ? {
            detail: `${formatWhen(transfer.updatedAt)} · ${
              outcome === 'REJECTED_FULL'
                ? 'Stock returned to source'
                : `Stock moved to ${destinationName}`
            }`,
            label: `${longStatus(outcome)} by restaurant`,
            state: outcome === 'REJECTED_FULL' ? 'stopped' : 'done',
          }
        : {
            detail: status === 'PENDING_ACKNOWLEDGEMENT' ? 'Waiting on the restaurant' : undefined,
            label: `Acknowledgement by ${destinationName}`,
            state: status === 'PENDING_ACKNOWLEDGEMENT' ? 'current' : 'todo',
          },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 border-b border-ds-divider px-[18px] py-3.5">
        {[
          { href: sourceHref, label: 'From', name: sourceName, type: transfer.sourceType },
          {
            href: destinationHref,
            label: 'To',
            name: destinationName,
            type: transfer.destinationType,
          },
        ].map((end) => (
          <div
            className="flex min-w-0 flex-col gap-1 rounded-xl bg-ds-subtle px-3 py-2.5"
            key={end.label}
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ds-muted">
              {end.label} · {end.type}
            </span>
            <RecordLink className="truncate text-[13px] font-bold text-ds-text" href={end.href}>
              {end.name}
            </RecordLink>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <span className="text-[11.5px] text-ds-muted">Business date</span>
          <span className="text-[13px] font-semibold text-ds-text">
            {formatDateOnly(transfer.businessDate)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11.5px] text-ds-muted">Remarks</span>
          <span
            className="truncate text-[13px] font-semibold text-ds-text"
            title={transfer.remarks ?? undefined}
          >
            {transfer.remarks || '—'}
          </span>
        </div>
      </div>

      <div className="px-[18px] pb-1.5 pt-3">
        <h3 className="mb-1.5 text-[13px] font-extrabold text-ds-text">
          Lines · {transfer.lines.length}
        </h3>
        <table className="w-full table-fixed text-[12.5px]">
          <thead>
            <tr className="border-b border-ds-divider text-[11.5px] font-semibold text-ds-muted">
              <th className="py-1.5 text-left font-semibold">Item · batch</th>
              <th className="w-16 py-1.5 pl-2 text-right font-semibold">Sent</th>
              <th className="w-rail py-1.5 pl-2 text-right font-semibold">Accepted</th>
              <th className="w-rail py-1.5 pl-2 text-right font-semibold">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((line) => {
              const expiresSoon =
                !isReceived &&
                line.expiryDate !== null &&
                new Date(line.expiryDate).getTime() <= warnBefore;

              return (
                <tr className="border-b border-ds-divider align-top" key={line.id}>
                  <td className="py-2 pr-2">
                    <RecordLink
                      className="block truncate font-bold text-ds-text"
                      href={recordHref('/masters/items', { id: line.item.id })}
                    >
                      {line.item.itemName}
                    </RecordLink>
                    {line.batchNumber || line.expiryDate ? (
                      <span
                        className={cn(
                          'block truncate text-[11.5px]',
                          expiresSoon ? 'font-semibold text-ds-status-bad-fg' : 'text-ds-muted',
                        )}
                      >
                        {[
                          line.batchNumber,
                          line.expiryDate ? `exp ${formatDateOnly(line.expiryDate)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                    {line.rejectedQty > 0 && line.rejectionReason ? (
                      <span className="block truncate text-[11.5px] text-ds-status-bad-fg">
                        {line.rejectionReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-right font-bold text-ds-text">
                    {formatQuantity(line.sentQty)}
                  </td>
                  <td
                    className={cn(
                      'py-2 text-right',
                      isReceived ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                    )}
                  >
                    {isReceived ? formatQuantity(line.acceptedQty) : '—'}
                  </td>
                  <td
                    className={cn(
                      'py-2 text-right',
                      isReceived && line.rejectedQty > 0
                        ? 'font-extrabold text-ds-status-bad-fg'
                        : 'text-ds-muted',
                    )}
                  >
                    {isReceived ? formatQuantity(line.rejectedQty) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-[18px] pb-1 pt-3">
        <h3 className="mb-2.5 text-[13px] font-extrabold text-ds-text">Timeline</h3>
        <Timeline label="Transfer timeline" steps={steps} />
      </div>
    </>
  );
}

export function TransfersPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { hasPermission } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Filters, view, page and the open record live in the URL so refresh, links and back work.
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
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
    queryKey: ['transfers', page, ...filterKey, statusFilter, sortOrder],
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
    queryKey: ['transfers', 'view-counts', ...filterKey],
  });

  const transfers = transfersQuery.data?.items ?? [];
  const meta = transfersQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const listedTransfer = transfers.find((transfer) => transfer.id === selectedTransferId);
  // A linked transfer that is not on this page (another page, other filters) is fetched alone.
  const linkedTransferQuery = useQuery({
    enabled: Boolean(selectedTransferId) && !listedTransfer && !transfersQuery.isLoading,
    queryFn: async () => (await organizationApi.getTransfer(selectedTransferId ?? '')).data,
    queryKey: ['transfers', 'detail', selectedTransferId],
    retry: false,
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
                    <Link href={`/inventory/transfers/${selectedTransfer.id}/acknowledge`}>
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

/** Unsent work on a new transfer, kept in this browser until it is saved or submitted. */
interface LocalTransferDraft {
  header: TransferHeaderFormValues;
  lines: TransferLineDraft[];
  savedAt: string;
}

const localTransferDraftKey = 'aahar-new-transfer-draft';
/** Near-expiry batches (store stock) are flagged on the line, as they go first under FEFO. */
const fefoWarningDays = 3;

function readLocalTransferDraft(): LocalTransferDraft | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(localTransferDraftKey) ?? 'null',
    ) as LocalTransferDraft | null;

    return parsed?.header && Array.isArray(parsed.lines) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalTransferDraft(draft: LocalTransferDraft | null): void {
  try {
    if (draft) {
      window.localStorage.setItem(localTransferDraftKey, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(localTransferDraftKey);
    }
  } catch {
    // Storage blocked or full: the form still works, it just isn't remembered.
  }
}

function daysFromToday(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

function StepHeading({
  id,
  number,
  children,
}: Readonly<{ children: ReactNode; id: string; number: number }>) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-ds-primary-soft text-xs font-extrabold text-ds-link">
        {number}
      </span>
      <h2 className="text-[15px] font-extrabold text-ds-text" id={id}>
        {children}
      </h2>
    </div>
  );
}

export function CreateTransferPageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [lines, setLines] = useState<TransferLineDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [batchPickerLineId, setBatchPickerLineId] = useState<string | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [isItemListOpen, setIsItemListOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(null);
  const hasRestoredDraft = useRef(false);
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
  const header = form.watch();
  const selectedHospitalId = header.hospitalId;
  const selectedSourceId = header.sourceId;
  const selectedSourceType = header.sourceType;
  const selectedBusinessDate = header.businessDate;
  const selectedRestaurantId = header.restaurantId;
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(selectedHospitalId);
  const kitchensQuery = useKitchens(selectedHospitalId);
  const restaurantsQuery = useRestaurants(selectedHospitalId);
  const stockQuery = useSourceStock(selectedSourceType, selectedSourceId, selectedBusinessDate);
  const stockOptions = useMemo(() => stockQuery.data ?? [], [stockQuery.data]);
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
  const sourceName =
    (selectedSourceType === 'KITCHEN'
      ? kitchensQuery.data?.find((kitchen) => kitchen.id === selectedSourceId)?.kitchenName
      : storesQuery.data?.find((store) => store.id === selectedSourceId)?.storeName) ?? null;
  const restaurantName =
    restaurantsQuery.data?.find((restaurant) => restaurant.id === selectedRestaurantId)
      ?.restaurantName ?? null;

  // Items recently sent to this restaurant, offered as one-tap chips.
  const recentToRestaurantQuery = useQuery({
    enabled: Boolean(selectedRestaurantId),
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          destinationId: selectedRestaurantId,
          destinationType: 'RESTAURANT',
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data.items,
    queryKey: ['transfers', 'recent-to-restaurant', selectedRestaurantId],
  });

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('sourceId', '', { shouldValidate: true });
      form.setValue('restaurantId', '', { shouldValidate: true });
      setLines([]);
    }
  }, [form, scopedHospitalId]);

  // Bring back unsent work from this browser (once, after the location is applied).
  useEffect(() => {
    if (hasRestoredDraft.current) {
      return;
    }

    hasRestoredDraft.current = true;
    const saved = readLocalTransferDraft();

    if (!saved || (scopedHospitalId && saved.header.hospitalId !== scopedHospitalId)) {
      return;
    }

    form.reset(saved.header);
    setLines(saved.lines);
    setLocalSavedAt(saved.savedAt);
  }, [form, scopedHospitalId]);

  // Autosave to this browser a moment after each change.
  const headerKey = JSON.stringify(header);

  useEffect(() => {
    if (!hasRestoredDraft.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const values = form.getValues();

      if (!values.sourceId && !values.restaurantId && lines.length === 0) {
        return;
      }

      const savedAt = new Date().toISOString();
      writeLocalTransferDraft({ header: values, lines, savedAt });
      setLocalSavedAt(savedAt);
    }, 800);

    return () => window.clearTimeout(timer);
  }, [form, headerKey, lines]);

  const saveMutation = useMutation({
    mutationFn: async ({ dispatch, payload }: { dispatch: boolean; payload: TransferInput }) => {
      const created = (await organizationApi.createTransfer(payload)).data;

      if (!dispatch) {
        return { dispatchError: null, transfer: created };
      }

      try {
        return {
          dispatchError: null,
          transfer: (await organizationApi.dispatchTransfer(created.id)).data,
        };
      } catch (error) {
        // The draft exists; say why it was not sent and open it so it can be dispatched there.
        return { dispatchError: error, transfer: created };
      }
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Transfer was not saved',
        variant: 'error',
      });
    },
    onSuccess({ dispatchError, transfer }) {
      const href = recordHref('/inventory/transfers', { id: transfer.id });
      invalidateTransferQueries(queryClient);
      writeLocalTransferDraft(null);

      if (dispatchError) {
        showToast({
          action: { href, label: `View ${transfer.transferNumber}` },
          description: `${transfer.transferNumber} is saved as a draft. ${getApiErrorMessage(dispatchError)}`,
          title: 'Saved, but not submitted',
          variant: 'error',
        });
      } else {
        showToast({
          action: { href, label: `View ${transfer.transferNumber}` },
          description: transfer.transferNumber,
          title: transfer.status === 'DRAFT' ? 'Draft saved' : 'Submitted for acknowledgement',
          variant: 'success',
        });
      }

      router.push(href);
    },
  });

  function resetLines() {
    setLines([]);
    setBatchPickerLineId(null);
    setHasTriedSubmit(false);
    setFormError('');
  }

  function addItem(groupKey: string) {
    const existing = lines.find((line) => line.itemId === groupKey);
    const lineId = existing?.clientId ?? clientId('transfer-line');

    if (!existing) {
      setLines((current) => [
        ...current,
        { clientId: lineId, itemId: groupKey, remarks: '', sentQty: '', stockBalanceId: '' },
      ]);
    }

    setItemQuery('');
    setIsItemListOpen(false);
    window.requestAnimationFrame(() => document.getElementById(`transfer-qty-${lineId}`)?.focus());
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((line) => line.clientId !== id));
  }

  function updateLine(id: string, patch: Partial<TransferLineDraft>) {
    setLines((current) =>
      current.map((line) => (line.clientId === id ? { ...line, ...patch } : line)),
    );
  }

  // Live check of every line against what the source holds right now.
  const remainingPreview = new Map(
    stockOptions.map((stock) => [stock.id, stock.availableQty] as const),
  );
  const lineChecks = new Map(
    [...lines]
      // Lines pinned to a batch take their stock first; FEFO lines share what is left.
      .sort(
        (left, right) =>
          Number(Boolean(right.stockBalanceId)) - Number(Boolean(left.stockBalanceId)),
      )
      .map((line) => {
        const group = stockGroupMap.get(line.itemId);
        const qty = Number(line.sentQty || 0);
        const pinned = line.stockBalanceId ? stockMap.get(line.stockBalanceId) : undefined;
        const available = pinned
          ? (remainingPreview.get(pinned.id) ?? 0)
          : (group?.stocks ?? []).reduce(
              (total, stock) => total + (remainingPreview.get(stock.id) ?? 0),
              0,
            );
        const allocations = pinned
          ? [{ allocatedQty: Math.min(qty, available), stock: pinned }]
          : group
            ? allocateFefo(group.stocks, qty > 0 ? qty : 0, selectedSourceType, remainingPreview)
            : [];

        if (pinned) {
          remainingPreview.set(
            pinned.id,
            Number((available - Math.min(qty, available)).toFixed(3)),
          );
        }

        const error = !group
          ? 'This item has no stock at the selected source any more.'
          : !Number.isFinite(qty) || qty <= 0
            ? hasTriedSubmit || line.sentQty !== ''
              ? 'Enter a quantity greater than 0.'
              : null
            : qty > available + 0.0005
              ? `Only ${formatQuantity(available)} available${pinned ? ' in this batch' : ''}. Reduce the quantity${
                  pinned ? ' or switch back to FEFO' : ''
                }.`
              : null;
        const firstStock = allocations[0]?.stock ?? pinned ?? group?.stocks[0];

        return [
          line.clientId,
          {
            allocations,
            available: Number(available.toFixed(3)),
            error,
            firstStock,
            group,
            isValid: Boolean(group) && qty > 0 && qty <= available + 0.0005,
            pinned,
          },
        ] as const;
      }),
  );
  const invalidLineCount = lines.filter((line) => !lineChecks.get(line.clientId)?.isValid).length;
  const batchCount = [...lineChecks.values()].reduce(
    (total, check) => total + check.allocations.length,
    0,
  );
  const canSubmit =
    lines.length > 0 && invalidLineCount === 0 && Boolean(selectedSourceId && selectedRestaurantId);

  const normalizedItemQuery = itemQuery.trim().toLowerCase();
  const itemMatches = stockGroups
    .filter(
      (group) =>
        !normalizedItemQuery ||
        group.itemName.toLowerCase().includes(normalizedItemQuery) ||
        group.itemCode.toLowerCase().includes(normalizedItemQuery),
    )
    .slice(0, 8);
  const addedKeys = new Set(lines.map((line) => line.itemId));
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();

    (recentToRestaurantQuery.data ?? []).forEach((transfer) =>
      transfer.lines.forEach((line) => counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1)),
    );

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([itemId]) => stockGroups.find((group) => group.itemId === itemId))
      .filter((group): group is TransferItemGroup => Boolean(group))
      .slice(0, 6);
  }, [recentToRestaurantQuery.data, stockGroups]);
  const visibleSuggestions = suggestions.filter((group) => !addedKeys.has(group.key)).slice(0, 4);

  function submit(dispatch: boolean) {
    setFormError('');
    setHasTriedSubmit(true);

    const parsedHeader = transferHeaderSchema.safeParse(form.getValues());

    if (!parsedHeader.success) {
      form.clearErrors();
      parsedHeader.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as keyof TransferHeaderFormValues | undefined;

        if (fieldName) {
          form.setError(fieldName, { message: issue.message });
        }
      });
      setFormError(parsedHeader.error.issues[0]?.message ?? 'Check the route.');
      return;
    }

    form.clearErrors();

    if (lines.length === 0) {
      setFormError('Add at least one item.');
      return;
    }

    const remainingByStockId = new Map(
      stockOptions.map((stock) => [stock.id, stock.availableQty] as const),
    );
    const preparedLines: PreparedTransferLine[] = [];
    // Lines pinned to a batch first, then FEFO from what is left.
    const ordered = [...lines].sort(
      (left, right) => Number(Boolean(right.stockBalanceId)) - Number(Boolean(left.stockBalanceId)),
    );

    for (const line of ordered) {
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

      if (line.stockBalanceId) {
        const stock = stockMap.get(line.stockBalanceId);
        const remaining = stock ? (remainingByStockId.get(stock.id) ?? 0) : 0;

        if (!stock || sentQty > remaining + 0.0005) {
          setFormError(
            `Available quantity in the chosen ${group.itemName} batch is ${formatQuantity(remaining)}.`,
          );
          return;
        }

        remainingByStockId.set(stock.id, Number((remaining - sentQty).toFixed(3)));
        preparedLines.push({ remarks: optionalValue(line.remarks), sentQty, stock });
        continue;
      }

      const allocations = allocateFefo(
        group.stocks,
        sentQty,
        parsedHeader.data.sourceType,
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

    const totals = new Map<string, number>();

    for (const line of preparedLines) {
      totals.set(line.stock.id, (totals.get(line.stock.id) ?? 0) + line.sentQty);
    }

    for (const [stockId, requestedQty] of totals.entries()) {
      const stock = stockMap.get(stockId);

      if (!stock || requestedQty > stock.availableQty + 0.0005) {
        setFormError('Transfer quantity cannot exceed available source quantity.');
        return;
      }
    }

    const selectedStocks = preparedLines.map((line) => line.stock);
    const businessDateFilter = optionalValue(parsedHeader.data.businessDate);
    let transferBusinessDate = businessDateFilter;

    if (parsedHeader.data.sourceType === 'KITCHEN') {
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

    saveMutation.mutate({
      dispatch,
      payload: {
        destinationId: parsedHeader.data.restaurantId,
        destinationType: 'RESTAURANT',
        ...(transferBusinessDate ? { businessDate: transferBusinessDate } : {}),
        hospitalId: parsedHeader.data.hospitalId,
        items: preparedLines.map((line) => ({
          batchNumber:
            parsedHeader.data.sourceType === 'STORE' ? (line.stock.batchNumber ?? '') : undefined,
          expiryDate:
            parsedHeader.data.sourceType === 'STORE'
              ? toDateOnlyValue(line.stock.expiryDate)
              : undefined,
          itemId: line.stock.itemId,
          remarks: line.remarks,
          sentQty: line.sentQty,
        })),
        remarks: optionalValue(parsedHeader.data.remarks),
        sourceId: parsedHeader.data.sourceId,
        sourceType: parsedHeader.data.sourceType,
        transferDate: new Date(parsedHeader.data.transferDate).toISOString(),
      },
    });
  }

  // Ctrl/Cmd+S saves a draft and Ctrl/Cmd+Enter submits, from anywhere on the page.
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || saveMutation.isPending) {
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        submitRef.current(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submitRef.current(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [saveMutation.isPending]);

  function discard() {
    writeLocalTransferDraft(null);
    router.push('/inventory/transfers');
  }

  const isBusy = saveMutation.isPending;
  const errors = form.formState.errors;
  const fieldLabel = 'flex flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2';
  const selectClass =
    'h-control w-full rounded-control border border-ds-input bg-ds-surface px-2.5 text-[13.5px] font-semibold text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted';
  const activeItem = itemMatches[Math.min(activeItemIndex, itemMatches.length - 1)];
  const footerNote =
    !selectedSourceId || !selectedRestaurantId
      ? 'Choose where the stock comes from and which restaurant receives it.'
      : lines.length === 0
        ? 'Add at least one item to submit.'
        : invalidLineCount > 0
          ? 'Fix the highlighted lines to submit.'
          : `${plural(lines.length, 'line')} ready · ${restaurantName ?? 'the restaurant'} is asked to acknowledge on submit.`;

  return (
    <section className="flex min-h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            className="inline-flex min-h-6 items-center gap-1 self-start rounded-sm text-[12.5px] font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
            href="/inventory/transfers"
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            Transfers
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">
              New transfer
            </h1>
            <StatusChip label="Draft" status="DRAFT" />
          </div>
        </div>
        {localSavedAt ? (
          <span
            aria-live="polite"
            className="flex items-center gap-1.5 text-[12.5px] text-ds-muted"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5 text-ds-teal-text" strokeWidth={2} />
            Draft kept on this device · {formatWhen(localSavedAt).replace('Today ', '')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
          <Panel
            aria-labelledby="transfer-route"
            className="flex flex-col gap-3.5 p-[18px]"
            role="region"
          >
            <StepHeading id="transfer-route" number={1}>
              Route
            </StepHeading>
            {!isLocationSelectorLocked ? (
              <label className={fieldLabel}>
                Location
                <select
                  className={selectClass}
                  disabled={isBusy}
                  onChange={(event) => {
                    form.setValue('hospitalId', event.target.value, {
                      shouldValidate: hasTriedSubmit,
                    });
                    form.setValue('sourceId', '');
                    form.setValue('restaurantId', '');
                    resetLines();
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
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
              <fieldset className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-ds-border p-3.5">
                <legend className="px-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ds-muted">
                  From
                </legend>
                <SegmentedControl<'KITCHEN' | 'STORE'>
                  className="flex w-full"
                  label="Source type"
                  onChange={(value) => {
                    form.setValue('sourceType', value);
                    form.setValue('sourceId', '');
                    resetLines();
                  }}
                  options={[
                    { label: 'Store', value: 'STORE' },
                    { label: 'Kitchen', value: 'KITCHEN' },
                  ]}
                  value={selectedSourceType === 'KITCHEN' ? 'KITCHEN' : 'STORE'}
                />
                <label className={fieldLabel}>
                  {selectedSourceType === 'KITCHEN' ? 'Kitchen' : 'Store'}
                  <select
                    className={selectClass}
                    disabled={!selectedHospitalId || isBusy}
                    onChange={(event) => {
                      form.setValue('sourceId', event.target.value, {
                        shouldValidate: hasTriedSubmit,
                      });
                      resetLines();
                    }}
                    value={selectedSourceId}
                  >
                    <option value="">
                      {selectedHospitalId
                        ? `Select ${selectedSourceType === 'KITCHEN' ? 'kitchen' : 'store'}`
                        : 'Choose a location first'}
                    </option>
                    {selectedSourceType === 'KITCHEN'
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
                  </select>
                  {errors.sourceId ? <FieldError>{errors.sourceId.message}</FieldError> : null}
                </label>
              </fieldset>
              <fieldset className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-ds-border p-3.5">
                <legend className="px-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ds-muted">
                  To
                </legend>
                <SegmentedControl<'COUNTER' | 'RESTAURANT'>
                  className="flex w-full"
                  label="Destination type"
                  onChange={() => undefined}
                  options={[
                    { label: 'Restaurant', value: 'RESTAURANT' },
                    // TODO(api): the backend accepts restaurant destinations only.
                    {
                      disabled: true,
                      label: 'Counter',
                      title: 'Counters cannot receive transfers yet',
                      value: 'COUNTER',
                    },
                  ]}
                  value="RESTAURANT"
                />
                <label className={fieldLabel}>
                  Restaurant
                  <select
                    className={selectClass}
                    disabled={!selectedHospitalId || isBusy}
                    onChange={(event) =>
                      form.setValue('restaurantId', event.target.value, {
                        shouldValidate: hasTriedSubmit,
                      })
                    }
                    value={selectedRestaurantId}
                  >
                    <option value="">
                      {selectedHospitalId ? 'Select restaurant' : 'Choose a location first'}
                    </option>
                    {(restaurantsQuery.data ?? []).map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.restaurantName}
                      </option>
                    ))}
                  </select>
                  {errors.restaurantId ? (
                    <FieldError>{errors.restaurantId.message}</FieldError>
                  ) : null}
                </label>
              </fieldset>
            </div>
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
              <label className={fieldLabel}>
                Transfer date &amp; time
                <Input disabled={isBusy} type="datetime-local" {...form.register('transferDate')} />
                {errors.transferDate ? (
                  <FieldError>{errors.transferDate.message}</FieldError>
                ) : null}
              </label>
              <label className={fieldLabel}>
                Business date
                <Input
                  disabled={isBusy}
                  type="date"
                  {...form.register('businessDate', {
                    // Kitchen stock is listed per business date, so lines no longer match.
                    onChange: () => selectedSourceType === 'KITCHEN' && resetLines(),
                  })}
                />
                <span className="text-[11.5px] font-medium text-ds-muted">
                  {selectedSourceType === 'KITCHEN'
                    ? 'Shows kitchen stock from this date only.'
                    : 'Optional for store stock.'}
                </span>
              </label>
            </div>
          </Panel>

          <Panel aria-labelledby="transfer-items" className="overflow-hidden" role="region">
            <div className="flex flex-col gap-3 px-[18px] pb-3 pt-[18px]">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StepHeading id="transfer-items" number={2}>
                  Items
                </StepHeading>
                <span className="text-[12.5px] text-ds-muted">
                  {selectedSourceType === 'KITCHEN'
                    ? 'Ready-made kitchen stock, oldest business date first'
                    : 'Batches are picked first-expiry-first-out (FEFO)'}
                </span>
              </div>
              <div className="relative">
                <label
                  className={cn(
                    'flex h-11 items-center gap-2.5 rounded-control border-[1.5px] bg-ds-surface px-3 text-ds-muted',
                    selectedSourceId ? 'border-ds-link' : 'border-ds-input opacity-70',
                  )}
                >
                  <Search aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <input
                    aria-activedescendant={
                      isItemListOpen && activeItem ? `transfer-item-${activeItem.key}` : undefined
                    }
                    aria-autocomplete="list"
                    aria-controls="transfer-item-options"
                    aria-expanded={isItemListOpen && itemMatches.length > 0}
                    aria-label="Add an item"
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ds-text outline-hidden placeholder:text-ds-muted focus-visible:outline-hidden"
                    disabled={!selectedSourceId || isBusy}
                    onBlur={() => window.setTimeout(() => setIsItemListOpen(false), 120)}
                    onChange={(event) => {
                      setItemQuery(event.target.value);
                      setActiveItemIndex(0);
                      setIsItemListOpen(true);
                    }}
                    onFocus={() => setIsItemListOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setIsItemListOpen(true);
                        const count = itemMatches.length;

                        if (count) {
                          setActiveItemIndex(
                            (current) =>
                              (Math.min(current, count - 1) +
                                (event.key === 'ArrowDown' ? 1 : -1) +
                                count) %
                              count,
                          );
                        }
                      } else if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey)) {
                        event.preventDefault();

                        if (activeItem) {
                          addItem(activeItem.key);
                        }
                      } else if (event.key === 'Escape') {
                        setIsItemListOpen(false);
                      }
                    }}
                    placeholder={
                      selectedSourceId
                        ? `Add an item by name or code — only items in stock at this ${selectedSourceType === 'KITCHEN' ? 'kitchen' : 'store'}`
                        : 'Choose the source first'
                    }
                    role="combobox"
                    type="text"
                    value={itemQuery}
                  />
                  <KeyboardHint className="hidden sm:inline-flex" keys={['Enter to add']} />
                </label>
                {isItemListOpen && selectedSourceId ? (
                  <ul
                    aria-label="Matching items"
                    className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-control border border-ds-border bg-ds-surface p-1 shadow-xl shadow-ds-text/10"
                    id="transfer-item-options"
                    role="listbox"
                  >
                    {stockQuery.isLoading ? (
                      <li className="px-3 py-2 text-[13px] text-ds-muted">Loading stock…</li>
                    ) : itemMatches.length === 0 ? (
                      <li className="px-3 py-2 text-[13px] text-ds-muted">
                        {stockGroups.length === 0
                          ? selectedSourceType === 'KITCHEN'
                            ? 'No ready-made stock at this kitchen for the chosen date.'
                            : 'No MRP stock at this store.'
                          : `No item matches “${itemQuery.trim()}”.`}
                      </li>
                    ) : (
                      itemMatches.map((group) => (
                        <li
                          aria-selected={group === activeItem}
                          className={cn(
                            'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2',
                            group === activeItem && 'bg-ds-selected',
                          )}
                          id={`transfer-item-${group.key}`}
                          key={group.key}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            addItem(group.key);
                          }}
                          role="option"
                        >
                          {group.stocks[0] ? (
                            <FoodTypeMarker type={group.stocks[0].item.type} />
                          ) : null}
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-bold text-ds-text">
                              {group.itemName}
                            </span>
                            <span className="truncate text-[11.5px] text-ds-muted">
                              {group.itemCode}
                              {selectedSourceType === 'KITCHEN' && group.businessDate
                                ? ` · produced ${formatDateOnly(group.businessDate)}`
                                : group.nearestExpiryDate
                                  ? ` · next expiry ${formatDateOnly(group.nearestExpiryDate)}`
                                  : ''}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-ds-text-2">
                            {formatQuantity(group.totalAvailableQty)} available
                          </span>
                          {addedKeys.has(group.key) ? (
                            <span className="text-[11px] font-bold text-ds-teal-text">Added</span>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                ) : null}
              </div>
              {visibleSuggestions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-ds-muted">
                    Often sent to this restaurant:
                  </span>
                  {visibleSuggestions.map((group) => (
                    <button
                      className="inline-flex h-[30px] items-center gap-1 rounded-full border border-dashed border-ds-input px-2.5 text-xs font-bold text-ds-text-2 transition hover:border-ds-primary hover:text-ds-link focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                      key={group.key}
                      onClick={() => addItem(group.key)}
                      type="button"
                    >
                      <Plus aria-hidden="true" className="h-3 w-3" strokeWidth={2.2} />
                      {group.itemName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {lines.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] table-fixed text-[13px]">
                  <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                    <tr>
                      <th className="w-10 py-2 pl-[18px] font-semibold">#</th>
                      <th className="px-2 py-2 font-semibold">Item</th>
                      <th className="w-[34%] px-2 py-2 font-semibold">
                        {selectedSourceType === 'KITCHEN' ? 'Produced' : 'Batch'}
                      </th>
                      <th className="w-[88px] px-2 py-2 text-right font-semibold">Available</th>
                      <th className="w-[120px] px-2 py-2 font-semibold">Send qty</th>
                      <th className="w-12 py-2 pr-[18px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const check = lineChecks.get(line.clientId);
                      const group = check?.group;
                      const first = check?.firstStock;
                      const extraBatches = Math.max(0, (check?.allocations.length ?? 0) - 1);
                      const expiresIn =
                        selectedSourceType === 'STORE' ? daysFromToday(first?.expiryDate) : null;
                      const warn =
                        check?.error || expiresIn === null || expiresIn > fefoWarningDays
                          ? null
                          : expiresIn < 0
                            ? `This batch expired on ${formatDateOnly(first?.expiryDate)}. Check it before sending.`
                            : `Expires ${expiresIn === 0 ? 'today' : expiresIn === 1 ? 'tomorrow' : `in ${expiresIn} days`}${
                                check?.pinned ? '' : ' — will be sent first'
                              }.`;
                      const isPicking = batchPickerLineId === line.clientId;

                      return (
                        <Fragment key={line.clientId}>
                          <tr
                            className={cn(
                              'align-middle',
                              check?.error ? 'bg-ds-status-bad-bg/40' : undefined,
                            )}
                          >
                            <td className="py-2.5 pl-[18px] text-[12.5px] tabular-nums text-ds-muted">
                              {index + 1}
                            </td>
                            <td className="px-2 py-2.5">
                              <span className="flex min-w-0 items-center gap-2">
                                {first ? <FoodTypeMarker type={first.item.type} /> : null}
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate text-[13.5px] font-bold text-ds-text">
                                    {group?.itemName ?? 'Unavailable item'}
                                  </span>
                                  <span className="truncate text-[11.5px] text-ds-muted">
                                    {group?.itemCode}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="px-2 py-2.5">
                              {isPicking && group ? (
                                <select
                                  aria-label={`Batch for ${group.itemName}`}
                                  autoFocus
                                  className={cn(selectClass, 'h-9 text-[12.5px]')}
                                  onBlur={() => setBatchPickerLineId(null)}
                                  onChange={(event) => {
                                    updateLine(line.clientId, {
                                      stockBalanceId: event.target.value,
                                    });
                                    setBatchPickerLineId(null);
                                  }}
                                  value={line.stockBalanceId}
                                >
                                  <option value="">FEFO (earliest expiry first)</option>
                                  {group.stocks.map((stock) => (
                                    <option key={stock.id} value={stock.id}>
                                      {[
                                        stock.batchNumber ?? 'No batch',
                                        stock.expiryDate
                                          ? `exp ${formatDateOnly(stock.expiryDate)}`
                                          : null,
                                        `${formatQuantity(stock.availableQty)} available`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={cn(
                                    'flex flex-wrap items-center gap-1.5 text-[12.5px]',
                                    warn ? 'text-ds-status-pending-fg' : 'text-ds-text-3',
                                  )}
                                >
                                  <span className="font-semibold">
                                    {selectedSourceType === 'KITCHEN'
                                      ? formatDateOnly(first?.businessDate)
                                      : [
                                          first?.batchNumber ?? 'No batch',
                                          first?.expiryDate
                                            ? `exp ${formatDateOnly(first.expiryDate)}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                    {extraBatches > 0 ? ` +${extraBatches} more` : ''}
                                  </span>
                                  {selectedSourceType === 'STORE' ? (
                                    <span
                                      className={cn(
                                        'rounded-[5px] px-1.5 py-px text-[10.5px] font-extrabold uppercase tracking-[0.04em]',
                                        check?.pinned
                                          ? 'bg-ds-status-neutral-bg text-ds-status-neutral-fg'
                                          : 'bg-ds-teal-soft text-ds-teal-text',
                                      )}
                                    >
                                      {check?.pinned ? 'Chosen' : 'FEFO'}
                                    </span>
                                  ) : null}
                                  {selectedSourceType === 'STORE' &&
                                  group &&
                                  group.stocks.length > 1 ? (
                                    <button
                                      aria-label={`Change batch for ${group.itemName}`}
                                      className="rounded-sm text-xs font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                                      onClick={() => setBatchPickerLineId(line.clientId)}
                                      type="button"
                                    >
                                      Change
                                    </button>
                                  ) : null}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-ds-text-2">
                              {check ? formatQuantity(check.available) : '—'}
                            </td>
                            <td className="px-2 py-2.5">
                              <Input
                                aria-describedby={
                                  check?.error ? `transfer-error-${line.clientId}` : undefined
                                }
                                aria-invalid={check?.error ? true : undefined}
                                aria-label={`Send quantity for ${group?.itemName ?? 'item'}`}
                                className={cn(
                                  'h-[38px] rounded-control border-[1.5px] font-bold tabular-nums',
                                  check?.error && 'border-ds-status-bad-fg',
                                )}
                                disabled={isBusy}
                                id={`transfer-qty-${line.clientId}`}
                                inputMode="decimal"
                                min="0"
                                onChange={(event) =>
                                  updateLine(line.clientId, { sentQty: event.target.value })
                                }
                                placeholder="0"
                                step="any"
                                type="number"
                                value={line.sentQty}
                              />
                            </td>
                            <td className="py-2.5 pr-[18px]">
                              <button
                                aria-label={`Remove ${group?.itemName ?? 'line'}`}
                                className="grid h-8 w-8 place-items-center rounded-lg text-ds-muted transition hover:bg-ds-status-bad-bg hover:text-ds-status-bad-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                                disabled={isBusy}
                                onClick={() => removeLine(line.clientId)}
                                type="button"
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                              </button>
                            </td>
                          </tr>
                          {check?.error || warn ? (
                            <tr className={check?.error ? 'bg-ds-status-bad-bg/40' : undefined}>
                              <td />
                              <td className="pb-2.5 pl-2 pr-[18px]" colSpan={5}>
                                {check?.error ? (
                                  <span
                                    className="flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                                    id={`transfer-error-${line.clientId}`}
                                    role="alert"
                                  >
                                    <AlertTriangle
                                      aria-hidden="true"
                                      className="h-3.5 w-3.5 shrink-0"
                                      strokeWidth={2}
                                    />
                                    {check.error}
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-ds-status-pending-fg">
                                    {warn}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border-t border-ds-divider px-[18px] py-6 text-center text-[13px] text-ds-muted">
                {selectedSourceId
                  ? 'Search above to add the items you are sending.'
                  : 'Choose a source to see the items it has in stock.'}
              </p>
            )}
          </Panel>

          <Panel
            aria-labelledby="transfer-remarks"
            className="flex flex-col gap-2.5 p-[18px]"
            role="region"
          >
            <StepHeading id="transfer-remarks" number={3}>
              Remarks <span className="text-[13px] font-medium text-ds-muted">(optional)</span>
            </StepHeading>
            <label className={fieldLabel}>
              Note for the receiving restaurant
              <Textarea
                disabled={isBusy}
                placeholder="e.g. Lunch top-up, deliver before 12:30"
                rows={2}
                {...form.register('remarks')}
              />
            </label>
          </Panel>
        </div>

        <SummaryCard
          className="min-w-0 flex-[1_1_300px]"
          rows={[
            { label: 'From', value: sourceName ?? '—' },
            { label: 'To', value: restaurantName ?? '—' },
            { label: 'Lines', value: lines.length },
            {
              label: selectedSourceType === 'KITCHEN' ? 'Stock rows' : 'Batches',
              value: batchCount,
            },
          ]}
          sticky
          title="Summary"
        >
          {lines.length === 0 || invalidLineCount > 0 ? (
            <div
              className="flex gap-2.5 rounded-xl bg-ds-status-bad-bg p-3 text-[12.5px] font-semibold text-ds-status-bad-fg"
              role="status"
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-px h-4 w-4 shrink-0"
                strokeWidth={2}
              />
              {lines.length === 0
                ? 'Add at least one item to submit.'
                : `${plural(invalidLineCount, 'line')} ${invalidLineCount === 1 ? 'needs' : 'need'} attention before you can submit.`}
            </div>
          ) : (
            <div
              className="flex gap-2.5 rounded-xl bg-ds-status-ok-bg p-3 text-[12.5px] font-semibold text-ds-status-ok-fg"
              role="status"
            >
              <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
              All lines are within available stock.
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-[12.5px] text-ds-text-3">
            <span className="font-extrabold text-ds-text">When you submit</span>
            <span>
              Stock is reserved at {sourceName ?? 'the source'}, and{' '}
              {restaurantName ?? 'the restaurant'} is asked to acknowledge each line.
            </span>
          </div>
          <div className="flex flex-col gap-1 border-t border-ds-divider pt-3 text-xs text-ds-muted">
            <span className="flex items-center justify-between">
              Save draft <KeyboardHint keys={['Ctrl', 'S']} />
            </span>
            <span className="flex items-center justify-between">
              Submit <KeyboardHint keys={['Ctrl', 'Enter']} />
            </span>
          </div>
        </SummaryCard>
      </div>

      {formError ? (
        <p
          className="rounded-control bg-ds-status-bad-bg p-3 text-sm font-semibold text-ds-status-bad-fg"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex flex-wrap items-center justify-end gap-2.5 border-t border-ds-border bg-ds-surface px-4 py-3 nav:-mx-6 nav:px-6">
        <span className="hidden min-w-[200px] flex-1 text-[12.5px] text-ds-muted sm:block">
          {footerNote}
        </span>
        <Button disabled={isBusy} onClick={discard} type="button" variant="ghost">
          Discard
        </Button>
        <Button disabled={isBusy} onClick={() => submit(false)} type="button" variant="outline">
          Save draft
        </Button>
        <Button
          aria-disabled={!canSubmit || undefined}
          className={cn(!canSubmit && 'opacity-60')}
          disabled={isBusy}
          onClick={() => submit(true)}
          type="button"
        >
          {isBusy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          <span className="sm:hidden">Submit</span>
          <span className="hidden sm:inline">Submit for acknowledgement</span>
        </Button>
      </div>
    </section>
  );
}

const rejectionReasons = [
  'Short received',
  'Damaged in transit',
  'Quality issue',
  'Expired or near expiry',
  'Wrong item sent',
];

type AcknowledgementOutcome = 'ACCEPTED_FULL' | 'ACCEPTED_PARTIAL' | 'REJECTED_FULL';

const outcomeCopy: Record<
  AcknowledgementOutcome,
  {
    box: string;
    confirm: string;
    text: (source: string, destination: string, lines: number) => string;
    title: string;
  }
> = {
  ACCEPTED_FULL: {
    box: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
    confirm: 'Confirm — accept in full',
    text: (_source, destination, lines) =>
      `Everything arrived as sent. All ${plural(lines, 'line')} move into ${destination} stock.`,
    title: 'Accepted in full',
  },
  ACCEPTED_PARTIAL: {
    box: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
    confirm: 'Confirm partial acceptance',
    text: (source, destination) =>
      `Accepted quantities move into ${destination} stock. Rejected quantities return to ${source}.`,
    title: 'Accepted partially',
  },
  REJECTED_FULL: {
    box: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
    confirm: 'Confirm rejection',
    text: (source) => `Nothing is accepted. All quantities return to ${source}.`,
    title: 'Rejected in full',
  },
};

/** Check a pending transfer line by line: accepted quantity in, the rest (with a reason) goes back. */
export function AcknowledgeTransferPageClient({ transferId }: Readonly<{ transferId: string }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const locationName = useLocationNames(hasPermission);
  const locationLink = useLocationHrefs(hasPermission);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState('');
  const [hasTriedConfirm, setHasTriedConfirm] = useState(false);
  const initializedFor = useRef<string | null>(null);
  const transferQuery = useQuery({
    queryFn: async () => (await organizationApi.getTransfer(transferId)).data,
    queryKey: ['transfers', 'detail', transferId],
    retry: false,
  });
  const transfer = transferQuery.data;
  useBreadcrumbLabel(
    transferId,
    transfer?.transferNumber ?? (transferQuery.isError ? 'Not found' : undefined),
  );
  const canAcknowledge = hasPermission('TRANSFER_ACKNOWLEDGE');
  const backHref = `/inventory/transfers?id=${transferId}`;

  // Start from "everything arrived", once per transfer, so a refetch keeps what was typed.
  useEffect(() => {
    if (transfer && initializedFor.current !== transfer.id) {
      initializedFor.current = transfer.id;
      setAccepted(
        Object.fromEntries(transfer.lines.map((line) => [line.id, String(line.sentQty)])),
      );
      setReasons({});
    }
  }, [transfer]);

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
      invalidateTransferQueries(queryClient);
      showToast({
        action: transfer ? { href: backHref, label: `View ${transfer.transferNumber}` } : undefined,
        description: transfer
          ? `${transfer.transferNumber} · ${outcomeCopy[outcome].title}`
          : undefined,
        title: 'Transfer acknowledged',
        variant: 'success',
      });
      router.push(backHref);
    },
  });

  if (transferQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (!transfer) {
    return (
      <Panel className="p-6">
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/inventory/transfers">Back to transfers</Link>
            </Button>
          }
          description="It may have been deleted, or it belongs to a location you can't view."
          title="Transfer not found"
        />
      </Panel>
    );
  }

  const sourceLabel = locationName(transfer.sourceType, transfer.sourceId);
  const destinationLabel = locationName(transfer.destinationType, transfer.destinationId);
  const rows = transfer.lines.map((line) => {
    const raw = accepted[line.id] ?? String(line.sentQty);
    const value = Number(raw);
    const isNumber = raw.trim() !== '' && Number.isFinite(value);
    const acceptedQty = isNumber ? Math.min(Math.max(value, 0), line.sentQty) : 0;
    const rejectedQty = Number((line.sentQty - acceptedQty).toFixed(3));
    const reason = reasons[line.id] ?? '';
    const error = !isNumber
      ? 'Enter the accepted quantity.'
      : value < 0 || value > line.sentQty + 0.0005
        ? `Accept between 0 and ${formatQuantity(line.sentQty)}.`
        : rejectedQty > 0 && !reason && hasTriedConfirm
          ? 'Choose why the rest is rejected.'
          : null;

    return {
      acceptedQty,
      error,
      line,
      raw,
      reason,
      rejectedQty,
      state:
        rejectedQty <= 0
          ? ('full' as const)
          : acceptedQty <= 0
            ? ('none' as const)
            : ('part' as const),
    };
  });
  const counts = {
    full: rows.filter((row) => row.state === 'full').length,
    none: rows.filter((row) => row.state === 'none').length,
    part: rows.filter((row) => row.state === 'part').length,
  };
  const outcome: AcknowledgementOutcome =
    counts.full === rows.length
      ? 'ACCEPTED_FULL'
      : counts.none === rows.length
        ? 'REJECTED_FULL'
        : 'ACCEPTED_PARTIAL';
  const copy = outcomeCopy[outcome];
  const isPending = transfer.status === 'PENDING_ACKNOWLEDGEMENT';

  function setAll(mode: 'accept' | 'reject') {
    if (!transfer) {
      return;
    }

    setAccepted(
      Object.fromEntries(
        transfer.lines.map((line) => [line.id, mode === 'accept' ? String(line.sentQty) : '0']),
      ),
    );
  }

  function confirm() {
    setHasTriedConfirm(true);

    if (!transfer || !canAcknowledge) {
      return;
    }

    const invalid = rows.find((row) => row.error || (row.rejectedQty > 0 && !row.reason));

    if (invalid) {
      document.getElementById(`ack-accepted-${invalid.line.id}`)?.focus();
      return;
    }

    acknowledgeMutation.mutate({
      items: rows.map((row) => ({
        acceptedQty: row.acceptedQty,
        batchNumber: row.line.batchNumber ?? undefined,
        expiryDate: row.line.expiryDate ?? undefined,
        itemId: row.line.itemId,
        rejectedQty: row.rejectedQty,
        rejectionReason: row.rejectedQty > 0 ? row.reason : undefined,
        sentQty: row.line.sentQty,
        transferLineId: row.line.id,
      })),
      remarks: optionalValue(remarks),
      transferId: transfer.id,
    });
  }

  const stateIcon = {
    full: {
      className: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
      icon: Check,
      label: 'Accepted in full',
    },
    none: { className: 'bg-ds-status-bad-bg text-ds-status-bad-fg', icon: X, label: 'Rejected' },
    part: {
      className: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
      icon: Minus,
      label: 'Partly accepted',
    },
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <Link
          className="inline-flex min-h-6 items-center gap-1 self-start rounded-sm text-[12.5px] font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
          href={backHref}
        >
          <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
          Transfers
        </Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">
            Acknowledge {transfer.transferNumber}
          </h1>
          <StatusChip
            label={
              isPending
                ? `Pending acknowledgement · ${formatAgeSince(transfer.updatedAt)}`
                : longStatus(transferOutcome(transfer) ?? transfer.status)
            }
            status={transferOutcome(transfer) ?? transfer.status}
          />
        </div>
        <p className="text-[13.5px] text-ds-muted">
          {isPending
            ? `Check what arrived at ${destinationLabel}. Enter the quantity you accept for each line; anything not accepted goes back to the source.`
            : 'This transfer is not waiting for acknowledgement, so there is nothing to confirm here.'}
        </p>
      </div>

      <dl
        aria-label="Transfer details"
        className="grid gap-px overflow-hidden rounded-card border border-ds-border bg-ds-border grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
      >
        {[
          {
            href: locationLink(transfer.sourceType, transfer.sourceId),
            label: `From · ${transfer.sourceType}`,
            value: sourceLabel,
          },
          {
            href: locationLink(transfer.destinationType, transfer.destinationId),
            label: `To · ${transfer.destinationType}`,
            value: destinationLabel,
          },
          { href: null, label: 'Sent', value: formatWhen(transfer.updatedAt) },
          { href: null, label: 'Remarks', value: transfer.remarks || '—' },
        ].map((entry) => (
          <div
            className="flex min-w-0 flex-col gap-[3px] bg-ds-surface px-4 py-3"
            key={entry.label}
          >
            <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-ds-muted">
              {entry.label}
            </dt>
            <dd className="truncate text-[13.5px] font-bold text-ds-text" title={entry.value}>
              <RecordLink href={entry.href}>{entry.value}</RecordLink>
            </dd>
          </div>
        ))}
      </dl>

      {isPending ? (
        <div className="flex flex-wrap items-start gap-5">
          <Panel
            aria-labelledby="ack-lines"
            className="min-w-0 flex-[2_1_560px] overflow-hidden"
            role="region"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
              <h2 className="text-[15px] font-extrabold text-ds-text" id="ack-lines">
                Received lines · {transfer.lines.length}
              </h2>
              <div className="flex gap-2">
                <Button
                  className="h-[34px] px-3 text-[12.5px] text-ds-status-ok-fg hover:text-ds-status-ok-fg"
                  onClick={() => setAll('accept')}
                  type="button"
                  variant="outline"
                >
                  <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Accept all
                </Button>
                <Button
                  className="h-[34px] px-3 text-[12.5px] text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                  onClick={() => setAll('reject')}
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Reject all
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] table-fixed text-[13px]">
                <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                  <tr>
                    <th className="py-2 pl-[18px] font-semibold">Item · batch</th>
                    <th className="w-[76px] px-2 py-2 text-right font-semibold">Sent</th>
                    <th className="w-[160px] px-2 py-2 font-semibold">Accepted</th>
                    <th className="w-[84px] px-2 py-2 text-right font-semibold">Rejected</th>
                    <th className="w-[30%] py-2 pl-2 pr-[18px] font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const icon = stateIcon[row.state];

                    return (
                      <Fragment key={row.line.id}>
                        <tr
                          className={cn(
                            'border-b border-ds-divider align-middle',
                            row.state === 'part' && 'bg-ds-status-pending-bg/30',
                            row.state === 'none' && 'bg-ds-status-bad-bg/30',
                          )}
                        >
                          <td className="py-2.5 pl-[18px]">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full',
                                  icon.className,
                                )}
                                role="img"
                                aria-label={icon.label}
                              >
                                <icon.icon aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-[13.5px] font-bold text-ds-text">
                                  {row.line.item.itemName}
                                </span>
                                <span className="truncate text-[11.5px] text-ds-muted">
                                  {[
                                    row.line.batchNumber,
                                    row.line.expiryDate
                                      ? `exp ${formatDateOnly(row.line.expiryDate)}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || row.line.item.itemCode}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-right text-[13.5px] font-bold tabular-nums text-ds-text">
                            {formatQuantity(row.line.sentQty)}
                          </td>
                          <td className="px-2 py-2.5">
                            <QuantityStepper
                              compact
                              id={`ack-accepted-${row.line.id}`}
                              label={`accepted quantity of ${row.line.item.itemName}`}
                              max={row.line.sentQty}
                              onChange={(value) =>
                                setAccepted((current) => ({ ...current, [row.line.id]: value }))
                              }
                              value={row.raw}
                            />
                          </td>
                          <td
                            className={cn(
                              'px-2 py-2.5 text-right text-[13.5px] tabular-nums',
                              row.rejectedQty > 0
                                ? 'font-extrabold text-ds-status-bad-fg'
                                : 'font-medium text-ds-muted',
                            )}
                          >
                            {formatQuantity(row.rejectedQty)}
                          </td>
                          <td className="py-2.5 pl-2 pr-[18px]">
                            {row.rejectedQty > 0 ? (
                              <select
                                aria-invalid={hasTriedConfirm && !row.reason ? true : undefined}
                                aria-label={`Rejection reason for ${row.line.item.itemName}`}
                                className={cn(
                                  'h-[38px] w-full rounded-control border-[1.5px] bg-ds-surface px-2 text-[12.5px] font-semibold text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary/15',
                                  hasTriedConfirm && !row.reason
                                    ? 'border-ds-status-bad-fg'
                                    : 'border-ds-status-pending-fg',
                                )}
                                onChange={(event) =>
                                  setReasons((current) => ({
                                    ...current,
                                    [row.line.id]: event.target.value,
                                  }))
                                }
                                value={row.reason}
                              >
                                <option value="">Choose a reason</option>
                                {rejectionReasons.map((reason) => (
                                  <option key={reason} value={reason}>
                                    {reason}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[12.5px] text-ds-muted">—</span>
                            )}
                          </td>
                        </tr>
                        {row.error ? (
                          <tr className="border-b border-ds-divider">
                            <td className="pb-2 pl-[50px] pr-[18px] pt-0" colSpan={5}>
                              <span
                                className="flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                                role="alert"
                              >
                                <AlertTriangle
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2}
                                />
                                {row.error}
                              </span>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="bg-ds-subtle px-[18px] py-3 text-xs text-ds-muted">
              Tip: press Tab to move between quantities. Rejected quantity is worked out for you.
            </p>
          </Panel>

          <aside
            aria-label="Acknowledgement outcome"
            className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-card border border-ds-border bg-ds-surface p-[18px] shadow-card nav:sticky nav:top-20"
          >
            <h2 className="text-[15px] font-extrabold text-ds-text">Outcome</h2>
            <div
              aria-live="polite"
              className={cn('flex flex-col gap-1.5 rounded-xl p-3.5', copy.box)}
            >
              <span className="text-[15px] font-extrabold">{copy.title}</span>
              <span className="text-[12.5px] text-ds-text-2">
                {copy.text(sourceLabel, destinationLabel, rows.length)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { className: 'text-ds-status-ok-fg', label: 'In full', value: counts.full },
                { className: 'text-ds-status-pending-fg', label: 'Partial', value: counts.part },
                { className: 'text-ds-status-bad-fg', label: 'Rejected', value: counts.none },
              ].map((count) => (
                <div
                  className="flex flex-col gap-0.5 rounded-control border border-ds-border px-1.5 py-2.5"
                  key={count.label}
                >
                  <span className={cn('text-lg font-extrabold tabular-nums', count.className)}>
                    {count.value}
                  </span>
                  <span className="text-[11.5px] text-ds-muted">{count.label}</span>
                </div>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2">
              Remarks for the store
              <Textarea
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Add details on shortages or damage"
                rows={3}
                value={remarks}
              />
            </label>
            <Button
              className="h-11 text-sm"
              disabled={acknowledgeMutation.isPending || !canAcknowledge}
              onClick={confirm}
              type="button"
            >
              {acknowledgeMutation.isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : null}
              {copy.confirm}
            </Button>
            <span className="text-xs text-ds-muted">
              {canAcknowledge
                ? 'Stock moves as soon as you confirm. You can’t edit an acknowledgement afterwards.'
                : 'Your role can view this transfer but not acknowledge it.'}
            </span>
          </aside>
        </div>
      ) : (
        <Button asChild variant="outline">
          <Link href={backHref}>Open the transfer</Link>
        </Button>
      )}
    </section>
  );
}

export function RestaurantStockPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'' | 'KITCHEN' | 'STORE'>('');
  const [itemFilter, setItemFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [batchFilter, setBatchFilter] = useState('');
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
  const restaurantsQuery = useRestaurants(hospitalFilter);
  const effectiveItemType =
    itemTypeFilter ||
    (sourceFilter === 'STORE' ? 'MRP' : sourceFilter === 'KITCHEN' ? 'READYMADE' : '');
  const itemOptionsQuery = useItems(effectiveItemType || undefined);

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setRestaurantFilter('');
    setPage(1);
  });

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
    <section className="space-y-5">
      <PageHeader
        subtitle="Current restaurant stock received from acknowledged transfers."
        title="Restaurant Stock"
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
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[18%] px-4 py-2.5">Restaurant</th>
                <th className="w-[12%] px-4 py-2.5">Source</th>
                <th className="w-[20%] px-4 py-2.5">Item</th>
                <th className="w-[14%] px-4 py-2.5">Batch</th>
                <th className="w-[14%] px-4 py-2.5">Expiry / Date</th>
                <th className="w-[12%] px-4 py-2.5">Available Qty</th>
                <th className="w-[10%] px-4 py-2.5">Status</th>
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
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {stock.itemType === 'READYMADE' ? 'Kitchen' : 'Store'}
                      </Badge>
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
                    <td className="px-4 py-3 text-ds-text-3">{stock.batchNumber ?? 'No batch'}</td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {stock.itemType === 'READYMADE'
                        ? formatDateOnly(stock.businessDate)
                        : formatDateOnly(stock.expiryDate)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {stock.availableQty.toFixed(3)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={stock.status} />
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
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
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
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setLocationTypeFilter('');
    setLocationFilter('');
    setPage(1);
  });

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
    <section className="space-y-5">
      <PageHeader
        subtitle="Read-only movement history across store, kitchen, and restaurant stock."
        title="Stock Ledgers"
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
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[16%] px-4 py-2.5">Location</th>
                <th className="w-[16%] px-4 py-2.5">Item</th>
                <th className="w-[11%] px-4 py-2.5">Transaction</th>
                <th className="w-[11%] px-4 py-2.5">Reference</th>
                <th className="w-[10%] px-4 py-2.5">Qty In</th>
                <th className="w-[10%] px-4 py-2.5">Qty Out</th>
                <th className="w-[10%] px-4 py-2.5">Balance</th>
                <th className="w-[12%] px-4 py-2.5">Batch</th>
                <th className="w-[12%] px-4 py-2.5">Business Date</th>
                <th className="w-[15%] px-4 py-2.5">Transaction Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {ledgers.length > 0 ? (
                ledgers.map((ledger: StockLedger) => (
                  <tr className="hover:bg-ds-subtle" key={ledger.id}>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          ledger.locationType,
                          ledger.location.code || ledger.location.name,
                        )}
                      >
                        {ledger.location.name}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">
                        {formatEnum(ledger.locationType)} - {ledger.location.code ?? '-'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: ledger.item.id })}
                      >
                        {ledger.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{ledger.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {formatEnum(ledger.transactionType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {ledger.referenceType ? formatEnum(ledger.referenceType) : '-'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-teal-text">
                      {ledger.qtyIn.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-status-bad-fg">
                      {ledger.qtyOut.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {ledger.balanceAfter.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{ledger.batchNumber ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(ledger.businessDate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
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
