import type { ShiftReconciliation } from '@aahar/api-client';

// Shared by the Reconciliation and Approvals screen tests: one shift that matches, and one
// whose cash is ₹230 short with a ₹160 UPI bill no gateway confirmed.

// 8 am – 2 pm in India.
const base = {
  closedAt: '2026-11-25T08:30:00.000Z',
  comment: null,
  counterName: 'Counter 1',
  decidedAt: null,
  decidedByName: null,
  hospitalId: 'h-ppg',
  openedAt: '2026-11-25T02:30:00.000Z',
  openingCash: 500,
  reasons: {},
  restaurantId: 'r1',
  restaurantName: 'PPG Main Restaurant',
  shiftName: null,
  submittedAt: null,
  submittedByName: null,
} satisfies Partial<ShiftReconciliation>;

export const matchedShift: ShiftReconciliation = {
  ...base,
  cashierName: 'Asha',
  checks: [],
  money: [
    { billed: 4620, difference: 0, mode: 'CASH', received: 4620 },
    { billed: 6380, difference: 0, mode: 'UPI', received: 6380 },
    { billed: 2150, difference: 0, mode: 'CARD', received: 2150 },
  ],
  shiftId: 's1',
  status: 'WAITING',
};

export const shortShift: ShiftReconciliation = {
  ...base,
  cashierName: 'Ravi Kumar',
  checks: [
    {
      amount: 230,
      bills: [],
      key: 'CASH',
      kind: 'short',
      payments: [],
      reasons: ['Cash short', 'Wrong change given', 'Opening cash entered wrong', 'Other'],
    },
    {
      amount: -160,
      bills: [{ amount: 160, id: 'b42', number: '0042' }],
      key: 'UPI',
      kind: 'unconfirmed',
      payments: [],
      reasons: [
        'Checked in the bank or UPI app',
        'Paid on another UPI app',
        'Paid, but the bill was not made',
        'Guest did not pay',
        'Other',
      ],
    },
  ],
  // 2 pm – 8 pm in India.
  closedAt: '2026-11-25T14:30:00.000Z',
  money: [
    { billed: 3560, difference: -230, mode: 'CASH', received: 3330 },
    { billed: 5940, difference: -160, mode: 'UPI', received: 5780 },
    { billed: 1200, difference: 0, mode: 'CARD', received: 1200 },
  ],
  openedAt: '2026-11-25T08:30:00.000Z',
  shiftId: 's2',
  status: 'NEEDS_REASON',
};

/** The short shift once the restaurant admin gave its reasons. */
export const reasonedShift: ShiftReconciliation = {
  ...shortShift,
  reasons: {
    CASH: { note: 'A ₹500 note taken as ₹200 at lunch', reason: 'Wrong change given' },
    UPI: { note: null, reason: 'Guest did not pay' },
  },
  status: 'WAITING',
  submittedAt: '2026-11-25T15:00:00.000Z',
  submittedByName: 'Priya',
};
