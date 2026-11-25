import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// A fresh session: another spec's sign-in ends the one saved at the start.
test.beforeAll(() => signIn());

// A dialog's middle scrolls; its title and close button stay put. Preferences on a laptop screen
// once slid its title off the top: hidden " (required)" text for screen readers hung below the
// dialog, so the backdrop scrolled too (2026-11-26).
test('scrolling a dialog to its end keeps its title on screen', async ({ page }) => {
  await page.setViewportSize({ height: 759, width: 1347 });
  await page.goto('masters/locations');
  await page.locator('main h1').waitFor();
  await page
    .getByLabel(/^Account menu/)
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Preferences' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByText('Workspace').waitFor();

  const box = await dialog.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let turn = 0; turn < 10; turn += 1) {
    await page.mouse.wheel(0, 200);
  }

  await expect.poll(() => dialog.evaluate((element) => element.parentElement!.scrollTop)).toBe(0);
  await expect(dialog.getByRole('heading', { name: 'Preferences' })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { exact: true, name: 'Close' })).toBeInViewport();
});
