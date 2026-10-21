import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { previewBill } from './pos-pricing';

// The same cases as the server's pos-pricing.spec.ts: the till and the bill must agree.
test('the till previews a bill exactly as the server prices it', () => {
  // Bills printed by the previous POS: ₹120 and ₹209 inclusive of 5% GST.
  assert.deepEqual(
    previewBill([{ gstPercent: 5, isGstInclusive: true, quantity: 2, unitPrice: 60 }]),
    { discountTotal: 0, grandTotal: 120, gstTotal: 5.72, roundOff: 0, subtotal: 114.28 },
  );
  assert.deepEqual(
    previewBill([{ gstPercent: 5, isGstInclusive: true, quantity: 1, unitPrice: 209 }]),
    { discountTotal: 0, grandTotal: 209, gstTotal: 9.96, roundOff: 0, subtotal: 199.04 },
  );
  assert.deepEqual(
    previewBill([
      { gstPercent: 18, isGstInclusive: false, quantity: 1, unitPrice: 49.5 },
      { gstPercent: 2.5, isGstInclusive: false, quantity: 2, unitPrice: 10 },
    ]),
    { discountTotal: 0, grandTotal: 79, gstTotal: 9.42, roundOff: 0.08, subtotal: 69.5 },
  );
  // Staff discount on the discountable line only.
  assert.deepEqual(
    previewBill([
      { discountPercent: 10, gstPercent: 5, isGstInclusive: true, quantity: 2, unitPrice: 60 },
      { gstPercent: 5, isGstInclusive: true, quantity: 1, unitPrice: 209 },
    ]),
    { discountTotal: 11.43, grandTotal: 317, gstTotal: 15.1, roundOff: 0.01, subtotal: 313.32 },
  );
  assert.equal(
    previewBill([{ gstPercent: 12, isGstInclusive: false, quantity: 1, unitPrice: 11 }]).roundOff,
    -0.32,
  );
});
