'use client';

import type { ShiftCheck, ShiftReasons, ShiftReconciliation } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, RowOpen, StatusChip, tableStyles } from '@/components/design-system';
import { RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Input, Label, Panel, Select } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { canOpenPath } from '@/lib/navigation';
import { queryKeys } from '@/lib/query-keys';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { formatDateTime, todayInIndia } from '../shared';
import {
  CheckDetail,
  DifferenceCell,
  MoneyTable,
  PanelHeading,
  checkTitle,
  shiftPlace,
  shiftTime,
  shiftTitle,
} from './shift-check';

/** A day's closed shifts at the picked location, and the restaurants among them. */
export function useDayShifts() {
  const { scopedHospitalId } = useLocationContext();
  const today = todayInIndia();
  const [date, setDate] = useUrlParam('date', today);
  const [restaurantId, setRestaurantId] = useUrlParam('restaurant');
  const query = useQuery({
    queryFn: async () =>
      (await organizationApi.listShiftReconciliations({ date, hospitalId: scopedHospitalId })).data
        .items,
    queryKey: queryKeys.shiftReconciliations(scopedHospitalId ?? 'all', date),
  });
  const shifts = query.data ?? [];
  const restaurants = [...new Map(shifts.map((s) => [s.restaurantId, s.restaurantName]))];
  const shown = restaurantId ? shifts.filter((s) => s.restaurantId === restaurantId) : shifts;

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Day"
        className="h-10 w-auto"
        max={today}
        onChange={(event) => setDate(event.target.value || today)}
        type="date"
        value={date}
      />
      {/* The select fills its box: the box sets its width, so the filters stay on one row. */}
      <div className="w-56">
        <Select
          aria-label="Restaurant"
          className="h-10"
          onChange={(event) => setRestaurantId(event.target.value)}
          value={restaurantId}
        >
          <option value="">All restaurants</option>
          {restaurants.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <RefreshButton onClick={() => void query.refetch()} />
    </div>
  );

  return { filters, query, shifts, shown };
}

/**
 * POS → Reconciliation (the user, 2026-11-26): each closed shift's cash, UPI and card against its
 * bills. The restaurant admin gives a reason for each difference; the shift then waits for a
 * Supervisor's approval (POS → Approvals), as a matched shift does at once.
 */
export function ReconciliationPageClient() {
  const { filters, query, shown } = useDayShifts();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = shown.find((shift) => shift.shiftId === openId) ?? null;

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={filters}
        description="Each closed shift: what its bills say against the money actually received. Give a reason for each difference; the shift then goes to a Supervisor for approval."
        title="Reconciliation"
      />
      <ShiftTable
        action={(shift) => (
          <RowOpen
            label={`Open ${shiftTitle(shift)}`}
            nextStep={shift.status === 'NEEDS_REASON' || shift.status === 'SENT_BACK'}
            onClick={() => setOpenId(shift.shiftId)}
          />
        )}
        query={query}
        shifts={shown}
      />
      {open ? (
        <ReasonsPanel key={open.shiftId} onClose={() => setOpenId(null)} shift={open} />
      ) : null}
    </section>
  );
}

