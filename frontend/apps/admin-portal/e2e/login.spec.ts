import { expect, test } from '@playwright/test';

/**
 * Sign-in is by a one-time code sent to the work email (or the mobile); there are no passwords.
 * The server's answers are stood in for: no code is ever sent.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('email signs in with a code sent to it; there is no password anywhere', async ({ page }) => {
  // Made-up tokens: a real sign-in here would end the session the other specs hold (one browser
  // per user). Storing them is what proves the screen signed in with the server's answer.
  const session = { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token' };
  let codeBody: unknown;
  let verifyBody: unknown;
  await page.route('**/auth/send-otp', async (route) => {
    codeBody = route.request().postDataJSON();
    await route.fulfill({
      json: { data: { channel: 'email' }, message: 'Success', success: true },
    });
  });
  await page.route('**/auth/verify-otp', async (route) => {
    verifyBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: session, message: 'Success', success: true } });
  });

  await page.goto('auth/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel(/password/i)).toHaveCount(0);
  await expect(page.getByText(/forgot password/i)).toHaveCount(0);

  await test.step('the email: only it is sent, cleaned', async () => {
    await page.getByLabel('Work email').fill(' Admin@MaxHealthcare.com ');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
    expect(codeBody).toEqual({ email: 'admin@maxhealthcare.com' });
  });

  await test.step('the code: signs in with the server’s answer', async () => {
    await page.locator('input[inputmode="numeric"]').first().click();
    await page.keyboard.type('123456');
    await page.getByRole('button', { name: 'Verify & sign in' }).click();
    await page.waitForFunction(() =>
      window.localStorage.getItem('aahar.admin.auth')?.includes('e2e-access-token'),
    );
    expect(verifyBody).toEqual({ email: 'admin@maxhealthcare.com', otp: '123456' });
  });
});
