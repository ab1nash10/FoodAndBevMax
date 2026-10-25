import type { DiscardReason } from './dto/discard-stock.dto';

export const discardReasonLabels: Record<DiscardReason, string> = {
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  OTHER: 'Other',
  SPILLED: 'Spilled',
  SPOILT: 'Spoilt',
};

/** The ledger line's remarks: "Discarded: Expired" or "Discarded: Damaged: tin dented". */
export function discardRemarks(reason: DiscardReason, note?: string): string {
  const detail = note?.trim();

  return `Discarded: ${discardReasonLabels[reason]}${detail ? `: ${detail}` : ''}`;
}

/**
 * Why a discard of `quantity` from a batch holding `available` cannot go ahead, or null. Rounded to
 * the ledger's 3 decimals, so 0.1 + 0.2 of a batch is not refused as more than 0.3.
 */
export function discardProblem(available: number, quantity: number): string | null {
  const round = (value: number) => Math.round(value * 1000) / 1000;

  if (round(quantity) <= 0) return 'Enter a quantity above zero.';
  if (round(quantity) > round(available)) {
    return `Only ${round(available)} left in this batch; discard that much or less.`;
  }

  return null;
}
