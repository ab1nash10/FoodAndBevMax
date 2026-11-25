import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import {
  reasonRefusal,
  reconciliationStatus,
  shiftMoney,
  type ShiftBill,
  type ShiftMoneyInput,
} from './shift-reconciliation';

const bill = (
  amount: number,
  paymentMode: ShiftBill['paymentMode'],
  extra: Partial<ShiftBill> = {},
): ShiftBill => ({
  amount,
  cancelled: false,
  complimentary: false,
  confirmed: false,
  id: `bill-${amount}-${paymentMode}`,
  number: `MAX/${amount}`,
  paymentMode,
  ...extra,
});

const matched: ShiftMoneyInput = {
  bills: [
    bill(100, 'CASH'),
    bill(250, 'UPI', { confirmed: true }),
    bill(400, 'CARD', { confirmed: true }),
    // Neither is a sale: they never reach the drawer or a gateway.
    bill(999, 'CASH', { cancelled: true }),
    bill(80, null, { complimentary: true }),
  ],
  countedCash: 600,
  openingCash: 500,
  unbilled: [],
};

test('a shift whose cash, UPI and card all match has nothing to explain', () => {
  const { checks, money } = shiftMoney(matched);

  assert.deepEqual(money, [
    { billed: 600, difference: 0, mode: 'CASH', received: 600 },
    { billed: 250, difference: 0, mode: 'UPI', received: 250 },
    { billed: 400, difference: 0, mode: 'CARD', received: 400 },
  ]);
  assert.deepEqual(checks, []);
  // Every shift waits for the supervisor, matched or not (the user's option A).
  assert.equal(reconciliationStatus(checks, null), 'WAITING');
});

test('cash short, a UPI bill no gateway confirmed and a payment with no bill each need a reason', () => {
  const { checks, money } = shiftMoney({
    bills: [
      bill(3060, 'CASH'),
      bill(5780, 'UPI', { confirmed: true }),
      bill(160, 'UPI', { id: 'bill-42', number: '0042' }),
      bill(1200, 'CARD', { confirmed: true }),
      bill(75, 'OTHER'),
    ],
    countedCash: 3330,
    openingCash: 500,
    unbilled: [
      {
        amount: 90,
        id: 'pay-1',
        mode: 'CARD',
        paidAt: new Date('2026-11-25T10:00:00Z'),
        reference: 'TXN-9',
      },
    ],
  });

  assert.deepEqual(money, [
    { billed: 3560, difference: -230, mode: 'CASH', received: 3330 },
    { billed: 5940, difference: -160, mode: 'UPI', received: 5780 },
    // The card machine took ₹90 that no bill shows.
    { billed: 1200, difference: 90, mode: 'CARD', received: 1290 },
    // Other is typed in at the till: nothing to check it against.
    { billed: 75, difference: null, mode: 'OTHER', received: null },
  ]);
  assert.deepEqual(
    checks.map((check) => [check.key, check.kind, check.amount]),
    [
      ['CASH', 'short', 230],
      ['UPI', 'unconfirmed', -160],
      ['CARD', 'unconfirmed', 90],
    ],
  );
  assert.deepEqual(checks[1]!.bills, [{ amount: 160, id: 'bill-42', number: '0042' }]);
  assert.deepEqual(checks[2]!.payments, [
    { amount: 90, id: 'pay-1', paidAt: new Date('2026-11-25T10:00:00Z'), reference: 'TXN-9' },
  ]);
  assert.ok(checks[0]!.reasons.includes('Wrong change given'));
  assert.equal(reconciliationStatus(checks, null), 'NEEDS_REASON');
});

test('cash over and cash never counted are their own differences', () => {
  const over = shiftMoney({ bills: [], countedCash: 230, openingCash: 0, unbilled: [] });
  assert.deepEqual(
    over.checks.map((check) => [check.kind, check.amount]),
    [['over', 230]],
  );
  assert.ok(over.checks[0]!.reasons.includes('Opening cash not entered'));

  // A shift an admin ended without its till may have no count at all.
  const uncounted = shiftMoney({
    bills: [bill(50, 'CASH')],
    countedCash: null,
    openingCash: 0,
    unbilled: [],
  });
  assert.deepEqual(uncounted.money[0], {
    billed: 50,
    difference: null,
    mode: 'CASH',
    received: null,
  });
  assert.deepEqual(
    uncounted.checks.map((check) => [check.kind, check.amount]),
    [['not-counted', null]],
  );
});

test('a shift moves from needing reasons to waiting, and the supervisor decides', () => {
  const { checks } = shiftMoney({ bills: [], countedCash: 230, openingCash: 0, unbilled: [] });
  const reasons = { CASH: { note: '', reason: 'Opening cash not entered' } };

  assert.equal(reconciliationStatus(checks, null), 'NEEDS_REASON');
  assert.equal(reconciliationStatus(checks, { reasons, status: 'SUBMITTED' }), 'WAITING');
  assert.equal(reconciliationStatus(checks, { reasons, status: 'SENT_BACK' }), 'SENT_BACK');
  assert.equal(reconciliationStatus(checks, { reasons, status: 'APPROVED' }), 'APPROVED');
  // A bill changed since (the cash is now short, not over): the old reason no longer fits.
  const changed = shiftMoney({ bills: [], countedCash: 0, openingCash: 230, unbilled: [] });
  assert.equal(
    reconciliationStatus(changed.checks, { reasons, status: 'SUBMITTED' }),
    'NEEDS_REASON',
  );
});

test('reasons must cover every difference, from its list, with a note for Other', () => {
  const { checks } = shiftMoney({
    bills: [bill(160, 'UPI')],
    countedCash: 100,
    openingCash: 0,
    unbilled: [],
  });

  assert.equal(
    reasonRefusal(checks, { CASH: { reason: 'Cash over' } }),
    'Give a reason for the UPI difference.',
  );
  assert.equal(
    reasonRefusal(checks, {
      CASH: { reason: 'Cash over' },
      UPI: { reason: 'Felt like it' },
    }),
    'Choose one of the listed reasons for the UPI difference.',
  );
  assert.equal(
    reasonRefusal(checks, { CASH: { reason: 'Other' }, UPI: { reason: 'Guest did not pay' } }),
    'Say what happened when the reason for the cash difference is Other.',
  );
  assert.equal(
    reasonRefusal(checks, {
      CASH: { note: 'Float left from yesterday', reason: 'Other' },
      UPI: { reason: 'Guest did not pay' },
    }),
    null,
  );
});
