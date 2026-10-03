import type {
  GrnStatus,
  KitchenProductionStatus,
  StockBalanceStatus,
  TransferAcknowledgementStatus,
  TransferStatus,
} from '@aahar/api-client';

/** Colour family of a status chip; each maps to the themed ds-status-* tokens. */
export type StatusTone = 'bad' | 'info' | 'neutral' | 'ok' | 'pending';

export type KnownStatus =
  | GrnStatus
  | KitchenProductionStatus
  | StockBalanceStatus
  | TransferAcknowledgementStatus
  | TransferStatus;

export interface StatusPresentation {
  label: string;
  /** Longer wording where the short label is abbreviated (e.g. "Pending ack"). */
  long?: string;
  tone: StatusTone;
}

// A Record over the union: the compiler rejects a status value that has no entry.
const presentations: Record<KnownStatus, StatusPresentation> = {
  // Shared by transfers, GRNs and kitchen production.
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  // Transfers
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'ok' },
  PENDING_ACKNOWLEDGEMENT: {
    label: 'Pending ack',
    long: 'Pending acknowledgement',
    tone: 'pending',
  },
  // Acknowledgement outcomes
  ACCEPTED_FULL: { label: 'Accepted in full', tone: 'ok' },
  ACCEPTED_PARTIAL: { label: 'Accepted partially', tone: 'pending' },
  REJECTED_FULL: { label: 'Rejected in full', tone: 'bad' },
  // GRNs
  ACCEPTED: { label: 'Accepted', tone: 'ok' },
  PARTIALLY_ACCEPTED: { label: 'Partially accepted', tone: 'pending' },
  POSTED_TO_STOCK: { label: 'Posted to stock', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  UNDER_VERIFICATION: { label: 'Under verification', tone: 'info' },
  // Kitchen production
  POSTED: { label: 'Posted', tone: 'ok' },
  // Stock balances
  AVAILABLE: { label: 'Available', tone: 'ok' },
  EXPIRED: { label: 'Expired', tone: 'bad' },
  LOW_STOCK: { label: 'Low stock', tone: 'pending' },
  NEAR_EXPIRY: { label: 'Near expiry', tone: 'pending' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'bad' },
};

function humanise(value: string): string {
  const words = value.toLowerCase().split('_').filter(Boolean).join(' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isKnownStatus(value: string): value is KnownStatus {
  return Object.prototype.hasOwnProperty.call(presentations, value);
}

/** Label and tone for any status value; an unknown value reads as a neutral chip. */
export function statusPresentation(status: string): StatusPresentation {
  return isKnownStatus(status)
    ? presentations[status]
    : { label: humanise(status), tone: 'neutral' };
}
