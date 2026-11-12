import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * A restaurant's QR needs nothing set up: its orders go to the restaurant's first counter, so
 * the QR card has no counter to pick. Read-only.
 */
test('the QR card has no counter to pick', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  await page.goto('masters/restaurants');
  await page
    .getByRole('button', { name: /^Menu and ordering QR for / })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Print QR' })).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByText(/billed at|ordered at the kiosk/)).toHaveCount(0);
});
