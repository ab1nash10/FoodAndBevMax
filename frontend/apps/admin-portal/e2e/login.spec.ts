import { expect, test } from '@playwright/test';

/**
 * The Email tab signs in with the password an admin set, or by a code sent to the email. The
 * server's answers are stood in for: no password is needed and no code is ever sent.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('email signs in with a password, or asks for a code instead', async ({ page }) => {
  // Made-up tokens: a real sign-in here would end the session the other specs hold (one browser
  // per user). Storing them is what proves the screen signed in with the server's answer.
  const session = { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token' };
  let passwordBody: unknown;
  let codeBody: unknown;
  await page.route('**/auth/login-with-password', async (route) => {
    passwordBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: session, message: 'Success', success: true } });
  });
  await page.route('**/auth/send-otp', async (route) => {
    codeBody = route.request().postDataJSON();
    await route.fulfill({
      json: { data: { channel: 'email' }, message: 'Success', success: true },
    });
  });

  await page.goto('auth/login');
  await page.getByLabel('Work email').fill(' Admin@MaxHealthcare.com ');

  await test.step('a code instead: only the email is sent', async () => {
    await page.getByRole('button', { name: 'Email me a code instead' }).click();
    await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
    expect(codeBody).toEqual({ email: 'admin@maxhealthcare.com' });
    await page.getByRole('button', { name: 'Change' }).click();
  });

  await test.step('the password: signs in with the server’s answer', async () => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('Secret 123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForFunction(() =>
      window.localStorage.getItem('aahar.admin.auth')?.includes('e2e-access-token'),
    );
    expect(passwordBody).toEqual({ email: 'admin@maxhealthcare.com', password: 'Secret 123' });
  });
});
