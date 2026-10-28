import type { OnlinePaymentProvider, PaymentMode } from '@aahar/api-client';

/** A card is taken on the counter's Pine Labs machine, or keyed in by hand with its reference. */
export type CardVia = 'MACHINE' | 'MANUAL';

/**
 * Who takes a bill's payment before the bill is made, or null when the cashier just records it:
 * a card on the counter's Pine Labs machine, or UPI through the online provider picked.
 */
export function onlineProvider(bill: {
  cardMachine: boolean;
  cardVia: CardVia;
  isComplimentary: boolean;
  paymentMode: PaymentMode;
  upiVia: 'OWN' | OnlinePaymentProvider;
}): OnlinePaymentProvider | null {
  if (bill.isComplimentary) return null;
  if (bill.paymentMode === 'CARD') {
    return bill.cardMachine && bill.cardVia === 'MACHINE' ? 'PINELABS' : null;
  }
  if (bill.paymentMode === 'UPI' && bill.upiVia !== 'OWN') return bill.upiVia;

  return null;
}
