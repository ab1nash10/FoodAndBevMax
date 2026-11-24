import { expect, test } from '@playwright/test';

/**
 * 8 hours without activity signs a screen out (the user, 2026-11-23); the POS till is exempt
 * (covered in components/auth-provider.test.tsx). Made-up tokens: a real sign-in here would end
 * the session the other specs hold (one browser per user), and the sign-out call is answered here.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('a screen opened again after 8 idle hours signs out, says why, and ends the session on the server', async ({
  page,
}) => {
  await page.addInitScript(
    (lastActivity) => {
      // Once: the sign-in page that follows must not get the session back.
      if (window.localStorage.getItem('e2e-idle-seeded')) return;
      window.localStorage.setItem('e2e-idle-seeded', '1');
      window.localStorage.setItem(
        'aahar.admin.auth',
        JSON.stringify({
          accessToken: 'e2e-access-token',
          refreshToken: 'e2e-refresh-token',
          savedAt: new Date().toISOString(),
        }),
      );
      window.localStorage.setItem('aahar.last-activity', String(lastActivity));
    },
    Date.now() - 9 * 3_600_000,
  );
  let logoutBody: unknown;
  await page.route('**/auth/logout', async (route) => {
    logoutBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: { loggedOut: true }, message: 'Success', success: true } });
  });

  await page.goto('dashboard');

  await expect(page).toHaveURL(/\/auth\/login\?reason=idle$/);
  await expect(
    page.getByText('You were signed out after 8 hours without activity.', { exact: false }).first(),
  ).toBeVisible();
  await expect.poll(() => logoutBody).toEqual({ refreshToken: 'e2e-refresh-token' });
  expect(await page.evaluate(() => window.localStorage.getItem('aahar.admin.auth'))).toBeNull();
});
