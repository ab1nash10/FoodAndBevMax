import { expect, test, type Route } from '@playwright/test';

/**
 * The restaurant's QR is for everyone: patients and attendants have the order delivered to their
 * room, staff and visitors pick it up at the counter. The QR API is stood in for here, so no
 * payment is opened and nothing is billed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { height: 800, width: 390 } });

const item = {
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

test('staff or a visitor orders from the QR for pickup at the counter, with no room asked', async ({
  page,
}) => {
  const menuChannels: string[] = [];
  let placed: Record<string, unknown> | undefined;

  await page.route('**/qr/restaurant-1/menu?*', (route) => {
    const channel = new URL(route.request().url()).searchParams.get('channel') ?? '';
    menuChannels.push(channel);
    return json(route, {
      items: [{ ...item, price: channel === 'COUNTER' ? 34 : 40 }],
      locationName: 'Saket',
      open: true,
      pickupCounter: 'Counter1',
      restaurantName: 'Cafe',
      staffDiscount: false,
    });
  });
  await page.route('**/qr/restaurant-1/orders?*', (route) => {
    placed = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { id: 'order-1', key: 'k', paymentUrl: null, status: 'AWAITING_PAYMENT' });
  });
  await page.route('**/qr/orders/order-1?*', (route) =>
    json(route, {
      billNumber: 'MAX/0001',
      channel: 'COUNTER',
      grandTotal: 34,
      id: 'order-1',
      key: 'k',
      kitchenStatus: 'READY',
      message: null,
      orderNumber: '17',
      paymentUrl: null,
      provider: 'RAZORPAY',
      restaurantName: 'Cafe',
      roomNumber: null,
      status: 'BILLED',
    }),
  );

  await page.goto('order/restaurant-1?token=t');
  const room = page.getByRole('button', { name: 'Deliver to my room' });
  const pickup = page.getByRole('button', { name: 'Pick up at counter' });
  await expect(room).toHaveAttribute('aria-pressed', 'true');

  await pickup.click();
  await expect(pickup).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('collect it at Counter1 when it is ready')).toBeVisible();
  // The counter's price, not the room's.
  await expect(page.getByText('₹34')).toBeVisible();
  expect(menuChannels).toContain('COUNTER');

  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: /View order/ }).click();
  await expect(page.getByLabel('Room')).toHaveCount(0);
  await expect(page.getByText('Pick up at Counter1. Show your order number')).toBeVisible();

  await page.getByRole('button', { name: /Pay by UPI/ }).click();
  await expect(page.getByText('Ready to collect at the counter')).toBeVisible();
  expect(placed).toMatchObject({ channel: 'COUNTER', lines: [{ menuId: 'menu-1', quantity: 1 }] });
  expect(placed?.roomNumber).toBeUndefined();
});
