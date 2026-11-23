'use client';

import { ArrowRight, Check, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { Transfer } from '@aahar/api-client';
import { HistoryButton } from '@/components/audit/history-drawer';
import { StatusChip, tableStyles, TypeTag, type StepItem } from '@/components/design-system';
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
  // The named operator acknowledges it; without one, anyone at the destination may.
  const receiver = transfer.receiverName ?? destinationName;
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
            label: `${longStatus(outcome)} by ${destinationName}`,
            state: outcome === 'REJECTED_FULL' ? 'stopped' : 'done',
          }
        : {
            detail: status === 'PENDING_ACKNOWLEDGEMENT' ? `Waiting on ${receiver}` : undefined,
            label: `Acknowledgement by ${receiver}`,
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
  const sec = 'text-xs font-bold uppercase tracking-[0.1em] text-ds-link';
  const stateLabel = { current: 'In progress', done: 'Done', stopped: 'Stopped', todo: 'Not yet' };
  const dot = {
    current: 'border-amber-200 bg-amber-500',
    done: 'border-ds-status-ok-fg bg-ds-status-ok-fg',
    stopped: 'border-ds-status-bad-fg bg-ds-status-bad-fg',
    todo: 'border-ds-border bg-ds-surface',
  };

  return (
    <section className="space-y-3">
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
      {/* Care Kitchen's detail card (2026-11-22): everything about the transfer in one place. */}
      <Panel className="overflow-hidden rounded-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h1 className="font-mono text-xl font-semibold leading-7 text-ds-text">
              {transfer.transferNumber}
            </h1>
            <p className="mt-1 text-[13px] text-ds-muted">
              {sourceName} → {destinationName} · created {formatWhen(transfer.createdAt)} ·{' '}
              {transfer.hospital.hospitalName}
            </p>
          </div>
          <StatusChip long status={outcome ?? status} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-2 px-6">
          <div className="min-w-0 rounded-[14px] bg-ds-subtle-2 p-3.5 ring-1 ring-inset ring-ds-divider">
            <TypeTag type={transfer.sourceType} />
            <RecordLink
              className="mt-2 block truncate text-[14px] font-semibold text-ds-text"
              href={sourceHref}
            >
              {sourceName}
            </RecordLink>
          </div>
          <ArrowRight aria-label="to" className="h-5 w-5 justify-self-center text-ds-primary" />
          <div className="min-w-0 rounded-[14px] bg-ds-subtle-2 p-3.5 ring-1 ring-inset ring-ds-divider">
            <TypeTag type={transfer.destinationType} />
            <RecordLink
              className="mt-2 block truncate text-[14px] font-semibold text-ds-text"
              href={destinationHref}
            >
              {destinationName}
            </RecordLink>
          </div>
        </div>

        <dl className="mx-6 mt-4 grid grid-cols-3 divide-x divide-ds-divider rounded-[14px] ring-1 ring-inset ring-ds-divider">
          <div className="px-3.5 py-3">
            <dt className="text-[12px] text-ds-muted">Sent</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ds-text">
              {formatQuantity(totalSent)}
            </dd>
            <p className="text-[11.5px] text-ds-muted">{plural(transfer.lines.length, 'line')}</p>
          </div>
          <div className="px-3.5 py-3">
            <dt className="text-[12px] text-ds-muted">Accepted</dt>
            {isReceived ? (
              <>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ds-text">
                  {formatQuantity(totalAccepted)}
                  <span className="text-[12.5px] font-medium text-ds-muted">
                    {' '}
                    of {formatQuantity(totalSent)}
                  </span>
                </dd>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ds-status-bad-bg"
                >
                  <div
                    className="h-full rounded-full bg-ds-status-ok-fg"
                    style={{ width: `${totalSent > 0 ? (totalAccepted / totalSent) * 100 : 0}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <dd className="mt-0.5 text-lg font-semibold text-ds-muted">—</dd>
                <p className="text-[11.5px] text-ds-muted">Once acknowledged</p>
              </>
            )}
          </div>
          <div className="px-3.5 py-3">
            <dt className="text-[12px] text-ds-muted">Rejected</dt>
            <dd
              className={cn(
                'mt-0.5 text-lg font-semibold tabular-nums',
                !isReceived
                  ? 'text-ds-muted'
                  : totalRejected > 0
                    ? 'text-ds-status-bad-fg'
                    : 'text-ds-text',
              )}
            >
              {isReceived ? formatQuantity(totalRejected) : '—'}
            </dd>
            <p className="text-[11.5px] text-ds-muted">
              {isReceived && rejectedLines.length === 0
                ? 'Nothing rejected'
                : isReceived
                  ? `${rejectedLines.length} of ${plural(transfer.lines.length, 'line')} · ${plural(reasonCount, 'reason')}`
                  : 'Once acknowledged'}
            </p>
          </div>
        </dl>

        <div aria-labelledby="transfer-lines" className="mt-6" role="region">
          <h2 className={cn(sec, 'px-6 pb-2')} id="transfer-lines">
            Lines · {transfer.lines.length}
          </h2>
          <table className="w-full table-fixed text-[13px]">
            <thead className="sr-only">
              <tr>
                <th>Item · batch</th>
                <th>Sent</th>
                <th>Accepted</th>
                <th>Rejected</th>
              </tr>
            </thead>
            <tbody>
              {transfer.lines.map((line) => {
                const expiresSoon =
                  !isReceived &&
                  line.expiryDate !== null &&
                  new Date(line.expiryDate).getTime() <= warnBefore;

                return (
                  <tr className="border-t border-ds-divider align-top" key={line.id}>
                    <td className="py-2.5 pl-6 pr-2">
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
                        'w-16 px-2 py-2.5 text-right font-semibold text-ds-text',
                        tableStyles.num,
                      )}
                    >
                      {formatQuantity(line.sentQty)}
                    </td>
                    <td
                      className={cn(
                        'w-18 px-2 py-2.5 text-right',
                        tableStyles.num,
                        isReceived ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                      )}
                      title="Accepted"
                    >
                      {isReceived ? formatQuantity(line.acceptedQty) : '—'}
                    </td>
                    <td
                      className={cn(
                        'w-18 py-2.5 pl-2 pr-6 text-right',
                        tableStyles.num,
                        isReceived && line.rejectedQty > 0
                          ? 'font-semibold text-ds-status-bad-fg'
                          : 'text-ds-muted',
                      )}
                      title="Rejected"
                    >
                      {isReceived ? formatQuantity(line.rejectedQty) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 px-6">
          <h2 className={cn(sec, 'pb-3')}>Journey</h2>
          <ol aria-label="Transfer progress">
            {steps.map((step, index) => (
              <li className="flex gap-3" key={step.label}>
                <span className="flex w-[22px] flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 text-white',
                      dot[step.state],
                    )}
                  >
                    {step.state === 'done' ? <Check className="h-3 w-3" strokeWidth={3.2} /> : null}
                  </span>
                  {index < steps.length - 1 ? (
                    <span aria-hidden="true" className="min-h-4 w-0.5 flex-1 bg-ds-divider" />
                  ) : null}
                </span>
                <span className="min-w-0 pb-3.5">
                  <span className="block text-[13.5px] font-semibold text-ds-text">
                    {step.label}
                  </span>
                  <span className="sr-only">{stateLabel[step.state]}</span>
                  {step.detail ? (
                    <span className="block text-[12.5px] text-ds-muted">{step.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div aria-labelledby="transfer-details" className="mt-2 px-6" role="region">
          <h2 className={cn(sec, 'pb-2.5')} id="transfer-details">
            Transfer details
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
            {[
              ['Location', transfer.hospital.hospitalName],
              ...(transfer.receiverId ? [['Operator', transfer.receiverName ?? '—']] : []),
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
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ds-divider px-6 py-4 [&>a:first-child]:flex-1 [&>button:first-child]:flex-1">
          {actions}
          <HistoryButton
            entityId={transfer.id}
            entityName="transfers"
            recordLabel={transfer.transferNumber}
          />
        </div>
      </Panel>
    </section>
  );
}
