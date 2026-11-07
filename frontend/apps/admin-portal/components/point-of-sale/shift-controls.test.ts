import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { whereToEndIt } from './open-shift-card';
import { cashDifference } from './shift-controls';

test('counted cash against expected: none, over or short, to the paisa', () => {
  assert.deepEqual(cashDifference({ countedCash: 1500, expectedCash: 1500 }), {
    label: 'None',
    tone: 'text-ds-status-ok-fg',
  });
  assert.deepEqual(cashDifference({ countedCash: 1520, expectedCash: 1500 }), {
    label: '+₹20.00',
    tone: 'text-ds-status-pending-fg',
  });
  assert.deepEqual(cashDifference({ countedCash: 1485, expectedCash: 1500 }), {
    label: '−₹15.00',
    tone: 'text-ds-status-bad-fg',
  });
});

test('floating-point dust is not a difference', () => {
  // 0.1 + 0.2 is 0.30000000000000004 in floating point.
  assert.equal(cashDifference({ countedCash: 0.1 + 0.2, expectedCash: 0.3 }).label, 'None');
  assert.equal(cashDifference({ countedCash: 1500.25, expectedCash: 1500.2 }).label, '+₹0.05');
});

test('a shift not counted yet (or with nothing expected) has no difference to show', () => {
  assert.equal(cashDifference({ countedCash: null, expectedCash: 1500 }).label, '—');
  assert.equal(cashDifference({ countedCash: 1500, expectedCash: null }).label, '—');
});

test('an open shift at another counter: where to end it, and never a till’s name', () => {
  const elsewhere = {
    counterName: 'Cafeteria Counter 1',
    openedAt: '2026-10-28T07:40:50.776Z',
    restaurantName: 'Test Restaurant',
  };

  assert.equal(
    whereToEndIt({ ...elsewhere, hasTill: true }),
    'End it on that counter’s till, then come back here.',
  );
  assert.equal(
    whereToEndIt({ ...elsewhere, hasTill: false }),
    'That counter has no till, so it can’t be ended there. Ask an admin to end it under POS & Payment Machines → Counters.',
  );
});
