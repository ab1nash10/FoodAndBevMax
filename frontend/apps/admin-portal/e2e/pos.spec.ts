import { expect, test } from '@playwright/test';
import { newSession } from './sign-in';

/**
 * The POS screens open for a signed-in admin, and a bill made at the till reaches the
 * kitchen board and the bill history. The bill is real: it needs a local counter with at least
 * one item it can sell now, and it stays in the database like any other bill.
 */
const screens: Array<[string, string]> = [
  ['pos/billing', 'Billing'],
  ['pos/orders', 'Orders'],
  ['pos/history', 'Bill history'],
  ['pos/complimentary', 'Complimentary'],
  ['pos/day', 'Day summary'],
  ['pos/menu', 'Counter menu'],
  ['pos/stock', 'Counter stock'],
  ['pos/receive', 'Receive inventory'],
];

// The POS opens only for a user an admin listed on a POS device with this computer's name, once
// they typed it here. The test does both on the screen, for a local POS device mapped to a
// restaurant with a counter: it lists its own user there (kept for later runs).
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
    // Every location, so the bill shows in the history whichever location the till is in. Only
    // when unset, so the till setup below can pick the till's own location for a moment.
    if (!window.localStorage.getItem('aahar.location-context')) {
      window.localStorage.setItem('aahar.location-context', 'all');
    }
  }, session);
  const title = page.getByRole('heading', { level: 1 });

  // The computer this test plays: the device's own Host name, or a made-up one.
  let hostName = '';

  await test.step('an admin adds this user, with this computer’s name, to the POS device', async () => {
    const devices = (await (
      await fetch(`${orgUrl}/pos-devices?limit=100`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
    ).json()) as { data: { items: Array<{ hostName: string | null; name: string }> } };
    const device = devices.data.items.find((option) => option.name === tillDevice);
    expect(device, `a POS device named ${tillDevice}`).toBeTruthy();
    hostName = device?.hostName || 'E2E-TILL-01';
    const me = (
      JSON.parse(Buffer.from(session.accessToken.split('.')[1]!, 'base64url').toString()) as {
        sub: string;
      }
    ).sub;

    await page.goto(`masters/pos?q=${encodeURIComponent(tillDevice)}`);
    await page.getByRole('button', { name: `Edit ${tillDevice}` }).click();
    const form = page.getByRole('dialog', { name: 'Edit POS device' });
    const users = form.getByRole('group', { name: 'Users' });
    await expect(users).toBeVisible();
    const pickers = users.getByRole('combobox', { name: /^User \d+$/ });
    // Listed already by an earlier run: its computer name is kept as it is.
    const listed = await pickers.evaluateAll(
      (selects, id) => selects.some((select) => (select as HTMLSelectElement).value === id),
      me,
    );
    if (!listed) {
      await users.getByRole('button', { name: 'Add user' }).click();
      const row = await pickers.count();
      await pickers.nth(row - 1).selectOption(me);
      await users.getByRole('textbox', { name: `User ${row}’s computer name` }).fill(hostName);
    } else {
      const row =
        (await pickers.evaluateAll(
          (selects, id) =>
            selects.findIndex((select) => (select as HTMLSelectElement).value === id),
          me,
        )) + 1;
      hostName = await users
        .getByRole('textbox', { name: `User ${row}’s computer name` })
        .inputValue();
    }
    await form.getByRole('button', { name: 'Save changes' }).click();
    // Saved: the form closes, and the list counts the device's users.
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('cell', { name: /\d+ users?$/ })).toBeVisible();
  });

  await test.step('this computer becomes the till by typing its name', async () => {
    // No device to pick and no location to choose: the name alone finds the POS device.
    await page.goto('pos/billing');
    const notATill = page.getByText('This computer is not set up as a till');
    await expect(notATill).toBeVisible();
    const open = page.getByRole('button', { name: 'Open POS' });
    const name = page.getByLabel('This computer’s name');
    await expect(open, 'nothing to check until a name is typed').toBeDisabled();
    // A name no POS device has is refused, without saying which name would have worked.
    await name.fill('NOT-THIS-PC');
    await open.click();
    await expect(
      page.getByText('You are not listed with this computer’s name on any POS device', {
        exact: false,
      }),
    ).toBeVisible();
    await name.fill(hostName.toLowerCase());
    await name.press('Enter');
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
    // Tapping the count opens a box to type how many; past the line limit it is refused.
    await page.getByRole('button', { name: /^Type how many .+ \(now 1\)$/ }).click();
    const howMany = page.getByRole('dialog', { name: /^How many / });
    await howMany.getByLabel('Quantity').fill('1000');
    await expect(howMany.getByText('At most 999 at a time.')).toBeVisible();
    await expect(howMany.getByRole('button', { name: 'Set quantity' })).toBeDisabled();
    await howMany.getByLabel('Quantity').fill('1');
    await howMany.getByLabel('Quantity').press('Enter');
    await expect(howMany).toHaveCount(0);
    await expect(page.getByText('Total (1 item)')).toBeVisible();
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

  // Log out asks only about the user's own open shift. On a counter where someone else's shift
  // was already open, the test billed on theirs and has none of its own: Log out rightly signs
  // straight out, so there is nothing to check.
  if (openedShift) {
    await test.step('logging out with the shift open asks to end or hand it over first', async () => {
      await page.goto('pos/billing');
      await page.locator('summary[aria-label^="Account menu"]:visible').first().click();
      await page.locator('[role="menuitem"]:visible', { hasText: 'Log out' }).click();

      const asked = page.getByRole('dialog', { name: 'End your shift before you log out' });
      await expect(asked).toBeVisible();
      await expect(asked.getByText('You still have a POS shift open.')).toBeVisible();
      await asked.getByRole('button', { name: 'Stay signed in' }).click();
      await expect(asked).toHaveCount(0);
      // Still signed in, on the till.
      await expect(title).toHaveText(/^Billing/);
    });
  } else {
    test.info().annotations.push({
      description:
        'the counter already had another user’s shift open, so no own shift to ask about',
      type: 'skipped: log out asks about the open shift',
    });
  }

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
