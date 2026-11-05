import type { PosOwnShift } from '@aahar/api-client';
import type { ReactNode } from 'react';

// Kept apart from the shift controls, so the log-out check on every page loads only this.

const dayAndTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
});

/** What the cashier does about their open shift at another counter. Names no till or computer. */
export function whereToEndIt(shift: PosOwnShift) {
  return shift.hasTill
    ? 'End it on that counter’s till, then come back here.'
    : 'That counter has no till, so it can’t be ended there. Ask an admin to end it under POS & Payment Machines → Counters.';
}

/** "28 Oct, 1:10 pm · 6 days" */
function openSince(value: string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);

  return `${dayAndTime.format(new Date(value))}${days >= 1 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}`;
}

/** The cashier's own open shift: what it holds up, where it is, and what to do about it. */
export function OpenShiftCard({
  advice,
  heading,
  lead,
  shift,
}: Readonly<{ advice: ReactNode; heading: string; lead: string; shift: PosOwnShift }>) {
  return (
    <div
      className="grid gap-2.5 rounded-xl bg-ds-status-pending-bg p-3.5 text-sm text-ds-status-pending-fg"
      role="status"
    >
      <p>
        <strong className="text-ds-text">{heading}</strong> {lead}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-0.5">
        <dt>Counter</dt>
        <dd className="font-semibold text-ds-text">{shift.counterName}</dd>
        <dt>Restaurant</dt>
        <dd className="font-semibold text-ds-text">{shift.restaurantName}</dd>
        <dt>Open since</dt>
        <dd className="font-semibold tabular-nums text-ds-text">{openSince(shift.openedAt)}</dd>
      </dl>
      <p className="text-ds-text-2">{advice}</p>
    </div>
  );
}
