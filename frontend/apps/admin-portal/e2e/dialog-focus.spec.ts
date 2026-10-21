import { expect, test, type Page } from '@playwright/test';
import { newSession } from './sign-in';

/**
 * A dialog opened from the keyboard takes focus, keeps Tab inside it, and on Esc gives focus
 * back to what opened it. Covers both kinds: a dialog over the page (Users, Employees, editing
 * an item) and a panel on its own route (/new, /edit), whose list is mounted anew on close.
 */
const lists = ['masters/items', 'masters/locations', 'masters/employees', 'users'];

function action(page: Page, name: RegExp) {
  const main = page.getByRole('main');

  return main.getByRole('link', { name }).or(main.getByRole('button', { name })).first();
}

const focusInDialog = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));

// A session of its own, as in pos.spec.ts: sharing the saved one, the first test to refresh it
// would sign the others out (each refresh token works once).
test.use({ storageState: { cookies: [], origins: [] } });

test('dialogs take focus, keep Tab inside and give it back on Esc', async ({ page }) => {
  test.setTimeout(5 * 60_000);
  page.setDefaultTimeout(30_000);
  const session = await newSession();
  await page.addInitScript((tokens) => {
    if (!window.localStorage.getItem('aahar.admin.auth')) {
      window.localStorage.setItem(
        'aahar.admin.auth',
        JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }),
      );
    }
  }, session);

  for (const path of lists) {
    for (const [kind, name] of [
      ['create', /^(new|create|add)\b/i],
      ['edit', /^edit\b/i],
    ] as const) {
      await test.step(`${path}: ${kind}`, async () => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        const opener = action(page, name);
        const label =
          (await opener.getAttribute('aria-label')) ?? (await opener.innerText()).trim();

        await opener.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect
          .poll(() => focusInDialog(page), { message: `${path} ${kind}: focus moves in` })
          .toBe(true);

        let left = 0;

        for (let step = 0; step < 40; step += 1) {
          await page.keyboard.press(step % 4 === 3 ? 'Shift+Tab' : 'Tab');
          left += (await focusInDialog(page)) ? 0 : 1;
        }

        expect.soft(left, `${path} ${kind}: Tab stays in the dialog`).toBe(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect
          .soft(
            page
              .getByRole('main')
              .getByRole(kind === 'create' ? 'link' : 'button', {
                exact: true,
                name: label,
              })
              .or(page.getByRole('main').getByRole('button', { exact: true, name: label }))
              .first(),
            `${path} ${kind}: Esc gives focus back to "${label}"`,
          )
          .toBeFocused();
      });
    }
  }
});
