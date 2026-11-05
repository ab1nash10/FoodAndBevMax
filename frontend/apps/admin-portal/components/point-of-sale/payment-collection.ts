import type { OnlinePaymentProvider, PaymentMode } from '@aahar/api-client';

/**
 * Who takes a bill's payment before the bill is made, or null when the cashier just records it:
 * a card on the counter's Pine Labs machine (the only way a counter with one takes cards; the
 * server refuses a typed card there), or UPI through the online provider picked.
 */
export function onlineProvider(bill: {
  cardMachine: boolean;
  isComplimentary: boolean;
  paymentMode: PaymentMode;
  upiVia: 'OWN' | OnlinePaymentProvider;
}): OnlinePaymentProvider | null {
  if (bill.isComplimentary) return null;
  if (bill.paymentMode === 'CARD') return bill.cardMachine ? 'PINELABS' : null;
  if (bill.paymentMode === 'UPI' && bill.upiVia !== 'OWN') return bill.upiVia;

  return null;
}

/** The modes the till offers: a kiosk order is paid by UPI or card (online included), never cash. */
export function paymentModesFor(bill: { kioskOrder: boolean }): PaymentMode[] {
  return bill.kioskOrder ? ['UPI', 'CARD'] : ['CASH', 'UPI', 'CARD', 'OTHER'];
}
