'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { TransferInput } from '@aahar/api-client';
import {
  FlowStepper,
  StatusChip,
  FoodTypeMarker,
  TypeTag,
  KeyboardHint,
  LoadingSkeleton,
  SummaryCard,
} from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FieldError, Input, Panel, RequiredMark, Skeleton } from '@/components/ui';
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
  transferHeaderSchema,
  type SourceType,
  type TransferHeaderFormValues,
  type TransferLineDraft,
} from '@/components/inventory/transfers/transfer-form';
import { readTransferPrefill } from '@/components/inventory/transfers/transfer-prefill';
import { useSourceStock } from '@/components/inventory/transfers/use-source-stock';
import { useAuth } from '@/components/auth-provider';
import { queryKeys } from '@/lib/query-keys';
import { useDeviceDraft } from '@/lib/use-device-draft';
import { setUrlParams } from '@/lib/use-url-state';
import { SetupNotice } from '@/components/location-empty-states';

const stepLabels = ['Where from and to', 'Items', 'Check and send'];

function emptyHeader(hospitalId: string): TransferHeaderFormValues {
  return {
    businessDate: '',
    destinationType: 'RESTAURANT',
    hospitalId,
    remarks: '',
    restaurantId: '',
    sourceId: '',
    sourceType: 'STORE',
    transferDate: defaultTransferDate(),
  };
}

const sourceTypeChoices = [
  { label: 'Store', permissions: ['TRANSFER_CREATE'], value: 'STORE' },
  {
    label: 'Kitchen',
    permissions: ['TRANSFER_CREATE', 'KITCHEN_TRANSFER_CREATE'],
    value: 'KITCHEN',
  },
  // A restaurant passes its ready-made leftovers to another restaurant.
  {
    label: 'Restaurant',
    permissions: ['TRANSFER_CREATE', 'RESTAURANT_TRANSFER_SEND'],
    value: 'RESTAURANT',
  },
] as const satisfies ReadonlyArray<{
  label: string;
  permissions: readonly string[];
  value: SourceType;
}>;

