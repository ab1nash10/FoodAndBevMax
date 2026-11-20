import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

/**
 * Access splits people in two: Admins (/users) and Operators (/operators, the fixed operator
 * roles). Read-only: nothing saved.
 */
test('Operators lists only operators, with the type filter and New Operator', async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const listed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/users') &&
      new URL(response.url()).searchParams.get('group') === 'OPERATORS',
  );
  await page.goto('operators');
  const body = (await (await listed).json()) as {
    data: { items: Array<{ roles: Array<{ isOperator: boolean }> }> };
  };
  // Everyone listed holds an operator role.
  for (const operator of body.data.items) {
    expect(operator.roles.some((role) => role.isOperator)).toBe(true);
  }

  await expect(page.getByRole('heading', { name: /^Operators/, level: 1 })).toBeVisible();
  for (const header of ['Name', 'Email', 'Mobile', 'Code', 'Type', 'Location', 'Last login at']) {
    await expect(page.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole('combobox', { name: 'Type' }).getByRole('option', {
      name: 'Restaurant/POS Operator',
    }),
  ).toBeAttached();

  await page.getByRole('button', { name: 'New Operator' }).click();
  const form = page.getByRole('dialog', { name: 'Add operator' });
  await expect(form.getByRole('textbox', { name: 'Pick from Employees' })).toBeVisible();
  await expect(form.getByRole('combobox', { name: /^Role/ })).not.toContainText('Super Admin');

  // Admins is the other half: nobody there holds an operator role.
  await page.goto('users');
  await expect(page.getByRole('heading', { name: /^Admins/, level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Operators' })).toBeVisible();
});
