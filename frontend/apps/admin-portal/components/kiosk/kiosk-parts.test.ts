import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { formatRupees } from './kiosk-parts';

test('kiosk prices: whole rupees without paise, paise only when there are some', () => {
  assert.equal(formatRupees(130), '₹130');
  assert.equal(formatRupees(5.86), '₹5.86');
  assert.equal(formatRupees(5.5), '₹5.5');
  // Indian grouping: lakhs and thousands.
  assert.equal(formatRupees(123456), '₹1,23,456');
});
