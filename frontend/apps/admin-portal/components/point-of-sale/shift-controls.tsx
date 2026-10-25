'use client';

import type { PosCounter, PosShift } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Clock3, Loader2, LockKeyhole, PackageCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Input, Label, Panel } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { formatMoney } from './shared';

const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
export const timeOf = (value: string | null) => (value ? clock.format(new Date(value)) : '—');

/** Counted cash against expected: "None", "+₹20.00" (over) or "−₹15.00" (short), with a tone. */
export function cashDifference(shift: Pick<PosShift, 'countedCash' | 'expectedCash'>) {
  if (shift.countedCash === null || shift.expectedCash === null) {
    return { label: '—', tone: 'text-ds-text-2' };
  }

  const difference = Math.round((shift.countedCash - shift.expectedCash) * 100) / 100;

  if (difference === 0) return { label: 'None', tone: 'text-ds-status-ok-fg' };

  return difference < 0
    ? { label: `−${formatMoney(-difference)}`, tone: 'text-ds-status-bad-fg' }
    : { label: `+${formatMoney(difference)}`, tone: 'text-ds-status-pending-fg' };
}

/** "12.50" → 12.5; anything that is not a sum of money → null. */
function cashValue(text: string): number | null {
  const trimmed = text.trim();

  return /^\d{1,8}(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : null;
}

function useRefreshShift() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.posSummary() });
  };
}

