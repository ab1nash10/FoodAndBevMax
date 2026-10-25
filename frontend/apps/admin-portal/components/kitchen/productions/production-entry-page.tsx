'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Info,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { KitchenProductionInput } from '@aahar/api-client';
import { useConfirm } from '@/components/confirm-provider';
import {
  FlowStepper,
  LoadingSkeleton,
  StatusChip,
  Stepper,
  SummaryCard,
  type StepItem,
} from '@/components/design-system';
import { formatWhen, plural } from '@/components/inventory/shared/utils';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input, Panel, RequiredMark, Skeleton } from '@/components/ui';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { formatProductionQuantity } from '@/components/kitchen/productions/shared';
import { useHospitals, useKitchens } from '@/components/kitchen/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { useDeviceDraft } from '@/lib/use-device-draft';
import { useHrefWith } from '@/lib/use-url-state';
import { SetupNotice } from '@/components/location-empty-states';

const headerSchema = z.object({
  businessDate: z.string().trim().min(1, 'Business date is required.'),
  hospitalId: z.string().uuid('Select a hospital.'),
  kitchenId: z.string().uuid('Select a kitchen.'),
  productionDate: z.string().trim().min(1, 'Production date is required.'),
  remarks: z.string().trim().max(500, 'Remarks can be at most 500 characters.'),
});

const lineSchema = z
  .object({
    acceptedQty: z.coerce.number().min(0, 'Accepted quantity cannot be negative.'),
    itemId: z.string().uuid('Select an item.'),
    producedQty: z.coerce.number().min(0.001, 'Produced quantity must be greater than zero.'),
    remarks: z.string().trim().max(500, 'Line remarks can be at most 500 characters.'),
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

const linesSchema = z
  .array(lineSchema)
  .min(1, 'Add at least one production line.')
  .max(200, 'A production can have at most 200 lines.');

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

function emptyHeader(hospitalId: string): ProductionHeaderFormValues {
  return {
    businessDate: defaultDateOnly(),
    hospitalId,
    kitchenId: '',
    productionDate: defaultDateTimeLocal(),
    remarks: '',
  };
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

      // One entry per item: an item mapped under several categories is still one item to produce.
      return response.data.items.filter(
        (mapping, index, all) =>
          mapping.item.itemType === 'READYMADE' &&
          all.findIndex((other) => other.itemId === mapping.itemId) === index,
      );
    },
    queryKey: queryKeys.kitchenProductionItems(kitchenId),
  });
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

const producedAtFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Business dates are plain YYYY-MM-DD, which Date parses as UTC midnight.
const businessDateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

function formatDate(formatter: Intl.DateTimeFormat, value: string): string {
  const date = new Date(value);

  return value && !Number.isNaN(date.getTime()) ? formatter.format(date) : '—';
}

function formatTotal(value: number): string {
  return formatProductionQuantity(Number(value.toFixed(3)));
}

const productionSteps = ['Kitchen and time', 'What was made', 'Check and post'] as const;

type ProductionStep = 1 | 2 | 3;

/**
 * Record what a kitchen produced and wasted, then post the accepted quantity to kitchen
 * stock. Without an id it creates a production; with one it opens it (drafts stay editable).
 */
