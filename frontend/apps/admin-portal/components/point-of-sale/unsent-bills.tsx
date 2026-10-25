'use client';

import { Button } from '@aahar/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '@/components/confirm-provider';
import { Modal } from '@/components/ui-controls';
import { useToast } from '@/components/toast-provider';
import { organizationApi } from '@/lib/api';
import {
  discardBill,
  queueBill,
  readQueue,
  sendQueued,
  type QueuedBill,
} from '@/lib/pos-offline-queue';
import { invalidatePosBillQueries } from '@/lib/query-invalidation';
import { cn } from '@/lib/utils';
import { formatMoney, paymentModeLabels } from './shared';

const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' });
const isWaiting = (bill: QueuedBill) => !bill.error && !bill.discardedAt;

/**
 * Bills this till kept while the server was out of reach, sent on their own when the connection
 * is back (the browser says it is online, the tab is looked at again, or every 30 s).
 */
export function useUnsentBills(counterId = '') {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [bills, setBills] = useState<QueuedBill[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isOpen, setOpen] = useState(false);
  const sendingRef = useRef(false);

  const refresh = useCallback(() => setBills(readQueue(counterId)), [counterId]);

  /** True when bills are still waiting afterwards: the server is still out of reach. */
  const send = useCallback(
    async (all: boolean) => {
      // One run at a time: 'online' and 'visibilitychange' often fire together.
      if (sendingRef.current) return false;
      sendingRef.current = true;
      setIsSending(true);

      try {
        const sent = await sendQueued(
          counterId,
          (payload) => organizationApi.createPosBill(payload),
          all,
        );

        if (sent > 0) {
          invalidatePosBillQueries(queryClient);
          showToast({
            action: { href: '/pos/history', label: 'Bill history' },
            description: 'They have their bill numbers now; print them from Bill history.',
            title: `${sent} saved bill${sent === 1 ? '' : 's'} sent`,
            variant: 'success',
          });
        }

        return readQueue(counterId).some(isWaiting);
      } finally {
        sendingRef.current = false;
        setIsSending(false);
        refresh();
      }
    },
    [counterId, queryClient, refresh, showToast],
  );

  useEffect(refresh, [refresh]);

  const waiting = bills.filter(isWaiting).length;

  useEffect(() => {
    if (waiting === 0) return undefined;
    const retry = () => void send(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    const timer = window.setInterval(retry, 30_000);

    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [send, waiting]);

  return {
    bills,
    discard(clientOrderId: string) {
      discardBill(counterId, clientOrderId);
      refresh();
    },
    isOpen,
    isSending,
    /** False when the device would not keep it. */
    queue(bill: Omit<QueuedBill, 'queuedAt'>) {
      const kept = queueBill(bill);
      refresh();
      return kept;
    },
    send,
    setOpen,
  };
}

type UnsentBills = ReturnType<typeof useUnsentBills>;

function counts(bills: QueuedBill[]) {
  const waiting = bills.filter(isWaiting).length;
  const attention = bills.filter((bill) => bill.error && !bill.discardedAt).length;
  return { attention, waiting };
}

/** The count of unsent bills in the page header; opens the list to retry or discard them. */
export function UnsentBillsButton({ unsent }: Readonly<{ unsent: UnsentBills }>) {
  const { attention, waiting } = counts(unsent.bills);

  if (unsent.bills.length === 0) return null;

  return (
    <Button
      className={cn(attention > 0 && 'border-ds-status-bad-fg text-ds-status-bad-fg')}
      onClick={() => unsent.setOpen(true)}
      size="sm"
      type="button"
      variant="outline"
    >
      <CloudOff className="h-4 w-4" />
      {[
        waiting > 0 && `${waiting} waiting to send`,
        attention > 0 && `${attention} need${attention === 1 ? 's' : ''} attention`,
        waiting + attention === 0 && `${unsent.bills.length} discarded`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </Button>
  );
}

/** The unsent bills, to retry or discard. Outside the page header, whose layer would cover it. */
export function UnsentBillsDialog({ unsent }: Readonly<{ unsent: UnsentBills }>) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { bills } = unsent;
  const { attention, waiting } = counts(bills);

  async function retryNow() {
    if (await unsent.send(true)) {
      showToast({
        description: 'The server could not be reached. They will be sent when it can.',
        title: 'Not sent yet',
        variant: 'info',
      });
    }
  }

  return (
    <Modal
      description="Kept on this till while the server was out of reach. They get their bill numbers when they are sent."
      footer={
        waiting + attention > 0 ? (
          <Button disabled={unsent.isSending} onClick={() => void retryNow()} type="button">
            {unsent.isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Retry now
          </Button>
        ) : null
      }
      onClose={() => unsent.setOpen(false)}
      open={unsent.isOpen && bills.length > 0}
      title="Unsent bills"
    >
      <ul className="divide-y divide-ds-divider">
        {bills.map((bill) => (
          <li
            className={cn('space-y-1 py-3', bill.discardedAt && 'opacity-60')}
            key={bill.payload.clientOrderId}
          >
            <div className="flex items-start justify-between gap-3">
              <p className={cn('text-sm text-ds-text', bill.discardedAt && 'line-through')}>
                {bill.summary}
              </p>
              <span className="font-mono text-sm font-semibold whitespace-nowrap">
                {formatMoney(bill.total)}
              </span>
            </div>
            <p className="text-xs text-ds-muted">
              {time.format(new Date(bill.queuedAt))} ·{' '}
              {bill.payload.isComplimentary
                ? 'Complimentary'
                : bill.payload.paymentMode
                  ? paymentModeLabels[bill.payload.paymentMode]
                  : '—'}
              {bill.payload.roomNumber ? ` · Room ${bill.payload.roomNumber}` : ''}
              {' · '}
              {bill.discardedAt
                ? `Discarded at ${time.format(new Date(bill.discardedAt))}`
                : 'Not yet sent: no bill number'}
            </p>
            {bill.error && !bill.discardedAt ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ds-status-bad-fg" role="alert">
                  {bill.error}
                </p>
                <Button
                  onClick={() =>
                    void confirm({
                      confirmLabel: 'Discard',
                      description: 'It will never be sent; settle it with the customer.',
                      title: `Discard this ${formatMoney(bill.total)} bill?`,
                      tone: 'danger',
                    }).then((confirmed) => {
                      if (confirmed) unsent.discard(bill.payload.clientOrderId);
                    })
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Discard
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
