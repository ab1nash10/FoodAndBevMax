import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Items open as a list and switch to cards in the toolbar; the choice stays in the address.
test('items open as a list and switch to cards and back', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  await page.goto('masters/items');
  const view = page.getByRole('group', { name: 'Show items as' });
  const table = page.locator('table');
  await expect(table.locator('thead th')).toContainText(['Item', 'HSN', 'Prep time', 'Status']);
  await expect(table.locator('thead th', { hasText: /^Type$/ })).toHaveCount(0);
  const row = table.locator('tbody tr[data-record-id]').first();
  await expect(row).toBeVisible();

  // A row's edit opens the item, as a card's does.
  await row.getByRole('button', { name: /^Edit / }).click();
  await expect(page).toHaveURL(/id=/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await view.getByRole('button', { name: 'Cards' }).click();
  await expect(page).toHaveURL(/view=cards/);
  await expect(table).toHaveCount(0);
  await expect(page.locator('li[data-record-id]').first()).toBeVisible();

  // The address keeps the choice.
  await page.goto('masters/items?view=cards');
  await expect(page.locator('li[data-record-id]').first()).toBeVisible();

  await view.getByRole('button', { name: 'List' }).click();
  await expect(page).not.toHaveURL(/view=/);
  await expect(page.locator('table tbody tr[data-record-id]').first()).toBeVisible();
});
