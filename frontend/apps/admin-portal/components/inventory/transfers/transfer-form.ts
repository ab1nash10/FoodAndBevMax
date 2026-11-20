'use client';

import { z } from 'zod';
import { defaultReceivedDate } from '@/components/inventory/shared/utils';

/** Where a transfer can come from: a store (MRP), a kitchen, or a restaurant's leftovers. */
export type SourceType = 'KITCHEN' | 'RESTAURANT' | 'STORE';

export interface TransferHeaderFormValues {
  businessDate: string;
  destinationType: 'COUNTER' | 'RESTAURANT';
  hospitalId: string;
  remarks: string;
  /** The operator who must acknowledge stock sent from a store to a restaurant. */
  receiverId: string;
  /** The receiving restaurant, or the counter when destinationType is COUNTER. */
  restaurantId: string;
  sourceId: string;
  sourceType: SourceType;
  transferDate: string;
}

export interface TransferLineDraft {
  clientId: string;
  itemId: string;
  remarks: string;
  sentQty: string;
  stockBalanceId: string;
}

export const transferHeaderSchema = z
  .object({
    businessDate: z.string().trim(),
    destinationType: z.enum(['RESTAURANT', 'COUNTER']),
    hospitalId: z.string().uuid('Select a hospital.'),
    receiverId: z.string(),
    remarks: z.string().trim().max(500, 'Remarks can be at most 500 characters.'),
    restaurantId: z.string().uuid('Select where the stock goes.'),
    sourceId: z.string().uuid('Select where the stock comes from.'),
    sourceType: z.enum(['STORE', 'KITCHEN', 'RESTAURANT']),
    transferDate: z.string().trim().min(1, 'Transfer date is required.'),
  })
  .superRefine((header, context) => {
    if (needsOperator(header) && !header.receiverId) {
      context.addIssue({
        code: 'custom',
        message: 'Choose the operator who acknowledges it.',
        path: ['receiverId'],
      });
    }
  });

/** Store stock sent to a restaurant names the operator who must acknowledge it. */
export function needsOperator(
  header: Pick<TransferHeaderFormValues, 'destinationType' | 'sourceType'>,
): boolean {
  return header.sourceType === 'STORE' && header.destinationType === 'RESTAURANT';
}

export function defaultTransferDate(): string {
  return defaultReceivedDate();
}
