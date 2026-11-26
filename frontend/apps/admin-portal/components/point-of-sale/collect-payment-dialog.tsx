'use client';

import type {
  OnlinePaymentInput,
  OnlinePaymentProvider,
  PaymentMode,
  PosCollectInput,
} from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { OnlinePaymentDialog, providerLabels } from './online-payment-dialog';
import { onlineProvider } from './payment-collection';
import { formatMoney, paymentModeLabels, UpiQr, upiPayLink, usePosCounter } from './shared';

type CollectMode = Exclude<PaymentMode, 'PAY_LATER'>;

const modes: CollectMode[] = ['CASH', 'UPI', 'CARD', 'OTHER'];

/**
 * Takes a Pay later room bill's payment at this till, into its open shift (the user,
 * 2026-11-26). As at billing: UPI on the restaurant's own QR where it has one, else through the
 * location's gateway; a card on the counter's card machine where it has one; else typed in.
 */
export function CollectPaymentDialog({
  bill,
  onClose,
  onCollected,
}: Readonly<{
  bill: { billNumber: string; grandTotal: number; id: string };
  onClose: () => void;
  onCollected: () => void;
}>) {
  const { counter, query: countersQuery } = usePosCounter();
  const [mode, setMode] = useState<CollectMode>('CASH');
  const [reference, setReference] = useState('');
  // The gateway or card machine taking it right now.
  const [taking, setTaking] = useState<OnlinePaymentProvider | null>(null);
  const providersQuery = useQuery({
    enabled: mode === 'UPI' && Boolean(counter),
    queryFn: async () => (await organizationApi.listOnlinePaymentProviders(counter!.id)).data,
    queryKey: queryKeys.posPaymentProviders(counter?.id),
    staleTime: Infinity,
  });
  const cardMachineQuery = useQuery({
    enabled: mode === 'CARD' && Boolean(counter),
    queryFn: async () => (await organizationApi.getCardMachine(counter!.id)).data,
    queryKey: ['pos-card-machine', counter?.id],
    staleTime: 5 * 60_000,
  });
  const upiId = counter?.restaurant.upiId?.trim();
  const via = onlineProvider({
    cardMachine: Boolean(cardMachineQuery.data),
    isComplimentary: false,
    paymentMode: mode,
    upiVia: upiId ? 'OWN' : (providersQuery.data?.[0] ?? 'OWN'),
  });
  const checking =
    (mode === 'UPI' && providersQuery.isPending) || (mode === 'CARD' && cardMachineQuery.isPending);
  const collect = useMutation({
    mutationFn: async (body: Omit<PosCollectInput, 'counterId'>) =>
      (await organizationApi.collectPosBillPayment(bill.id, { counterId: counter!.id, ...body }))
        .data,
    onSuccess: onCollected,
  });
  // One object per payment: the payment dialog starts a new payment for each new request.
  const counterId = counter?.id;
  const request = useMemo<OnlinePaymentInput | null>(
    () => (taking && counterId ? { counterId, orderId: bill.id, provider: taking } : null),
    [bill.id, counterId, taking],
  );
  const shiftOpen = Boolean(counter?.shift.open);
  const ready = Boolean(counter) && shiftOpen;

  return (
    <>
      <Modal
        description={`${bill.billNumber} · ${formatMoney(bill.grandTotal)}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            {ready ? (
              <Button
                disabled={checking || collect.isPending}
                onClick={() => {
                  if (via) {
                    setTaking(via);
                  } else {
                    collect.mutate({
                      paymentMode: mode,
                      paymentReference: mode === 'CASH' ? undefined : reference.trim() || undefined,
                    });
                  }
                }}
                type="button"
              >
                {collect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Collect {formatMoney(bill.grandTotal)}
              </Button>
            ) : null}
          </div>
        }
        onClose={onClose}
        open={!request}
        title="Collect payment"
      >
        {countersQuery.isLoading ? (
          <Loader2 aria-label="Loading" className="mx-auto h-6 w-6 animate-spin text-ds-link" />
        ) : !counter ? (
          <p className="text-sm text-ds-text-2">
            Collect it at a POS till: this computer is not one.
          </p>
        ) : !shiftOpen ? (
          <p className="text-sm text-ds-text-2">
            Open a shift at {counter.counterName} before collecting a payment.
          </p>
        ) : (
          <div className="space-y-3">
            <div
              aria-label="Collect by"
              className="grid grid-cols-4 gap-1 rounded-control-lg bg-ds-subtle p-1"
              role="group"
            >
              {modes.map((option) => (
                <button
                  aria-pressed={mode === option}
                  className={cn(
                    'h-10 rounded-xl text-[13px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                    mode === option
                      ? 'bg-ds-primary text-white shadow-md shadow-ds-primary/25'
                      : 'text-ds-text-2 hover:bg-ds-surface hover:text-ds-text',
                  )}
                  key={option}
                  onClick={() => setMode(option)}
                  type="button"
                >
                  {paymentModeLabels[option]}
                </button>
              ))}
            </div>
            {mode === 'UPI' && !via && upiId ? (
              <UpiQr
                link={upiPayLink({
                  amount: bill.grandTotal,
                  payee: counter.restaurant.legalName ?? counter.restaurant.restaurantName,
                  reference: bill.billNumber,
                  upiId,
                })}
                size={112}
              />
            ) : null}
            {via ? (
              <p className="text-sm text-ds-text-2">
                {via === 'PINELABS'
                  ? 'The amount goes to the counter’s card machine.'
                  : `The guest pays by UPI through ${providerLabels[via]}.`}
              </p>
            ) : mode === 'CASH' ? null : (
              <Input
                aria-label="Payment reference"
                maxLength={100}
                onChange={(event) => setReference(event.target.value)}
                placeholder={
                  mode === 'OTHER'
                    ? 'How was it paid? (e.g. Sodexo)'
                    : `${paymentModeLabels[mode]} reference (optional)`
                }
                value={reference}
              />
            )}
            {collect.error ? (
              <p className="text-sm text-ds-status-bad-fg" role="alert">
                {getApiErrorMessage(collect.error)}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
      <OnlinePaymentDialog
        onClose={() => setTaking(null)}
        onPaid={(payment) => {
          setTaking(null);
          collect.mutate({ onlinePaymentId: payment.id });
        }}
        request={request}
      />
    </>
  );
}
