'use client';

import type { PosDaySummary, PosShift } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useConfirm } from '@/components/confirm-provider';
import { tableStyles } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Panel } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { cashDifference, timeOf } from './shift-controls';
import { formatMoney } from './shared';

const statusLabels: Record<PosShift['status'], string> = {
  CLOSED: 'Closed',
  HANDED_OVER: 'Handed over',
  OPEN: 'Open',
};

/**
 * The day's shifts at a counter with each one's cash check, and closing the day: an admin closes
 * it once no shift is open; later bills then go on the next day.
 */
export function DayShiftsPanel({
  counterId,
  date,
  summary,
}: Readonly<{ counterId: string; date: string; summary: PosDaySummary }>) {
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const openShift = summary.shifts.find((shift) => shift.status === 'OPEN');
  const canClose = hasPermission('POS_DAY_CLOSE');
  const closeMutation = useMutation({
    mutationFn: () => organizationApi.closePosDay(counterId, date),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Day was not closed',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.posSummary() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() });
      showToast({ title: 'Day closed. New bills go on the next day.', variant: 'success' });
    },
  });

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ds-divider px-4 py-3">
        <h2 className="text-sm font-semibold text-ds-text">Shifts</h2>
        {summary.dayClose ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ds-subtle px-3 py-1 text-xs font-semibold text-ds-text-2">
            <LockKeyhole className="h-3.5 w-3.5" />
            Day closed by {summary.dayClose.closedByName ?? '—'} at{' '}
            {timeOf(summary.dayClose.closedAt)}
          </span>
        ) : canClose ? (
          <Button
            disabled={Boolean(openShift) || closeMutation.isPending}
            onClick={() =>
              void confirm({
                confirmLabel: 'Close day',
                description:
                  'Its bills become final and can no longer be cancelled. Bills made after this go on the next day.',
                title: 'Close the day at this counter?',
                tone: 'danger',
              }).then((confirmed) => confirmed && closeMutation.mutate())
            }
            size="sm"
            title={openShift ? 'End the open shift first' : undefined}
            type="button"
          >
            {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <LockKeyhole className="h-4 w-4" />
            Close day
          </Button>
        ) : null}
      </div>
      {openShift && !summary.dayClose && canClose ? (
        <p className="border-b border-ds-divider px-4 py-2 text-xs text-ds-muted">
          {openShift.openedByName ?? 'A cashier'}’s shift is still open. It has to end before the
          day can close.
        </p>
      ) : null}
      {summary.shifts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ds-muted">
          No shift was opened at this counter on this day.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[760px]')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>Cashier</th>
                <th className={tableStyles.th}>Time</th>
                <th className={cn(tableStyles.th, 'text-right')}>Opening</th>
                <th className={cn(tableStyles.th, 'text-right')}>Expected</th>
                <th className={cn(tableStyles.th, 'text-right')}>Counted</th>
                <th className={cn(tableStyles.th, 'text-right')}>Difference</th>
                <th className={tableStyles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.shifts.map((shift) => {
                const difference = cashDifference(shift);

                return (
                  <tr className="border-t border-ds-divider" key={shift.id}>
                    <td className={cn(tableStyles.td, tableStyles.title)}>
                      {shift.openedByName ?? '—'}
                      {shift.name ? (
                        <span className="block text-xs font-normal text-ds-muted">
                          {shift.name}
                        </span>
                      ) : null}
                    </td>
                    <td className={cn(tableStyles.td, 'tabular-nums text-ds-text-2')}>
                      {timeOf(shift.openedAt)} – {shift.closedAt ? timeOf(shift.closedAt) : 'now'}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {formatMoney(shift.openingCash)}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {shift.expectedCash === null ? '—' : formatMoney(shift.expectedCash)}
                    </td>
                    <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                      {shift.countedCash === null ? '—' : formatMoney(shift.countedCash)}
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        tableStyles.num,
                        'text-right font-semibold',
                        difference.tone,
                      )}
                    >
                      {difference.label}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {statusLabels[shift.status]}
                      {shift.note ? (
                        <span
                          className="block max-w-[200px] truncate text-xs text-ds-muted"
                          title={shift.note}
                        >
                          {shift.note}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
