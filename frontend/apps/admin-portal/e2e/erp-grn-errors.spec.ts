import { expect, test } from '@playwright/test';
import { env, mainStoreItem, sendAsErp } from './erp';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// Goods in for a batch that has already expired are refused whole: nothing is saved, and the
// store team finds it on Logs → ERP GRN errors with why.
test('an expired batch sent as goods in is refused and listed on ERP GRN errors', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');
  const found = await mainStoreItem(request);
  test.skip(!found, 'no item set up in a Main Store');
  const { hospital, mapped } = found!;
  const batch = `E2E-ERR-${Date.now().toString(36)}`;

  const refused = await sendAsErp(request, [
    {
      batch,
      date: '2026-10-26 15:50:00',
      expiry_date: '2020-01-01',
      flag: 0,
      grn_No: batch,
      location: hospital.hospitalCode,
      part_item_code: mapped.item.itemCode,
      transaction_qty: '2',
    },
  ]);
  const why = `Batch ${batch} of item ${mapped.item.itemCode} has expired and cannot be received`;
  expect(refused.status(), await refused.text()).toBe(422);
  expect(((await refused.json()) as { errors: string[] }).errors).toEqual([why]);

  await page.addInitScript(
    (id) => window.localStorage.setItem('aahar.location-context', id),
    hospital.id,
  );
  await page.goto(`logs/erp-grn-errors?q=${batch}`);
  const row = page.getByRole('row').filter({ hasText: batch });
  await expect(row).toContainText(why);
  await expect(row).toContainText(`${mapped.item.itemCode} · ${batch} · in 2`);
});
