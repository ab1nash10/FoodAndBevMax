import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The kiosk: a guest gives their name and mobile and confirms it with an OTP before paying, for
 * this order only. An employee's mobile brings their staff discount by itself; after paying, a
 * QR takes the order to the guest's own phone (their proof at the counter). Then the kiosk
 * forgets them. The API is stood in for here, so no SMS is sent and nothing is billed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { height: 1100, width: 900 } });

const json = (route: Route, data: unknown) =>
  route.fulfill({
    contentType: 'application/json',
    json: { data, message: 'Success', success: true },
  });

const chai = {
  category: { categoryName: 'Beverages', id: 'c1', sortOrder: 1 },
  foodType: 'VEG',
  gstPercent: 5,
  id: 'menu-1',
  isDiscountable: true,
  isFeatured: false,
  isGstInclusive: true,
  itemName: 'Masala Chai',
  preparationTimeMinutes: 5,
  price: 30,
};

async function keypad(page: Page, digits: string) {
  const pad = page.getByRole('group', { name: 'Number pad' });
  for (const digit of digits) await pad.getByRole('button', { exact: true, name: digit }).click();
}

async function addChaiAndCheckout(page: Page) {
  await page.getByRole('button', { name: /Tap to order/ }).click();
  await page
    .getByRole('button', { name: /Masala Chai/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add to order' }).click();
  await page.getByRole('button', { name: /Checkout/ }).click();
}

test('a kiosk order needs the guest confirmed by OTP; an employee is discounted; the order goes home on their phone', async ({
  page,
}) => {
  let otpAsked: Record<string, unknown> | undefined;
  let placed: Record<string, unknown> | undefined;

  await page.route('**/kiosk/restaurant-1/menu?*', (route) =>
    json(route, {
      items: [chai],
      locationName: 'Saket',
      open: true,
      payWith: ['UPI'],
      restaurantName: 'Cafe',
      staffDiscount: true,
    }),
  );
  await page.route('**/qr/restaurant-1/guest-otp?*', (route) => {
    otpAsked = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { sentTo: '******3210' });
  });
  await page.route('**/qr/restaurant-1/guest-verify?*', (route) =>
    json(route, {
      expiresAt: '2099-01-01T00:00:00.000Z',
      guestToken: 'kiosk-guest',
      mobile: '9876543210',
      name: 'Ravi Kumar',
    }),
  );
  await page.route('**/qr/restaurant-1/guest-discount?*', (route) =>
    json(route, { discountPercent: 20 }),
  );
  await page.route('**/kiosk/restaurant-1/paid-orders?*', (route) => {
    placed = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, {
      channel: 'COUNTER',
      grandTotal: 24,
      id: 'order-1',
      key: 'k',
      paymentUrl: 'https://rzp.io/i/kiosk',
      status: 'AWAITING_PAYMENT',
    });
  });
  await page.route('**/qr/orders/order-1?*', (route) =>
    json(route, {
      billNumber: 'MAX/0042',
      channel: 'COUNTER',
      deliveredAt: null,
      grandTotal: 24,
      id: 'order-1',
      key: 'k',
      kitchenStatus: 'PLACED',
      lines: [{ amount: 24, itemName: 'Masala Chai', quantity: 1 }],
      message: null,
      orderNumber: '42',
      paidAt: '2026-11-19T05:12:00.000Z',
      paymentUrl: null,
      provider: 'RAZORPAY',
      readyAt: null,
      readyBy: null,
      restaurantName: 'Cafe',
      roomNumber: null,
      status: 'BILLED',
    }),
  );

  await page.goto('kiosk/restaurant-1?token=t');
  await addChaiAndCheckout(page);

  // Paying needs the guest confirmed first.
  await page.getByRole('button', { name: /Pay by UPI/ }).click();
  await expect(page.getByText('Confirm your mobile number with the OTP to pay.')).toBeVisible();
  expect(placed).toBeUndefined();

  // Name, the mobile on the big number pad, the OTP: its sixth digit confirms it.
  await page.getByLabel('Your name').fill('Ravi Kumar');
  await keypad(page, '9876543210');
  await expect(page.getByLabel('Mobile number')).toHaveValue('9876543210');
  await page.getByRole('button', { name: 'Send OTP' }).click();
  expect(otpAsked).toEqual({ mobile: '9876543210', name: 'Ravi Kumar' });
  await keypad(page, '123456');
  await expect(page.getByText(/Ravi Kumar\s*Mobile \*{6}3210 · confirmed/)).toBeVisible();
  // An employee's mobile: their staff discount, by itself; no Employee ID asked anywhere.
  await expect(page.getByText(/20% staff discount applied/)).toBeVisible();
  await expect(page.getByText('Staff discount', { exact: true })).toBeVisible();
  await expect(page.getByText(/Employee ID/)).toHaveCount(0);

  await page.getByRole('button', { name: /Pay by UPI/ }).click();
  expect(placed).toMatchObject({
    guestToken: 'kiosk-guest',
    lines: [{ menuId: 'menu-1', quantity: 1 }],
    method: 'UPI',
  });
  expect(placed).not.toHaveProperty('customerName');

  // Paid: the order number, and a QR that takes the order to the guest's phone.
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'QR code to take your order with you' }),
  ).toBeVisible();

  // The next guest starts afresh: nobody is signed in.
  await page.getByRole('button', { name: /Done/ }).click();
  await addChaiAndCheckout(page);
  await expect(page.getByLabel('Your name')).toHaveValue('');
  await expect(page.getByText(/· confirmed/)).toHaveCount(0);
});
