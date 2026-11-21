import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, env, list, mainStoreItem, sendAsErp } from './erp';
import signIn from './sign-in';

// The saved session may have been ended by another spec signing in (one browser at a time).
test.beforeAll(() => signIn());

type Transfer = {
  id: string;
  lines: { batchNumber: string | null; id: string }[];
  transferNumber: string;
};

async function held(request: APIRequestContext, type: string, id: string, batch: string) {
  const rows = await list<{ availableQty: number | string }>(
    request,
    `/stock-balances?locationType=${type}&locationId=${id}&batchNumber=${batch}&limit=10`,
  );
  return rows.reduce((total, row) => total + Number(row.availableQty), 0);
}

// A restaurant sends a batch back on Return to Store; the store counts it on Count Returns and
// finds one short, so the counted stock goes into the store and the missing one back to the
// restaurant.
test('a restaurant returns stock to the store and the store counts it in', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000);
  test.skip(!env('ERP_API_KEY') || !env('ERP_API_SECRET'), 'no ERP key in .env');
  const found = await mainStoreItem(request);
  test.skip(!found, 'no item set up in a Main Store');
  const { hospital, mapped, store } = found!;
  const restaurant = (
    await list<{ id: string }>(
      request,
      `/restaurants?hospitalId=${hospital.id}&isActive=true&limit=1`,
    )
  )[0]!;
  test.skip(!restaurant, 'no restaurant at that location');
  const batch = `E2E-RTN-${Date.now().toString(36)}`;
  const expiryDate = '2030-10-26';

  // The ERP brings 3 of a fresh batch into the store, and the store issues them to the restaurant.
  const grn = await sendAsErp(request, [
    {
      batch,
      date: '2026-10-26 15:50:00',
      expiry_date: expiryDate,
      flag: 0,
      grn_No: batch,
      item_name: mapped.item.itemName,
      location: hospital.hospitalCode,
      part_item_code: mapped.item.itemCode,
      transaction_qty: '3',
    },
  ]);
  expect(grn.status(), await grn.text()).toBe(200);
  const [receiver] = await api<{ id: string }[]>(
    request,
    'GET',
    `/transfers/receivers?hospitalId=${hospital.id}`,
  );
  const issue = await api<Transfer>(request, 'POST', '/transfers', {
    destinationId: restaurant.id,
    destinationType: 'RESTAURANT',
    hospitalId: hospital.id,
    items: [{ batchNumber: batch, expiryDate, itemId: mapped.itemId, sentQty: 3 }],
    receiverId: receiver?.id,
    sourceId: store.id,
    sourceType: 'STORE',
    transferDate: new Date().toISOString(),
  });
  const issued = await api<Transfer>(request, 'PATCH', `/transfers/${issue.id}/dispatch`);
  await api(request, 'POST', '/transfer-acknowledgements', {
    items: [{ acceptedQty: 3, rejectedQty: 0, transferLineId: issued.lines[0]!.id }],
    transferId: issue.id,
  });
  expect(await held(request, 'RESTAURANT', restaurant.id, batch)).toBe(3);

  // Return to Store: no more than the restaurant holds, then all 3 go back.
  await page.addInitScript(
    (id) => window.localStorage.setItem('aahar.location-context', id),
    hospital.id,
  );
  await page.goto(`inventory/returns/new?restaurant=${restaurant.id}`);
  const qty = page.getByLabel(`Return quantity of ${mapped.item.itemName}, batch ${batch}`);
  await qty.fill('4');
  await expect(page.getByText(/^Only 3 of this batch at /)).toBeVisible();
  await qty.fill('3');
  await page.getByRole('button', { name: /^Return to / }).click();
  await expect(page.getByText('Returned to the store')).toBeVisible();
  expect(await held(request, 'RESTAURANT', restaurant.id, batch)).toBe(0);

  // Count Returns: the store counts 2 of the 3.
  const returns = await list<Transfer>(
    request,
    `/transfers?destinationType=STORE&status=PENDING_ACKNOWLEDGEMENT&hospitalId=${hospital.id}&limit=100`,
  );
  const sentBack = returns.find((transfer) =>
    transfer.lines.some((line) => line.batchNumber === batch),
  )!;
  await page.goto('inventory/returns');
  await page.getByRole('link', { name: `Count ${sentBack.transferNumber}` }).click();
  await page.getByLabel(`actual count of ${mapped.item.itemName}`, { exact: true }).fill('2');
  await page
    .getByLabel(`Why ${mapped.item.itemName} is missing`)
    .selectOption('Short in the return');
  await page.getByRole('button', { name: /^Confirm/ }).click();

  await expect.poll(() => held(request, 'STORE', store.id, batch)).toBe(2);
  expect(await held(request, 'RESTAURANT', restaurant.id, batch)).toBe(1);
});
