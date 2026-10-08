'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { GrnLineInput } from '@aahar/api-client';
import { EmptyState, StatusChip, Stepper, type StepItem } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useHrefWith } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { invalidateGrnQueries } from '@/lib/query-invalidation';
import {
  daysFromToday,
  formatDate,
  formatDateOnly,
  formatQuantity,
  formatWhen,
  plural,
  toDateOnlyValue,
} from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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
export function GrnVerificationView({ grnId }: Readonly<{ grnId: string }>) {
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
    queryKey: queryKeys.grns('detail', grnId),
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
