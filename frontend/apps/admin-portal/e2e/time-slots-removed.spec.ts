import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Time Slots is gone: no tab, no page, and a menu item's hours are typed, not picked from a slot.
test('time slots are gone; menu items keep their own on-sale hours', async ({ page }) => {
  page.setDefaultTimeout(60_000);
  await page.goto('masters/restaurant-menus');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Time Slots' })).toHaveCount(0);

  await page.getByRole('button', { name: 'New menu item' }).click();
  await expect(page.getByLabel('Available From')).toBeVisible();
  await expect(page.getByLabel('Available To')).toBeVisible();
  await expect(page.getByLabel('Time slot')).toHaveCount(0);

  const response = await page.goto('masters/time-slots');
  expect(response?.status()).toBe(404);
});
