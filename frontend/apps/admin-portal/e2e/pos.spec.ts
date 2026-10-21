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

// A session of its own: sharing the saved one, the first test to refresh it would sign the
// other out (each refresh token works once).
test.use({ storageState: { cookies: [], origins: [] } });

test('point of sale: every screen opens, and a bill goes from the till to the kitchen', async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(30_000);
  const session = await newSession();
  await page.addInitScript((tokens) => {
    if (!window.localStorage.getItem('aahar.admin.auth')) {
      window.localStorage.setItem(
        'aahar.admin.auth',
        JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }),
      );
    }
  }, session);
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
});
