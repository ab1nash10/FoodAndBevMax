import { expect, test } from '@playwright/test';

// The top bar's module links never run under the location picker, search or account, at any
// common screen width ("Access" once hid behind the location picker, 2026-11-22).
test('every module link stays clear of the controls on the right', async ({ page }) => {
  await page.goto('dashboard');
  await page.locator('main h1').waitFor();

  for (const width of [1280, 1366, 1440, 1536, 1920]) {
    await page.setViewportSize({ height: 800, width });
    const room = await page.evaluate(() => {
      const links = [...document.querySelectorAll('header nav[aria-label="Modules"] a')];
      const lastLink = Math.max(...links.map((link) => link.getBoundingClientRect().right));
      const controls = [...document.querySelectorAll('header button')]
        .map((button) => button.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.left > lastLink - 400)
        .map((box) => box.left);

      return { gap: Math.min(...controls) - lastLink, links: links.length };
    });

    expect(room.links, `${width}px: module links`).toBeGreaterThan(0);
    expect(room.gap, `${width}px: room between the last module and the controls`).toBeGreaterThan(
      8,
    );
  }
});
