import { strict as assert } from 'node:assert';
import type { KioskMenuItem } from '@aahar/api-client';
import { test } from 'vitest';
import { cartTotals, MAX_PER_ITEM, quantityOf, reconcile, setQuantity } from './kiosk';

const item = (id: string, price: number, extra: Partial<KioskMenuItem> = {}): KioskMenuItem => ({
  category: null,
  foodType: 'VEG',
  gstPercent: 0,
  id,
  isDiscountable: true,
  isFeatured: false,
  isGstInclusive: false,
  itemName: id,
  preparationTimeMinutes: null,
  price,
  ...extra,
});

test('quantities add, cap and come off at zero', () => {
  const coke = item('coke', 130);
  let cart = setQuantity([], coke, 1);
  cart = setQuantity(cart, coke, 3);
  assert.equal(quantityOf(cart, 'coke'), 3);
  assert.equal(quantityOf(setQuantity(cart, coke, 99), 'coke'), MAX_PER_ITEM);
  assert.deepEqual(setQuantity(cart, coke, 0), []);
});

test('a fresh menu re-prices the cart and drops what is off sale', () => {
  const cart = setQuantity(setQuantity([], item('coke', 130), 2), item('tea', 20), 1);
  const result = reconcile(cart, [item('coke', 140)]);
  assert.deepEqual(result.dropped, ['tea']);
  assert.equal(result.cart[0]!.item.price, 140);
});

// The same order the server priced in the kiosk API check: ₹357 with a 10% staff discount.
test('the kiosk total matches the bill the counter makes', () => {
  const cart = setQuantity(
    setQuantity([], item('coke', 130), 2),
    item('red-bull', 123, { gstPercent: 5, isDiscountable: false, isGstInclusive: true }),
    1,
  );
  const totals = cartTotals(cart, 10);
  assert.equal(totals.grandTotal, 357);
  assert.equal(totals.discountTotal, 26);
  assert.equal(totals.itemCount, 3);
});