export function CreateTransferPageClient() {
  const { isAllLocations, isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { currentUser, hasPermission } = useAuth();
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
  const [step, setStep] = useState(0);
  // A "Send from store" link (Restaurant or Counter stock) names the destination and lines,
  // maybe the store; read it once.
  const [prefill] = useState(() =>
    typeof window === 'undefined'
      ? null
      : readTransferPrefill(new URLSearchParams(window.location.search)),
  );
  const prefillApplied = useRef(false);
  // Set when an applied link left the store to choose: the location's only store is then picked.
  const [pickSoleStore, setPickSoleStore] = useState(false);
  const form = useForm<TransferHeaderFormValues>({
    defaultValues: emptyHeader(scopedHospitalId ?? ''),
  });
  const header = form.watch();
  const selectedHospitalId = header.hospitalId;
  const selectedSourceId = header.sourceId;
  const selectedSourceType = header.sourceType;
  // Kitchens and restaurants hold ready-made stock by business date; stores hold MRP batches.
  const isReadymade = selectedSourceType !== 'STORE';
  const sourceNoun = selectedSourceType.toLowerCase();
  const sourceTypeOptions = sourceTypeChoices
    .filter((choice) => hasPermission([...choice.permissions]))
    .map(({ label, value }) => ({ label, value }));
  const firstSourceType = sourceTypeOptions[0]?.value;
  const mayUseSourceType = sourceTypeOptions.some((option) => option.value === selectedSourceType);
  const selectedBusinessDate = header.businessDate;
  const selectedRestaurantId = header.restaurantId;
  const selectedDestinationType = header.destinationType;
  const isToCounter = selectedDestinationType === 'COUNTER';
  const destinationNoun = isToCounter ? 'counter' : 'restaurant';
  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(selectedHospitalId);
  const kitchensQuery = useKitchens(selectedHospitalId);
  const restaurantsQuery = useRestaurants(selectedHospitalId);
  const countersQuery = useQuery({
    enabled: Boolean(selectedHospitalId) && isToCounter,
    queryFn: async () =>
      (
        await organizationApi.listCounters({
          hospitalId: selectedHospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'counterName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.counters('transfer-options', selectedHospitalId),
  });
  const destinationOptions = isToCounter
    ? (countersQuery.data ?? []).map((counter) => ({
        id: counter.id,
        name: `${counter.restaurant.restaurantName} · ${counter.counterName}`,
      }))
    : (restaurantsQuery.data ?? [])
        .filter((restaurant) => restaurant.id !== selectedSourceId)
        .map((restaurant) => ({ id: restaurant.id, name: restaurant.restaurantName }));
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
  const sourceOptions = {
    KITCHEN: (kitchensQuery.data ?? []).map((kitchen) => ({
      id: kitchen.id,
      name: kitchen.kitchenName,
    })),
    RESTAURANT: (restaurantsQuery.data ?? []).map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.restaurantName,
    })),
    STORE: (storesQuery.data ?? []).map((store) => ({ id: store.id, name: store.storeName })),
  }[selectedSourceType];
  const sourceName = sourceOptions.find((option) => option.id === selectedSourceId)?.name ?? null;

  // Open on a source this user may send from: restaurant staff send from restaurants only.
  useEffect(() => {
    if (mayUseSourceType || !firstSourceType) return;
    form.setValue('sourceType', firstSourceType);
    if (firstSourceType === 'RESTAURANT') form.setValue('destinationType', 'RESTAURANT');
  }, [firstSourceType, form, mayUseSourceType]);
  const restaurantName =
    destinationOptions.find((option) => option.id === selectedRestaurantId)?.name ?? null;

  // Items recently sent to this restaurant or counter, offered as one-tap chips.
  const recentToRestaurantQuery = useQuery({
    enabled: Boolean(selectedRestaurantId),
    queryFn: async () =>
      (
        await organizationApi.listTransfers({
          destinationId: selectedRestaurantId,
          destinationType: selectedDestinationType,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data.items,
    queryKey: queryKeys.transfersRecentToRestaurant(selectedRestaurantId),
  });

  // Only a real change of location clears the route: a restored draft or a prefill is already
  // there, and dev's double-run effects must not wipe it.
  useEffect(() => {
    if (scopedHospitalId && form.getValues('hospitalId') !== scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('sourceId', '', { shouldValidate: true });
      form.setValue('restaurantId', '', { shouldValidate: true });
      setLines([]);
    }
  }, [form, scopedHospitalId]);

  // Unsent work is kept on this device per user and location, and brought back on return
  // (after the location is applied). A prefill link wins over it.
  const draftKey =
    isLoadingLocations || !currentUser
      ? null
      : `aahar.new-transfer.draft:${currentUser.id}:${scopedHospitalId ?? 'all'}`;
  const draft = useDeviceDraft(
    draftKey,
    { header, lines },
    {
      keep: Boolean(header.sourceId || header.restaurantId || lines.length),
      onRestore: (saved) => {
        if (prefill && !prefillApplied.current) return false;
        // Drafts kept before counters could receive stock have no destination type.
        form.reset({
          ...saved.header,
          destinationType: saved.header.destinationType === 'COUNTER' ? 'COUNTER' : 'RESTAURANT',
        });
        setLines(saved.lines);
        return true;
      },
    },
  );

  // Runs after the draft is offered for the same key, so the link's store and lines win.
  useEffect(() => {
    if (!prefill || prefillApplied.current || !draftKey) {
      return;
    }

    prefillApplied.current = true;
    // A refresh then brings back the draft (with any edits) rather than the link again.
    setUrlParams({ from: null, hospital: null, items: null, to: null });

    if (scopedHospitalId && prefill.hospitalId && prefill.hospitalId !== scopedHospitalId) {
      return;
    }

    setPickSoleStore(!prefill.storeId);
    form.reset({
      ...emptyHeader(scopedHospitalId ?? prefill.hospitalId),
      ...(prefill.destination
        ? { destinationType: prefill.destination.type, restaurantId: prefill.destination.id }
        : {}),
      sourceId: prefill.storeId ?? '',
    });
    setLines(
      prefill.items.map((item) => ({
        clientId: clientId('transfer-line'),
        itemId: item.itemId,
        remarks: '',
        sentQty: String(item.qty),
        stockBalanceId: '',
      })),
    );
  }, [draftKey, form, prefill, scopedHospitalId]);

  useEffect(() => {
    if (!pickSoleStore || !storesQuery.data) return;
    setPickSoleStore(false);
    if (storesQuery.data.length === 1) form.setValue('sourceId', storesQuery.data[0]!.id);
  }, [form, pickSoleStore, storesQuery.data]);

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
      draft.clear();

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
          recordId: transfer.id,
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
  // A restored draft's lines are only checked once the source's stock has loaded.
  const isCheckingStock = stockQuery.isLoading && lines.length > 0;
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

  /** Checks the route; shows the same field errors as before and returns it when it is valid. */
  function validateHeader(): ReturnType<typeof transferHeaderSchema.parse> | null {
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
      return null;
    }

    form.clearErrors();
    return parsedHeader.data;
  }

  /** The request for a valid route and lines, or why the lines cannot be sent. */
  function buildPayload(
    parsed: ReturnType<typeof transferHeaderSchema.parse>,
  ): TransferInput | string {
    if (lines.length === 0) {
      return 'Add at least one item.';
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
        return 'Select an item for every transfer line.';
      }

      if (!Number.isFinite(sentQty) || sentQty <= 0) {
        return 'Transfer quantity must be greater than zero.';
      }

      if (line.stockBalanceId) {
        const stock = stockMap.get(line.stockBalanceId);
        const remaining = stock ? (remainingByStockId.get(stock.id) ?? 0) : 0;

        if (!stock || sentQty > remaining + 0.0005) {
          return `Available quantity in the chosen ${group.itemName} batch is ${formatQuantity(remaining)}.`;
        }

        remainingByStockId.set(stock.id, Number((remaining - sentQty).toFixed(3)));
        preparedLines.push({ remarks: optionalValue(line.remarks), sentQty, stock });
        continue;
      }

      const allocations = allocateFefo(
        group.stocks,
        sentQty,
        parsed.sourceType,
        remainingByStockId,
      );
      const allocatedQty = allocations.reduce(
        (total, allocation) => total + allocation.allocatedQty,
        0,
      );

      if (allocatedQty < sentQty) {
        return `Available quantity for ${group.itemName} is ${formatQuantity(
          allocatedQty,
        )}. Please enter quantity up to ${formatQuantity(allocatedQty)}.`;
      }

      preparedLines.push(
        ...allocations.map((allocation) => ({
          remarks: optionalValue(line.remarks),
          sentQty: allocation.allocatedQty,
          stock: allocation.stock,
        })),
      );
    }

    if (preparedLines.length > 200) {
      return 'A transfer can carry at most 200 batch lines. Split it into two transfers.';
    }

    const totals = new Map<string, number>();

    for (const line of preparedLines) {
      totals.set(line.stock.id, (totals.get(line.stock.id) ?? 0) + line.sentQty);
    }

    for (const [stockId, requestedQty] of totals.entries()) {
      const stock = stockMap.get(stockId);

      if (!stock || requestedQty > stock.availableQty + 0.0005) {
        return 'Transfer quantity cannot exceed available source quantity.';
      }
    }

    const selectedStocks = preparedLines.map((line) => line.stock);
    const businessDateFilter = optionalValue(parsed.businessDate);
    let transferBusinessDate = businessDateFilter;

    if (parsed.sourceType !== 'STORE') {
      const stockBusinessDates = new Set(
        selectedStocks.map((stock) => toDateOnlyValue(stock.businessDate)).filter(Boolean),
      );

      if (stockBusinessDates.size === 0) {
        return 'Selected ready-made stock is missing a business date.';
      }

      if (businessDateFilter) {
        const mismatchedStock = selectedStocks.find(
          (stock) => toDateOnlyValue(stock.businessDate) !== businessDateFilter,
        );

        if (mismatchedStock) {
          return 'Selected ready-made stock does not match the chosen business date.';
        }
      } else if (stockBusinessDates.size > 1) {
        return 'Select ready-made stock from one business date per transfer.';
      } else {
        transferBusinessDate = [...stockBusinessDates][0];
      }
    }

    return {
      destinationId: parsed.restaurantId,
      destinationType: parsed.destinationType,
      ...(transferBusinessDate ? { businessDate: transferBusinessDate } : {}),
      hospitalId: parsed.hospitalId,
      items: preparedLines.map((line) => ({
        batchNumber: parsed.sourceType === 'STORE' ? (line.stock.batchNumber ?? '') : undefined,
        expiryDate:
          parsed.sourceType === 'STORE' ? toDateOnlyValue(line.stock.expiryDate) : undefined,
        itemId: line.stock.itemId,
        remarks: line.remarks,
        sentQty: line.sentQty,
      })),
      remarks: optionalValue(parsed.remarks),
      sourceId: parsed.sourceId,
      sourceType: parsed.sourceType,
      transferDate: new Date(parsed.transferDate).toISOString(),
    };
  }

  /** Checks everything and returns the request, or shows why not on the step that needs fixing. */
  function prepare(): TransferInput | null {
    setFormError('');
    setHasTriedSubmit(true);

    const parsed = validateHeader();

    if (!parsed) {
      goTo(0);
      return null;
    }

    const payload = buildPayload(parsed);

    if (typeof payload === 'string') {
      setFormError(payload);
      goTo(1);
      return null;
    }

    return payload;
  }

  function submit(dispatch: boolean) {
    const payload = prepare();

    if (payload) {
      saveMutation.mutate({ dispatch, payload });
    }
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

  function goTo(next: number) {
    if (next === step) {
      return;
    }

    setStep(next);
    window.requestAnimationFrame(() =>
      document.getElementById('new-transfer-steps')?.scrollIntoView({ block: 'nearest' }),
    );
  }

  function goToItems() {
    setFormError('');

    if (validateHeader()) {
      goTo(1);
    }
  }

  function goToReview() {
    if (prepare()) {
      goTo(2);
    }
  }

  function discard() {
    draft.clear();
    router.push('/inventory/transfers');
  }

  function startOver() {
    draft.clear();
    form.reset(emptyHeader(scopedHospitalId ?? selectedHospitalId));
    resetLines();
    setStep(0);
  }

  const isBusy = saveMutation.isPending;
  const errors = form.formState.errors;
  const fieldLabel = 'flex flex-col gap-1.5 text-[12.5px] font-bold text-ds-text-2';
  const selectClass =
    'h-control w-full rounded-control border border-ds-input bg-ds-surface px-2.5 text-[13.5px] font-semibold text-ds-text outline-hidden focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted';
  const activeItem = itemMatches[Math.min(activeItemIndex, itemMatches.length - 1)];
  const totalQty = Number(
    lines.reduce((total, line) => total + (Number(line.sentQty) || 0), 0).toFixed(3),
  );
  const readiness: { text: string; tone: 'bad' | 'ok' | 'todo' } =
    !selectedSourceId || !selectedRestaurantId
      ? {
          text: `Choose where the stock comes from and which ${destinationNoun} receives it.`,
          tone: 'todo',
        }
      : lines.length === 0
        ? { text: 'Add at least one item to submit.', tone: 'todo' }
        : invalidLineCount > 0
          ? {
              text: `${plural(invalidLineCount, 'line')} ${invalidLineCount === 1 ? 'needs' : 'need'} attention before you can submit.`,
              tone: 'bad',
            }
          : { text: 'All lines are within available stock.', tone: 'ok' };
  // Why the faded submit button will not send yet, said next to it.
  const submitBlocker = canSubmit
    ? null
    : !selectedSourceId
      ? 'Choose where it comes from'
      : !selectedRestaurantId
        ? `Choose the ${destinationNoun} it goes to`
        : lines.length === 0
          ? 'Add at least one item'
          : `Fix ${plural(invalidLineCount, 'line')} first`;
  const changeLinkClass =
    'rounded-sm text-[12.5px] font-bold text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';
  const route = (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
      <span>{sourceName ?? '—'}</span>
      <span aria-hidden="true" className="text-ds-muted">
        →
      </span>
      <span className="sr-only">to</span>
      <span>{restaurantName ?? '—'}</span>
    </span>
  );

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
        {draft.savedAt ? (
          <div className="flex items-center gap-3">
            <span
              aria-live="polite"
              className="flex items-center gap-1.5 text-[12.5px] text-ds-muted"
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5 text-ds-link" strokeWidth={2} />
              Draft kept on this device ·{' '}
              {formatWhen(draft.savedAt.toISOString()).replace('Today ', '')}
            </span>
            <Button disabled={isBusy} onClick={startOver} size="sm" type="button" variant="ghost">
              Start over
            </Button>
          </div>
        ) : null}
      </div>

      <div className="scroll-mt-20" id="new-transfer-steps">
        <FlowStepper
          label="New transfer steps"
          steps={stepLabels.map((label, index) => ({
            label,
            onSelect: index < step ? () => goTo(index) : undefined,
            state: index < step ? 'done' : index === step ? 'current' : 'todo',
          }))}
        />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
          {step === 0 ? (
            <Panel
              aria-labelledby="transfer-route"
              className="flex flex-col gap-3.5 p-[18px]"
              role="region"
            >
              <h2 className="text-[15px] font-extrabold text-ds-text" id="transfer-route">
                Where from and to
              </h2>
              {isAllLocations ? (
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
                  <SegmentedControl<SourceType>
                    className="flex w-full"
                    label="Source type"
                    onChange={(value) => {
                      form.setValue('sourceType', value);
                      form.setValue('sourceId', '');
                      // A restaurant's leftovers go to another restaurant, never a counter.
                      if (value === 'RESTAURANT') {
                        form.setValue('destinationType', 'RESTAURANT');
                        form.setValue('restaurantId', '');
                      }
                      resetLines();
                    }}
                    options={sourceTypeOptions}
                    value={selectedSourceType}
                  />
                  <label className={fieldLabel}>
                    <span>
                      {
                        sourceTypeChoices.find((choice) => choice.value === selectedSourceType)
                          ?.label
                      }
                      <RequiredMark />
                    </span>
                    <select
                      aria-required="true"
                      className={selectClass}
                      disabled={!selectedHospitalId || isBusy}
                      onChange={(event) => {
                        form.setValue('sourceId', event.target.value, {
                          shouldValidate: hasTriedSubmit,
                        });
                        // Lines a link brought before any store was picked stay for that store.
                        if (selectedSourceId) resetLines();
                      }}
                      value={selectedSourceId}
                    >
                      <option value="">
                        {selectedHospitalId ? `Select ${sourceNoun}` : 'Choose a location first'}
                      </option>
                      {sourceOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {errors.sourceId ? <FieldError>{errors.sourceId.message}</FieldError> : null}
                  </label>
                  {selectedHospitalId &&
                  selectedSourceType !== 'RESTAURANT' &&
                  (selectedSourceType === 'KITCHEN' ? kitchensQuery.data : storesQuery.data)
                    ?.length === 0 ? (
                    selectedSourceType === 'KITCHEN' ? (
                      <SetupNotice href="/masters/kitchens/new" linkLabel="Create a kitchen">
                        This location has no kitchen yet.
                      </SetupNotice>
                    ) : (
                      <SetupNotice href="/masters/stores/new" linkLabel="Create a store">
                        This location has no store yet.
                      </SetupNotice>
                    )
                  ) : null}
                </fieldset>
                <fieldset className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-ds-border p-3.5">
                  <legend className="px-1.5 text-xs font-bold uppercase tracking-[0.06em] text-ds-muted">
                    To
                  </legend>
                  <SegmentedControl<'COUNTER' | 'RESTAURANT'>
                    className="flex w-full"
                    label="Destination type"
                    onChange={(value) => {
                      form.setValue('destinationType', value);
                      form.setValue('restaurantId', '');
                    }}
                    options={
                      selectedSourceType === 'RESTAURANT'
                        ? [{ label: 'Restaurant', value: 'RESTAURANT' }]
                        : [
                            { label: 'Restaurant', value: 'RESTAURANT' },
                            { label: 'Counter', value: 'COUNTER' },
                          ]
                    }
                    value={selectedDestinationType}
                  />
                  <label className={fieldLabel}>
                    <span>
                      {isToCounter ? 'Counter' : 'Restaurant'}
                      <RequiredMark />
                    </span>
                    <select
                      aria-required="true"
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
                        {selectedHospitalId
                          ? `Select ${destinationNoun}`
                          : 'Choose a location first'}
                      </option>
                      {destinationOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {errors.restaurantId ? (
                      <FieldError>{errors.restaurantId.message}</FieldError>
                    ) : null}
                  </label>
                  {selectedHospitalId &&
                  (isToCounter ? countersQuery.data : restaurantsQuery.data) &&
                  destinationOptions.length === 0 ? (
                    isToCounter ? (
                      <SetupNotice href="/masters/counters/new" linkLabel="Create a counter">
                        This location has no active counter to send stock to yet.
                      </SetupNotice>
                    ) : (
                      <SetupNotice href="/masters/restaurants/new" linkLabel="Create a restaurant">
                        {selectedSourceType === 'RESTAURANT'
                          ? 'This location has no other restaurant to pass leftovers to.'
                          : 'This location has no restaurant to send stock to yet.'}
                      </SetupNotice>
                    )
                  ) : null}
                </fieldset>
              </div>
              <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                <label className={fieldLabel}>
                  <span>
                    Transfer date &amp; time
                    <RequiredMark />
                  </span>
                  <Input
                    aria-required="true"
                    disabled={isBusy}
                    type="datetime-local"
                    {...form.register('transferDate')}
                  />
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
                      // Ready-made stock is listed per business date, so lines no longer match.
                      onChange: () => isReadymade && resetLines(),
                    })}
                  />
                  <span className="text-[11.5px] font-medium text-ds-muted">
                    {isReadymade
                      ? `Shows ${sourceNoun} stock from this date only.`
                      : 'Optional for store stock.'}
                  </span>
                </label>
              </div>
              <label className={fieldLabel}>
                <span>
                  Note for the receiving {destinationNoun}{' '}
                  <span className="font-medium text-ds-muted">(optional)</span>
                </span>
                <Textarea
                  disabled={isBusy}
                  maxLength={500}
                  placeholder="e.g. Lunch top-up, deliver before 12:30"
                  rows={2}
                  {...form.register('remarks')}
                />
              </label>
            </Panel>
          ) : step === 1 ? (
            <Panel
              aria-labelledby="transfer-items"
              // Not clipped: the item search's list drops below the card (the table rounds its own corners).
              role="region"
            >
              <div className="flex flex-col gap-3 px-[18px] pb-3 pt-[18px]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h2 className="text-[15px] font-extrabold text-ds-text" id="transfer-items">
                    Items
                  </h2>
                  <span className="text-[12.5px] text-ds-muted">
                    {isReadymade
                      ? `Ready-made ${sourceNoun} stock, oldest business date first`
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
                          ? `Add an item by name or code — only items in stock at this ${sourceNoun}`
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
                        <li aria-label="Loading stock" className="space-y-1 p-1">
                          <Skeleton className="h-9 w-full" />
                          <Skeleton className="h-9 w-full" />
                        </li>
                      ) : itemMatches.length === 0 ? (
                        <li className="px-3 py-2 text-[13px] text-ds-muted">
                          {stockGroups.length === 0
                            ? isReadymade
                              ? selectedSourceType === 'RESTAURANT'
                                ? 'No ready-made stock at this restaurant for the chosen date. It arrives when a kitchen transfer is accepted.'
                                : 'No ready-made stock at this kitchen for the chosen date. It arrives when a production is posted.'
                              : 'No MRP stock at this store. It arrives when a GRN is posted.'
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
                                {isReadymade && group.businessDate
                                  ? ` · produced ${formatDateOnly(group.businessDate)}`
                                  : group.nearestExpiryDate
                                    ? ` · next expiry ${formatDateOnly(group.nearestExpiryDate)}`
                                    : ''}
                              </span>
                            </span>
                            <span className="whitespace-nowrap text-xs font-semibold font-mono text-ds-text-2">
                              {formatQuantity(group.totalAvailableQty)} available
                            </span>
                            {addedKeys.has(group.key) ? (
                              <span className="text-[11px] font-bold text-ds-link">Added</span>
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
                      Often sent to this {destinationNoun}:
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

              {isCheckingStock ? (
                <div className="border-t border-ds-divider px-[18px] py-3">
                  <LoadingSkeleton rows={Math.min(lines.length, 5)} />
                </div>
              ) : lines.length > 0 ? (
                <div className="overflow-x-auto rounded-b-card">
                  <table className="w-full min-w-[700px] table-fixed text-[13px]">
                    <thead className="border-y border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                      <tr>
                        <th className="w-10 py-2 pl-[18px] font-semibold">#</th>
                        <th className="px-2 py-2 font-semibold">Item</th>
                        <th className="w-[34%] px-2 py-2 font-semibold">
                          {isReadymade ? 'Produced' : 'Batch'}
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
                              <td className="py-2.5 pl-[18px] text-[12.5px] font-mono text-ds-muted">
                                {index + 1}
                              </td>
                              <td className="px-2 py-2.5">
                                <span className="flex min-w-0 items-center gap-2">
                                  {first ? <FoodTypeMarker type={first.item.type} /> : null}
                                  <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-[13.5px] font-bold text-ds-text">
                                      {group?.itemName ?? 'Unavailable item'}
                                    </span>
                                    <span className="truncate font-mono text-[11.5px] text-ds-muted">
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
                                      {isReadymade
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
                                            : 'bg-ds-selected text-ds-link',
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
                              <td className="px-2 py-2.5 text-right font-semibold font-mono text-ds-text-2">
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
                                    'h-[38px] rounded-control border-[1.5px] font-bold font-mono',
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
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                  />
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
          ) : (
            <Panel
              aria-labelledby="transfer-review"
              className="flex flex-col gap-4 p-[18px]"
              role="region"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-extrabold text-ds-text" id="transfer-review">
                  Check and send
                </h2>
                <button className={changeLinkClass} onClick={() => goTo(0)} type="button">
                  Change route
                </button>
              </div>
              <dl className="grid gap-3.5 text-[13px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-ds-muted">From</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-bold text-ds-text">
                    <TypeTag type={selectedSourceType} />
                    <span className="truncate">{sourceName ?? '—'}</span>
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-ds-muted">To</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-bold text-ds-text">
                    <TypeTag type={selectedDestinationType} />
                    <span className="truncate">{restaurantName ?? '—'}</span>
                  </dd>
                </div>
                {isAllLocations ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-xs font-semibold text-ds-muted">Location</dt>
                    <dd className="font-semibold text-ds-text">
                      {hospitalsQuery.data?.find((hospital) => hospital.id === selectedHospitalId)
                        ?.hospitalName ?? '—'}
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-ds-muted">Transfer date &amp; time</dt>
                  <dd className="font-semibold text-ds-text">
                    {header.transferDate ? formatWhen(header.transferDate) : '—'}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-semibold text-ds-muted">Business date</dt>
                  <dd className="font-semibold text-ds-text">
                    {header.businessDate ? formatDateOnly(header.businessDate) : 'Not set'}
                  </dd>
                </div>
                <div className="flex flex-col gap-1 [grid-column:1/-1]">
                  <dt className="text-xs font-semibold text-ds-muted">
                    Note for the receiving {destinationNoun}
                  </dt>
                  <dd className="whitespace-pre-line text-ds-text-2">
                    {header.remarks.trim() || 'None'}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-3 border-t border-ds-divider pt-3.5">
                <h3 className="text-[13.5px] font-extrabold text-ds-text">
                  {plural(lines.length, 'item')}
                </h3>
                <button className={changeLinkClass} onClick={() => goTo(1)} type="button">
                  Change items
                </button>
              </div>
              <ol className="divide-y divide-ds-divider rounded-tile border border-ds-border">
                {lines.map((line, index) => {
                  const check = lineChecks.get(line.clientId);

                  return (
                    <li className="flex items-start gap-3 px-3.5 py-3" key={line.clientId}>
                      <span className="w-5 shrink-0 pt-px font-mono text-[12.5px] text-ds-muted">
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-2">
                          {check?.firstStock ? (
                            <FoodTypeMarker type={check.firstStock.item.type} />
                          ) : null}
                          <span className="truncate text-[13.5px] font-bold text-ds-text">
                            {check?.group?.itemName ?? 'Unavailable item'}
                          </span>
                        </span>
                        <span className="font-mono text-[11.5px] text-ds-muted">
                          {check?.group?.itemCode}
                        </span>
                        <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-ds-text-3">
                          {(check?.allocations ?? []).map((allocation) => (
                            <li className="flex flex-wrap gap-x-1.5" key={allocation.stock.id}>
                              <span>
                                {isReadymade
                                  ? `Produced ${formatDateOnly(allocation.stock.businessDate)}`
                                  : [
                                      allocation.stock.batchNumber ?? 'No batch',
                                      allocation.stock.expiryDate
                                        ? `exp ${formatDateOnly(allocation.stock.expiryDate)}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                              </span>
                              <span className="font-mono font-semibold text-ds-text-2">
                                × {formatQuantity(allocation.allocatedQty)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {check?.error ? (
                          <span
                            className="mt-1 flex items-center gap-1.5 text-xs font-bold text-ds-status-bad-fg"
                            role="alert"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2}
                            />
                            {check.error}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono text-[15px] font-bold text-ds-text">
                        {formatQuantity(Number(line.sentQty) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}
        </div>

        <SummaryCard
          className="min-w-0 flex-[1_1_300px]"
          rows={[
            { label: 'Route', value: route },
            { label: 'Items', value: <span className="font-mono">{lines.length}</span> },
            {
              label: 'Total quantity',
              value: <span className="font-mono">{formatQuantity(totalQty)}</span>,
            },
            {
              label: isReadymade ? 'Stock rows' : 'Batches',
              value: <span className="font-mono">{batchCount}</span>,
            },
          ]}
          sticky
          title="Summary"
        >
          {isCheckingStock ? (
            <Skeleton className="h-11 w-full rounded-xl" />
          ) : (
            <p
              className={cn(
                'flex gap-2.5 rounded-xl p-3 text-[12.5px] font-semibold',
                readiness.tone === 'ok'
                  ? 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                  : readiness.tone === 'bad'
                    ? 'bg-ds-status-bad-bg text-ds-status-bad-fg'
                    : 'bg-ds-subtle text-ds-text-3',
              )}
              role="status"
            >
              {readiness.tone === 'ok' ? (
                <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
              ) : (
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-px h-4 w-4 shrink-0"
                  strokeWidth={2}
                />
              )}
              {readiness.text}
            </p>
          )}
          {formError ? (
            <p
              className="rounded-control bg-ds-status-bad-bg p-3 text-[12.5px] font-semibold text-ds-status-bad-fg"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
          {step === 2 ? (
            <div className="flex flex-col gap-1.5 text-[12.5px] text-ds-text-3">
              <span className="font-extrabold text-ds-text">When you submit</span>
              <span>
                Stock is reserved at {sourceName ?? 'the source'}, and{' '}
                {restaurantName ?? `the ${destinationNoun}`} is asked to acknowledge each line.
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {step === 2 ? (
              <>
                <Button
                  aria-describedby={submitBlocker ? 'transfer-submit-blocker' : undefined}
                  aria-disabled={!canSubmit || undefined}
                  className={cn('w-full', !canSubmit && 'opacity-60')}
                  disabled={isBusy}
                  onClick={() => submit(true)}
                  type="button"
                >
                  {isBusy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                  Submit for acknowledgement
                </Button>
                {submitBlocker ? (
                  <p
                    className="-mt-0.5 text-center text-[12px] font-semibold text-ds-text-3"
                    id="transfer-submit-blocker"
                  >
                    {submitBlocker}
                  </p>
                ) : null}
                <Button
                  className="w-full"
                  disabled={isBusy}
                  onClick={() => submit(false)}
                  type="button"
                  variant="outline"
                >
                  Save draft
                </Button>
              </>
            ) : (
              <Button
                className="w-full"
                disabled={isBusy || (step === 1 && isCheckingStock)}
                onClick={step === 0 ? goToItems : goToReview}
                type="button"
              >
                {step === 0 ? 'Next: items' : 'Next: check and send'}
              </Button>
            )}
            <div className="flex gap-2">
              {step > 0 ? (
                <Button
                  className="flex-1"
                  disabled={isBusy}
                  onClick={() => goTo(step - 1)}
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                  Back
                </Button>
              ) : null}
              <Button
                className="flex-1"
                disabled={isBusy}
                onClick={discard}
                type="button"
                variant="ghost"
              >
                Discard
              </Button>
            </div>
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
    </section>
  );
}
