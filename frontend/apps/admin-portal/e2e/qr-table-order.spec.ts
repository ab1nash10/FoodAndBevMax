import { expect, test, type Route } from '@playwright/test';

/**
 * A dine-in table's QR, on a guest's phone: straight to its restaurant's menu with the table
 * fixed, the counter menu, the order served at the table (no delivery check), then its progress.
 * The QR API is stood in for here, so no payment is opened and nothing is billed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { height: 800, width: 390 } });

const json = (route: Route, data: unknown) =>
  route.fulfill({
    contentType: 'application/json',
    json: { data, message: 'Success', success: true },
  });

test('a table QR opens the menu with the table fixed, and the order is served there', async ({
  page,
}) => {
  const menuChannels: string[] = [];
  let placed: Record<string, unknown> | undefined;

  await page.route('**/qr/tables/table-1', (route) =>
    json(route, {
      restaurantId: 'restaurant-1',
      restaurantName: 'Cafe Max',
      tableName: 'Window 2',
      token: 't',
    }),
  );
  await page.route('**/qr/restaurant-1/menu?*', (route) => {
    menuChannels.push(new URL(route.request().url()).searchParams.get('channel') ?? '');
    return json(route, {
      address: null,
      items: [
        {
          available: true,
          category: { categoryName: 'Snacks', id: 'c1', sortOrder: 1 },
          foodType: 'VEG',
          gstPercent: 5,
          id: 'menu-1',
          isDiscountable: true,
          isGstInclusive: true,
          itemName: 'Aloo Patty',
          preparationTimeMinutes: 15,
          price: 34,
          stock: null,
        },
      ],
      locationName: 'Saket',
      open: true,
      pickupCounter: 'Counter1',
      restaurantName: 'Cafe Max',
      roomDelivery: false,
      staffDiscount: false,
    });
  });
  // Signed in on this phone before.
  await page.addInitScript(() =>
    localStorage.setItem(
      'aahar:qr-guest',
      JSON.stringify({
        expiresAt: '2099-01-01T00:00:00.000Z',
        guestToken: 'signed-guest',
        mobile: '9811122233',
        name: 'Meera Shah',
      }),
    ),
  );
  await page.route('**/qr/restaurant-1/guest-discount?*', (route) =>
    json(route, { discountPercent: 0 }),
  );
  await page.route('**/qr/restaurant-1/orders?*', (route) => {
    placed = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { id: 'order-1', key: 'k', paymentUrl: null, status: 'AWAITING_PAYMENT' });
  });
  await page.route('**/qr/orders/order-1?*', (route) =>
    json(route, {
      billNumber: 'MAX/0018',
      channel: 'TABLE',
      deliveredAt: null,
      grandTotal: 34,
      id: 'order-1',
      key: 'k',
      kitchenStatus: 'READY',
      lines: [{ amount: 34, itemName: 'Aloo Patty', quantity: 1 }],
      message: null,
      orderNumber: '18',
      paidAt: '2026-11-20T05:12:00.000Z',
      paymentUrl: null,
      provider: 'RAZORPAY',
      readyAt: '2026-11-20T05:25:00.000Z',
      readyBy: '2026-11-20T05:27:00.000Z',
      restaurantName: 'Cafe Max',
      roomNumber: null,
      status: 'BILLED',
      tableName: 'Window 2',
    }),
  );

  // The table's QR goes straight to its restaurant's menu, the table fixed: no list to pick from.
  await page.goto('order/table/table-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Cafe Max' })).toBeVisible();
  await expect(page).toHaveURL(/\/order\/restaurant-1\?table=Window\+2&tableId=table-1&token=t$/);
  await expect(page.getByText('At table Window 2')).toBeVisible();
  // The counter menu, at counter prices.
  expect(menuChannels).toContain('COUNTER');
  expect(menuChannels).not.toContain('ROOM');

  await page.getByRole('button', { name: 'Add Aloo Patty' }).click();
  await page.getByRole('button', { name: /1 item · ₹34 View order/ }).click();
  await expect(page.getByRole('region', { name: 'Where it goes' })).toContainText(
    'Served at your table, Window 2',
  );

  // Pay goes straight on: no "deliver to?" check for a table.
  await page.getByRole('button', { name: /Pay ₹34 by UPI/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(placed).toMatchObject({ channel: 'TABLE', lines: [{ menuId: 'menu-1', quantity: 1 }] });
  expect(placed).toHaveProperty('tableId', 'table-1');
  expect(placed).not.toHaveProperty('roomId');

  // Its progress: ready and coming to the table, then served there.
  await expect(page.getByText('Ready, coming to your table').first()).toBeVisible();
  await expect(page.getByText('Served at Window 2')).toBeVisible();
  await expect(page.getByText('At table Window 2')).toBeVisible();
});

test("a table QR says why when the restaurant doesn't take orders at the table", async ({
  page,
}) => {
  await page.route('**/qr/tables/table-2', (route) =>
    route.fulfill({
      contentType: 'application/json',
      json: {
        message: 'Cafe Max does not take orders at the table. Please order at the counter.',
        success: false,
      },
      status: 400,
    }),
  );

  await page.goto('order/table/table-2');
  // Next's route announcer is an alert too.
  await expect(
    page.getByRole('alert').filter({ hasText: 'This QR code is not working' }),
  ).toContainText('Cafe Max does not take orders at the table. Please order at the counter.');
});
