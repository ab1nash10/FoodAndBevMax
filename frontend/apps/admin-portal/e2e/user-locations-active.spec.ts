import { expect, test, type Request } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * A user can only be given a location that is active: the Add user form's default-location list
 * and its location picker ask for active locations only. Read-only: nothing saved.
 */
const asksActiveOnly = (request: Request) =>
  new URL(request.url()).pathname.endsWith('/hospitals') &&
  new URL(request.url()).searchParams.get('isActive') === 'true';

test('Add user offers only active locations', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  await page.goto('users');

  const formList = page.waitForRequest(asksActiveOnly);
  await page.getByRole('button', { name: 'New user' }).click();
  await formList;

  const dialog = page.getByRole('dialog', { name: 'Add user' });
  const pickerList = page.waitForRequest(asksActiveOnly);
  await dialog.getByRole('button', { name: 'Add Location(s)' }).click();
  await pickerList;
  await expect(page.getByRole('dialog', { name: 'Select locations' })).toBeVisible();
});
