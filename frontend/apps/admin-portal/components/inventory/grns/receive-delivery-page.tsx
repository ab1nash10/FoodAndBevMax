'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Loader2, PackageCheck, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Grn, GrnInput } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { QuantityStepper } from '@/components/ui-controls';
import {
  checkHeader,
  checkLines,
  emptyBatch,
  emptyLine,
  grnLinesSchema,
  headerSchema,
  lineTotals,
  quantity,
  rejectedQty,
  useMappedStoreItems,
  type BatchDraft,
  type GrnHeaderFormValues,
  type LineDraft,
} from '@/components/inventory/grns/grn-form';
import { readReceivePrefill } from '@/components/inventory/grns/receive-prefill';
import {
  clientId,
  daysFromToday,
  defaultReceivedDate,
  optionalValue,
  plural,
  useHospitals,
  useStores,
} from '@/components/inventory/shared/utils';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateGrnQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useDeviceDraft } from '@/lib/use-device-draft';
import { setUrlParams } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const rejectionReasons = ['Damaged', 'Expired', 'Short supply', 'Wrong item'];
const draftKey = 'aahar.receive-delivery.draft';
const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });

/** "Expires in 5 months", or a warning when it is close or past. */
function expiryHint(
  expiryDate: string,
): { text: string; tone: 'bad' | 'muted' | 'pending' } | null {
  const days = daysFromToday(expiryDate);

  if (days === null) return null;
  if (days < 0) return { text: 'Already expired: it cannot be accepted', tone: 'bad' };
  if (days === 0) return { text: 'Expires today', tone: 'bad' };
  if (days <= 30) return { text: `Expires in ${plural(days, 'day')}`, tone: 'pending' };

  const months = Math.round(days / 30);

  return { text: `Expires in ${plural(months, 'month')}`, tone: 'muted' };
}

function emptyHeader(hospitalId: string, receivedBy: string): GrnHeaderFormValues {
  return {
    hospitalId,
    invoiceNumber: '',
    poNumber: '',
    receivedBy,
    receivedDate: defaultReceivedDate(),
    remarks: '',
    storeId: '',
    vendorName: '',
  };
}

/**
 * The store keeper's delivery screen: who it came from and into which store, then each item with
 * its batch, expiry and how many were received and accepted (a reason for anything rejected),
 * then Post to stock. The delivery is kept on this device until it is posted or saved.
 */
