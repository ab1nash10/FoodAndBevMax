'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StockDiscardReason } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Label } from '@/components/ui';
import { Modal, SegmentedControl } from '@/components/ui-controls';
import { Textarea } from '@/components/organization/shared/form-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateStockDiscardQueries } from '@/lib/query-invalidation';

/** One batch at one location, as a stock screen shows it. */
export interface DiscardableBatch {
  availableQty: number;
  batchNumber: string | null;
  expiryDate: string | null;
  itemName: string;
  locationName: string;
  stockBalanceId: string;
}

const reasons: Array<{ label: string; value: StockDiscardReason }> = [
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Damaged', value: 'DAMAGED' },
  { label: 'Spoilt', value: 'SPOILT' },
  { label: 'Spilled', value: 'SPILLED' },
  { label: 'Other', value: 'OTHER' },
];

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

/** The Discard button on a batch row; shown only to roles that may discard stock. */
export function DiscardBatchButton({
  batch,
  onDiscard,
}: Readonly<{ batch: DiscardableBatch; onDiscard: (batch: DiscardableBatch) => void }>) {
  const { hasPermission } = useAuth();

  if (!hasPermission('STOCK_DISCARD') || batch.availableQty <= 0) return null;

  return (
    <button
      aria-label={`Discard from ${batch.itemName}${batch.batchNumber ? ` batch ${batch.batchNumber}` : ''}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold text-ds-status-bad-fg transition hover:bg-ds-status-bad-bg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary pointer-coarse:h-10"
      onClick={(event) => {
        event.stopPropagation();
        onDiscard(batch);
      }}
      type="button"
    >
      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      Discard
    </button>
  );
}

/**
 * Throws stock away from one batch: how much (up to what it holds) and why. The batch's balance
 * goes down and the stock ledger shows a "Discarded" line with the reason.
 */
export function DiscardStockDialog({
  batch,
  onClose,
}: Readonly<{ batch: DiscardableBatch | null; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<StockDiscardReason>('EXPIRED');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // A fresh form for each batch: all of it, as expired.
  useEffect(() => {
    if (!batch) return;
    setQuantity(String(batch.availableQty));
    setReason(
      batch.expiryDate && batch.expiryDate.slice(0, 10) <= new Date().toISOString().slice(0, 10)
        ? 'EXPIRED'
        : 'DAMAGED',
    );
    setNote('');
    setSubmitted(false);
  }, [batch]);

  const mutation = useMutation({
    mutationFn: () =>
      organizationApi.discardStock({
        note: note.trim() || undefined,
        quantity: Number(quantity),
        reason,
        stockBalanceId: batch!.stockBalanceId,
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Stock was not discarded',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateStockDiscardQueries(queryClient);
      showToast({
        description: `${batch!.itemName}${batch!.batchNumber ? `, batch ${batch!.batchNumber}` : ''}: ${response.data.availableQty} left.`,
        title: `${quantity} discarded`,
        variant: 'success',
      });
      onClose();
    },
  });

  const amount = Number(quantity);
  const problems = batch
    ? [
        !(amount > 0) && 'Enter a quantity above zero.',
        amount > batch.availableQty && `Only ${batch.availableQty} left in this batch.`,
        reason === 'OTHER' && !note.trim() && 'Say what happened to the stock.',
      ].filter((problem): problem is string => Boolean(problem))
    : [];

  return (
    <Modal
      description={
        batch
          ? `${batch.itemName} · ${batch.locationName}${batch.batchNumber ? ` · Batch ${batch.batchNumber}` : ''}${batch.expiryDate ? ` · Expires ${dateFormat.format(new Date(batch.expiryDate))}` : ''}`
          : undefined
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className="bg-ds-status-bad-fg hover:bg-ds-status-bad-fg/90"
            disabled={mutation.isPending}
            onClick={() => {
              setSubmitted(true);
              if (problems.length === 0) mutation.mutate();
            }}
            type="button"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Discard {amount > 0 ? amount : ''}
          </Button>
        </div>
      }
      onClose={onClose}
      open={batch !== null}
      side
      title="Discard stock"
    >
      {batch ? (
        <div className="grid gap-4">
          <Field
            label={`Quantity (of ${batch.availableQty} in this batch)`}
            name="discard-quantity"
            required
          >
            <Input
              id="discard-quantity"
              inputMode="decimal"
              max={batch.availableQty}
              min={0}
              onChange={(event) => setQuantity(event.target.value)}
              step="any"
              type="number"
              value={quantity}
            />
          </Field>
          <div className="grid gap-2">
            <Label>Reason</Label>
            <SegmentedControl<StockDiscardReason>
              className="w-full flex-wrap"
              label="Reason"
              onChange={setReason}
              options={reasons}
              value={reason}
            />
          </div>
          <Field
            label={reason === 'OTHER' ? 'What happened' : 'Note (optional)'}
            name="discard-note"
            required={reason === 'OTHER'}
          >
            <Textarea
              id="discard-note"
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. tin dented in transit"
              value={note}
            />
          </Field>
          {submitted && problems.length > 0 ? (
            <ul className="space-y-0.5 text-sm text-ds-status-bad-fg" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ds-muted">
            The batch goes down by this much, and the stock ledger shows a “Discarded” line with the
            reason. It can’t be undone here.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
