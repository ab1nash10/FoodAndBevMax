'use client';

import type { Counter, PosShift } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/components/point-of-sale/shared';
import { useToast } from '@/components/toast-provider';
import { Input, Label } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const openedAt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
});

/** "12.50" → 12.5; empty → undefined (not counted); anything else → null. */
function countedValue(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  return /^\d{1,8}(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * Ends the open shift of a counter no till reaches, so it could never be ended on one: a reason
 * is required, the cash count only if someone counted it. Its bills are tallied as on a till.
 */
export function EndStuckShiftDialog({
  counter,
  onClose,
}: Readonly<{ counter: Counter | null; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [cash, setCash] = useState('');
  const [reason, setReason] = useState('');
  const [ended, setEnded] = useState<PosShift | null>(null);
  const shift = counter?.openShift;
  const countedCash = countedValue(cash);
  const endMutation = useMutation({
    mutationFn: () =>
      organizationApi.endPosShiftWithoutTill(shift!.id, {
        countedCash: countedCash ?? undefined,
        reason: reason.trim(),
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Shift was not ended',
        variant: 'error',
      });
    },
    onSuccess(response) {
      setEnded(response.data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.counters() });
    },
  });
  const close = () => {
    setCash('');
    setReason('');
    setEnded(null);
    onClose();
  };
  const who = shift?.openedByName ?? 'the cashier';

  return (
    <Modal
      description={
        shift
          ? `Opened ${openedAt.format(new Date(shift.openedAt))} · ${counter?.restaurant.restaurantName ?? ''}`
          : undefined
      }
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
              disabled={endMutation.isPending || countedCash === null || !reason.trim()}
              onClick={() => endMutation.mutate()}
              type="button"
            >
              {endMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <LockKeyhole className="h-4 w-4" />
              End shift
            </Button>
          </div>
        )
      }
      onClose={close}
      open={Boolean(shift)}
      title={ended ? 'Shift ended' : `End ${who}’s shift at ${counter?.counterName ?? ''}?`}
    >
      {ended ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 rounded-xl border border-ds-border p-3 text-sm">
            <div>
              <dt className="text-ds-muted">Bills</dt>
              <dd className="font-semibold tabular-nums text-ds-text">
                {ended.summary?.bills ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-ds-muted">Sales</dt>
              <dd className="font-semibold tabular-nums text-ds-text">
                {formatMoney(ended.summary?.sales ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-ds-muted">Expected cash</dt>
              <dd className="font-semibold tabular-nums text-ds-text">
                {formatMoney(ended.expectedCash)}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-ds-text-2">
            {who} can open a shift at another counter now. The cash check is in Day Summary.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-ds-text-2">
            No till reaches this counter, so its shift can only be ended here. Its bills are tallied
            as on a till.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="stuck-shift-cash">
              Cash counted{' '}
              <span className="font-normal text-ds-muted">(if someone counted it)</span>
            </Label>
            <Input
              aria-invalid={countedCash === null}
              id="stuck-shift-cash"
              inputMode="decimal"
              onChange={(event) => setCash(event.target.value)}
              placeholder="Leave empty if nobody counted it"
              value={cash}
            />
            {countedCash === null ? (
              <p className="text-xs text-ds-status-bad-fg">Enter an amount, e.g. 500 or 250.50.</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="stuck-shift-reason">Why it’s ended here</Label>
            <Input
              autoFocus
              id="stuck-shift-reason"
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The till was removed with the shift open"
              value={reason}
            />
            <p className="text-xs text-ds-muted">Shown in Day Summary and Activity Logs.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
