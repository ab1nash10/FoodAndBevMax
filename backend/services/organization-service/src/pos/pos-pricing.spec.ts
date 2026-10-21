import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { isOnSale, priceBill } from './pos-pricing';

test('an inclusive price is split into taxable value and GST that add back to it', () => {
  const bill = priceBill([{ gstPercent: 5, isGstInclusive: true, quantity: 3, unitPrice: 35 }]);

  assert.deepEqual(bill.lines[0], {
    discountAmount: 0,
    gstAmount: 5,
    lineTotal: 105,
    taxableAmount: 100,
  });
  assert.equal(bill.grandTotal, 105);
  assert.equal(bill.roundOff, 0);
});

// Two bills printed by the previous POS (Idoraa), which AAHAR's bills must match to the paisa.
test('inclusive prices split as the previous POS printed them: CGST and SGST rounded each', () => {
  assert.deepEqual(
    priceBill([{ gstPercent: 5, isGstInclusive: true, quantity: 2, unitPrice: 60 }]),
    {
      discountTotal: 0,
      grandTotal: 120,
      gstTotal: 5.72,
      lines: [{ discountAmount: 0, gstAmount: 5.72, lineTotal: 120, taxableAmount: 114.28 }],
      roundOff: 0,
      subtotal: 114.28,
    },
  );
  assert.deepEqual(
    priceBill([{ gstPercent: 5, isGstInclusive: true, quantity: 1, unitPrice: 209 }]),
    {
      discountTotal: 0,
      grandTotal: 209,
      gstTotal: 9.96,
      lines: [{ discountAmount: 0, gstAmount: 9.96, lineTotal: 209, taxableAmount: 199.04 }],
      roundOff: 0,
      subtotal: 199.04,
    },
  );
});

test('an exclusive price has GST added and the total is rounded to the rupee', () => {
  const bill = priceBill([
    { gstPercent: 18, isGstInclusive: false, quantity: 1, unitPrice: 49.5 },
    { gstPercent: 2.5, isGstInclusive: false, quantity: 2, unitPrice: 10 },
  ]);

  // 49.50 + 2 x 4.46 + 20.00 + 2 x 0.25 = 78.92 -> 79, round-off 0.08.
  assert.equal(bill.subtotal, 69.5);
  assert.equal(bill.gstTotal, 9.42);
  assert.equal(bill.grandTotal, 79);
  assert.equal(bill.roundOff, 0.08);
});

test('a staff discount comes off the taxable value, GST is charged on the rest', () => {
  const bill = priceBill([
    // Discountable at 10%: 114.28 - 11.43 = 102.85, GST 2 x 2.57.
    { discountPercent: 10, gstPercent: 5, isGstInclusive: true, quantity: 2, unitPrice: 60 },
    // Not discountable: billed at its full ₹209.
    { gstPercent: 5, isGstInclusive: true, quantity: 1, unitPrice: 209 },
  ]);

  assert.deepEqual(bill.lines, [
    { discountAmount: 11.43, gstAmount: 5.14, lineTotal: 107.99, taxableAmount: 102.85 },
    { discountAmount: 0, gstAmount: 9.96, lineTotal: 209, taxableAmount: 199.04 },
  ]);
  // 313.32 - 11.43 + 15.10 = 316.99 -> 317.
  assert.deepEqual(
    { ...bill, lines: undefined },
    {
      discountTotal: 11.43,
      grandTotal: 317,
      gstTotal: 15.1,
      lines: undefined,
      roundOff: 0.01,
      subtotal: 313.32,
    },
  );
});

test('rounding down shows a negative round-off', () => {
  const bill = priceBill([{ gstPercent: 5, isGstInclusive: false, quantity: 1, unitPrice: 20 }]);

  assert.equal(bill.grandTotal, 21);
  assert.equal(bill.roundOff, 0);

  const odd = priceBill([{ gstPercent: 12, isGstInclusive: false, quantity: 1, unitPrice: 11 }]);

  // 11 + 1.32 = 12.32 -> 12.
  assert.equal(odd.grandTotal, 12);
  assert.equal(odd.roundOff, -0.32);
});

test('a menu item is on sale on its days, inside its window, while switched on', () => {
  // Thursday 15 Oct 2026, 13:12 in India.
  const lunch = new Date('2026-10-15T07:42:00Z');
  const base = { availableFrom: null, availableTo: null, daysOfWeek: [], isAvailable: true };

  assert.equal(isOnSale(base, lunch), true);
  assert.equal(isOnSale({ ...base, isAvailable: false }, lunch), false);
  assert.equal(isOnSale({ ...base, daysOfWeek: ['THURSDAY'] }, lunch), true);
  assert.equal(isOnSale({ ...base, daysOfWeek: ['FRIDAY'] }, lunch), false);
  assert.equal(isOnSale({ ...base, availableFrom: '12:00', availableTo: '15:00' }, lunch), true);
  assert.equal(isOnSale({ ...base, availableFrom: '07:00', availableTo: '10:30' }, lunch), false);
  assert.equal(isOnSale({ ...base, availableFrom: '22:00', availableTo: '01:00' }, lunch), false);
});
