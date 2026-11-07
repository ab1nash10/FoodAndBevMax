import { expect, test } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Orders & Reports under Organization: the bill table with every column, the complimentary
// tab, and the amendments tab's New Amendment panel. Reads only: nothing is amended.
test('orders & reports: bills with every column, complimentary, and the amendment finder', async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  await page.goto('masters/orders?from=2026-01-01');
  await expect(page.getByRole('heading', { name: 'Orders & Reports' })).toBeVisible();

  const table = page.getByRole('table');
  for (const header of [
    'Bill/Invoice No',
    'Order No',
    'Final Status',
    'History',
    'Order Time Taken',
    'Steward Assigned',
    'IHC',
    'Sent on ERP',
    'Room Consent',
    'Mode of Payment',
    'Transaction ID',
    'Actions',
  ]) {
    await expect(table.getByRole('columnheader', { exact: true, name: header })).toBeAttached();
  }
  await expect(table.getByRole('button', { name: 'Invoice' }).first()).toBeVisible();
  await expect(page.getByLabel('Order Type')).toHaveValue('');

  await page.getByRole('tab', { name: 'Complimentary Orders' }).click();
  await expect(page).toHaveURL(/tab=complimentary/);
  await expect(page.getByLabel('Order Type')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Order Amendments' }).click();
  await expect(table.getByRole('columnheader', { name: 'Amended By' })).toBeVisible();
  await page.getByRole('button', { name: 'New Amendment' }).click();
  const panel = page.getByRole('dialog', { name: 'New Amendment' });
  await panel.getByLabel('Order Number / Bill Number').fill('NO-SUCH-BILL');
  await panel.getByRole('button', { name: 'Find Order' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'No bill of the last 48 hours has order or bill number “NO-SUCH-BILL”.',
  );
});
