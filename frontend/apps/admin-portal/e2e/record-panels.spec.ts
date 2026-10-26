import { expect, test, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Every record (item, category, employee, location, store, kitchen, restaurant, mapping, menu
 * item, POS device, counter, user) is created and edited the same way: in the side panel over its
 * list, never a page of its own. Documents (GRN, transfer, production) are guided flows and are
 * not listed here.
 */
const lists = [
  'masters/items',
  'masters/item-categories',
  'masters/item-mapping',
  'masters/restaurant-menus',
  'masters/employees',
  'masters/locations',
  'masters/entities',
  'masters/stores',
  'masters/kitchens',
  'masters/restaurants',
  'masters/pos',
  'masters/pos?tab=counters',
  'users',
];

function action(page: Page, name: RegExp) {
  const main = page.getByRole('main');

  return main.getByRole('link', { name }).or(main.getByRole('button', { name })).first();
}

// One test, one signed-in tab, like a person's: separate contexts would each hold a copy of the
// refresh token, and the first refresh would sign every other copy out. Soft checks, so one run
// lists every module that breaks the rule.
test('records are created and edited in the side panel over their list', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  // The dev server compiles a route on its first visit.
  page.setDefaultTimeout(30_000);

  const sidePanel = page.locator('[role="dialog"][data-side]');
  const title = page.getByRole('heading', { level: 1 });

  for (const path of lists) {
    await test.step(`${path}: create`, async () => {
      await page.goto(path);
      await action(page, /^(new|create|map|add)\b/i).click();
      await expect.soft(sidePanel, `${path}: create opens a side panel`).toBeVisible();
      // Fully shown, not stuck part-way through its slide-in.
      await expect
        .soft(sidePanel, `${path}: the panel finishes appearing`)
        .toHaveCSS('opacity', '1');
      // The list is still underneath, not replaced by a page of its own.
      await expect.soft(title, `${path}: the list stays behind it`).toBeVisible();
      await page.keyboard.press('Escape');
      // On a /new route Esc navigates back to the list, which the dev server may still be compiling.
      await expect.soft(sidePanel, `${path}: Esc closes it`).toHaveCount(0, { timeout: 15_000 });
    });

    await test.step(`${path}: edit`, async () => {
      await page.goto(path);
      await expect(title).toBeVisible();
      await page.waitForLoadState('networkidle');

      const edit = action(page, /^edit\b/i);

      // An empty list has nothing to edit.
      if ((await edit.count()) === 0) {
        return;
      }

      await edit.click();
      await expect.soft(sidePanel, `${path}: edit opens a side panel`).toBeVisible();
      await expect
        .soft(sidePanel, `${path}: the panel finishes appearing`)
        .toHaveCSS('opacity', '1');
      await expect.soft(title, `${path}: the list stays behind it`).toBeVisible();
    });
  }
});
