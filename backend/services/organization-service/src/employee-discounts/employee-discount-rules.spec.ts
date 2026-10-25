import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { bestDiscountRule, type DiscountRule } from './employee-discount-rules';

const rule = (overrides: Partial<DiscountRule>): DiscountRule => ({
  daysOfWeek: [],
  discountPercent: 10,
  employmentType: null,
  endTime: null,
  id: 'r',
  name: 'Rule',
  startTime: null,
  ...overrides,
});

// Thursday 22 Oct 2026, 13:00 in India (07:30 UTC).
const thursdayLunch = new Date('2026-10-22T07:30:00Z');
// The same Thursday, 18:00 in India.
const thursdayEvening = new Date('2026-10-22T12:30:00Z');

test('the highest matching percentage wins', () => {
  const rules = [rule({ discountPercent: 10, id: 'a' }), rule({ discountPercent: 30, id: 'b' })];

  assert.equal(bestDiscountRule(rules, 'ON_ROLL', thursdayLunch)?.id, 'b');
});

test('a rule for one level skips the other; a rule for everyone covers both', () => {
  const rules = [
    rule({ discountPercent: 25, employmentType: 'ON_ROLL', id: 'onRoll' }),
    rule({ discountPercent: 5, id: 'everyone' }),
  ];

  assert.equal(bestDiscountRule(rules, 'ON_ROLL', thursdayLunch)?.id, 'onRoll');
  assert.equal(bestDiscountRule(rules, 'OUTSOURCED', thursdayLunch)?.id, 'everyone');
  // An employee with no recorded level gets only the rules for everyone.
  assert.equal(bestDiscountRule(rules, null, thursdayLunch)?.id, 'everyone');
});

test('special timings and serve days are read in India time', () => {
  const lunchOnly = rule({ endTime: '15:00', id: 'lunch', startTime: '12:00' });

  assert.equal(bestDiscountRule([lunchOnly], 'ON_ROLL', thursdayLunch)?.id, 'lunch');
  assert.equal(bestDiscountRule([lunchOnly], 'ON_ROLL', thursdayEvening), null);
  assert.equal(
    bestDiscountRule([rule({ daysOfWeek: ['MONDAY'], id: 'mon' })], 'ON_ROLL', thursdayLunch),
    null,
  );
  assert.equal(
    bestDiscountRule([rule({ daysOfWeek: ['THURSDAY'], id: 'thu' })], 'ON_ROLL', thursdayLunch)?.id,
    'thu',
  );
});

test('no rules, no discount', () => {
  assert.equal(bestDiscountRule([], 'ON_ROLL', thursdayLunch), null);
});