export function ReceiveDeliveryPageClient() {
  const { currentUser, hasPermission } = useAuth();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const receiver = currentUser?.name ?? '';
  const [header, setHeader] = useState<GrnHeaderFormValues>(() =>
    emptyHeader(scopedHospitalId ?? '', receiver),
  );
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Grn | null>(null);
  // A "Receive a delivery" link (from Stock levels) names the store and items; read it once.
  const [prefill] = useState(() =>
    typeof window === 'undefined'
      ? null
      : readReceivePrefill(new URLSearchParams(window.location.search)),
  );
  // The link's items, held until the store's item list says which it stocks.
  const [prefillItemIds, setPrefillItemIds] = useState<string[] | null>(null);
  const prefillApplied = useRef(false);
  // Bring back an unfinished delivery from this device, and keep this one as it is typed. A
  // link wins over it.
  const draft = useDeviceDraft(
    draftKey,
    { header, lines },
    {
      keep: !done && lines.length > 0,
      onRestore: (saved) => {
        if (prefill || saved.lines.length === 0) return false;
        setHeader(saved.header);
        setLines(saved.lines);
        showToast({ title: 'Unfinished delivery restored', variant: 'info' });
        return true;
      },
    },
  );
  const savedAt = draft.savedAt;
  const canPost = hasPermission('GRN_CREATE') && hasPermission('GRN_POST');

  const hospitalsQuery = useHospitals();
  const storesQuery = useStores(header.hospitalId);
  const storeItemsQuery = useMappedStoreItems(header.storeId);
  const storeItems = storeItemsQuery.data ?? [];
  const itemById = useMemo(
    () => new Map(storeItems.map((mapping) => [mapping.itemId, mapping.item] as const)),
    [storeItems],
  );
  const storeName = storesQuery.data?.find((store) => store.id === header.storeId)?.storeName;

  useEffect(() => {
    if (!header.receivedBy && receiver)
      setHeader((current) => ({ ...current, receivedBy: receiver }));
  }, [header.receivedBy, receiver]);

  useEffect(() => {
    if (scopedHospitalId && scopedHospitalId !== header.hospitalId && lines.length === 0) {
      setHeader((current) => ({ ...current, hospitalId: scopedHospitalId, storeId: '' }));
    }
  }, [header.hospitalId, lines.length, scopedHospitalId]);

  // The link's store once the location is known (choosing it later would clear the store).
  useEffect(() => {
    if (!prefill || prefillApplied.current || isLoadingLocations) return;
    prefillApplied.current = true;
    // A refresh then brings back the draft (with any edits) rather than the link again.
    setUrlParams({ hospital: null, items: null, store: null });
    if (scopedHospitalId && prefill.hospitalId && prefill.hospitalId !== scopedHospitalId) return;
    setHeader((current) => ({
      ...current,
      hospitalId: scopedHospitalId ?? prefill.hospitalId,
      storeId: prefill.storeId,
    }));
    setPrefillItemIds(prefill.itemIds);
  }, [isLoadingLocations, prefill, scopedHospitalId]);

  // Then the link's items, those the store stocks, as lines left for counting.
  useEffect(() => {
    if (!prefillItemIds || !storeItemsQuery.data) return;
    const stocked = new Set(storeItemsQuery.data.map((mapping) => mapping.itemId));
    setLines(
      prefillItemIds.filter((id) => stocked.has(id)).map((itemId) => ({ ...emptyLine(), itemId })),
    );
    setPrefillItemIds(null);
  }, [prefillItemIds, storeItemsQuery.data]);

  // The vendor's past deliveries into this store: how often, and what they usually bring.
  const vendor = header.vendorName.trim();
  const historyQuery = useQuery({
    enabled: Boolean(vendor.length >= 2 && header.storeId),
    queryFn: async () =>
      (
        await organizationApi.listGrns({
          hospitalId: header.hospitalId,
          limit: 100,
          search: vendor,
          sortBy: 'receivedDate',
          sortOrder: 'desc',
          storeId: header.storeId,
        })
      ).data.items.filter(
        (grn) =>
          grn.vendorName?.toLowerCase() === vendor.toLowerCase() && grn.status !== 'CANCELLED',
      ),
    queryKey: queryKeys.grns('vendor-history', header.storeId, vendor.toLowerCase()),
  });
  const history = historyQuery.data ?? [];
  const usuallyBrings = useMemo(() => {
    const counts = new Map<string, number>();

    for (const grn of history) {
      for (const line of grn.lines) counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1);
    }

    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([itemId]) => itemById.get(itemId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => !lines.some((line) => line.itemId === item.id))
      .slice(0, 6);
  }, [history, itemById, lines]);
  const vendorsQuery = useQuery({
    enabled: Boolean(header.storeId),
    queryFn: async () => {
      const grns = (
        await organizationApi.listGrns({
          limit: 100,
          sortBy: 'receivedDate',
          storeId: header.storeId,
        })
      ).data.items;

      return [...new Set(grns.flatMap((grn) => grn.vendorName ?? []))].sort();
    },
    queryKey: queryKeys.grns('vendors', header.storeId),
  });

  const totals = lines.reduce(
    (sum, line) => {
      const lineSum = lineTotals(line);

      return {
        accepted: sum.accepted + lineSum.accepted,
        received: sum.received + lineSum.received,
        rejected: sum.rejected + lineSum.rejected,
      };
    },
    { accepted: 0, received: 0, rejected: 0 },
  );
  const headerCheck = checkHeader(header);
  const linesCheck = checkLines(lines);
  const batchesOk =
    lines.length > 0 &&
    lines.every((line) =>
      line.batches.every(
        (batch) =>
          batch.batchNumber.trim() &&
          batch.expiryDate &&
          quantity(batch.receivedQty) > 0 &&
          quantity(batch.acceptedQty) <= quantity(batch.receivedQty),
      ),
    );
  const reasonsOk = lines.every((line) =>
    line.batches.every((batch) => rejectedQty(batch) === 0 || batch.rejectionReason.trim()),
  );
  const checks = [
    { label: 'Vendor, store and time set', ok: !headerCheck.message },
    { label: 'Each item has a batch, expiry and quantity', ok: batchesOk },
    { label: 'Every rejection has a reason', ok: lines.length > 0 && reasonsOk },
  ];
  const problem = headerCheck.message ?? linesCheck.message;

  function addItem(itemId: string) {
    if (!itemId || lines.some((line) => line.itemId === itemId)) return;
    setLines((current) => [
      ...current,
      {
        batches: [emptyBatch()],
        clientId: clientId('line'),
        itemId,
        orderedQty: '',
        rejectionReason: '',
        remarks: '',
      },
    ]);
  }

  function updateBatch(lineId: string, batchId: string, patch: Partial<BatchDraft>) {
    setLines((current) =>
      current.map((line) =>
        line.clientId === lineId
          ? {
              ...line,
              batches: line.batches.map((batch) =>
                batch.clientId === batchId ? { ...batch, ...patch } : batch,
              ),
            }
          : line,
      ),
    );
  }

  function setReceived(lineId: string, batch: BatchDraft, value: string) {
    // Accepted follows received until someone rejects part of it.
    const follows = !batch.acceptedQty || batch.acceptedQty === batch.receivedQty;

    updateBatch(lineId, batch.clientId, {
      acceptedQty: follows ? value : String(Math.min(quantity(batch.acceptedQty), quantity(value))),
      receivedQty: value,
      rejectionReason: follows ? '' : batch.rejectionReason,
    });
  }

  function startOver() {
    draft.clear();
    setLines([]);
    setTried(false);
    setDone(null);
    setHeader((current) => emptyHeader(current.hospitalId, receiver || current.receivedBy));
  }

  const save = useMutation({
    mutationFn: async (post: boolean) => {
      const headerData = headerSchema.parse(header);
      const items = grnLinesSchema.parse(lines).map((line) => {
        const lineSum = lineTotals(line);

        return {
          acceptedQty: Number(lineSum.accepted.toFixed(3)),
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
          receivedQty: Number(lineSum.received.toFixed(3)),
          rejectedQty: Number(lineSum.rejected.toFixed(3)),
          rejectionReason: optionalValue(line.rejectionReason),
          remarks: optionalValue(line.remarks),
        };
      });
      const body: GrnInput = {
        hospitalId: headerData.hospitalId,
        invoiceNumber: optionalValue(headerData.invoiceNumber),
        items,
        poNumber: optionalValue(headerData.poNumber),
        receivedBy: headerData.receivedBy,
        receivedDate: new Date(headerData.receivedDate).toISOString(),
        remarks: optionalValue(headerData.remarks),
        storeId: headerData.storeId,
        vendorName: headerData.vendorName,
      };
      const created = (await organizationApi.createGrn(body)).data;

      return post ? (await organizationApi.postGrnToStock(created.id)).data : created;
    },
    onError: (error) =>
      showToast({
        description: getApiErrorMessage(error),
        title: 'Delivery not saved',
        variant: 'error',
      }),
    onSuccess: (grn) => {
      draft.clear();
      invalidateGrnQueries(queryClient);
      setDone(grn);
    },
  });

  function submit(post: boolean) {
    setTried(true);
    if (!problem && !save.isPending) save.mutate(post);
  }

  if (done) {
    const posted = done.status === 'POSTED_TO_STOCK';

    return (
      <section className="space-y-4">
        <AppPageHeader eyebrow="Inventory · GRNs" title="Receive a delivery" />
        <Panel className="mx-auto max-w-xl space-y-4 p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-ds-status-ok-fg" />
          <h2 className="text-xl font-semibold text-ds-text">
            {posted ? 'Posted' : 'Saved as draft'}{' '}
            <span className="font-mono">{done.grnNumber}</span>
          </h2>
          <p className="text-sm text-ds-text-2">
            {posted
              ? `${totals.accepted} units added to ${storeName ?? 'the store'}.${totals.rejected ? ' Rejected stock is recorded with its reasons.' : ''}`
              : 'Nothing is in stock yet: post it from the GRN once it is checked.'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={startOver} type="button">
              <PackageCheck className="h-4 w-4" />
              Receive another delivery
            </Button>
            <Button asChild variant="outline">
              <Link href={recordHref('/inventory/grns', { id: done.id })}>Open the GRN</Link>
            </Button>
          </div>
        </Panel>
      </section>
    );
  }

  const inputError = (path: string) => (tried ? headerCheck.errors.get(path) : undefined);

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <div className="flex items-center gap-3">
            {savedAt ? (
              <span className="text-xs text-ds-muted">
                Draft kept {timeFormatter.format(savedAt)}
              </span>
            ) : null}
            {lines.length > 0 ? (
              <Button onClick={startOver} size="sm" type="button" variant="ghost">
                Start over
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/inventory/grns">Back to GRNs</Link>
            </Button>
          </div>
        }
        eyebrow="Inventory · GRNs"
        title="Receive a delivery"
      />

      <Panel className="space-y-5 p-5">
        <StepHeading
          done={checks[0]!.ok}
          n={1}
          subtitle="Who brought it and where it goes, from the invoice in your hand."
          title="The delivery"
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field error={inputError('vendorName')} label="From" name="vendorName" required>
            <Input
              id="vendorName"
              list="receive-vendors"
              maxLength={500}
              onChange={(event) => setHeader({ ...header, vendorName: event.target.value })}
              placeholder="Vendor"
              value={header.vendorName}
            />
            <datalist id="receive-vendors">
              {(vendorsQuery.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {history.length > 0 ? (
              <p className="mt-1 text-xs text-ds-muted">
                Delivered {plural(history.length, 'time')} since{' '}
                {monthFormatter.format(new Date(history[history.length - 1]!.receivedDate))}
              </p>
            ) : null}
          </Field>
          <div className="space-y-3">
            {scopedHospitalId ? null : (
              <Field error={inputError('hospitalId')} label="Location" name="hospitalId" required>
                <Select
                  disabled={lines.length > 0}
                  id="hospitalId"
                  onChange={(event) =>
                    setHeader({ ...header, hospitalId: event.target.value, storeId: '' })
                  }
                  value={header.hospitalId}
                >
                  <option value="">Select location</option>
                  {(hospitalsQuery.data ?? []).map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.hospitalName}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field error={inputError('storeId')} label="Into" name="storeId" required>
              <Select
                disabled={!header.hospitalId || lines.length > 0}
                id="storeId"
                onChange={(event) => setHeader({ ...header, storeId: event.target.value })}
                value={header.storeId}
              >
                <option value="">Select store</option>
                {(storesQuery.data ?? []).map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.storeName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="space-y-3">
            <Field error={inputError('receivedDate')} label="Received" name="receivedDate" required>
              <Input
                id="receivedDate"
                onChange={(event) => setHeader({ ...header, receivedDate: event.target.value })}
                type="datetime-local"
                value={header.receivedDate}
              />
            </Field>
            <Field error={inputError('receivedBy')} label="By" name="receivedBy" required>
              <Input
                id="receivedBy"
                maxLength={255}
                onChange={(event) => setHeader({ ...header, receivedBy: event.target.value })}
                value={header.receivedBy}
              />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label="Invoice" name="invoiceNumber">
              <Input
                id="invoiceNumber"
                maxLength={500}
                onChange={(event) => setHeader({ ...header, invoiceNumber: event.target.value })}
                placeholder="Add later if it is not here yet"
                value={header.invoiceNumber}
              />
            </Field>
            <Field label="PO number" name="poNumber">
              <Input
                id="poNumber"
                maxLength={500}
                onChange={(event) => setHeader({ ...header, poNumber: event.target.value })}
                placeholder="Optional"
                value={header.poNumber}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <Panel className="space-y-4 p-5">
            <StepHeading
              done={lines.length > 0 && checks[1]!.ok && checks[2]!.ok}
              n={2}
              subtitle="Add each item, then its batch, expiry and what you accept."
              title="Count the items"
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-full max-w-sm">
                <Select
                  aria-label="Add an item"
                  disabled={!header.storeId}
                  onChange={(event) => addItem(event.target.value)}
                  value=""
                >
                  <option value="">
                    {header.storeId ? 'Add an item…' : 'Choose the store first'}
                  </option>
                  {storeItems
                    .filter((mapping) => !lines.some((line) => line.itemId === mapping.itemId))
                    .map((mapping) => (
                      <option key={mapping.itemId} value={mapping.itemId}>
                        {mapping.item.itemName} · {mapping.item.itemCode}
                      </option>
                    ))}
                </Select>
              </div>
              {usuallyBrings.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ds-muted">{vendor} usually brings</span>
                  {usuallyBrings.map((item) => (
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-ds-border bg-ds-surface px-3 text-[13px] font-medium text-ds-text-2 transition hover:border-ds-primary/40 hover:text-ds-link"
                      key={item.id}
                      onClick={() => addItem(item.id)}
                      type="button"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {item.itemName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>

          {lines.length === 0 ? (
            <Panel className="grid place-items-center gap-1.5 p-10 text-center">
              <span className="tile-blue mb-1.5 grid h-12 w-12 place-items-center rounded-2xl text-ds-link">
                <PackageCheck aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <p className="text-sm font-semibold text-ds-text">Nothing counted yet</p>
              <p className="text-sm text-ds-muted">
                {header.storeId
                  ? 'Add the items that came in this delivery.'
                  : 'Choose the store first, then add what came in.'}
              </p>
            </Panel>
          ) : (
            lines.map((line) => {
              const item = itemById.get(line.itemId);

              return (
                <Panel className="space-y-3 p-4" key={line.clientId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-ds-text">
                        {item?.itemName ?? 'Item'}
                      </p>
                      <p className="font-mono text-xs text-ds-muted">{item?.itemCode}</p>
                    </div>
                    <Button
                      aria-label={`Remove ${item?.itemName ?? 'item'}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((entry) => entry.clientId !== line.clientId),
                        )
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {line.batches.map((batch, batchIndex) => {
                    const rejected = rejectedQty(batch);
                    const hint = expiryHint(batch.expiryDate);
                    const needsReason = rejected > 0 && !batch.rejectionReason.trim();
                    const otherReason =
                      batch.rejectionReason && !rejectionReasons.includes(batch.rejectionReason);

                    return (
                      <div
                        className={cn(
                          'space-y-3 rounded-card border p-3',
                          tried && needsReason
                            ? 'border-ds-status-bad-fg/50 bg-ds-status-bad-bg/40'
                            : 'border-ds-border',
                        )}
                        key={batch.clientId}
                      >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
                          <Field label="Batch" name={`batch-${batch.clientId}`} required>
                            <Input
                              id={`batch-${batch.clientId}`}
                              maxLength={100}
                              onChange={(event) =>
                                updateBatch(line.clientId, batch.clientId, {
                                  batchNumber: event.target.value,
                                })
                              }
                              value={batch.batchNumber}
                            />
                          </Field>
                          <Field label="Expiry" name={`expiry-${batch.clientId}`} required>
                            <Input
                              id={`expiry-${batch.clientId}`}
                              onChange={(event) =>
                                updateBatch(line.clientId, batch.clientId, {
                                  expiryDate: event.target.value,
                                })
                              }
                              type="date"
                              value={batch.expiryDate}
                            />
                            {hint ? (
                              <p
                                className={cn(
                                  'mt-1 text-xs',
                                  hint.tone === 'bad' && 'text-ds-status-bad-fg',
                                  hint.tone === 'pending' && 'text-ds-status-pending-fg',
                                  hint.tone === 'muted' && 'text-ds-muted',
                                )}
                              >
                                {hint.text}
                              </p>
                            ) : null}
                          </Field>
                          <div className="w-40">
                            <p className="mb-1.5 text-sm font-medium text-ds-text-2">Received</p>
                            <QuantityStepper
                              compact
                              label={`${item?.itemName ?? 'Item'} received`}
                              min={0}
                              onChange={(value) => setReceived(line.clientId, batch, value)}
                              value={batch.receivedQty}
                            />
                          </div>
                          <div className="w-40">
                            <p className="mb-1.5 text-sm font-medium text-ds-text-2">Accepted</p>
                            <QuantityStepper
                              compact
                              label={`${item?.itemName ?? 'Item'} accepted`}
                              max={quantity(batch.receivedQty)}
                              min={0}
                              onChange={(value) =>
                                updateBatch(line.clientId, batch.clientId, {
                                  acceptedQty: value,
                                  ...(quantity(value) >= quantity(batch.receivedQty)
                                    ? { rejectionReason: '' }
                                    : {}),
                                })
                              }
                              value={batch.acceptedQty}
                            />
                          </div>
                        </div>
                        {rejected > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'text-sm font-medium',
                                needsReason ? 'text-ds-status-bad-fg' : 'text-ds-text-2',
                              )}
                            >
                              Why were {rejected} rejected?
                            </span>
                            {rejectionReasons.map((reason) => (
                              <button
                                aria-pressed={batch.rejectionReason === reason}
                                className={cn(
                                  'h-8 rounded-full border px-3 text-[13px] font-medium transition',
                                  batch.rejectionReason === reason
                                    ? 'border-ds-primary bg-ds-primary text-white'
                                    : 'border-ds-border bg-ds-surface text-ds-text-2 hover:border-ds-primary/40',
                                )}
                                key={reason}
                                onClick={() =>
                                  updateBatch(line.clientId, batch.clientId, {
                                    rejectionReason: reason,
                                  })
                                }
                                type="button"
                              >
                                {reason}
                              </button>
                            ))}
                            <Input
                              aria-label="Other reason"
                              className="h-8 max-w-56 text-[13px]"
                              maxLength={500}
                              onChange={(event) =>
                                updateBatch(line.clientId, batch.clientId, {
                                  rejectionReason: event.target.value,
                                })
                              }
                              placeholder="Other reason"
                              value={otherReason ? batch.rejectionReason : ''}
                            />
                          </div>
                        ) : null}
                        {line.batches.length > 1 ? (
                          <button
                            className="inline-flex items-center gap-1 text-xs text-ds-muted hover:text-ds-status-bad-fg"
                            onClick={() =>
                              setLines((current) =>
                                current.map((entry) =>
                                  entry.clientId === line.clientId
                                    ? {
                                        ...entry,
                                        batches: entry.batches.filter(
                                          (other) => other.clientId !== batch.clientId,
                                        ),
                                      }
                                    : entry,
                                ),
                              )
                            }
                            type="button"
                          >
                            <X className="h-3.5 w-3.5" />
                            Remove batch {batchIndex + 1}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <Button
                    onClick={() =>
                      setLines((current) =>
                        current.map((entry) =>
                          entry.clientId === line.clientId
                            ? { ...entry, batches: [...entry.batches, emptyBatch()] }
                            : entry,
                        ),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus className="h-4 w-4" />
                    Another batch of this item
                  </Button>
                </Panel>
              );
            })
          )}
        </div>

        <Panel
          aria-label="This delivery"
          className="space-y-4 self-start p-4 xl:sticky xl:top-[calc(var(--app-header-h)+1.5rem)]"
          role="region"
        >
          <StepHeading
            done={false}
            n={3}
            subtitle="Posting adds what you accepted to the store's stock."
            title="Check and post"
          />
          <div className="tile-blue rounded-[18px] p-4">
            <p className="truncate text-[12.5px] font-medium text-ds-text-3">
              {header.vendorName.trim() || 'Vendor not set yet'}
            </p>
            <p className="mt-3 text-[13px] text-ds-text-3">Accepted</p>
            <p className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-ds-text tabular-nums">
              {totals.accepted}
              <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ds-text-3">
                units
              </span>
            </p>
            <div
              aria-hidden="true"
              className="mt-4 flex h-2 overflow-hidden rounded-full bg-ds-surface/80"
            >
              <span
                className="bg-ds-status-ok-fg transition-[width]"
                style={{
                  width: `${totals.received ? (totals.accepted / totals.received) * 100 : 0}%`,
                }}
              />
              <span
                className="bg-ds-status-bad-fg transition-[width]"
                style={{
                  width: `${totals.received ? (totals.rejected / totals.received) * 100 : 0}%`,
                }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
              {(
                [
                  ['Received', totals.received, 'text-ds-text'],
                  ['Accepted', totals.accepted, 'text-ds-status-ok-fg'],
                  [
                    'Rejected',
                    totals.rejected,
                    totals.rejected ? 'text-ds-status-bad-fg' : 'text-ds-text-3',
                  ],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label}>
                  <dt className="text-ds-text-3">{label}</dt>
                  <dd className={cn('font-mono text-base font-semibold', tone)}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ul className="space-y-2">
            {checks.map((check) => (
              <li className="flex items-center gap-2 text-sm" key={check.label}>
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full text-white',
                    check.ok ? 'bg-ds-status-ok-fg' : 'bg-ds-divider',
                  )}
                >
                  {check.ok ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className={check.ok ? 'text-ds-text' : 'text-ds-text-3'}>{check.label}</span>
              </li>
            ))}
          </ul>
          {tried && problem ? (
            <p className="text-sm text-ds-status-bad-fg" role="alert">
              {problem}
            </p>
          ) : null}
          <div className="space-y-2">
            {canPost ? (
              <Button
                className="h-14 w-full rounded-2xl text-base shadow-lg shadow-ds-primary/25"
                disabled={save.isPending}
                onClick={() => submit(true)}
                type="button"
              >
                {save.isPending && save.variables ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <PackageCheck className="h-5 w-5" />
                )}
                Post to stock
              </Button>
            ) : null}
            {hasPermission('GRN_CREATE') ? (
              <Button
                className="w-full"
                disabled={save.isPending}
                onClick={() => submit(false)}
                type="button"
                variant={canPost ? 'outline' : 'default'}
              >
                Save as draft
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}

/** A numbered step of the page; its number turns into a green tick once the step is done. */
function StepHeading({
  done,
  n,
  subtitle,
  title,
}: Readonly<{ done: boolean; n: number; subtitle: string; title: string }>) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white transition-colors',
          done ? 'bg-ds-status-ok-fg' : 'bg-ds-primary',
        )}
      >
        {done ? <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} /> : n}
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] leading-8 font-semibold tracking-[-0.01em] text-ds-text">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </h2>
        <p className="text-[13px] text-ds-muted">{subtitle}</p>
      </div>
    </div>
  );
}
