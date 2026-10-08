'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ChevronLeft, Loader2, Minus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { TransferAcknowledgementLineInput } from '@aahar/api-client';
import { EmptyState, StatusChip } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { QuantityStepper } from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { transferOutcome } from '@/lib/dashboard-stats';
import { Textarea } from '@/components/organization/shared/form-controls';
import { useLocationHrefs, useLocationNames } from '@/components/inventory/use-locations';
import { RecordLink } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { invalidateTransferQueries } from '@/lib/query-invalidation';
import {
  formatDateOnly,
  formatQuantity,
  formatWhen,
  optionalValue,
  plural,
} from '@/components/inventory/shared/utils';
import { longStatus } from '@/components/inventory/transfers/shared';
import { transferDetailQuery } from '@/lib/detail-queries';

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
  const transferQuery = useQuery(transferDetailQuery(transferId));
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
