'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { KitchenProductionInput } from '@aahar/api-client';
import { StatusChip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input, Panel, Skeleton } from '@/components/ui';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { invalidateKitchenProductionQueries } from '@/lib/query-invalidation';
import { formatProductionQuantity } from '@/components/kitchen/productions/shared';
import { useHospitals, useKitchens } from '@/components/kitchen/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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

      return response.data.items.filter((mapping) => mapping.item.itemType === 'READYMADE');
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
    queryKey: queryKeys.kitchenProductions('detail', productionId),
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
