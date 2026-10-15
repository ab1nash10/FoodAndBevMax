'use client';

import { Button } from '@aahar/ui';
import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage } from '@/lib/api';

/**
 * Issues a key that lets a channel send orders (x-order-key on POST /api/v1/orders): a POS
 * device's key, or a restaurant's key for its kiosks, QR ordering and other apps. The key is
 * shown once; issuing a new one turns the old one off.
 */
export function OrderKeyButton({
  issue,
  label,
  name,
  usage,
}: Readonly<{
  issue: () => Promise<string>;
  /** Shown on wide screens next to the icon; icon only when omitted. */
  label?: string;
  name: string;
  usage: string;
}>) {
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: issue,
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Key not issued',
        variant: 'error',
      });
    },
    onSuccess: setApiKey,
  });

  return (
    <>
      <Button
        aria-label={`Order key for ${name}`}
        disabled={mutation.isPending}
        onClick={() => {
          if (
            window.confirm(
              `Issue a new order key for ${name}? Whatever sends its orders must then use the new key; any earlier key stops working.`,
            )
          ) {
            mutation.mutate();
          }
        }}
        size={label ? 'default' : 'icon'}
        title={`Order key: ${usage}`}
        type="button"
        variant="outline"
      >
        <KeyRound aria-hidden="true" className="h-4 w-4" />
        {label}
      </Button>
      <Modal
        footer={
          <Button onClick={() => setApiKey(null)} type="button">
            Done
          </Button>
        }
        onClose={() => setApiKey(null)}
        open={apiKey !== null}
        title={`Order key for ${name}`}
      >
        <div className="space-y-3 text-sm text-ds-text">
          <p>
            {usage.charAt(0).toUpperCase() + usage.slice(1)}. The key is shown only now; if it is
            lost, issue a new one.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-ds-border bg-ds-subtle px-3 py-2 font-mono text-xs">
              {apiKey}
            </code>
            <Button
              aria-label="Copy key"
              onClick={() =>
                apiKey &&
                void navigator.clipboard
                  .writeText(apiKey)
                  .then(() => showToast({ title: 'Key copied' }))
              }
              size="icon"
              type="button"
              variant="outline"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-ds-muted">
            Each order goes to <code>POST /api/v1/orders</code> with the key in the{' '}
            <code>x-order-key</code> header: the sender&apos;s own order id, the order number the
            guest is given, and optionally the items and source (KIOSK, QR or OTHER).
          </p>
        </div>
      </Modal>
    </>
  );
}
