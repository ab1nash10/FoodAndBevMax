'use client';

import { z } from 'zod';
import type { InventoryLocationType } from '@aahar/api-client';
import { defaultReceivedDate } from '@/components/inventory/shared/utils';

export interface TransferHeaderFormValues {
  businessDate: string;
  hospitalId: string;
  remarks: string;
  restaurantId: string;
  sourceId: string;
  sourceType: InventoryLocationType;
  transferDate: string;
}

export interface TransferLineDraft {
  clientId: string;
  itemId: string;
  remarks: string;
  sentQty: string;
  stockBalanceId: string;
}

export const transferHeaderSchema = z.object({
  businessDate: z.string().trim(),
  hospitalId: z.string().uuid('Select a hospital.'),
  remarks: z.string().trim(),
  restaurantId: z.string().uuid('Select a restaurant.'),
  sourceId: z.string().uuid('Select a source.'),
  sourceType: z.enum(['STORE', 'KITCHEN']),
  transferDate: z.string().trim().min(1, 'Transfer date is required.'),
});

export function defaultTransferDate(): string {
  return defaultReceivedDate();
}

/** Unsent work on a new transfer, kept in this browser until it is saved or submitted. */
interface LocalTransferDraft {
  header: TransferHeaderFormValues;
  lines: TransferLineDraft[];
  savedAt: string;
}

const localTransferDraftKey = 'aahar-new-transfer-draft';

export function readLocalTransferDraft(): LocalTransferDraft | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(localTransferDraftKey) ?? 'null',
    ) as LocalTransferDraft | null;

    return parsed?.header && Array.isArray(parsed.lines) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalTransferDraft(draft: LocalTransferDraft | null): void {
  try {
    if (draft) {
      window.localStorage.setItem(localTransferDraftKey, JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(localTransferDraftKey);
    }
  } catch {
    // Storage blocked or full: the form still works, it just isn't remembered.
  }
}