/** What the outgoing cashier passed on: their cash and the counter's stock. */
function HandoverCard({ shift }: Readonly<{ shift: PosShift }>) {
  const stock = shift.handoverStock ?? [];

  return (
    <div className="rounded-xl border border-ds-border bg-ds-subtle p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-ds-text">
        <ArrowRightLeft className="h-4 w-4 text-ds-link" />
        Handed over by {shift.openedByName ?? 'the last cashier'} at {timeOf(shift.closedAt)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ds-muted">Cash handed over</dt>
          <dd className="font-semibold tabular-nums text-ds-text">
            {formatMoney(shift.countedCash)}
          </dd>
        </div>
        <div>
          <dt className="text-ds-muted">Stock passed on</dt>
          <dd className="font-semibold text-ds-text">
            {stock.length ? `${stock.length} item${stock.length === 1 ? '' : 's'}` : 'None'}
          </dd>
        </div>
      </dl>
      {stock.length ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium text-ds-link">See the stock</summary>
          <ul className="mt-1.5 divide-y divide-ds-border">
            {stock.map((line) => (
              <li className="flex justify-between gap-3 py-1" key={line.itemId}>
                <span className="truncate text-ds-text-2">{line.itemName}</span>
                <span className="font-semibold tabular-nums text-ds-text">{line.quantity}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {shift.note ? <p className="mt-2 text-sm text-ds-text-2">“{shift.note}”</p> : null}
    </div>
  );
}

/**
 * Shown on the till while no shift is open at the counter: billing needs one. It opens with the
 * cash in the till, taking on a handover when the last cashier passed theirs on.
 */
export function ShiftStartPanel({ counter }: Readonly<{ counter: PosCounter }>) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const refresh = useRefreshShift();
  const { dayClosed, handover } = counter.shift;
  const [cash, setCash] = useState(() =>
    handover?.countedCash !== null && handover?.countedCash !== undefined
      ? String(handover.countedCash)
      : '',
  );
  const openingCash = cashValue(cash);
  const openMutation = useMutation({
    mutationFn: () => organizationApi.openPosShift(counter.id, openingCash ?? 0),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Shift was not opened',
        variant: 'error',
      });
    },
    onSuccess() {
      refresh();
      showToast({ title: 'Shift opened. You can bill now.', variant: 'success' });
    },
  });

  return (
    <Panel aria-label="Open a shift" className="p-4 sm:p-5" role="region">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-ds-text">
            <Clock3 className="h-5 w-5 text-ds-link" />
            Open a shift to start billing
          </h2>
          <p className="text-sm text-ds-text-2">
            Count the cash in the till first. At the end of the shift you count it again, and the
            difference from the bills is shown.
          </p>
          {dayClosed ? (
            <p className="text-sm font-medium text-ds-status-pending-fg">
              Today is closed at this counter, so bills from this shift go on tomorrow.
            </p>
          ) : null}
        </div>
        {hasPermission('POS_SHIFT_MANAGE') ? (
          <form
            className="flex w-full flex-col gap-3 lg:w-[360px]"
            onSubmit={(event) => {
              event.preventDefault();
              if (openingCash !== null) openMutation.mutate();
            }}
          >
            {handover ? <HandoverCard shift={handover} /> : null}
            <div className="grid gap-1.5">
              <Label htmlFor="shift-opening-cash">Cash in the till</Label>
              <Input
                aria-invalid={cash !== '' && openingCash === null}
                id="shift-opening-cash"
                inputMode="decimal"
                onChange={(event) => setCash(event.target.value)}
                placeholder="0"
                value={cash}
              />
              {cash !== '' && openingCash === null ? (
                <p className="text-xs text-ds-status-bad-fg">
                  Enter an amount, e.g. 500 or 250.50.
                </p>
              ) : null}
            </div>
            <Button disabled={openMutation.isPending || openingCash === null} type="submit">
              {openMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {handover ? 'Take over and open shift' : 'Open shift'}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-ds-muted lg:w-[360px]">
            Ask a cashier to open a shift at this counter.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** The open shift on the till's header; ending it counts the cash and closes or hands over. */
export function ShiftChip({ counter }: Readonly<{ counter: PosCounter }>) {
  const { currentUser, hasPermission } = useAuth();
  const { showToast } = useToast();
  const refresh = useRefreshShift();
  const shift = counter.shift.open;
  const [isOpen, setIsOpen] = useState(false);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [ended, setEnded] = useState<PosShift | null>(null);
  const countedCash = cashValue(cash);
  const endMutation = useMutation({
    mutationFn: (handover: boolean) =>
      organizationApi.endPosShift(shift!.id, {
        countedCash: countedCash ?? 0,
        handover,
        note: note.trim() || undefined,
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Shift was not ended',
        variant: 'error',
      });
    },
    // The till refreshes on Done: refreshing now would swap it for the shift screen and take the
    // cash check away before the cashier has read it.
    onSuccess(response) {
      setEnded(response.data);
    },
  });

  if (!shift) return null;

  const mayEnd =
    (shift.openedBy === currentUser?.id && hasPermission('POS_SHIFT_MANAGE')) ||
    hasPermission('POS_DAY_CLOSE');
  const difference = ended ? cashDifference(ended) : null;
  const close = () => {
    setIsOpen(false);
    setCash('');
    setNote('');
    if (ended) {
      setEnded(null);
      refresh();
    }
  };

  return (
    <>
      <button
        className="inline-flex h-10 items-center gap-2 rounded-control-lg border border-ds-border bg-ds-surface px-3 text-sm font-semibold text-ds-text hover:bg-ds-subtle disabled:cursor-default disabled:hover:bg-ds-surface"
        disabled={!mayEnd}
        onClick={() => setIsOpen(true)}
        title={mayEnd ? 'End this shift' : undefined}
        type="button"
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-ds-status-ok-fg" />
        <span className="max-w-[180px] truncate">
          {shift.name ? `${shift.name} · ` : ''}
          {shift.openedByName ?? 'Shift'} · since {timeOf(shift.openedAt)}
        </span>
        {mayEnd ? <span className="text-ds-link">End shift</span> : null}
      </button>
      <Modal
        description={`Opened by ${shift.openedByName ?? '—'} at ${timeOf(shift.openedAt)} with ${formatMoney(shift.openingCash)}`}
        footer={
          ended ? (
            <div className="flex justify-end">
              <Button onClick={close} type="button">
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button onClick={close} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={endMutation.isPending || countedCash === null}
                onClick={() => endMutation.mutate(true)}
                type="button"
                variant="outline"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Hand over to next person
              </Button>
              <Button
                disabled={endMutation.isPending || countedCash === null}
                onClick={() => endMutation.mutate(false)}
                type="button"
              >
                {endMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <LockKeyhole className="h-4 w-4" />
                Close sales
              </Button>
            </div>
          )
        }
        onClose={close}
        open={isOpen}
        title={
          ended
            ? ended.status === 'HANDED_OVER'
              ? 'Shift handed over'
              : 'Shift closed'
            : 'End shift'
        }
      >
        {ended ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 rounded-xl border border-ds-border p-3 text-sm">
              <div>
                <dt className="text-ds-muted">Expected cash</dt>
                <dd className="font-semibold tabular-nums text-ds-text">
                  {formatMoney(ended.expectedCash)}
                </dd>
              </div>
              <div>
                <dt className="text-ds-muted">Counted</dt>
                <dd className="font-semibold tabular-nums text-ds-text">
                  {formatMoney(ended.countedCash)}
                </dd>
              </div>
              <div>
                <dt className="text-ds-muted">Difference</dt>
                <dd className={cn('font-bold tabular-nums', difference?.tone)}>
                  {difference?.label}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-ds-text-2">
              {ended.summary?.bills ?? 0} bill{ended.summary?.bills === 1 ? '' : 's'} ·{' '}
              {formatMoney(ended.summary?.sales ?? 0)} in sales this shift.{' '}
              {ended.status === 'HANDED_OVER'
                ? 'The next cashier takes on this cash and the counter’s stock when they open their shift.'
                : 'The till is closed until the next shift opens.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="shift-counted-cash">
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" />
                  Cash counted in the till
                </span>
              </Label>
              <Input
                aria-invalid={cash !== '' && countedCash === null}
                autoFocus
                id="shift-counted-cash"
                inputMode="decimal"
                onChange={(event) => setCash(event.target.value)}
                placeholder="0"
                value={cash}
              />
              <p className="text-xs text-ds-muted">
                Count it before you see the bills’ total: the difference is shown next.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shift-note">
                Note <span className="font-normal text-ds-muted">(optional)</span>
              </Label>
              <Input
                id="shift-note"
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. ₹20 short, change given from own pocket"
                value={note}
              />
            </div>
            <p className="flex items-start gap-2 text-sm text-ds-text-2">
              <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-ds-link" />
              Handing over passes this cash and the counter’s stock to whoever opens the next shift
              here. Closing ends sales at this till.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