/** The shifts, a row each: cash, UPI and card differences and where each stands. */
export function ShiftTable({
  action,
  extraColumns,
  query,
  shifts,
}: Readonly<{
  action: (shift: ShiftReconciliation) => ReactNode;
  /** Replaces the Cash, UPI and Card columns (Approvals shows takings and reasons). */
  extraColumns?: {
    cells: (shift: ShiftReconciliation) => ReactNode;
    heads: ReactNode;
  };
  query: { error: unknown; isError: boolean; isLoading: boolean };
  shifts: ShiftReconciliation[];
}>) {
  const modeOf = (shift: ShiftReconciliation, mode: 'CARD' | 'CASH' | 'UPI') =>
    shift.money.find((row) => row.mode === mode);

  if (query.isError) {
    return (
      <Panel className="p-6 text-sm text-ds-status-bad-fg">{getApiErrorMessage(query.error)}</Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cn(tableStyles.table, 'min-w-[900px]')}>
          <thead className={tableStyles.head}>
            <tr>
              <th className={tableStyles.th}>Cashier</th>
              <th className={tableStyles.th}>Shift</th>
              {extraColumns ? (
                extraColumns.heads
              ) : (
                <>
                  <th className={cn(tableStyles.th, 'text-right')}>Cash</th>
                  <th className={cn(tableStyles.th, 'text-right')}>UPI</th>
                  <th className={cn(tableStyles.th, 'text-right')}>Card</th>
                </>
              )}
              <th className={tableStyles.th}>Status</th>
              <th className={tableStyles.th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-ds-muted" colSpan={8}>
                  Loading shifts…
                </td>
              </tr>
            ) : shifts.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-ds-muted" colSpan={8}>
                  No shift here on this day.
                </td>
              </tr>
            ) : (
              shifts.map((shift) => (
                <tr className={tableStyles.row} key={shift.shiftId}>
                  <td className={tableStyles.td}>
                    <span className={tableStyles.title}>{shift.cashierName ?? '—'}</span>
                    <span className="block text-xs text-ds-muted">{shiftPlace(shift)}</span>
                  </td>
                  <td
                    className={cn(tableStyles.td, 'whitespace-nowrap text-ds-text-2 tabular-nums')}
                  >
                    {shiftTime(shift)}
                  </td>
                  {extraColumns
                    ? extraColumns.cells(shift)
                    : (['CASH', 'UPI', 'CARD'] as const).map((mode) => (
                        <td className={cn(tableStyles.td, 'text-right')} key={mode}>
                          <DifferenceCell row={modeOf(shift, mode)} />
                        </td>
                      ))}
                  <td className={tableStyles.td}>
                    <StatusChip status={shift.status} />
                    {statusNote(shift) ? (
                      <span className="mt-1 block text-xs text-ds-muted">{statusNote(shift)}</span>
                    ) : null}
                  </td>
                  <td className={cn(tableStyles.td, 'text-right')}>{action(shift)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Who acted last, and when: under the status chip. */
function statusNote(shift: ShiftReconciliation): string {
  if ((shift.status === 'APPROVED' || shift.status === 'SENT_BACK') && shift.decidedAt) {
    return `${shift.decidedByName ?? 'Supervisor'}, ${formatDateTime(shift.decidedAt)}`;
  }
  if (shift.status === 'WAITING' && shift.submittedAt) {
    return `Sent by ${shift.submittedByName ?? 'an admin'}`;
  }

  return '';
}

type Draft = Record<string, { note: string; reason: string }>;

const editable = (shift: ShiftReconciliation) =>
  shift.status === 'NEEDS_REASON' ||
  shift.status === 'SENT_BACK' ||
  (shift.status === 'WAITING' && shift.checks.length > 0);

/** A shift's money and, for each difference, the reason the restaurant admin gives. */
function ReasonsPanel({
  onClose,
  shift,
}: Readonly<{ onClose: () => void; shift: ShiftReconciliation }>) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      shift.checks.map((check) => [
        check.key,
        {
          note: shift.reasons[check.key]?.note ?? '',
          // A reason that no longer fits the difference (a bill changed since) is chosen again.
          reason: check.reasons.includes(shift.reasons[check.key]?.reason ?? '')
            ? shift.reasons[check.key]!.reason
            : '',
        },
      ]),
    ),
  );
  const canEdit = hasPermission('SHIFT_RECONCILE') && editable(shift);
  const ready = shift.checks.every((check) => {
    const given = draft[check.key];
    return Boolean(given?.reason) && (given!.reason !== 'Other' || given!.note.trim() !== '');
  });
  const save = useMutation({
    mutationFn: () =>
      organizationApi.saveShiftReasons(
        shift.shiftId,
        Object.fromEntries(
          shift.checks.map((check) => [
            check.key,
            { note: draft[check.key]!.note.trim() || undefined, reason: draft[check.key]!.reason },
          ]),
        ) as ShiftReasons,
      ),
    onError: (error) =>
      showToast({ description: getApiErrorMessage(error), title: 'Not sent', variant: 'error' }),
    onSuccess: async () => {
      showToast({
        description: `${shiftTitle(shift)} is with the Supervisor for approval.`,
        title: 'Sent for approval',
        variant: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.shiftReconciliations() });
      onClose();
    },
  });
  const set = (key: ShiftCheck['key'], patch: Partial<Draft[string]>) =>
    setDraft((current) => ({ ...current, [key]: { ...current[key]!, ...patch } }));
  const canAmend = canOpenPath('/masters/orders', hasPermission);

  return (
    <Modal
      description={`${shiftPlace(shift)} · ${shiftTime(shift)}`}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
          {canEdit ? (
            <Button disabled={!ready || save.isPending} onClick={() => save.mutate()} type="button">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send for approval
            </Button>
          ) : null}
        </>
      }
      onClose={onClose}
      open
      side
      title={shiftTitle(shift)}
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <PanelHeading>Money</PanelHeading>
          <MoneyTable money={shift.money} />
        </section>

        {shift.status === 'SENT_BACK' ? (
          <div className="rounded-card border border-ds-status-bad-fg/25 bg-ds-status-bad-bg px-4 py-3 text-sm">
            <p className="font-semibold text-ds-status-bad-fg">
              Sent back by {shift.decidedByName ?? 'the Supervisor'}
            </p>
            {shift.comment ? <p className="mt-1 text-ds-text">“{shift.comment}”</p> : null}
          </div>
        ) : null}

        {shift.checks.length ? (
          <section className="space-y-2">
            <PanelHeading>{canEdit ? 'Needs a reason' : 'Reasons given'}</PanelHeading>
            {shift.checks.map((check) => {
              const id = `shift-${check.key.toLowerCase()}`;
              const given = draft[check.key]!;

              return (
                <div
                  aria-label={checkTitle(check)}
                  className="space-y-3 rounded-card border border-ds-border bg-ds-subtle px-4 py-3"
                  key={check.key}
                  role="group"
                >
                  <p className="font-semibold text-ds-text">{checkTitle(check)}</p>
                  <CheckDetail check={check} shift={shift} />
                  {canEdit ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor={`${id}-reason`}>Reason</Label>
                        <Select
                          id={`${id}-reason`}
                          onChange={(event) => set(check.key, { reason: event.target.value })}
                          value={given.reason}
                        >
                          <option value="">Choose a reason</option>
                          {check.reasons.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${id}-note`}>Note</Label>
                        <Input
                          id={`${id}-note`}
                          maxLength={300}
                          onChange={(event) => set(check.key, { note: event.target.value })}
                          placeholder={given.reason === 'Other' ? 'Say what happened' : 'Optional'}
                          value={given.note}
                        />
                      </div>
                      {check.key !== 'CASH' && check.bills.length && canAmend ? (
                        <p className="text-sm text-ds-text-2">
                          Wrong payment mode on a bill? Change it in{' '}
                          <Link
                            className="font-semibold text-ds-link"
                            href="/masters/orders?tab=amendments"
                          >
                            Order amendments
                          </Link>
                          ; a corrected bill needs no reason.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-sm">
                      <p className="font-semibold text-ds-text">
                        {shift.reasons[check.key]?.reason ?? 'No reason given'}
                      </p>
                      {shift.reasons[check.key]?.note ? (
                        <p className="text-ds-text-2">{shift.reasons[check.key]!.note}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ) : null}

        <StandingNote shift={shift} />
      </div>
    </Modal>
  );
}

/** Where the shift stands, in a sentence. */
function StandingNote({ shift }: Readonly<{ shift: ShiftReconciliation }>) {
  const ok =
    'rounded-card border border-ds-status-ok-fg/25 bg-ds-status-ok-bg px-4 py-3 text-sm font-semibold text-ds-status-ok-fg';
  const info =
    'rounded-card border border-ds-status-info-fg/25 bg-ds-status-info-bg px-4 py-3 text-sm font-semibold text-ds-status-info-fg';

  if (shift.status === 'APPROVED') {
    return (
      <p className={ok}>
        Approved by {shift.decidedByName ?? 'the Supervisor'}
        {shift.decidedAt ? ` on ${formatDateTime(shift.decidedAt)}` : ''}. Its bills are locked:
        payment modes can no longer be changed.
        {shift.comment ? ` “${shift.comment}”` : ''}
      </p>
    );
  }
  if (shift.status === 'WAITING' && shift.checks.length === 0) {
    return <p className={ok}>Everything matches. It is with the Supervisor for approval.</p>;
  }
  if (shift.status === 'WAITING') {
    return (
      <p className={info}>
        Sent by {shift.submittedByName ?? 'an admin'}: with the Supervisor for approval. You can
        still change a reason until it is decided.
      </p>
    );
  }

  return null;
}
