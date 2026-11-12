import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * A kitchen item is Readymade (made ahead, in the Main Kitchen) or Live (made to order, in the
 * counter kitchen): the form asks which, and offers that kitchen first. Read-only: nothing saved.
 */
const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

function accessToken() {
  const saved = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  return (JSON.parse(saved.origins[0]!.localStorage[0]!.value) as { accessToken: string })
    .accessToken;
}

test('Map item asks Readymade or Live, and picks the Main or the counter kitchen', async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const response = await fetch(`${organizationApi}/kitchens?isActive=true&limit=100`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const kitchens = (
    (await response.json()) as {
      data: { items: Array<{ hospitalId: string; id: string; kitchenName: string }> };
    }
  ).data.items;
  // A location with both a Main Kitchen and a counter kitchen.
  const counter = kitchens.find((kitchen) => /counter/i.test(kitchen.kitchenName));
  const main = kitchens.find(
    (kitchen) =>
      kitchen.hospitalId === counter?.hospitalId && kitchen.kitchenName === 'Main Kitchen',
  );
  test.skip(!counter || !main, 'no location with a Main Kitchen and a counter kitchen');

  await page.addInitScript(
    (id) => window.localStorage.setItem('aahar.location-context', id),
    counter!.hospitalId,
  );
  await page.goto('masters/item-mapping');
  const tab = page.getByRole('tab', { name: 'Kitchen items' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Map item' }).click();
  const dialog = page.getByRole('dialog', { name: 'Map Item to Kitchen' });

  const readymade = dialog.getByRole('radio', { name: /^Readymade/ });
  const live = dialog.getByRole('radio', { name: /^Live/ });
  const kitchen = dialog.getByRole('combobox', { name: 'Kitchen (required)' });
  // Readymade is made only in the Main Kitchen, so every other kitchen is greyed out.
  const offered = kitchen.locator('option:not([value=""]):not([disabled])');
  await expect(readymade).toBeChecked();
  await expect(kitchen).toHaveValue(main!.id);
  await expect(offered).toHaveText([/^Main Kitchen/]);

  await live.check();
  await expect(kitchen).toHaveValue(counter!.id);
  await expect(offered).not.toHaveCount(1);
  // Picking another kitchen for a Live item does not survive switching back to Readymade.
  await kitchen.selectOption(counter!.id);
  await readymade.check();
  await expect(kitchen).toHaveValue(main!.id);
  await expect(offered).toHaveText([/^Main Kitchen/]);
});

test('the Kitchen items list filters by type: Readymade or Live', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  await page.goto('masters/item-mapping');
  await page.getByRole('tab', { name: 'Kitchen items' }).click();
  await page.getByRole('button', { name: /^Filters/ }).click();
  const filters = page.getByRole('dialog', { name: 'Filters' });

  const asked = page.waitForRequest(
    (request) =>
      request.url().includes('/kitchen-items?') &&
      new URL(request.url()).searchParams.get('itemType') === 'LIVE',
  );
  await filters.getByLabel('Type').selectOption('LIVE');
  await asked;

  // Every row shown is Live.
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(rows.filter({ hasText: 'Readymade' })).toHaveCount(0);
});
