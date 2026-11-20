import { expect, test } from '@playwright/test';
import { env, mainStoreItem, sendAsErp } from './erp';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

// The ERP sends a GRN in its own field names; it goes into the Main Store on arrival, and the
// ERP GRNs page shows every field and what was added, with nothing left for the store to do.
test('a GRN from the ERP goes into stock on arrival and shows every field', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');

  const found = await mainStoreItem(request);
  test.skip(!found, 'no item set up in a Main Store');
  const { hospital, mapped } = found!;
  const grnNo = `E2E-${Date.now().toString(36)}`;

  const sent = await sendAsErp(request, [
    {
      'Discount/Extra Charges': '0',
      MRP: '15',
      'Tax Rate': 'IGST@18%',
      'Total Value': '9.257',
      UOM: 'No.',
      'Unit Rate': '9.80',
      batch: grnNo,
      date: '2026-10-26 15:50:00',
      expiry_date: '2030-10-26 15:50:00',
      flag: 0,
      grn_No: grnNo,
      issued_by: 'M030634',
      // By name, as the ERP may send it; item name and HSN are left to the Item master.
      location: hospital.hospitalName,
      part_item_code: mapped.item.itemCode,
      purchase_order: '392851',
      requisition: '918590',
      supplier: 'CAGR0008',
      transaction_qty: '5',
    },
  ]);
  expect(sent.status(), await sent.text()).toBe(200);
  // AAHAR answers with its own number for the request.
  const receipt = (await sent.json()) as Record<string, unknown>;
  expect(receipt).toEqual({
    message: 'We have successfully received the request',
    success: true,
    transaction_number: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
  });
  const transactionNumber = receipt.transaction_number as string;

  await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
  await page.goto(`inventory/erp-grns?q=${grnNo}`);
  const row = page.locator(`tr[data-record-id="${grnNo}"]`);
  await expect(row).toContainText('Success');
  await expect(row).toContainText('1 batch · GRN');
  // The row itself opens nothing: its GRN number does.
  await row.getByRole('button', { name: grnNo }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`GRN ${grnNo}`);
  // Batches sit under their item; each says what was sent and what went into the store.
  const item = dialog.locator(`li[data-item="${mapped.item.itemCode}"]`);
  await expect(item.getByRole('heading')).toContainText(mapped.item.itemCode);
  const batch = item.locator('li[data-row]');
  await expect(batch).toContainText(/Qty sent\s*5\s*No\./);
  await expect(batch).toContainText(/Added to the store\s*5/);
  for (const text of [
    transactionNumber,
    hospital.hospitalCode,
    'Main Store',
    'CAGR0008',
    '392851',
    '918590',
    'M030634',
    'IGST@18%',
    '9.257',
    '9.8',
  ]) {
    await expect(dialog).toContainText(text);
  }
  // Nothing for the store to do on goods in.
  await expect(dialog.getByRole('button', { name: 'Run now' })).toHaveCount(0);
});

// A reverse (flag 1) takes the batch back out of the store: here the same GRN brings it in
// and sends it back, so the store holds it whatever else is in stock.
test('a GRN reverse takes the batch back out of the store', async ({ page, request }) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');

  const found = await mainStoreItem(request);
  test.skip(!found, 'no item set up in a Main Store');
  const { hospital, mapped } = found!;
  const grnNo = `E2E-RET-${Date.now().toString(36)}`;

  const line = (flag: number) => ({
    batch: grnNo,
    date: '2026-10-26 15:50:00',
    expiry_date: '2030-10-26',
    flag,
    grn_No: grnNo,
    location: hospital.hospitalCode,
    part_item_code: mapped.item.itemCode,
    transaction_qty: '2',
  });
  const sent = await sendAsErp(request, [line(0), line(1)]);
  expect(sent.status(), await sent.text()).toBe(200);

  await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
  await page.goto(`inventory/erp-grns?q=${grnNo}`);
  const row = page.locator(`tr[data-record-id="${grnNo}"]`);
  await expect(row).toContainText('GRN + reverse');
  await expect(row).toContainText('Success');
  // The row itself opens nothing: its GRN number does.
  await row.getByRole('button', { name: grnNo }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('li[data-row]', { hasText: 'Qty sent' })).toContainText(
    /Added to the store\s*2/,
  );
  await expect(dialog.locator('li[data-row]', { hasText: 'Qty to return' })).toContainText(
    /Returned\s*2/,
  );
});

// The list keeps itself up to date: a GRN the ERP sends while the page is open shows up on its
// own, with no reload.
test('a GRN sent while the page is open appears without a reload', async ({ page, request }) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');

  const found = await mainStoreItem(request);
  test.skip(!found, 'no item set up in a Main Store');
  const { hospital, mapped } = found!;

  await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
  await page.goto('inventory/erp-grns');
  await expect(page.getByRole('region', { name: 'GRNs from the ERP' })).toBeVisible();

  const grnNo = `E2E-LIVE-${Date.now().toString(36)}`;
  const sent = await sendAsErp(request, [
    {
      batch: '*',
      date: '2026-10-26 15:50:00',
      expiry_date: '2030-10-26',
      flag: 0,
      grn_No: grnNo,
      location: hospital.hospitalCode,
      part_item_code: mapped.item.itemCode,
      transaction_qty: '1',
    },
  ]);
  expect(sent.status(), await sent.text()).toBe(200);

  // No reload: the open page finds it by itself.
  await expect(page.locator(`tr[data-record-id="${grnNo}"]`)).toBeVisible({ timeout: 25_000 });
});
