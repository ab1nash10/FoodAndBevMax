import { strict as assert } from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import {
  daysFromToday,
  formatEnum,
  formatQuantity,
  optionalValue,
  plural,
  toDateOnlyValue,
} from './utils';

afterEach(() => {
  vi.useRealTimers();
});

test('small text helpers: enums, blanks, plurals, dates and quantities', () => {
  assert.equal(formatEnum('PENDING_ACKNOWLEDGEMENT'), 'Pending Acknowledgement');
  assert.equal(optionalValue('  '), undefined);
  assert.equal(optionalValue(' PO-1 '), 'PO-1');
  assert.equal(plural(1, 'batch', 'batches'), '1 batch');
  assert.equal(plural(3, 'batch', 'batches'), '3 batches');
  assert.equal(plural(0, 'line'), '0 lines');
  assert.equal(toDateOnlyValue('2026-10-26T18:30:00Z'), '2026-10-26');
  assert.equal(toDateOnlyValue(null), '');
  // Whole quantities as they are, fractions to three places (kg, litres).
  assert.equal(formatQuantity(12), '12');
  assert.equal(formatQuantity(1.5), '1.500');
});

// Local wall-clock times (no zone), so the day count does not depend on this machine's zone.
test('days from today: past, today and future whole days, ignoring the time of day', () => {
  vi.useFakeTimers({ now: new Date('2026-10-26T22:00') });
  assert.equal(daysFromToday('2026-10-26T01:00'), 0);
  assert.equal(daysFromToday('2026-10-29T08:00'), 3);
  assert.equal(daysFromToday('2026-10-25T23:59'), -1);
  assert.equal(daysFromToday(null), null);
  assert.equal(daysFromToday(''), null);
});
