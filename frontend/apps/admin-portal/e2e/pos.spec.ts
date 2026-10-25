import { expect, test } from '@playwright/test';
import { newSession } from './sign-in';

/**
 * The Point of Sale screens open for a signed-in admin, and a bill made at the till reaches the
 * kitchen board and the bill history. The bill is real: it needs a local counter with at least
 * one item it can sell now, and it stays in the database like any other bill.
 */
const screens: Array<[string, string]> = [
  ['pos/billing', 'Billing'],
  ['pos/orders', 'Orders'],
  ['pos/history', 'Bill History'],
  ['pos/complimentary', 'Complimentary'],
  ['pos/day', 'Day Summary'],
  ['pos/menu', 'Counter Menu'],
  ['pos/stock', 'Counter Stock'],
  ['pos/receive', 'Receive Inventory'],
  // The store and kitchen task screens.
  ['inventory/grns/new', 'Receive a delivery'],
];

// The till: a local POS device with this hostname, mapped to the restaurant whose counter bills.
const tillHost = process.env.E2E_POS_HOST ?? 'test1';
const orgUrl = process.env.E2E_ORG_URL ?? 'http://localhost:4003/api/v1';
let openedShift = false;

// A session of its own: sharing the saved one, the first test to refresh it would sign the
// other out (each refresh token works once).
test.use({ storageState: { cookies: [], origins: [] } });

test('point of sale: every screen opens, and a bill goes from the till to the kitchen', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(30_000);
  const session = await newSession();
  await page.addInitScript(
    ({ host, tokens }) => {
      if (!window.localStorage.getItem('aahar.admin.auth')) {
        window.localStorage.setItem(
          'aahar.admin.auth',
          JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }),
        );
      }
      // This browser is the till whose hostname a local POS device carries.
      window.localStorage.setItem('aahar.pos.host', host);
    },
    { host: tillHost, tokens: session },
  );
  const title = page.getByRole('heading', { level: 1 });

  for (const [path, name] of screens) {
    await test.step(`${path} opens`, async () => {
      await page.goto(path);
      // The error page has its own title, so this also fails when the screen crashes.
      await expect.soft(title, `${path}: its title shows`).toHaveText(name);
    });
  }

  await test.step('kitchen/tablet opens', async () => {
    await page.goto('kitchen/tablet');
    // Titled with the kitchen's name, so the prompt above it is what is checked.
    await expect.soft(page.getByText('What did you make?')).toBeVisible();
  });

  await test.step('bill an item and find it on the board and in the history', async () => {
    await page.goto('pos/billing');
    // The till opens once a shift is started; one this test starts, it ends again below.
    const openShift = page.getByRole('button', { name: /open shift$/i });
    const anyItem = page.locator('button[aria-label^="Add "]');
    // Wait for the till to load: either the shift step or the menu.
    await expect(openShift.or(anyItem).first()).toBeVisible();
    if (await openShift.isVisible()) {
      await page.locator('#shift-opening-cash').fill('0');
      await openShift.click();
      openedShift = true;
    }
    const sellable = page.locator('button[aria-label^="Add "]:not([disabled])').first();
    await expect(sellable, 'the counter has an item it can sell now').toBeVisible();
    await sellable.click();
    await page.getByRole('button', { exact: true, name: 'Cash' }).click();
    await page.getByRole('button', { name: /^Complete order/ }).click();

    const done = page.getByRole('dialog', { name: 'Bill completed' });
    await expect(done).toBeVisible();
    const billNumber = (await done.locator('p.font-mono').innerText()).trim();
    await done.getByRole('button', { name: 'New bill' }).click();

    await page.goto('pos/orders');
    await expect(page.getByText(billNumber)).toBeVisible();

    await page.goto('pos/history');
    await expect(page.getByText(billNumber)).toBeVisible();
  });

  if (openedShift) {
    await test.step('end the shift this test started', async () => {
      const headers = { Authorization: `Bearer ${session.accessToken}` };
      const counters = (await (
        await fetch(`${orgUrl}/pos/counters?host=${encodeURIComponent(tillHost)}`, { headers })
      ).json()) as { data: Array<{ shift: { open: { id: string } | null } }> };
      const shiftId = counters.data[0]?.shift.open?.id;
      expect(shiftId, 'the shift this test opened').toBeTruthy();
      const ended = await fetch(`${orgUrl}/pos/shifts/${shiftId}/end`, {
        body: JSON.stringify({ countedCash: 0, handover: false, note: 'Browser test' }),
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      expect(ended.status, 'the shift ends').toBeLessThan(300);
    });
  }
});
