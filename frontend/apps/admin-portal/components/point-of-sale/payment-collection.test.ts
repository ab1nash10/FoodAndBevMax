import { describe, expect, test } from 'vitest';
import { onlineProvider } from './payment-collection';

const bill = {
  cardMachine: true,
  isComplimentary: false,
  paymentMode: 'CARD' as const,
  upiVia: 'OWN' as const,
};

describe('which provider takes a bill’s payment before it is made', () => {
  test('a card goes to the counter’s Pine Labs machine; typed in only where it has none', () => {
    expect(onlineProvider(bill)).toBe('PINELABS');
    expect(onlineProvider({ ...bill, cardMachine: false })).toBeNull();
  });

  test('UPI goes to the picked online provider; the own QR and cash need none', () => {
    expect(onlineProvider({ ...bill, paymentMode: 'UPI', upiVia: 'RAZORPAY' })).toBe('RAZORPAY');
    expect(onlineProvider({ ...bill, paymentMode: 'UPI', upiVia: 'OWN' })).toBeNull();
    expect(onlineProvider({ ...bill, paymentMode: 'CASH' })).toBeNull();
    expect(onlineProvider({ ...bill, paymentMode: 'OTHER' })).toBeNull();
  });

  test('a complimentary bill takes no payment', () => {
    expect(onlineProvider({ ...bill, isComplimentary: true })).toBeNull();
    expect(
      onlineProvider({ ...bill, isComplimentary: true, paymentMode: 'UPI', upiVia: 'PAYU' }),
    ).toBeNull();
  });
});
