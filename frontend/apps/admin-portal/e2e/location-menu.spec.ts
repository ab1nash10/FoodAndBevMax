import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// A fresh session: another spec's sign-in ends the one saved at the start.
test.beforeAll(() => signIn());

// The header's location menu must open fully on screen at every width, phone to wide desktop.
for (const width of [400, 900, 1100, 1280, 1440, 1920]) {
  test(`the location menu stays on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ height: 800, width });
    await page.goto('dashboard');
    await page
      .getByRole('button', { name: /^Select Location/ })
      .filter({ visible: true })
      .click();

    const menu = page
      .getByText('Choose a location to view location-specific data')
      .locator('../..');
    const box = await menu.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}
