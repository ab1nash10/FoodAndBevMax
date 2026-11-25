'use client';

import type { ShiftCheckStatus, ShiftReconciliation } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, RowOpen, tableStyles } from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Label } from '@/components/ui';
import { Modal, SegmentedControl } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { formatDateTime, formatMoney } from '../shared';
import { ShiftTable, useDayShifts } from './reconciliation-page';
import {
  CheckDetail,
  MoneyTable,
  PanelHeading,
  checkTitle,
  differences,
  shiftPlace,
  shiftTime,
  shiftTitle,
  takings,
} from './shift-check';

type View = Extract<ShiftCheckStatus, 'APPROVED' | 'SENT_BACK' | 'WAITING'>;

const views: Array<{ label: string; value: View }> = [
  { label: 'Waiting', value: 'WAITING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Sent back', value: 'SENT_BACK' },
];

const reasonsGiven = (shift: ShiftReconciliation) =>
  shift.checks
    .map((check) => shift.reasons[check.key]?.reason)
    .filter(Boolean)
    .join(' · ') || '—';

/**
 * POS → Approvals (the user, 2026-11-26): every closed shift waits here for a Supervisor,
 * matched or not, once the restaurant admin has given a reason for each difference. Approving
 * makes its money final; sending it back says what to fix.
 */
export function ApprovalsPageClient() {
  const { filters, query, shown } = useDayShifts();
  const [view, setView] = useUrlParam<View>('view', 'WAITING', [
    'WAITING',
    'APPROVED',
    'SENT_BACK',
  ]);
  const [openId, setOpenId] = useState<string | null>(null);
  const listed = shown.filter((shift) => shift.status === view);
  const needingReasons = shown.filter((shift) => shift.status === 'NEEDS_REASON').length;
  const open = shown.find((shift) => shift.shiftId === openId) ?? null;

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={filters}
        description="Every closed shift at your locations waits here, matched or not. Approve it, or send it back saying what to fix."
        title="Approvals"
      />
      <SegmentedControl label="Show" onChange={setView} options={views} value={view} />
      <ShiftTable
        action={(shift) => (
          <RowOpen
            label={`Review ${shiftTitle(shift)}`}
            nextStep={shift.status === 'WAITING'}
            onClick={() => setOpenId(shift.shiftId)}
            text="Review"
          />
        )}
        extraColumns={{
          cells: (shift) => (
            <>
              <td className={cn(tableStyles.td, tableStyles.num, 'text-right')}>
                {formatMoney(takings(shift))}
              </td>
              <td className={cn(tableStyles.td, 'text-ds-text-2')}>{differences(shift)}</td>
              <td className={cn(tableStyles.td, 'max-w-72 text-ds-text-2')}>
                {reasonsGiven(shift)}
              </td>
            </>
          ),
          heads: (
            <>
              <th className={cn(tableStyles.th, 'text-right')}>Takings</th>
              <th className={tableStyles.th}>Differences</th>
              <th className={tableStyles.th}>Reasons given</th>
            </>
          ),
        }}
        query={query}
        shifts={listed}
      />
      {needingReasons ? (
        <p className="text-sm text-ds-muted">
          {needingReasons === 1
            ? '1 shift still needs the restaurant admin’s reasons before it comes here.'
            : `${needingReasons} shifts still need the restaurant admin’s reasons before they come here.`}
        </p>
      ) : null}
      {open ? (
        <ApprovalPanel key={open.shiftId} onClose={() => setOpenId(null)} shift={open} />
      ) : null}
    </section>
  );
}

