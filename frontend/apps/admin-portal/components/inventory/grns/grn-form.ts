'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { organizationApi } from '@/lib/api';
import { clientId } from '@/components/inventory/shared/utils';
import { queryKeys } from '@/lib/query-keys';

export const headerSchema = z.object({
  hospitalId: z.string().uuid('Select a hospital.'),
  invoiceNumber: z.string().trim().max(500),
  poNumber: z.string().trim().max(500),
  receivedBy: z.string().trim().min(1, 'Received by is required.').max(255),
  receivedDate: z.string().trim().min(1, 'Received date is required.'),
  remarks: z.string().trim().max(500),
  storeId: z.string().uuid('Select a store.'),
  vendorName: z.string().trim().min(1, 'Vendor name is required.').max(500),
});

const grnBatchSchema = z
  .object({
    acceptedQty: z
      .string()
      .trim()
      .min(1, 'Accepted quantity is required.')
      .transform(Number)
      .pipe(z.number().min(0, 'Accepted quantity cannot be negative.')),
    batchNumber: z.string().trim().min(1, 'Batch number is required.').max(100),
    expiryDate: z.string().trim().min(1, 'Expiry date is required.'),
    manufacturingDate: z.string().trim(),
    receivedQty: z.coerce.number().min(0.001, 'Received quantity must be greater than zero.'),
    rejectionReason: z.string().trim().max(500),
  })
  .superRefine((batch, context) => {
    if (batch.acceptedQty > batch.receivedQty) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Accepted quantity cannot exceed received quantity.',
        path: ['acceptedQty'],
      });
    }
  });

const grnLineSchema = z
  .object({
    batches: z
      .array(grnBatchSchema)
      .min(1, 'Add at least one batch.')
      .max(200, 'A line can have at most 200 batches.'),
    itemId: z.string().uuid('Select an item.'),
    orderedQty: z
      .string()
      .trim()
      .refine((value) => !value || Number(value) >= 0, 'Ordered quantity cannot be negative.'),
    rejectionReason: z.string().trim().max(500),
    remarks: z.string().trim().max(500),
  })
  .superRefine((line, context) => {
    // A rejected quantity needs a reason, the batch's own or the line's, as the server checks.
    if (
      !line.rejectionReason &&
      line.batches.some((batch) => rejectedQty(batch) > 0 && !batch.rejectionReason)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a rejection reason for each batch with a rejected quantity.',
        path: ['rejectionReason'],
      });
    }
  });

export const grnLinesSchema = z
  .array(grnLineSchema)
  .min(1, 'Add at least one GRN line.')
  .max(200, 'A GRN can have at most 200 lines.');

export interface GrnHeaderFormValues {
  hospitalId: string;
  invoiceNumber: string;
  poNumber: string;
  receivedBy: string;
  receivedDate: string;
  remarks: string;
  storeId: string;
  vendorName: string;
}

export interface BatchDraft {
  acceptedQty: string;
  batchNumber: string;
  clientId: string;
  expiryDate: string;
  manufacturingDate: string;
  receivedQty: string;
  rejectionReason: string;
}

export interface LineDraft {
  batches: BatchDraft[];
  clientId: string;
  itemId: string;
  orderedQty: string;
  rejectionReason: string;
  remarks: string;
}

export function emptyBatch(): BatchDraft {
  return {
    acceptedQty: '',
    batchNumber: '',
    clientId: clientId('batch'),
    expiryDate: '',
    manufacturingDate: '',
    receivedQty: '',
    rejectionReason: '',
  };
}

export function emptyLine(): LineDraft {
  return {
    batches: [emptyBatch()],
    clientId: clientId('line'),
    itemId: '',
    orderedQty: '',
    rejectionReason: '',
    remarks: '',
  };
}

interface QuantityDraft {
  acceptedQty: number | string;
  receivedQty: number | string;
}

export function quantity(value: number | string): number {
  return Number(value || 0);
}

export function rejectedQty(batch: QuantityDraft): number {
  return Math.max(quantity(batch.receivedQty) - quantity(batch.acceptedQty), 0);
}

export function lineTotals(line: { batches: QuantityDraft[] }) {
  return line.batches.reduce(
    (totals, batch) => ({
      accepted: totals.accepted + quantity(batch.acceptedQty),
      received: totals.received + quantity(batch.receivedQty),
      rejected: totals.rejected + rejectedQty(batch),
    }),
    { accepted: 0, received: 0, rejected: 0 },
  );
}

export interface GrnCheck {
  /** Each problem by its field path, such as "vendorName" or "0.batches.1.expiryDate". */
  errors: Map<string, string>;
  /** The first problem, or null when the step is complete. */
  message: string | null;
}

function toCheck(result: { error?: z.ZodError }, numberLines = false): GrnCheck {
  const issues = result.error?.issues ?? [];
  const errors = new Map<string, string>();

  for (const issue of issues) {
    const key = issue.path.join('.');

    if (!errors.has(key)) {
      errors.set(key, issue.message);
    }
  }

  const first = issues[0];
  const line = first?.path[0];

  return {
    errors,
    message: !first
      ? null
      : numberLines && typeof line === 'number'
        ? `Line ${line + 1}: ${first.message}`
        : first.message,
  };
}

/** Step 1, Receive from. */
export function checkHeader(values: GrnHeaderFormValues): GrnCheck {
  return toCheck(headerSchema.safeParse(values));
}

/** Step 2, Items and batches. */
export function checkLines(lines: LineDraft[]): GrnCheck {
  return toCheck(grnLinesSchema.safeParse(lines), true);
}

export function useMappedStoreItems(storeId?: string) {
  return useQuery({
    enabled: Boolean(storeId),
    queryFn: async () => {
      const response = await organizationApi.listStoreItems({
        isActive: true,
        limit: 100,
        sortBy: 'createdAt',
        sortOrder: 'asc',
        storeId,
      });

      // One option per item: an item mapped under several categories is still one stock item.
      return response.data.items.filter(
        (mapping, index, all) =>
          all.findIndex((other) => other.itemId === mapping.itemId) === index,
      );
    },
    queryKey: queryKeys.inventoryStoreItems(storeId),
  });
}
