import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

const organizationApi = process.env.E2E_ORGANIZATION_URL ?? 'http://localhost:4003/api/v1';

/** A setting from the repo's .env (the ERP key and secret the local API checks). */
function env(name: string): string {
  const line = readFileSync('../../../.env', 'utf8')
    .split(/\r?\n/)
    .find((text) => text.startsWith(`${name}=`));
  return (line?.slice(name.length + 1) ?? '').replace(/^["']|["']$/g, '');
}

async function list<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const session = JSON.parse(readFileSync('e2e/.auth.json', 'utf8')) as {
    origins: { localStorage: { value: string }[] }[];
  };
  const { accessToken } = JSON.parse(session.origins[0]?.localStorage[0]?.value ?? '{}') as {
    accessToken: string;
  };
  const response = await request.get(`${organizationApi}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return ((await response.json()) as { data: { items: T[] } }).data.items;
}

/** India time as the ERP signs it: dd/MM/yyyy/HH/mm. */
function erpTimestamp(): string {
  const ist = new Date(Date.now() + 330 * 60_000);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(ist.getUTCDate())}/${two(ist.getUTCMonth() + 1)}/${ist.getUTCFullYear()}/${two(ist.getUTCHours())}/${two(ist.getUTCMinutes())}`;
}

/** Sends rows to POST /erp/grns signed as the ERP does. */
async function sendAsErp(request: APIRequestContext, rows: object[]) {
  const url = new URL(`${organizationApi}/erp/grns`);
  const body = JSON.stringify(rows);
  const timestamp = erpTimestamp();
  const nonce = randomUUID();
  const text = [
    'POST',
    url.pathname,
    timestamp,
    nonce,
    createHash('sha256').update(body).digest('hex'),
  ].join('\n');

  return request.post(url.toString(), {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env('ERP_API_KEY'),
      'x-nonce': nonce,
      'x-signature': createHmac('sha256', env('ERP_API_SECRET')).update(text).digest('hex'),
      'x-timestamp': timestamp,
    },
  });
}

type Store = { hospitalId: string; id: string; isActive: boolean; storeName: string };
type StoreItem = { isActive: boolean; item: { itemCode: string }; storeId: string };
type Hospital = { hospitalCode: string; hospitalName: string; id: string };

// The ERP sends a GRN in its own field names; the store opens it on the ERP GRNs page, sees
// every field, rejects the batch with a reason (so no stock moves) and verifies it.
test('a GRN from the ERP shows every field and is verified by the store', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');

  const stores = await list<Store>(request, '/stores?isActive=true&limit=100');
  const storeItems = await list<StoreItem>(request, '/store-items?isActive=true&limit=100');
  const hospitals = await list<Hospital>(request, '/hospitals?isActive=true&limit=100');
  const mapped = storeItems.find((row) =>
    stores.some((store) => store.id === row.storeId && store.storeName === 'Main Store'),
  );
  test.skip(!mapped, 'no item set up in a Main Store');
  const store = stores.find((row) => row.id === mapped!.storeId)!;
  const hospital = hospitals.find((row) => row.id === store.hospitalId)!;
  const grnNo = `E2E-${Date.now().toString(36)}`;

  const sent = await sendAsErp(request, [
    {
      'Discount/Extra Charges': '0',
      MRP: '15',
      'Tax Rate': 'IGST@18%',
      'Total Value': '9.257',
      UOM: 'No.',
      'Unit Rate': '9.80',
      batch: '*',
      date: '2026-10-26 15:50:00',
      expiry_date: '2030-10-26 15:50:00',
      flag: 0,
      grn_No: grnNo,
      issued_by: 'M030634',
      // By name, as the ERP may send it; item name and HSN are left to the Item master.
      location: hospital.hospitalName,
      part_item_code: mapped!.item.itemCode,
      purchase_order: '392851',
      requisition: '918590',
      supplier: 'CAGR0008',
      transaction_number: `${grnNo}-1`,
      transaction_qty: '5',
    },
  ]);
  expect(sent.status(), await sent.text()).toBe(200);

  await page.addInitScript(() => window.localStorage.setItem('aahar.location-context', 'all'));
  await page.goto(`inventory/erp-grns?q=${grnNo}`);
  const row = page.locator(`tr[data-record-id="${grnNo}"]`);
  await expect(row).toContainText('To verify');
  await row.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`GRN ${grnNo}`);
  // The batch's quantity says what it is.
  await expect(dialog.locator('li[data-transaction]')).toContainText(/Qty sent\s*5\s*No\./);
  for (const text of [
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

  // Reject the whole batch: a reason is needed before Verify is allowed.
  await dialog.getByLabel(`Accepted for ${grnNo}-1`).fill('0');
  await expect(dialog.getByRole('button', { name: 'Verify GRN' })).toBeDisabled();
  await dialog.getByLabel(`Reason for ${grnNo}-1`).fill('E2E check, not received');
  await dialog.getByRole('button', { name: 'Verify GRN' }).click();
  await page
    .getByRole('dialog', { name: `Verify GRN ${grnNo}?` })
    .getByRole('button', { name: 'Verify' })
    .click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('Verified');
});

// The list keeps itself up to date: a GRN the ERP sends while the page is open shows up on its
// own, with no reload.
test('a GRN sent while the page is open appears without a reload', async ({ page, request }) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');

  const stores = await list<Store>(request, '/stores?isActive=true&limit=100');
  const storeItems = await list<StoreItem>(request, '/store-items?isActive=true&limit=100');
  const hospitals = await list<Hospital>(request, '/hospitals?isActive=true&limit=100');
  const mapped = storeItems.find((row) =>
    stores.some((store) => store.id === row.storeId && store.storeName === 'Main Store'),
  );
  test.skip(!mapped, 'no item set up in a Main Store');
  const store = stores.find((row) => row.id === mapped!.storeId)!;
  const hospital = hospitals.find((row) => row.id === store.hospitalId)!;

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
      part_item_code: mapped!.item.itemCode,
      transaction_number: `${grnNo}-1`,
      transaction_qty: '1',
    },
  ]);
  expect(sent.status(), await sent.text()).toBe(200);

  // No reload: the open page finds it by itself.
  await expect(page.locator(`tr[data-record-id="${grnNo}"]`)).toBeVisible({ timeout: 25_000 });
});