/** A shift's money and the reasons given, to approve or send back. */
function ApprovalPanel({
  onClose,
  shift,
}: Readonly<{ onClose: () => void; shift: ShiftReconciliation }>) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [comment, setComment] = useState('');
  const canDecide = hasPermission('SHIFT_APPROVE') && shift.status === 'WAITING';
  const decided = (title: string, description: string) => async () => {
    showToast({ description, title, variant: 'success' });
    await queryClient.invalidateQueries({ queryKey: queryKeys.shiftReconciliations() });
    onClose();
  };
  const failed = (error: unknown) =>
    showToast({ description: getApiErrorMessage(error), title: 'Not saved', variant: 'error' });
  const approve = useMutation({
    mutationFn: () => organizationApi.approveShift(shift.shiftId, comment.trim()),
    onError: failed,
    onSuccess: decided('Shift approved', `${shiftTitle(shift)} is approved: its money is final.`),
  });
  const sendBack = useMutation({
    mutationFn: () => organizationApi.sendBackShift(shift.shiftId, comment.trim()),
    onError: failed,
    onSuccess: decided(
      'Shift sent back',
      `${shiftTitle(shift)} goes back to the restaurant admin.`,
    ),
  });
  const busy = approve.isPending || sendBack.isPending;

  return (
    <Modal
      description={`${shiftPlace(shift)} · ${shiftTime(shift)}`}
      footer={
        canDecide ? (
          <>
            <Button
              disabled={busy || !comment.trim()}
              onClick={() => sendBack.mutate()}
              type="button"
              variant="outline"
            >
              {sendBack.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send back
            </Button>
            <Button disabled={busy} onClick={() => approve.mutate()} type="button">
              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approve shift
            </Button>
          </>
        ) : (
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
        )
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

        <section className="space-y-2">
          <PanelHeading>Reasons given</PanelHeading>
          {shift.checks.length === 0 ? (
            <p className="rounded-card border border-ds-status-ok-fg/25 bg-ds-status-ok-bg px-4 py-3 text-sm font-semibold text-ds-status-ok-fg">
              Everything matches. No reasons needed.
            </p>
          ) : (
            shift.checks.map((check) => (
              <div
                className="space-y-2 rounded-card border border-ds-border bg-ds-subtle px-4 py-3 text-sm"
                key={check.key}
              >
                <p className="font-semibold text-ds-text">{checkTitle(check)}</p>
                <CheckDetail check={check} shift={shift} />
                <p className="font-semibold text-ds-text">
                  {shift.reasons[check.key]?.reason ?? 'No reason given'}
                </p>
                {shift.reasons[check.key]?.note ? (
                  <p className="text-ds-text-2">{shift.reasons[check.key]!.note}</p>
                ) : null}
              </div>
            ))
          )}
          {shift.submittedByName ? (
            <p className="text-xs text-ds-muted">
              Given by {shift.submittedByName}
              {shift.submittedAt ? `, ${formatDateTime(shift.submittedAt)}` : ''}
            </p>
          ) : null}
        </section>

        {canDecide ? (
          <div className="space-y-1">
            <Label htmlFor="approval-comment">Your comment (needed to send it back)</Label>
            <textarea
              className="min-h-20 w-full rounded-control border border-ds-input bg-ds-surface px-3 py-2 text-sm text-ds-text outline-hidden focus:ring-2 focus:ring-ds-primary"
              id="approval-comment"
              maxLength={300}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What should be fixed"
              value={comment}
            />
          </div>
        ) : shift.status === 'APPROVED' ? (
          <p className="rounded-card border border-ds-status-ok-fg/25 bg-ds-status-ok-bg px-4 py-3 text-sm font-semibold text-ds-status-ok-fg">
            Approved by {shift.decidedByName ?? 'a Supervisor'}
            {shift.decidedAt ? ` on ${formatDateTime(shift.decidedAt)}` : ''}.
            {shift.comment ? ` “${shift.comment}”` : ''}
          </p>
        ) : shift.status === 'SENT_BACK' ? (
          <p className="rounded-card border border-ds-status-bad-fg/25 bg-ds-status-bad-bg px-4 py-3 text-sm font-semibold text-ds-status-bad-fg">
            Sent back by {shift.decidedByName ?? 'a Supervisor'}
            {shift.comment ? `: “${shift.comment}”` : ''}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
