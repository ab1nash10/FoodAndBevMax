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

// The POS opens only in a browser an admin set up as a POS device's till. The test does that on
// the screen, as an admin would, for a local POS device mapped to a restaurant with a counter.
// (Setting a device up again moves its till: any other browser set up as it stops being one.)
const tillDevice = process.env.E2E_POS_DEVICE ?? 'Smart Main Res';
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
  await page.addInitScript((tokens) => {
    if (!window.localStorage.getItem('aahar.admin.auth')) {
      window.localStorage.setItem(
        'aahar.admin.auth',
        JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }),
      );
    }
    // Every location, so the bill shows in the history whichever location the till is in.
    window.localStorage.setItem('aahar.location-context', 'all');
  }, session);
  const title = page.getByRole('heading', { level: 1 });

  await test.step('an admin sets this computer up as the till', async () => {
    await page.goto('pos/billing');
    const notATill = page.getByText('This computer is not set up as a till');
    await expect(notATill).toBeVisible();
    await page
      .getByRole('button', { name: `Make this computer the till of ${tillDevice}` })
      .click();
    await expect(notATill).toHaveCount(0);
  });

  for (const [path, name] of screens) {
    await test.step(`${path} opens`, async () => {
      await page.goto(path);
      // The error page has its own title, so this also fails when the screen crashes.
      // Some titles carry a count badge once their list loads ("Orders 8").
      await expect.soft(title, `${path}: its title shows`).toHaveText(new RegExp(`^${name}\\d*$`));
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
    // The menu opens on its categories; "All items" lists every dish.
    const allItems = page.getByRole('button', { name: /^All items/ });
    // Wait for the till to load: either the shift step or the menu.
    await expect(openShift.or(allItems).first()).toBeVisible();
    if (await openShift.isVisible()) {
      await page.locator('#shift-opening-cash').fill('0');
      await openShift.click();
      openedShift = true;
    }
    await allItems.click();
    const sellable = page.locator('button[aria-label^="Add "]:not([disabled])').first();
    await expect(sellable, 'the counter has an item it can sell now').toBeVisible();
    await sellable.click();
    await expect(page.getByRole('button', { name: 'Back to categories' })).toBeVisible();
    await page.getByRole('button', { exact: true, name: 'Cash' }).click();
    // Notes the guest hands over add up; the change due shows once they cover the bill.
    await page.getByRole('button', { exact: true, name: '₹500' }).click();
    await page.getByRole('button', { exact: true, name: '₹500' }).click();
    await expect(page.getByText('₹1,000.00', { exact: true })).toBeVisible();
    await expect(page.getByText('Change', { exact: true })).toBeVisible();
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
      const tillKey = await page.evaluate(() => localStorage.getItem('aahar.pos.tillKey'));
      const headers = {
        Authorization: `Bearer ${session.accessToken}`,
        'X-Till-Key': tillKey ?? '',
      };
      const counters = (await (
        await fetch(`${orgUrl}/pos/counters?till=true`, { headers })
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

// What the server says about this computer, and why the POS stays closed then.
const closedCases = [
  {
    message: 'This computer is not set up as a till',
    name: 'on a computer not set up as a till',
    whoami: { allowed: false, restaurants: [], till: null },
  },
  {
    message:
      'You are not assigned to the location of this till’s restaurant (Smart Main Restaurant)',
    name: 'for a user not assigned to the till’s location',
    whoami: { allowed: false, restaurants: ['Smart Main Restaurant'], till: 'Smart Main Res' },
  },
];

for (const closed of closedCases) {
  test(`${closed.name}, no POS screen opens; the rest of the portal does`, async ({ page }) => {
    const session = await newSession();
    await page.addInitScript((tokens) => {
      if (!window.localStorage.getItem('aahar.admin.auth')) {
        window.localStorage.setItem(
          'aahar.admin.auth',
          JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }),
        );
      }
    }, session);
    await page.route('**/pos/whoami', (route) =>
      route.fulfill({
        json: {
          data: closed.whoami,
          message: 'Success',
          success: true,
        },
      }),
    );

    for (const [path] of screens.filter(([path]) => path.startsWith('pos/'))) {
      await test.step(`${path} stays closed`, async () => {
        await page.goto(path);
        await expect.soft(page.getByText(closed.message)).toBeVisible();
      });
    }

    await page.goto('dashboard');
    await expect(page.getByText(closed.message)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}
