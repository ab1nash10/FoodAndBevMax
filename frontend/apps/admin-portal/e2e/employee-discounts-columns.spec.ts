import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// A fresh session: another spec's sign-in ends the one saved at the start.
test.beforeAll(() => signIn());

// The Employee Discounts list carries the columns of the agreed layout; only its Edit button opens
// a rule, a click on the row does not.
test('the employee discounts list shows every agreed column', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  // All Locations, so the rows are there whatever the test user's own location holds.
  await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
  await page.goto('masters/employee-discounts');

  const headers = page.locator('thead th');
  await expect(headers).toHaveText(
    [
      'ID',
      'Name',
      'Restaurant',
      'Discount value',
      'Special timings',
      'Serve days',
      'Timings',
      'Employee level',
      'Archived',
      'Created by',
      'Last updated at',
      'Actions',
      // The first visit compiles the page on a dev server: allow for it.
    ],
    { timeout: 30_000 },
  );

  const row = page.locator('tbody tr[data-record-id]').first();
  // Wait for the list to load: a row, or the empty message.
  await expect(row.or(page.getByText(/Add a discount for a restaurant/))).toBeVisible();
  if ((await row.count()) === 0) test.skip(true, 'no employee discounts locally');

  await expect(row.getByRole('button', { name: /^Edit / })).toHaveText('Edit');
  await expect(row.getByRole('button', { name: /^Archive / })).toHaveText('Archive');
  await expect(row.getByLabel('Not archived')).toBeVisible();

  // Both buttons fit inside the list, none cut off at its right edge.
  const list = await page.locator('table').locator('..').boundingBox();
  const archive = await row.getByRole('button', { name: /^Archive / }).boundingBox();
  expect(archive!.x + archive!.width).toBeLessThanOrEqual(list!.x + list!.width);
  const editor = page.getByRole('heading', { name: /^Edit / });
  await row.getByRole('cell').nth(1).click();
  await page.waitForTimeout(300);
  await expect(editor).toHaveCount(0);

  await row.getByRole('button', { name: /^Edit / }).click();
  await expect(editor).toBeVisible();
  await page.screenshot({ path: 'test-results/employee-discounts.png' });
});
