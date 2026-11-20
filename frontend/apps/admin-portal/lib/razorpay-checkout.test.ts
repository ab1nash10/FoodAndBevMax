import { expect, test, vi } from 'vitest';
import { checkoutOptions } from './razorpay-checkout';

const checkout = {
  amount: 12000,
  currency: 'INR',
  keyId: 'rzp_test_pub',
  name: 'Ppg Main Restaurant',
  orderId: 'order_9',
  prefill: { contact: '+919815925566', name: 'Abinash' },
};

test('Razorpay opens on UPI for the order, the signed-in name and mobile filled in and locked', () => {
  const onPaid = vi.fn();
  const options = checkoutOptions(checkout, { onPaid });

  expect(options).toMatchObject({
    amount: 12000,
    currency: 'INR',
    key: 'rzp_test_pub',
    name: 'Ppg Main Restaurant',
    order_id: 'order_9',
    prefill: { contact: '+919815925566', method: 'upi', name: 'Abinash' },
    readonly: { contact: true, name: true },
  });
  // Only the server's own check with Razorpay bills it: the browser just asks again sooner.
  options.handler();
  expect(onPaid).toHaveBeenCalledOnce();
});

test('nothing is locked that was not filled in', () => {
  const options = checkoutOptions({ ...checkout, prefill: {} }, { onPaid: () => undefined });

  expect(options.readonly).toEqual({ contact: false, name: false });
});
