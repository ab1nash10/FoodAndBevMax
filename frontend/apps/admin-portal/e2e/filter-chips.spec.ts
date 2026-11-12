import { expect, test, type Page } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Picking a choice applies it and closes the panel; what is set shows as chips under the toolbar
 * (each removable, plus Clear all), and the filters live in the address, so a reload keeps them.
 * Read-only: nothing saved.
 */
const chips = (page: Page) => page.getByRole('group', { name: 'Filters in use' });

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filters/ }).click();
  return page.getByRole('dialog', { name: 'Filters' });
}

test('Item Mapping filters: a pick closes the panel, chips, kept on reload, removed one by one or all at once', async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  await page.goto('masters/item-mapping?tab=kitchen');

  let filters = await openFilters(page);
  await expect(filters.getByLabel('Item')).toHaveCount(0); // the search finds items
  await filters.getByLabel('Type').selectOption('LIVE');
  await expect(filters).toBeHidden();
  await expect(page.getByRole('button', { name: /^Filters/ })).toBeFocused();
  filters = await openFilters(page);
  await filters.getByLabel('Status').selectOption('active');
  await expect(filters).toBeHidden();

  await expect(chips(page).getByRole('button', { name: 'Remove filter Type: Live' })).toBeVisible();
  await expect(
    chips(page).getByRole('button', { name: 'Remove filter Status: Active' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/[?&]type=LIVE/);

  // A reload asks for the same list and shows the same chips.
  const asked = page.waitForRequest(
    (request) =>
      request.url().includes('/kitchen-items?') &&
      new URL(request.url()).searchParams.get('itemType') === 'LIVE',
  );
  await page.reload();
  await asked;
  await expect(chips(page).getByRole('button', { name: 'Remove filter Type: Live' })).toBeVisible();

  await chips(page).getByRole('button', { name: 'Remove filter Type: Live' }).click();
  await expect(chips(page).getByRole('button', { name: /Type/ })).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]type=/);
  await expect(
    chips(page).getByRole('button', { name: 'Remove filter Status: Active' }),
  ).toBeVisible();

  // Clear all inside the panel empties it and closes it, and the chips row goes away.
  filters = await openFilters(page);
  await filters.getByRole('button', { name: 'Clear all' }).click();
  await expect(filters).toBeHidden();
  await expect(chips(page)).toBeHidden();
  filters = await openFilters(page);
  await expect(filters.getByLabel('Status')).toHaveValue('');

  // The Store tab starts clean: a kitchen filter does not follow it there.
  await filters.getByLabel('Type').selectOption('LIVE');
  await page.getByRole('tab', { name: 'Store items' }).click();
  await expect(page).not.toHaveURL(/[?&]type=/);
  await expect(chips(page)).toBeHidden();
});
