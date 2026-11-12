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

test('a forgotten password is reset by an emailed code, then signs in at once without a reload', async ({
  page,
}) => {
  const session = { accessToken: 'e2e-reset-access', refreshToken: 'e2e-reset-refresh' };
  let resetBody: unknown;
  let passwordBody: unknown;
  await page.route('**/auth/send-otp', async (route) => {
    await route.fulfill({
      json: { data: { channel: 'email' }, message: 'Success', success: true },
    });
  });
  await page.route('**/auth/reset-password', async (route) => {
    resetBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: { reset: true }, message: 'Success', success: true } });
  });
  await page.route('**/auth/login-with-password', async (route) => {
    passwordBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: session, message: 'Success', success: true } });
  });

  await page.goto('auth/login');
  await page.getByLabel('Work email').fill('Admin@MaxHealthcare.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();

  await test.step('the code and a new password, typed twice alike', async () => {
    await page.locator('input[inputmode="numeric"]').first().click();
    await page.keyboard.type('123456');
    await page.getByLabel('New password', { exact: true }).fill('Fresh-pass-1');
    await page.getByLabel('Confirm new password').fill('Fresh-pass-2');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByText('The two passwords do not match.')).toBeVisible();
    expect(resetBody).toBeUndefined();

    await page.getByLabel('Confirm new password').fill('Fresh-pass-1');
    await page.getByRole('button', { name: 'Reset password' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(resetBody).toEqual({
      email: 'admin@maxhealthcare.com',
      newPassword: 'Fresh-pass-1',
      otp: '123456',
    });
  });

  await test.step('the new password signs in straight away, no reload', async () => {
    await expect(page.getByLabel('Work email')).toHaveValue('Admin@MaxHealthcare.com');
    await page.getByLabel('Password', { exact: true }).fill('Fresh-pass-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForFunction(() =>
      window.localStorage.getItem('aahar.admin.auth')?.includes('e2e-reset-access'),
    );
    expect(passwordBody).toEqual({ email: 'admin@maxhealthcare.com', password: 'Fresh-pass-1' });
  });
});
