'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { TransferInput } from '@aahar/api-client';
import { StatusChip, FoodTypeMarker, KeyboardHint, SummaryCard } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input, Panel } from '@/components/ui';
import { SegmentedControl } from '@/components/ui-controls';
import { Textarea } from '@/components/organization/shared/form-controls';
import { recordHref } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { invalidateTransferQueries } from '@/lib/query-invalidation';
import {
  clientId,
  daysFromToday,
  formatDateOnly,
  formatQuantity,
  formatWhen,
  optionalValue,
  plural,
  toDateOnlyValue,
  useHospitals,
  useKitchens,
  useRestaurants,
  useStores,
} from '@/components/inventory/shared/utils';
import {
  allocateFefo,
  buildTransferItemGroups,
  fefoWarningDays,
  type PreparedTransferLine,
  type TransferItemGroup,
} from '@/components/inventory/transfers/fefo-allocation';
import {
  defaultTransferDate,
  readLocalTransferDraft,
  transferHeaderSchema,
  writeLocalTransferDraft,
  type TransferHeaderFormValues,
  type TransferLineDraft,
} from '@/components/inventory/transfers/transfer-form';
import { useSourceStock } from '@/components/inventory/transfers/use-source-stock';
import { queryKeys } from '@/lib/query-keys';

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
  const { isAllLocations, scopedHospitalId } = useLocationContext();
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
    queryKey: queryKeys.transfersRecentToRestaurant(selectedRestaurantId),
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
            {isAllLocations ? (
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
