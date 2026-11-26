import { expect, test, type Page } from '@playwright/test';
import signIn from './sign-in';

// A fresh session: another spec's sign-in (pos.spec.ts) ends the one saved at the start.
test.beforeAll(() => signIn());

/**
 * POS → Reconciliation and Approvals (the user, 2026-11-26) in a real browser: both open from the
 * POS menu on a computer that is no till, the restaurant admin sends a shift with its reasons,
 * and a Supervisor approves one. The shift API is answered here, so no real shift in the local
 * database is approved (approval locks its bills); the server side is covered by
 * shift-reconciliation.int.spec.ts.
 */

const base = {
  checks: [],
  closedAt: '2026-11-25T08:30:00.000Z',
  comment: null,
  counterName: 'Counter 1',
  decidedAt: null,
  decidedByName: null,
  hospitalId: 'h1',
  openedAt: '2026-11-25T02:30:00.000Z',
  openingCash: 500,
  reasons: {},
  restaurantId: 'r1',
  restaurantName: 'E2E Restaurant',
  shiftName: null,
  submittedAt: null,
  submittedByName: null,
};
const matched = {
  ...base,
  cashierName: 'E2E Asha',
  money: [
    { billed: 4620, difference: 0, mode: 'CASH', received: 4620 },
    { billed: 6380, difference: 0, mode: 'UPI', received: 6380 },
    { billed: 2150, difference: 0, mode: 'CARD', received: 2150 },
  ],
  shiftId: 'e2e-s1',
  status: 'WAITING',
};
const short = {
  ...base,
  cashierName: 'E2E Ravi',
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
      reasons: ['Checked in the bank or UPI app', 'Guest did not pay', 'Other'],
    },
  ],
  money: [
    { billed: 3560, difference: -230, mode: 'CASH', received: 3330 },
    { billed: 5940, difference: -160, mode: 'UPI', received: 5780 },
    { billed: 1200, difference: 0, mode: 'CARD', received: 1200 },
  ],
  shiftId: 'e2e-s2',
  status: 'NEEDS_REASON',
};

const wrap = (data: unknown) => ({ json: { data, message: 'Success', success: true } });

/** Answers the shift list, and records each write the screen sends. */
async function answerShifts(page: Page, items: unknown[]) {
  const writes: Array<{ body: unknown; path: string }> = [];
  await page.route(
    (url) => url.pathname.includes('/pos/shift-reconciliations'),
    async (route) => {
      const { pathname } = new URL(route.request().url());
      if (route.request().method() === 'GET') {
        await route.fulfill(wrap({ date: '2026-11-25', items }));
        return;
      }
      writes.push({ body: route.request().postDataJSON(), path: pathname.split('/api/v1')[1]! });
      await route.fulfill(wrap({ ...short, status: 'WAITING' }));
    },
  );
  return writes;
}

test('the restaurant admin sends a shift for approval with a reason for each difference', async ({
  page,
}) => {
  const writes = await answerShifts(page, [matched, short]);

  await page.goto('pos/reconciliation?date=2026-11-25');

  await expect(page.getByRole('heading', { level: 1, name: 'Reconciliation' })).toBeVisible();
  // A desk screen: no till to set up first.
  await expect(page.getByText('This computer is not set up as a till')).toHaveCount(0);
  const tabs = page.getByRole('navigation', { name: 'POS pages' });
  await expect(tabs.getByRole('link', { name: 'Reconciliation' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(tabs.getByRole('link', { name: 'Approvals' })).toBeVisible();

  await page.getByRole('button', { name: 'Open E2E Ravi’s shift' }).click();
  const panel = page.getByRole('dialog', { name: 'E2E Ravi’s shift' });
  const send = panel.getByRole('button', { name: 'Send for approval' });
  await expect(send).toBeDisabled();
  await panel
    .getByRole('group', { name: 'Cash short by ₹230.00' })
    .getByLabel('Reason')
    .selectOption('Wrong change given');
  await panel
    .getByRole('group', { name: 'UPI: 1 bill with no payment confirmed' })
    .getByLabel('Reason')
    .selectOption('Guest did not pay');
  await send.click();

  await expect(panel).toBeHidden();
  expect(writes).toEqual([
    {
      body: {
        reasons: { CASH: { reason: 'Wrong change given' }, UPI: { reason: 'Guest did not pay' } },
      },
      path: '/pos/shift-reconciliations/e2e-s2/reasons',
    },
  ]);
});

test('a Supervisor approves a shift from the queue', async ({ page }) => {
  const reasoned = {
    ...short,
    reasons: { CASH: { reason: 'Wrong change given' }, UPI: { reason: 'Guest did not pay' } },
    status: 'WAITING',
    submittedByName: 'E2E Priya',
  };
  const writes = await answerShifts(page, [matched, reasoned]);

  await page.goto('pos/approvals?date=2026-11-25');

  await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible();
  await expect(page.getByText('E2E Asha')).toBeVisible();
  await page.getByRole('button', { name: 'Review E2E Ravi’s shift' }).click();
  const panel = page.getByRole('dialog', { name: 'E2E Ravi’s shift' });
  await expect(panel.getByText('Wrong change given')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Send back' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Approve shift' }).click();

  await expect(panel).toBeHidden();
  expect(writes).toEqual([
    { body: { comment: undefined }, path: '/pos/shift-reconciliations/e2e-s2/approve' },
  ]);
});
