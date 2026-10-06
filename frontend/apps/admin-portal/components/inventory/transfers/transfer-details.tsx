'use client';

import type { Transfer } from '@aahar/api-client';
import { Timeline, type StepItem } from '@/components/design-system';
import { transferOutcome } from '@/lib/dashboard-stats';
import { RecordLink } from '@/components/record-link';
import { recordHref } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { formatDateOnly, formatQuantity, formatWhen } from '@/components/inventory/shared/utils';
import { longStatus } from '@/components/inventory/transfers/shared';

/** Expiry within this many days is flagged on lines still in transit. */
const expiryWarningDays = 3;

export function TransferDetails({
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
