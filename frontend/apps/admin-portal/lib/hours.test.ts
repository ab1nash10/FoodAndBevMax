import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { hoursRange } from './hours';

test('hours read as a range; a window ending before it starts runs past midnight', () => {
  const hours = (start: string | null, end: string | null) =>
    hoursRange(start, end).replace(/\s/g, ' ').toLowerCase();
  assert.equal(hours('07:00', '10:30'), '7:00 am – 10:30 am');
  assert.equal(hours('22:00', '01:00'), '10:00 pm – 1:00 am (next day)');
  assert.equal(hours(null, '10:30'), 'all day');
});
