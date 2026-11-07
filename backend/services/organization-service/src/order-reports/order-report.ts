import type { OrderChannel, OrderStatus, PaymentMode } from '@prisma/client';

/** What a bill's row in Orders & Reports is worked out from. */
export interface ReportSource {
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  channel: OrderChannel | null;
  deliveredAt: Date | null;
  discountTotal: number;
  isComplimentary: boolean;
  /** When the payment gateway or card machine confirmed it; null when the cashier recorded it. */
  onlinePaidAt: Date | null;
  paymentMode: PaymentMode | null;
  placedAt: Date;
  readyAt: Date | null;
  status: OrderStatus;
}

const minutesBetween = (from: Date | null, to: Date | null) =>
  from && to ? Math.max(0, Math.round((to.valueOf() - from.valueOf()) / 60_000)) : null;

const reached = (status: OrderStatus, steps: OrderStatus[]) => steps.includes(status);

/**
 * The yes/no columns, the final status and the minutes each step took. A counter bill is paid
 * when it is billed (complimentary ones are never paid); a paid bill cancelled later is a
 * refund. A bill from before step times were kept still shows the steps its status has passed.
 */
export function reportFacts(order: ReportSource) {
  const cancelled = order.status === 'CANCELLED';
  const paid = !order.isComplimentary && order.paymentMode !== null;

  return {
    accepted:
      order.acceptedAt !== null || reached(order.status, ['PREPARING', 'READY', 'COLLECTED']),
    cancelled,
    delivered: order.deliveredAt !== null || order.status === 'COLLECTED',
    deliveryMinutes: minutesBetween(order.readyAt, order.deliveredAt),
    discounted: order.discountTotal > 0,
    finalStatus: cancelled ? 'Cancelled' : order.isComplimentary ? 'Complimentary' : 'Paid',
    ihc: order.isComplimentary,
    inRoom: order.channel === 'ROOM',
    kitchenMinutes: minutesBetween(order.acceptedAt, order.readyAt),
    online: order.onlinePaidAt !== null,
    orderMinutes: minutesBetween(order.placedAt, order.acceptedAt),
    paid,
    paidAt: paid ? (order.onlinePaidAt ?? order.placedAt) : null,
    ready: order.readyAt !== null || reached(order.status, ['READY', 'COLLECTED']),
    refunded: cancelled && paid,
    totalMinutes: minutesBetween(order.placedAt, order.deliveredAt),
  };
}

/** A bill as an amendment checks it. */
export interface AmendableBill {
  /** Its restaurant's day has been posted to the ERP. */
  erpSent: boolean;
  isComplimentary: boolean;
  /** The gateway or card machine confirmed the payment. */
  onlinePaid: boolean;
  paymentMode: PaymentMode | null;
  paymentReference: string | null;
  placedAt: Date;
  status: OrderStatus;
}

export const AMEND_WINDOW_MS = 48 * 60 * 60 * 1000;

const modeLabels: Record<PaymentMode, string> = {
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
  UPI: 'UPI',
};

/** The reference a payment mode keeps: none for cash, the trimmed ID otherwise ('' → none). */
export function referenceFor(paymentMode: PaymentMode, reference?: string | null) {
  return paymentMode === 'CASH' ? null : reference?.trim() || null;
}

/** Why a bill cannot be amended at all, or null when it can. */
export function billRefusal(bill: AmendableBill, now: Date | number): string | null {
  if (bill.status === 'CANCELLED') return 'A cancelled bill cannot be amended.';
  if (bill.isComplimentary) return 'A complimentary bill has no payment mode to change.';
  if (now.valueOf() - bill.placedAt.valueOf() > AMEND_WINDOW_MS) {
    return 'A bill can be amended only within 48 hours of billing.';
  }
  if (bill.onlinePaid) {
    return 'This bill was paid through the payment gateway or card machine, so its payment mode cannot be changed.';
  }
  if (bill.erpSent)
    return 'This bill’s day has been sent to the ERP, so it can no longer be amended.';

  return null;
}

/** Why a bill's payment mode cannot be changed to `change`, or null when it can. */
export function amendRefusal(
  bill: AmendableBill,
  change: { paymentMode: PaymentMode; paymentReference?: string | null },
  now: Date | number,
): string | null {
  const refused = billRefusal(bill, now);

  if (refused) return refused;

  const reference = referenceFor(change.paymentMode, change.paymentReference);

  if ((change.paymentMode === 'UPI' || change.paymentMode === 'CARD') && !reference) {
    return 'Enter the transaction ID for a UPI or card payment.';
  }
  if (change.paymentMode === bill.paymentMode && reference === bill.paymentReference) {
    return `The bill is already paid by ${modeLabels[change.paymentMode]}. Choose another payment mode or transaction ID.`;
  }

  return null;
}
