'use client';

import type { OnlinePayment, OnlinePaymentInput, OnlinePaymentProvider } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { formatMoney, UpiQr } from './shared';

export const providerLabels: Record<OnlinePaymentProvider, string> = {
  PAYU: 'PayU',
  PINELABS: 'Pine Labs',
  RAZORPAY: 'Razorpay',
};

/**
 * Takes a bill's payment online: asks the provider for a payment link (the server prices the
 * bill), shows it as a QR, checks every 2 s until the guest has paid, then hands the paid
 * payment back. For Pine Labs the amount goes to the counter's card machine instead, and the
 * guest pays by card there. Nothing here is the till's: a kiosk can use it with the same request.
 */
export function OnlinePaymentDialog({
  onClose,
  onPaid,
  request,
}: Readonly<{
  onClose: () => void;
  onPaid: (payment: OnlinePayment) => void;
  /** The bill to take payment for; null keeps the dialog closed. */
  request: OnlinePaymentInput | null;
}>) {
  const [payment, setPayment] = useState<OnlinePayment | null>(null);
  const handedBack = useRef<string | null>(null);
  const startMutation = useMutation({
    mutationFn: async (body: OnlinePaymentInput) =>
      (await organizationApi.startOnlinePayment(body)).data,
    onSuccess: setPayment,
  });
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => (await organizationApi.cancelOnlinePayment(id)).data,
    onSuccess(checked) {
      setPayment(checked);
      if (checked.status !== 'PAID') close();
    },
  });
  const statusQuery = useQuery({
    enabled: payment?.status === 'PENDING',
    queryFn: async () => (await organizationApi.checkOnlinePayment(payment!.id)).data,
    queryKey: ['online-payment', payment?.id],
    refetchInterval: 2000,
  });
  const current = statusQuery.data ?? payment;
  const { mutate: start, reset: resetStart } = startMutation;

  // A new bill starts a new payment; closed, the last one is forgotten.
  useEffect(() => {
    if (request) {
      start(request);
    } else {
      setPayment(null);
      resetStart();
    }
  }, [request, resetStart, start]);

  useEffect(() => {
    if (current?.status === 'PAID' && handedBack.current !== current.id) {
      handedBack.current = current.id;
      onPaid(current);
    }
  }, [current, onPaid]);

  function close() {
    setPayment(null);
    resetStart();
    onClose();
  }

  const provider = request ? providerLabels[request.provider] : '';
  const byCard = request?.provider === 'PINELABS';
  const how = byCard ? `by card on the ${provider} machine` : `by UPI through ${provider}`;
  const error = startMutation.error ?? cancelMutation.error;

  return (
    <Modal
      description={current ? `${formatMoney(current.amount)} ${how}` : how.replace(/^by /, '')}
      footer={
        <div className="flex justify-end gap-2">
          {current?.status === 'PENDING' ? (
            <Button
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate(current.id)}
              type="button"
              variant="outline"
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cancel payment
            </Button>
          ) : (
            <Button onClick={close} type="button" variant="outline">
              Close
            </Button>
          )}
        </div>
      }
      onClose={() => (current?.status === 'PENDING' ? cancelMutation.mutate(current.id) : close())}
      open={request !== null}
      title="Waiting for payment"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <XCircle className="h-10 w-10 text-ds-status-bad-fg" />
            <p className="text-sm text-ds-status-bad-fg" role="alert">
              {getApiErrorMessage(error)}
            </p>
            {request && !current ? (
              <Button onClick={() => start(request)} type="button">
                Try again
              </Button>
            ) : null}
          </>
        ) : !current ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-ds-link" />
            <p className="text-sm text-ds-text-2">
              {byCard
                ? 'Sending the amount to the card machine…'
                : `Getting a payment QR from ${provider}…`}
            </p>
          </>
        ) : current.status === 'PENDING' && byCard ? (
          <>
            <span className="grid h-20 w-20 place-items-center rounded-full bg-ds-primary-soft text-ds-link">
              <CreditCard aria-hidden="true" className="h-9 w-9" />
            </span>
            <p className="text-3xl font-bold tabular-nums text-ds-text">
              {formatMoney(current.amount)}
            </p>
            <p className="flex items-center gap-2 text-sm text-ds-text-2" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-ds-link" />
              The amount is on the card machine. The guest taps, inserts or swipes the card there;
              the bill completes by itself once {provider} confirms it.
            </p>
          </>
        ) : current.status === 'PENDING' ? (
          <>
            <UpiQr link={current.paymentUrl} size={208} />
            <p className="text-3xl font-bold tabular-nums text-ds-text">
              {formatMoney(current.amount)}
            </p>
            <p className="flex items-center gap-2 text-sm text-ds-text-2" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-ds-link" />
              The guest scans to pay. The bill completes by itself once {provider} confirms it.
            </p>
            <a
              className="break-all text-xs text-ds-link hover:underline"
              href={current.paymentUrl}
              rel="noreferrer"
              target="_blank"
            >
              {current.paymentUrl}
            </a>
          </>
        ) : current.status === 'PAID' ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-ds-status-ok-fg" />
            <p className="text-sm text-ds-text-2" role="status">
              Paid. Completing the bill…
            </p>
          </>
        ) : (
          <>
            <XCircle className="h-10 w-10 text-ds-status-bad-fg" />
            <p className="text-sm text-ds-text-2" role="status">
              {current.status === 'EXPIRED'
                ? `${provider} closed this payment unpaid. Take payment again.`
                : 'Payment cancelled.'}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