export function ProductionEntryPageClient({ productionId }: Readonly<{ productionId?: string }>) {
  const { isAllLocations, isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { currentUser, hasPermission } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
  // Back to the list keeps its filters (they are still in the URL).
  const listHref = useHrefWith()({ id: null });
  const [lines, setLines] = useState<ProductionLineDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [hasTriedSave, setHasTriedSave] = useState(false);
  const [step, setStep] = useState<ProductionStep>(1);
  const initializedFor = useRef<string | null>(null);
  const form = useForm<ProductionHeaderFormValues>({
    defaultValues: emptyHeader(scopedHospitalId ?? ''),
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
    queryKey: queryKeys.kitchenProductions('detail', productionId),
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
    queryKey: queryKeys.kitchenProductionsToday(
      scopedHospitalId ?? 'all',
      todayStart.toDateString(),
    ),
  });
  const isExisting = Boolean(productionId);
  const isEditable = !isExisting || production?.status === 'DRAFT';
  const canSave =
    isEditable &&
    hasPermission(isExisting ? 'KITCHEN_PRODUCTION_UPDATE' : 'KITCHEN_PRODUCTION_CREATE');
  const canPost = isEditable && hasPermission('KITCHEN_PRODUCTION_POST');

  // Only a real change of location clears the form, so a restored draft survives.
  useEffect(() => {
    if (scopedHospitalId && !isExisting && form.getValues('hospitalId') !== scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('kitchenId', '', { shouldValidate: true });
      setLines([]);
      setStep(1);
    }
  }, [form, isExisting, scopedHospitalId]);

  // A new production is kept on this device per user and location, and brought back on return.
  const draft = useDeviceDraft(
    isExisting || isLoadingLocations || !currentUser
      ? null
      : `aahar.new-production.draft:${currentUser.id}:${scopedHospitalId ?? 'all'}`,
    { header: form.watch(), lines },
    {
      keep: Boolean(selectedKitchenId || lines.length),
      onRestore: (saved) => {
        form.reset(saved.header);
        setLines(saved.lines);
        setStep(saved.lines.length > 0 ? 2 : 1);
        return true;
      },
    },
  );

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
    // A saved production is complete (drafts are validated before saving), so open it at review.
    setStep(3);
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
      draft.clear();
      showToast({
        action: { href, label: `View ${saved.productionNumber}` },
        description: saved.productionNumber,
        recordId: saved.id,
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
    onSuccess(_response, id) {
      invalidateKitchenProductionQueries(queryClient);
      showToast({ recordId: id, title: 'Production cancelled', variant: 'success' });
    },
  });

  function startOver() {
    draft.clear();
    form.reset(emptyHeader(scopedHospitalId ?? selectedHospitalId));
    setLines([]);
    setFormError('');
    setHasTriedSave(false);
    setStep(1);
  }

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
  const totalAccepted = rows.reduce((total, row) => total + row.accepted, 0);
  const overallPercent = wastePercent(totalProduced, totalWasted);
  const flagged = rows.filter((row) => row.isHigh).length;
  const linesNeedingAttention = rows.filter(
    (row) => row.error || row.line.producedQty === '',
  ).length;
  const addedIds = new Set(lines.map((line) => line.itemId));
  const available = mappedItems.filter((mapping) => !addedIds.has(mapping.itemId));
  const kitchenName =
    (kitchensQuery.data ?? []).find((kitchen) => kitchen.id === selectedKitchenId)?.kitchenName ??
    production?.kitchen.kitchenName ??
    'this kitchen';
  const hospitalName =
    (hospitalsQuery.data ?? []).find((hospital) => hospital.id === selectedHospitalId)
      ?.hospitalName ?? production?.hospital.hospitalName;

  function itemOf(itemId: string) {
    return (
      itemMap.get(itemId)?.item ?? production?.lines.find((line) => line.itemId === itemId)?.item
    );
  }

  /** Checks step 1; on failure marks the fields, explains why and returns to step 1. */
  function validateHeader() {
    setHasTriedSave(true);
    form.clearErrors();

    const header = headerSchema.safeParse(form.getValues());

    if (header.success) {
      return header.data;
    }

    for (const issue of header.error.issues) {
      form.setError(issue.path[0] as keyof ProductionHeaderFormValues, { message: issue.message });
    }

    setFormError(header.error.issues[0]?.message ?? 'Check production header.');
    setStep(1);
    return null;
  }

  /** Checks step 2; on failure explains why and returns to step 2. */
  function validateLines() {
    setHasTriedSave(true);

    const parsedLines = linesSchema.safeParse(lines);
    const message = !parsedLines.success
      ? (parsedLines.error.issues[0]?.message ?? 'Check production lines.')
      : parsedLines.data.some((line) => !itemMap.has(line.itemId))
        ? 'Every production line must use a mapped READYMADE kitchen item.'
        : null;

    if (message || !parsedLines.success) {
      setFormError(message ?? 'Check production lines.');
      setStep(2);
      return null;
    }

    return parsedLines.data;
  }

  /** Moves between steps: back freely, forward only once each step in between is valid. */
  function goTo(target: ProductionStep) {
    setFormError('');

    if (target > step && step === 1 && !validateHeader()) {
      return;
    }

    if (target === 3 && !validateLines()) {
      return;
    }

    setStep(target);
  }

  function save(post: boolean) {
    setFormError('');

    const header = validateHeader();
    const items = header ? validateLines() : null;

    if (!header || !items) {
      return;
    }

    saveMutation.mutate({
      body: {
        businessDate: header.businessDate,
        hospitalId: header.hospitalId,
        items: items.map((line) => ({
          acceptedQty: line.acceptedQty,
          itemId: line.itemId,
          producedQty: line.producedQty,
          remarks: optionalValue(line.remarks),
          wastageQty: line.wastageQty,
        })),
        kitchenId: header.kitchenId,
        productionDate: new Date(header.productionDate).toISOString(),
        remarks: optionalValue(header.remarks),
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
  // Posted and cancelled productions can only be read, so they open straight on the review.
  const currentStep: ProductionStep = isEditable ? step : 3;
  const header = form.watch();
  const fieldLabel = 'flex flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2';
  const selectClass =
    'h-control w-full rounded-control border border-ds-input bg-ds-surface px-2.5 text-[13.5px] font-semibold text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted';
  const qtyClass =
    'h-9 w-full rounded-control border-[1.5px] bg-ds-surface px-2 font-mono text-[13px] font-bold tabular-nums text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:bg-ds-subtle disabled:text-ds-muted';
  const readiness = !selectedKitchenId
    ? { text: 'Choose a kitchen to start.', tone: 'neutral' as const }
    : lines.length === 0
      ? { text: 'Add at least one item to post.', tone: 'neutral' as const }
      : linesNeedingAttention > 0
        ? {
            text: `${plural(linesNeedingAttention, 'line')} ${linesNeedingAttention === 1 ? 'needs' : 'need'} attention.`,
            tone: 'bad' as const,
          }
        : { text: `Ready to post ${plural(lines.length, 'item')}.`, tone: 'ok' as const };
  const canPostHere = canPost && (isExisting || hasPermission('KITCHEN_PRODUCTION_CREATE'));
  const wastageTotals = (
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
        <div className="flex flex-col gap-0.5 bg-ds-subtle px-[18px] py-3" key={total.label}>
          <dt className="text-[11.5px] text-ds-muted">{total.label}</dt>
          <dd className={cn('font-mono text-base font-bold tabular-nums', total.tone)}>
            {total.value}
          </dd>
        </div>
      ))}
    </dl>
  );
  const wasteBadge = (row: (typeof rows)[number]) => (
    <span
      className={cn(
        'rounded-full px-[7px] py-0.5 font-mono text-[11.5px] font-bold tabular-nums',
        row.isHigh
          ? 'bg-ds-status-pending-bg text-ds-status-pending-fg'
          : 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
      )}
      title={row.isHigh ? `Above the ${WASTAGE_ALERT_PERCENT}% limit` : undefined}
    >
      {row.percent.toFixed(1)}%
    </span>
  );

  // A saved production's steps: drafted, then posted to stock or cancelled.
  const statusSteps: StepItem[] = production
    ? [
        {
          detail: `Created ${formatWhen(production.createdAt)}`,
          label: 'Draft',
          state: production.status === 'DRAFT' ? 'current' : 'done',
        },
        production.status === 'CANCELLED'
          ? { detail: formatWhen(production.updatedAt), label: 'Cancelled', state: 'stopped' }
          : {
              detail:
                production.status === 'POSTED'
                  ? formatWhen(production.updatedAt)
                  : 'Adds to kitchen stock',
              label: 'Added to stock',
              state: production.status === 'POSTED' ? 'done' : 'todo',
            },
      ]
    : [];
  const cardClass = 'rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card';

  return (
    <section className="space-y-4">
      {production ? (
        <Link
          className="inline-flex min-h-6 items-center gap-1 self-start rounded-sm text-[13px] font-medium text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
          href={listHref}
        >
          <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
          Production
        </Link>
      ) : null}
      {/* A saved production gets the record header card (as a GRN does); a new one stays plain. */}
      <div
        className={cn(
          production &&
            'relative isolate space-y-6 overflow-hidden rounded-[24px] border border-ds-border bg-ds-surface p-5 shadow-card sm:p-6',
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1
                className={cn(
                  'text-ds-text',
                  production
                    ? 'font-mono text-[28px] font-semibold leading-tight tracking-[-0.02em]'
                    : 'text-2xl font-extrabold tracking-[-0.01em]',
                )}
              >
                {production?.productionNumber ?? 'New production'}
              </h1>
              <StatusChip
                label={production?.status === 'POSTED' ? 'Added to stock' : undefined}
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
          {isEditable && isExisting && production && hasPermission('KITCHEN_PRODUCTION_UPDATE') ? (
            <Button
              className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
              disabled={isBusy}
              onClick={() =>
                void confirm({
                  confirmLabel: 'Cancel production',
                  description: 'Nothing is added to stock.',
                  title: `Cancel ${production.productionNumber}?`,
                  tone: 'danger',
                }).then((confirmed) => {
                  if (confirmed) cancelMutation.mutate(production.id);
                })
              }
              type="button"
              variant="ghost"
            >
              Cancel production
            </Button>
          ) : null}
          {draft.savedAt ? (
            <div className="flex items-center gap-3">
              <span aria-live="polite" className="text-xs text-ds-muted">
                Draft kept {timeOnlyFormatter.format(draft.savedAt)}
              </span>
              <Button disabled={isBusy} onClick={startOver} size="sm" type="button" variant="ghost">
                Start over
              </Button>
            </div>
          ) : null}
        </div>
        {production ? <Stepper label="Production progress" steps={statusSteps} /> : null}
      </div>

      {production ? (
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cardClass}>
            <dt className="text-[12.5px] text-ds-muted">Produced</dt>
            <dd className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ds-text tabular-nums">
              {formatTotal(totalProduced)}
            </dd>
            <p className="mt-1 text-xs text-ds-muted">
              {formatTotal(totalAccepted)} accepted to stock
            </p>
          </div>
          <div className={cardClass}>
            <dt className="text-[12.5px] text-ds-muted">Wastage</dt>
            <dd
              className={cn(
                'mt-1.5 text-2xl font-semibold tracking-[-0.02em] tabular-nums',
                overallPercent > WASTAGE_ALERT_PERCENT
                  ? 'text-ds-status-pending-fg'
                  : 'text-ds-text',
              )}
            >
              {formatTotal(totalWasted)}
            </dd>
            <p className="mt-1 text-xs text-ds-muted">{overallPercent.toFixed(1)}% of produced</p>
          </div>
          <div className={cardClass}>
            <dt className="text-[12.5px] text-ds-muted">Items</dt>
            <dd className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ds-text tabular-nums">
              {lines.length}
            </dd>
            <p className="mt-1 text-xs text-ds-muted">
              {flagged} above the {WASTAGE_ALERT_PERCENT}% limit
            </p>
          </div>
          <div className={cardClass}>
            <dt className="text-[12.5px] text-ds-muted">Kitchen</dt>
            <dd
              className="mt-1.5 truncate text-[17px] font-semibold text-ds-text"
              title={kitchenName}
            >
              {kitchenName}
            </dd>
            <p className="mt-1 truncate text-xs text-ds-muted">
              {production.chef ? `Made by ${production.chef.name}` : 'No chef assigned'}
            </p>
          </div>
        </dl>
      ) : null}

      {isEditable ? (
        <FlowStepper
          label="New production steps"
          steps={productionSteps.map((label, index) => {
            const number = (index + 1) as ProductionStep;

            return {
              label,
              onSelect: number < currentStep ? () => goTo(number) : undefined,
              state: number === currentStep ? 'current' : number < currentStep ? 'done' : 'todo',
            };
          })}
        />
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          {currentStep === 1 ? (
            <Panel
              aria-label="Kitchen and time"
              className="grid gap-3 px-[18px] py-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]"
              role="region"
            >
              {isAllLocations && !isExisting ? (
                <label className={fieldLabel}>
                  <span>
                    Location
                    <RequiredMark />
                  </span>
                  <select
                    aria-required="true"
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
              ) : hospitalName ? (
                <div className={fieldLabel}>
                  <span>Location</span>
                  <span className="flex h-control items-center text-[13.5px] font-semibold text-ds-text">
                    {hospitalName}
                  </span>
                </div>
              ) : null}
              <label className={fieldLabel}>
                <span>
                  Kitchen
                  <RequiredMark />
                </span>
                <select
                  aria-required="true"
                  className={selectClass}
                  disabled={!selectedHospitalId || isBusy}
                  onChange={(event) => {
                    form.setValue('kitchenId', event.target.value, {
                      shouldValidate: hasTriedSave,
                    });
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
              {selectedHospitalId && kitchensQuery.data?.length === 0 ? (
                <div className="col-span-full">
                  <SetupNotice href="/masters/kitchens/new" linkLabel="Create a kitchen">
                    This location has no kitchen yet, so there is nothing to record production for.
                  </SetupNotice>
                </div>
              ) : null}
              <label className={fieldLabel}>
                <span>
                  Produced at
                  <RequiredMark />
                </span>
                <Input
                  aria-required="true"
                  disabled={isBusy}
                  type="datetime-local"
                  {...form.register('productionDate')}
                />
                {errors.productionDate ? (
                  <FieldError>{errors.productionDate.message}</FieldError>
                ) : null}
              </label>
              <label className={fieldLabel}>
                <span>
                  Business date
                  <RequiredMark />
                </span>
                <Input
                  aria-required="true"
                  disabled={isBusy}
                  type="date"
                  {...form.register('businessDate')}
                />
                {errors.businessDate ? (
                  <FieldError>{errors.businessDate.message}</FieldError>
                ) : null}
              </label>
              {production?.chef ? (
                <div className={fieldLabel}>
                  <span>Chef</span>
                  <span className="flex h-control items-center text-[13.5px] font-semibold text-ds-text">
                    {production.chef.name}
                  </span>
                </div>
              ) : null}
              <label className={cn(fieldLabel, 'col-span-full')}>
                Remarks
                <Input
                  disabled={isBusy}
                  maxLength={500}
                  placeholder="Optional"
                  {...form.register('remarks')}
                />
                {errors.remarks ? <FieldError>{errors.remarks.message}</FieldError> : null}
              </label>
            </Panel>
          ) : null}

          {currentStep === 2 ? (
            <Panel aria-labelledby="production-lines" className="overflow-hidden" role="region">
              <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
                <h2 className="text-[15px] font-extrabold text-ds-text" id="production-lines">
                  Produced items · <span className="font-mono">{lines.length}</span>
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
                        <th className="w-[124px] px-2 py-2 font-semibold">
                          Produced
                          <RequiredMark />
                        </th>
                        <th className="w-[124px] px-2 py-2 font-semibold">Wastage</th>
                        <th className="w-[92px] px-2 py-2 text-right font-semibold">Accepted</th>
                        <th className="w-[76px] px-2 py-2 text-right font-semibold">Waste</th>
                        <th className="w-12 py-2 pr-[18px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const item = itemOf(row.line.itemId);

                        return (
                          <Fragment key={row.line.clientId}>
                            <tr
                              className={cn(
                                'border-b border-ds-divider align-middle',
                                row.isHigh && 'bg-ds-status-pending-bg/30',
                              )}
                            >
                              <td className="py-2 pl-[18px]">
                                <span className="block truncate text-[13.5px] font-bold text-ds-text">
                                  {item?.itemName ?? 'Item'}
                                </span>
                                <span className="block truncate font-mono text-[11.5px] text-ds-muted">
                                  {item?.itemCode}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  aria-invalid={row.error ? true : undefined}
                                  aria-label={`Produced quantity for ${item?.itemName ?? 'item'}`}
                                  aria-required="true"
                                  className={cn(
                                    qtyClass,
                                    row.error ? 'border-ds-status-bad-fg' : 'border-ds-input',
                                  )}
                                  disabled={isBusy}
                                  id={`produced-${row.line.clientId}`}
                                  inputMode="decimal"
                                  min="0"
                                  onChange={(event) =>
                                    updateLine(row.line.clientId, {
                                      producedQty: event.target.value,
                                    })
                                  }
                                  placeholder="0"
                                  step="any"
                                  type="number"
                                  value={row.line.producedQty}
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  aria-label={`Wastage for ${item?.itemName ?? 'item'}`}
                                  className={cn(
                                    qtyClass,
                                    row.isHigh ? 'border-ds-status-pending-fg' : 'border-ds-input',
                                  )}
                                  disabled={isBusy}
                                  inputMode="decimal"
                                  min="0"
                                  onChange={(event) =>
                                    updateLine(row.line.clientId, {
                                      wastageQty: event.target.value,
                                    })
                                  }
                                  placeholder="0"
                                  step="any"
                                  type="number"
                                  value={row.line.wastageQty}
                                />
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-[13.5px] font-bold tabular-nums text-ds-status-ok-fg">
                                {formatTotal(row.accepted)}
                              </td>
                              <td className="px-2 py-2 text-right">{wasteBadge(row)}</td>
                              <td className="py-2 pr-[18px]">
                                <button
                                  aria-label={`Remove ${item?.itemName ?? 'line'}`}
                                  className="grid h-8 w-8 place-items-center rounded-lg text-ds-muted transition hover:bg-ds-status-bad-bg hover:text-ds-status-bad-fg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setLines((current) =>
                                      current.filter((line) => line.clientId !== row.line.clientId),
                                    )
                                  }
                                  type="button"
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                  />
                                </button>
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
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border-t border-ds-divider px-[18px] py-6 text-center text-[13px] text-ds-muted">
                  {itemsQuery.isLoading ? (
                    <LoadingSkeleton rows={3} />
                  ) : mappedItems.length === 0 ? (
                    <SetupNotice
                      href="/masters/item-mapping?tab=kitchen"
                      linkLabel="Map items to this kitchen"
                    >
                      No READYMADE items are mapped to this kitchen yet, so there is nothing to
                      record.
                    </SetupNotice>
                  ) : (
                    'Add what the kitchen produced from the items below.'
                  )}
                </div>
              )}
              {available.length > 0 ? (
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
              {wastageTotals}
            </Panel>
          ) : null}

          {currentStep === 3 ? (
            <>
              <Panel
                aria-labelledby="production-review-header"
                className="px-[18px] py-4"
                role="region"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2
                    className="text-[15px] font-extrabold text-ds-text"
                    id="production-review-header"
                  >
                    Kitchen and time
                  </h2>
                  {isEditable ? (
                    <Button onClick={() => goTo(1)} size="sm" type="button" variant="ghost">
                      Edit
                    </Button>
                  ) : null}
                </div>
                <dl className="grid gap-3 text-[13.5px] grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
                  {[
                    { label: 'Location', value: hospitalName ?? '—' },
                    { label: 'Kitchen', value: kitchenName },
                    {
                      label: 'Produced at',
                      value: formatDate(producedAtFormatter, header.productionDate),
                    },
                    {
                      label: 'Business date',
                      value: formatDate(businessDateFormatter, header.businessDate),
                    },
                    ...(production?.chef ? [{ label: 'Chef', value: production.chef.name }] : []),
                    { label: 'Remarks', value: header.remarks.trim() || '—' },
                  ].map((entry) => (
                    <div className="flex flex-col gap-0.5" key={entry.label}>
                      <dt className="text-[12px] font-bold text-ds-muted">{entry.label}</dt>
                      <dd className="font-semibold text-ds-text">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel
                aria-labelledby="production-review-lines"
                className="overflow-hidden"
                role="region"
              >
                <div className="flex items-center justify-between gap-2 px-[18px] py-3.5">
                  <h2
                    className="text-[15px] font-extrabold text-ds-text"
                    id="production-review-lines"
                  >
                    What was made · <span className="font-mono">{lines.length}</span>
                  </h2>
                  {isEditable ? (
                    <Button onClick={() => goTo(2)} size="sm" type="button" variant="ghost">
                      Edit
                    </Button>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                      <tr>
                        <th className="py-2 pl-[18px] font-semibold">Item</th>
                        <th className="px-2 py-2 text-right font-semibold">Produced</th>
                        <th className="px-2 py-2 text-right font-semibold">Wastage</th>
                        <th className="px-2 py-2 text-right font-semibold">Accepted</th>
                        <th className="py-2 pl-2 pr-[18px] text-right font-semibold">Waste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const item = itemOf(row.line.itemId);

                        return (
                          <tr
                            className={cn(
                              'border-b border-ds-divider',
                              row.isHigh && 'bg-ds-status-pending-bg/30',
                            )}
                            key={row.line.clientId}
                          >
                            <td className="py-2 pl-[18px]">
                              <span className="block font-bold text-ds-text">
                                {item?.itemName ?? 'Item'}
                              </span>
                              <span className="block font-mono text-[11.5px] text-ds-muted">
                                {item?.itemCode}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right font-mono tabular-nums">
                              {formatTotal(row.produced)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono tabular-nums">
                              {formatTotal(row.wasted)}
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-bold tabular-nums text-ds-status-ok-fg">
                              {formatTotal(row.accepted)}
                            </td>
                            <td className="py-2 pl-2 pr-[18px] text-right">{wasteBadge(row)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {wastageTotals}
              </Panel>

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
            </>
          ) : null}

          {formError ? (
            <p
              className="rounded-control bg-ds-status-bad-bg p-3 text-sm font-semibold text-ds-status-bad-fg"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
        </div>

        <SummaryCard
          className="min-w-0 flex-[1_1_300px]"
          rows={[
            { label: 'Kitchen', value: selectedKitchenId ? kitchenName : '—' },
            { label: 'Items', value: <span className="font-mono">{lines.length}</span> },
            {
              label: 'Produced',
              value: <span className="font-mono">{formatTotal(totalProduced)}</span>,
            },
            {
              label: 'Wastage',
              value: (
                <span
                  className={cn(
                    'font-mono',
                    overallPercent > WASTAGE_ALERT_PERCENT && 'text-ds-status-pending-fg',
                  )}
                >
                  {formatTotal(totalWasted)}
                </span>
              ),
            },
            {
              label: 'Accepted',
              value: (
                <span className="font-mono text-ds-status-ok-fg">{formatTotal(totalAccepted)}</span>
              ),
            },
          ]}
          sticky
          title="Summary"
        >
          {isEditable ? (
            <>
              <div
                className={cn(
                  'flex gap-2.5 rounded-xl p-3 text-[12.5px] font-semibold',
                  readiness.tone === 'ok' && 'bg-ds-status-ok-bg text-ds-status-ok-fg',
                  readiness.tone === 'bad' && 'bg-ds-status-bad-bg text-ds-status-bad-fg',
                  readiness.tone === 'neutral' &&
                    'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
                )}
                role="status"
              >
                {readiness.tone === 'ok' ? (
                  <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
                ) : readiness.tone === 'bad' ? (
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-px h-4 w-4 shrink-0"
                    strokeWidth={2}
                  />
                ) : (
                  <Info aria-hidden="true" className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
                )}
                {readiness.text}
              </div>
              <div className="flex flex-col gap-2">
                {currentStep === 1 ? (
                  <Button disabled={isBusy} onClick={() => goTo(2)} type="button">
                    Continue to items
                  </Button>
                ) : null}
                {currentStep === 2 ? (
                  <Button disabled={isBusy} onClick={() => goTo(3)} type="button">
                    Continue to check
                  </Button>
                ) : null}
                {currentStep === 3 && canPostHere ? (
                  <Button disabled={isBusy} onClick={() => save(true)} type="button">
                    {saveMutation.isPending ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                    )}
                    Post to kitchen stock
                  </Button>
                ) : null}
                {currentStep === 3 && canSave ? (
                  <Button
                    disabled={isBusy}
                    onClick={() => save(false)}
                    type="button"
                    variant="outline"
                  >
                    Save draft
                  </Button>
                ) : null}
                {currentStep > 1 ? (
                  <Button
                    disabled={isBusy}
                    onClick={() => goTo((currentStep - 1) as ProductionStep)}
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                    Back
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SummaryCard>
      </div>

      <nav
        aria-labelledby="production-today"
        className="overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
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
          <div className="grid border-t border-ds-divider grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {(todayQuery.data ?? []).map((entry) => {
              const isCurrent = entry.id === productionId;

              return (
                <Link
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 border-b border-ds-divider px-4 py-2.5 transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-primary',
                    isCurrent ? 'bg-ds-selected' : 'hover:bg-ds-subtle',
                  )}
                  href={`/kitchen/productions?id=${entry.id}`}
                  key={entry.id}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        'font-mono text-[13px] font-bold tabular-nums',
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
            })}
          </div>
        )}
      </nav>
    </section>
  );
}
