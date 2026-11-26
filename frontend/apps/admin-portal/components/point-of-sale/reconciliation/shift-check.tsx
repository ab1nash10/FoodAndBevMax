'use client';

import type { ShiftCheck, ShiftMoneyRow, ShiftReconciliation } from '@aahar/api-client';
import type { ReactNode } from 'react';
import { tableStyles } from '@/components/design-system';
import { cn } from '@/lib/utils';
import { formatMoney, paymentModeLabels } from '../shared';
import { cashDifference, timeOf } from '../shift-controls';

// What POS → Reconciliation and Approvals both show of a closed shift's money check.

const checkNames: Record<ShiftCheck['key'], string> = { CARD: 'card', CASH: 'cash', UPI: 'UPI' };

const sources: Record<ShiftMoneyRow['mode'], string> = {
  CARD: 'Confirmed by Pine Labs',
  CASH: 'Counted at shift end',
  OTHER: 'Typed in at the till',
  // Not money yet: a Pay later bill counts in the shift that collects it, in the mode paid by.
  PAY_LATER: 'Collected later at a till',
  UPI: 'Confirmed by Razorpay or PayU',
};

export const shiftTitle = (shift: ShiftReconciliation) =>
  `${shift.cashierName ?? 'A cashier'}’s shift`;

export const shiftPlace = (shift: ShiftReconciliation) =>
  `${shift.restaurantName} · ${shift.counterName}`;

export const shiftTime = (shift: ShiftReconciliation) =>
  `${timeOf(shift.openedAt)} – ${timeOf(shift.closedAt)}`;

/** "None", "+₹20.00" or "−₹15.00" with its tone; "—" when there is nothing to check against. */
export function difference(row: ShiftMoneyRow) {
  return row.received === null || row.difference === null
    ? { label: '—', tone: 'text-ds-text-2' }
    : cashDifference({ countedCash: row.received, expectedCash: row.billed });
}

/** The shift's takings: its bills in every mode, the opening cash left out. */
export function takings(shift: ShiftReconciliation): number {
  const billed = shift.money.reduce((total, row) => total + row.billed, 0);

  return Math.round((billed - shift.openingCash) * 100) / 100;
}

/** "Cash −₹230.00 · UPI −₹160.00", or "None" when everything matches. */
export function differences(shift: ShiftReconciliation): string {
  const parts = shift.money
    .filter((row) => row.difference !== null && row.difference !== 0)
    .map((row) => `${paymentModeLabels[row.mode]} ${difference(row).label}`);

  if (shift.money.some((row) => row.mode === 'CASH' && row.received === null)) {
    parts.unshift('Cash not counted');
  }

  return parts.length ? parts.join(' · ') : 'None';
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/** What the difference is, in a line: "Cash short by ₹230.00". */
export function checkTitle(check: ShiftCheck): string {
  if (check.kind === 'short') return `Cash short by ${formatMoney(check.amount)}`;
  if (check.kind === 'over') return `Cash over by ${formatMoney(check.amount)}`;
  if (check.kind === 'not-counted') return 'Cash was not counted at shift end';

  const parts = [
    check.bills.length ? `${plural(check.bills.length, 'bill')} with no payment confirmed` : '',
    check.payments.length ? `${plural(check.payments.length, 'payment')} with no bill` : '',
  ].filter(Boolean);

  return `${paymentModeLabels[check.key]}: ${parts.join(', ')}`;
}

/** Why it is a difference: the cash sums, or the bills and payments behind it. */
export function CheckDetail({
  check,
  shift,
}: Readonly<{ check: ShiftCheck; shift: ShiftReconciliation }>) {
  const cash = shift.money.find((row) => row.mode === 'CASH');

  if (check.key === 'CASH' && cash) {
    const cashBills = cash.billed - shift.openingCash;

    return (
      <p className="text-sm text-ds-text-2">
        {cash.received === null
          ? `No cash count was entered when the shift ended; ${formatMoney(cash.billed)} was expected.`
          : `Counted ${formatMoney(cash.received)} at shift end against ${formatMoney(cash.billed)} expected (${formatMoney(shift.openingCash)} opening cash + ${formatMoney(cashBills)} cash bills).`}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 text-sm text-ds-text-2">
      <ul className="space-y-0.5 font-medium text-ds-text">
        {check.bills.map((bill) => (
          <li key={bill.id}>{`Bill ${bill.number} · ${formatMoney(bill.amount)}`}</li>
        ))}
        {check.payments.map((payment) => (
          <li key={payment.id}>
            {`${formatMoney(payment.amount)} paid at ${timeOf(payment.paidAt)}${payment.reference ? `, reference ${payment.reference}` : ''}, no bill made`}
          </li>
        ))}
      </ul>
      <p>
        {`No gateway confirmed these ${checkNames[check.key]} amounts. If a bill was paid another way, change its payment mode; otherwise give a reason.`}
      </p>
    </div>
  );
}

/** A side panel's small blue section heading. */
export function PanelHeading({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ds-link">{children}</h3>
  );
}

/** Each payment mode: what the bills say, what was received, and the difference. */
export function MoneyTable({ money }: Readonly<{ money: ShiftMoneyRow[] }>) {
  return (
    <div className="overflow-hidden rounded-card border border-ds-border">
      <table className={tableStyles.table}>
        <thead className={tableStyles.head}>
          <tr>
            <th className={tableStyles.th}>Mode</th>
            <th className={cn(tableStyles.th, 'text-right')}>Bills say</th>
            <th className={cn(tableStyles.th, 'text-right')}>Received</th>
            <th className={cn(tableStyles.th, 'text-right')}>Difference</th>
          </tr>
        </thead>
        <tbody>
          {money.map((row) => {
            const diff = difference(row);

            return (
              <tr className="border-t border-ds-divider" key={row.mode}>
                <td className={tableStyles.td}>
                  <span className={tableStyles.title}>{paymentModeLabels[row.mode]}</span>
                  <span className="block text-xs text-ds-muted">{sources[row.mode]}</span>
                </td>
                <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                  {formatMoney(row.billed)}
                </td>
                <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                  {row.received === null ? '—' : formatMoney(row.received)}
                </td>
                <td
                  className={cn(
                    tableStyles.td,
                    tableStyles.num,
                    'text-right font-semibold',
                    diff.tone,
                  )}
                >
                  {diff.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One payment mode's difference in a list row: the difference over its two sums. */
export function DifferenceCell({ row }: Readonly<{ row: ShiftMoneyRow | undefined }>) {
  if (!row) return <span className="text-ds-muted">—</span>;

  const diff = difference(row);

  return (
    <>
      <span className={cn('block font-semibold', diff.tone)}>{diff.label}</span>
      <span className="block text-xs text-ds-muted tabular-nums">
        {`${formatMoney(row.billed)} → ${row.received === null ? '—' : formatMoney(row.received)}`}
      </span>
    </>
  );
}
