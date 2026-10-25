'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { Transfer } from '@aahar/api-client';
import {
  StatusChip,
  Stepper,
  tableStyles,
  TypeTag,
  type StepItem,
} from '@/components/design-system';
import { Panel } from '@/components/ui';
import { transferOutcome } from '@/lib/dashboard-stats';
import { RecordLink } from '@/components/record-link';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  formatDateOnly,
  formatQuantity,
  formatWhen,
  plural,
} from '@/components/inventory/shared/utils';
import { longStatus } from '@/components/inventory/transfers/shared';

/** Expiry within this many days is flagged on lines still in transit. */
const expiryWarningDays = 3;

/** One transfer's page: header card with its actions and steps, totals, then its lines. */
export function TransferDetails({
  actions,
  backHref,
  destinationHref,
  destinationName,
  onBack,
  sourceHref,
  sourceName,
  transfer,
}: Readonly<{
  actions?: ReactNode;
  backHref: string;
  destinationHref: string | null;
  destinationName: string;
  onBack: () => void;
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
            : `${{ KITCHEN: 'Kitchen', RESTAURANT: 'Restaurant' }[transfer.sourceType as string] ?? 'Store'} stock reserved at source`,
      label: 'Dispatched',
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
  const sum = (pick: (line: Transfer['lines'][number]) => number) =>
    Number(transfer.lines.reduce((total, line) => total + pick(line), 0).toFixed(3));
  const totalSent = sum((line) => line.sentQty);
  const totalAccepted = sum((line) => line.acceptedQty);
  const totalRejected = sum((line) => line.rejectedQty);
  const rejectedLines = transfer.lines.filter((line) => line.rejectedQty > 0);
  const reasonCount = new Set(
    rejectedLines.flatMap((line) => (line.rejectionReason ? [line.rejectionReason] : [])),
  ).size;
  const cardClass = 'rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card';
  const valueClass = 'mt-1.5 text-2xl font-semibold tracking-[-0.02em] tabular-nums';

  return (
    <section className="space-y-4">
      <Link
        className="inline-flex min-h-6 items-center gap-1 self-start rounded-sm text-[13px] font-medium text-ds-link hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
        href={backHref}
        onClick={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
        Transfers
      </Link>
      {/* The record's header card: number, status, route, its actions and its steps. */}
      <div className="relative isolate space-y-6 overflow-hidden rounded-[24px] border border-ds-border bg-ds-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ds-text">
                {transfer.transferNumber}
              </h1>
              <StatusChip long status={outcome ?? status} />
            </div>
            <p className="text-[13.5px] text-ds-muted">
              {sourceName} → {destinationName} · created {formatWhen(transfer.createdAt)} ·{' '}
              {transfer.hospital.hospitalName}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>

        <Stepper label="Transfer progress" steps={steps} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cardClass}>
          <dt className="text-[12.5px] text-ds-muted">Sent</dt>
          <dd className={cn(valueClass, 'text-ds-text')}>{formatQuantity(totalSent)}</dd>
          <p className="mt-1 text-xs text-ds-muted">{plural(transfer.lines.length, 'line')}</p>
        </div>
        <div className={cardClass}>
          <dt className="text-[12.5px] text-ds-muted">Accepted</dt>
          {isReceived ? (
            <>
              <dd className={cn(valueClass, 'text-ds-text')}>
                {formatQuantity(totalAccepted)}
                <span className="text-sm font-medium text-ds-muted">
                  {' '}
                  of {formatQuantity(totalSent)}
                </span>
              </dd>
              <div
                aria-hidden="true"
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ds-status-bad-bg"
              >
                <div
                  className="h-full rounded-full bg-ds-status-ok-fg"
                  style={{ width: `${totalSent > 0 ? (totalAccepted / totalSent) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <dd className={cn(valueClass, 'text-ds-muted')}>—</dd>
              <p className="mt-1 text-xs text-ds-muted">Once acknowledged</p>
            </>
          )}
        </div>
        <div className={cardClass}>
          <dt className="text-[12.5px] text-ds-muted">Rejected</dt>
          <dd
            className={cn(
              valueClass,
              !isReceived
                ? 'text-ds-muted'
                : totalRejected > 0
                  ? 'text-ds-status-bad-fg'
                  : 'text-ds-text',
            )}
          >
            {isReceived ? formatQuantity(totalRejected) : '—'}
          </dd>
          <p className="mt-1 text-xs text-ds-muted">
            {isReceived && rejectedLines.length === 0
              ? 'Nothing rejected'
              : isReceived
                ? `${rejectedLines.length} of ${plural(transfer.lines.length, 'line')} · ${plural(reasonCount, 'reason')}`
                : 'Once acknowledged'}
          </p>
        </div>
        <div className={cardClass}>
          <dt className="text-[12.5px] text-ds-muted">Route</dt>
          <dd className="mt-2 flex min-w-0 flex-col gap-1 text-[13.5px]">
            <span className="flex min-w-0 items-center gap-1.5">
              <TypeTag type={transfer.sourceType} />
              <RecordLink className="truncate font-semibold text-ds-text" href={sourceHref}>
                {sourceName}
              </RecordLink>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden="true" className="text-ds-muted">
                →
              </span>
              <span className="sr-only">to</span>
              <TypeTag type={transfer.destinationType} />
              <RecordLink className="truncate text-ds-text-2" href={destinationHref}>
                {destinationName}
              </RecordLink>
            </span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-labelledby="transfer-lines"
          className="min-w-0 flex-[2_1_600px] overflow-hidden"
          role="region"
        >
          <h2
            className="px-[18px] py-3.5 text-[15px] font-semibold text-ds-text"
            id="transfer-lines"
          >
            Lines · {transfer.lines.length}
          </h2>
          <table className="w-full table-fixed text-[13px]">
            <thead className="border-y border-ds-divider bg-ds-subtle text-left text-[12px] text-ds-muted">
              <tr>
                <th className="py-2.5 pl-[18px] pr-2 font-medium">Item · batch</th>
                <th className="w-16 px-2 py-2.5 text-right font-medium">Sent</th>
                <th className="w-rail px-2 py-2.5 text-right font-medium">Accepted</th>
                <th className="w-rail py-2.5 pl-2 pr-[18px] text-right font-medium">Rejected</th>
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
                    <td className="py-2.5 pl-[18px] pr-2">
                      <RecordLink
                        className={cn('block truncate', tableStyles.title)}
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
                          {line.batchNumber ? (
                            <span className="font-mono">{line.batchNumber}</span>
                          ) : null}
                          {line.batchNumber && line.expiryDate ? ' · ' : null}
                          {line.expiryDate ? `exp ${formatDateOnly(line.expiryDate)}` : null}
                        </span>
                      ) : null}
                      {line.rejectedQty > 0 && line.rejectionReason ? (
                        <span className="block truncate text-[11.5px] text-ds-status-bad-fg">
                          {line.rejectionReason}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2.5 text-right font-semibold text-ds-text',
                        tableStyles.num,
                      )}
                    >
                      {formatQuantity(line.sentQty)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2.5 text-right',
                        tableStyles.num,
                        isReceived ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                      )}
                    >
                      {isReceived ? formatQuantity(line.acceptedQty) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-2.5 pl-2 pr-[18px] text-right',
                        tableStyles.num,
                        isReceived && line.rejectedQty > 0
                          ? 'font-semibold text-ds-status-bad-fg'
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
        </Panel>

        <Panel
          aria-labelledby="transfer-details"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 px-[18px] py-4"
          role="region"
        >
          <h2 className="text-[15px] font-semibold text-ds-text" id="transfer-details">
            Transfer details
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
            {[
              ['Location', transfer.hospital.hospitalName],
              ['Transfer date', formatWhen(transfer.transferDate)],
              ['Business date', formatDateOnly(transfer.businessDate)],
              ['Remarks', transfer.remarks || '—'],
            ].map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-ds-muted">{label}</dt>
                <dd className="truncate font-semibold text-ds-text" title={value}>
                  {value}
                </dd>
              </Fragment>
            ))}
          </dl>
        </Panel>
      </div>
    </section>
  );
}
