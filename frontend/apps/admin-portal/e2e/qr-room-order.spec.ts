import { expect, test, type Route } from '@playwright/test';

/**
 * Room service from a bed's QR, on a patient's phone: the bed and the restaurants that deliver
 * to it (open or closed), the menu with category tabs, the order with its bill, a last check of
 * the bed, then the order's progress and My orders. The QR API is stood in for here, so no
 * payment is opened and nothing is billed.
 */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { height: 800, width: 390 } });

const bed = 'PG-ECO-06 (EWS)';
const dish = {
  available: true,
  foodType: 'VEG',
  gstPercent: 5,
  isDiscountable: true,
  isGstInclusive: true,
  preparationTimeMinutes: 40,
  stock: null,
};
const json = (route: Route, data: unknown) =>
  route.fulfill({
    contentType: 'application/json',
    json: { data, message: 'Success', success: true },
  });

test('a bed QR orders to that bed: restaurants, menu, order, a last check, progress', async ({
  page,
}) => {
  let placed: Record<string, unknown> | undefined;

  await page.route('**/qr/rooms/room-1', (route) =>
    json(route, {
      locationAddress: 'MAX-PATPARGANJ, New Delhi, Delhi',
      locationName: 'Patparganj',
      restaurants: [
        {
          id: 'restaurant-1',
          open: true,
          opensAt: '07:00',
          readyMinutes: { max: 40, min: 25 },
          restaurantName: 'Room Service',
          token: 't',
        },
        {
          id: 'restaurant-2',
          open: false,
          opensAt: '08:30',
          readyMinutes: null,
          restaurantName: 'Juice Bar',
          token: 't2',
        },
      ],
      roomName: bed,
    }),
  );
  await page.route('**/qr/restaurant-1/menu?*', (route) =>
    json(route, {
      address: 'Max Hospital, Patparganj, New Delhi 110092',
      items: [
        {
          ...dish,
          category: { categoryName: 'Breakfast', id: 'c1', sortOrder: 1 },
          id: 'menu-1',
          itemName: 'Multigrain Sandwich',
          price: 175,
        },
        {
          ...dish,
          category: { categoryName: 'Breakfast', id: 'c1', sortOrder: 1 },
          foodType: 'EGGETARIAN',
          id: 'menu-2',
          itemName: 'Bread Omelette',
          price: 125,
        },
        {
          ...dish,
          available: false,
          category: { categoryName: 'Bakery', id: 'c2', sortOrder: 2 },
          id: 'menu-0',
          itemName: 'Saffron Thandai',
          price: 75,
        },
      ],
      locationName: 'Patparganj',
      open: true,
      pickupCounter: 'Counter1',
      restaurantName: 'Room Service',
      roomDelivery: true,
      staffDiscount: false,
    }),
  );
  let otpAsked: Record<string, unknown> | undefined;
  await page.route('**/qr/restaurant-1/guest-otp?*', (route) => {
    otpAsked = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { sentTo: '******2233' });
  });
  await page.route('**/qr/restaurant-1/guest-verify?*', (route) =>
    json(route, {
      expiresAt: '2099-01-01T00:00:00.000Z',
      guestToken: 'signed-guest',
      mobile: '9811122233',
      name: 'Meera Shah',
    }),
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
      billNumber: 'MAX/0017',
      channel: 'ROOM',
      deliveredAt: null,
      grandTotal: 175,
      id: 'order-1',
      key: 'k',
      kitchenStatus: 'PREPARING',
      lines: [{ amount: 175, itemName: 'Multigrain Sandwich', quantity: 1 }],
      message: null,
      orderNumber: '17',
      paidAt: '2026-11-19T05:12:00.000Z',
      paymentUrl: null,
      provider: 'RAZORPAY',
      readyAt: null,
      readyBy: '2026-11-19T05:52:00.000Z',
      restaurantName: 'Room Service',
      roomNumber: bed,
      status: 'BILLED',
    }),
  );

  // The bed, and the restaurants that deliver to it: open ones open, closed ones say when.
  await page.goto('order/room/room-1');
  await expect(page.getByRole('heading', { name: 'What would you like to eat?' })).toBeVisible();
  const where = page.getByRole('region', { name: 'Where your food goes' });
  await expect(where).toContainText(bed);
  await expect(where).toContainText('MAX-PATPARGANJ, New Delhi, Delhi');
  await expect(
    page.getByRole('link', { name: /Room Service.*Open now.*Ready in 25–40 min/ }),
  ).toBeVisible();
  await expect(page.getByText('Opens at 8:30 am')).toBeVisible();
  await expect(page.getByRole('link', { name: /Juice Bar/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Room Service/ }).click();

  // The menu: the bed fixed, category tabs, filter chips, dishes not available now.
  await expect(page.getByRole('heading', { level: 1, name: 'Room Service' })).toBeVisible();
  await expect(page.getByText(`To ${bed}`)).toBeVisible();
  const tabs = page.getByRole('navigation', { name: 'Categories' });
  await expect(tabs.getByRole('button', { name: 'Breakfast' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await tabs.getByRole('button', { name: 'Bakery' }).click();
  await expect(page.getByText('Not available now')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Add Saffron Thandai' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Egg', exact: true }).click();
  await expect(page.getByText('Multigrain Sandwich')).toHaveCount(0);
  await expect(page.getByText('Bread Omelette')).toBeVisible();
  await page.getByRole('button', { name: 'Egg', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search for dishes' }).fill('sandwich');
  await expect(page.getByText('Bread Omelette')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search for dishes' }).fill('');

  await page.getByRole('button', { name: 'Add Multigrain Sandwich' }).click();
  await page.getByRole('button', { name: /1 item · ₹175 View order/ }).click();

  // The order: where it goes first, then the dishes and a short bill.
  await expect(page.getByRole('heading', { name: 'Your order' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Where it goes' })).toContainText(
    `Delivering to ${bed}`,
  );
  const bill = page.getByRole('region', { name: 'Bill' });
  await expect(bill).toContainText('Item total₹166.66');
  await expect(bill).toContainText('GST (5%)₹8.34');
  await expect(bill).toContainText('CGST (2.5%)₹4.17');
  await expect(bill).toContainText('To pay₹175.00');
  await expect(page.getByLabel('Room', { exact: true })).toHaveCount(0);

  // Cooking instructions stay folded away until wanted.
  const note = page.getByLabel('Cooking instructions');
  await expect(note).toBeHidden();
  await page.getByText('Add cooking instructions').click();
  await note.fill('Less spicy');

  // A first order on this phone: name and mobile, confirmed by OTP, before paying.
  await page.getByRole('button', { name: /Pay ₹175 by UPI/ }).click();
  await expect(page.getByText('Confirm your mobile number to pay.')).toBeVisible();
  const details = page.getByRole('region', { name: 'Your details' });
  await details.getByLabel('Your name').fill('Meera Shah');
  await details.getByLabel('Mobile number').fill('9811122233');
  await details.getByRole('button', { name: 'Send OTP' }).click();
  // The sixth digit confirms it.
  await details.getByLabel('Enter the OTP sent to ******2233').fill('123456');
  await expect(details).toContainText('Meera Shah');
  await expect(details).toContainText('******2233 · confirmed');
  expect(otpAsked).toEqual({ mobile: '9811122233', name: 'Meera Shah' });

  // A last check of the bed before paying; going back changes nothing.
  await page.getByRole('button', { name: /Pay ₹175 by UPI/ }).click();
  const confirm = page.getByRole('dialog', { name: `Deliver to ${bed}?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'No, go back' }).click();
  await expect(confirm).toBeHidden();
  expect(placed).toBeUndefined();

  await page.getByRole('button', { name: /Pay ₹175 by UPI/ }).click();
  await confirm.getByRole('button', { name: 'Yes, pay ₹175' }).click();

  // Its progress: paid, being prepared, when to expect it, and what was ordered.
  await expect(page.getByRole('heading', { name: 'Order 17' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Being prepared' })).toBeVisible();
  await expect(page.getByText('Expected by 11:22 am.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Order progress' })).toContainText('Paid · 10:42 am');
  await expect(page.getByRole('region', { name: 'Your dishes' })).toContainText(
    '1 × Multigrain Sandwich',
  );
  expect(placed).toMatchObject({
    channel: 'ROOM',
    instructions: 'Less spicy',
    lines: [{ menuId: 'menu-1', quantity: 1 }],
    roomId: 'room-1',
  });
  // Who it is comes from the sign-in, not from anything typed on the order.
  expect(placed?.guestToken).toBe('signed-guest');
  expect(placed).not.toHaveProperty('customerName');
  expect(String(placed?.returnUrl)).toContain('roomId=room-1');

  // My orders: every order from this phone.
  await page.getByRole('button', { name: 'My orders' }).click();
  await expect(page.getByRole('heading', { name: 'My orders' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Room Service.*Order 17 · Being prepared/ }),
  ).toBeVisible();

  // Back on the bed's page, the order in progress comes first.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: /Your order 17.*Being prepared/ })).toBeVisible();
});
