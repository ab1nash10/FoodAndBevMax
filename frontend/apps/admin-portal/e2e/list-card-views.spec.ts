import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Each of these lists opens as a table and switches to cards and back, like Items.
const pages = [
  { label: 'Show categories as', path: 'masters/item-categories' },
  { label: 'Show store items as', path: 'masters/item-mapping?tab=store' },
  { label: 'Show kitchen items as', path: 'masters/item-mapping?tab=kitchen' },
  { label: 'Show menu items as', path: 'masters/restaurant-menus' },
];

for (const { label, path } of pages) {
  test(`${path} switches between a list and cards`, async ({ page }) => {
    page.setDefaultTimeout(30_000);
    await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
    await page.goto(path);
    const row = page.locator('tbody tr[data-record-id]').first();
    await expect(row.or(page.getByText(/^No /).first())).toBeVisible();
    test.skip((await row.count()) === 0, 'nothing listed');

    const view = page.getByRole('group', { name: label });
    await view.getByRole('button', { name: 'Cards' }).click();
    await expect(page).toHaveURL(/view=cards/);
    await expect(page.locator('table')).toHaveCount(0);
    const card = page.locator('li[data-record-id]').first();
    await expect(card).toBeVisible();

    // A card's edit opens the record's editor, as a row's does.
    await card.getByRole('button', { name: /^Edit / }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await view.getByRole('button', { name: 'List' }).click();
    await expect(page).not.toHaveURL(/view=/);
    await expect(page.locator('tbody tr[data-record-id]').first()).toBeVisible();
  });
}
