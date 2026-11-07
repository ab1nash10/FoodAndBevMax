import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// A fresh session: another spec's sign-in ends the one saved at the start.
test.beforeAll(() => signIn());

// Each print switch on the POS devices list says in words whether it is on, and follows a click.
test('the KOT print switch shows On / Off beside it', async ({ page }) => {
  await page.goto('masters/pos');
  const kot = page.getByRole('switch', { name: /^KOT print for / }).first();
  await expect(kot).toBeVisible();

  const cell = kot.locator('..');
  const wasOn = (await kot.getAttribute('aria-checked')) === 'true';
  await expect(cell).toContainText(wasOn ? 'On' : 'Off');

  await kot.click();
  await expect(cell).toContainText(wasOn ? 'Off' : 'On');

  // Put it back as it was.
  await kot.click();
  await expect(cell).toContainText(wasOn ? 'On' : 'Off');
});
