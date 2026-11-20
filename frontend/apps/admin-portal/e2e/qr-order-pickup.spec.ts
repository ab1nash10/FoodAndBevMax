import { expect, test, type Route } from '@playwright/test';

/**
 * The restaurant's own QR is pickup at the counter only: nothing about rooms (delivery to a room
 * is from the bed's QR). The QR API is stood in for here, so no payment is opened and nothing is
 * billed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { height: 800, width: 390 } });

const item = {
  available: true,
  category: { categoryName: 'Snacks', id: 'c1' },
  foodType: 'VEG',
  gstPercent: 5,
  id: 'menu-1',
  isDiscountable: true,
  isGstInclusive: true,
  itemName: 'Aloo Patty',
  preparationTimeMinutes: null,
  stock: null,
};
const json = (route: Route, data: unknown) =>
  route.fulfill({
    contentType: 'application/json',
    json: { data, message: 'Success', success: true },
  });

test("the restaurant's QR is pickup at the counter only, with no room offered or asked", async ({
  page,
}) => {
  const menuChannels: string[] = [];
  let placed: Record<string, unknown> | undefined;

  await page.route('**/qr/restaurant-1/menu?*', (route) => {
    const channel = new URL(route.request().url()).searchParams.get('channel') ?? '';
    menuChannels.push(channel);
    return json(route, {
      address: null,
      items: [{ ...item, price: channel === 'COUNTER' ? 34 : 40 }],
      locationName: 'Saket',
      open: true,
      pickupCounter: 'Counter1',
      restaurantName: 'Cafe',
      roomDelivery: true,
      staffDiscount: false,
    });
  });
  // Signed in on this phone before, with an employee's registered mobile.
  await page.addInitScript(() =>
    localStorage.setItem(
      'aahar:qr-guest',
      JSON.stringify({
        expiresAt: '2099-01-01T00:00:00.000Z',
        guestToken: 'signed-guest',
        mobile: '9876543210',
        name: 'Asha Rao',
      }),
    ),
  );
  await page.route('**/qr/restaurant-1/guest-discount?*', (route) =>
    json(route, { discountPercent: 20 }),
  );
  await page.route('**/qr/restaurant-1/orders?*', (route) => {
    placed = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { id: 'order-1', key: 'k', paymentUrl: null, status: 'AWAITING_PAYMENT' });
  });
  await page.route('**/qr/orders/order-1?*', (route) =>
    json(route, {
      billNumber: 'MAX/0001',
      channel: 'COUNTER',
      deliveredAt: null,
      grandTotal: 34,
      id: 'order-1',
      key: 'k',
      kitchenStatus: 'READY',
      lines: [{ amount: 34, itemName: 'Aloo Patty', quantity: 1 }],
      message: null,
      orderNumber: '17',
      paidAt: '2026-11-19T05:12:00.000Z',
      paymentUrl: null,
      provider: 'RAZORPAY',
      readyAt: '2026-11-19T05:20:00.000Z',
      readyBy: null,
      restaurantName: 'Cafe',
      roomNumber: null,
      status: 'BILLED',
    }),
  );

  await page.goto('order/restaurant-1?token=t');
  await expect(page.getByText('Pick up at Counter1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deliver to my room' })).toHaveCount(0);
  await expect(page.getByText(/Delivering to|To your bed/)).toHaveCount(0);
  // The counter's menu and price, never the room's.
  await expect(page.getByText('₹34')).toBeVisible();
  expect(new Set(menuChannels)).toEqual(new Set(['COUNTER']));

  await page.getByRole('button', { name: 'Add Aloo Patty' }).click();
  await page.getByRole('button', { name: /View order/ }).click();
  await expect(page.getByLabel('Room', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Where it goes' })).toContainText(
    'Pick up at Counter1Show your order number to collect it.',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Nothing to type: the phone's sign-in, and the staff discount it brings, by themselves.
  const details = page.getByRole('region', { name: 'Your details' });
  await expect(details).toContainText('Asha Rao');
  await expect(details).toContainText('Staff discount 20% applied');
  await expect(details.getByLabel('Your name')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Bill' })).toContainText('Staff discount (20%)');

  await page.getByRole('button', { name: /Pay ₹27 by UPI/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Ready to collect at the counter' }),
  ).toBeVisible();
  await expect(page.getByText('Collect it at the counter')).toBeVisible();
  expect(placed).toMatchObject({ channel: 'COUNTER', lines: [{ menuId: 'menu-1', quantity: 1 }] });
  expect(placed?.roomId).toBeUndefined();
  expect(placed?.guestToken).toBe('signed-guest');
});
