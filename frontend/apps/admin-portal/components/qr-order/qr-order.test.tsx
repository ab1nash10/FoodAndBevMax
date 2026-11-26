import {
  ApiClientError,
  type QrGuest,
  type QrMenu,
  type QrMenuItem,
  type QrOrderView,
} from '@aahar/api-client';
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { renderScreen, reply } from '@/test/harness';
import { QrOrder } from './qr-order';
import type * as ApiModule from '@/lib/api';

type Client = typeof ApiModule.publicOrganizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  createQrOrder: vi.fn<Client['createQrOrder']>(),
  getQrGuestDiscount: vi.fn<Client['getQrGuestDiscount']>(),
  getQrMenu: vi.fn<Client['getQrMenu']>(),
  getQrOrder: vi.fn<Client['getQrOrder']>(),
  sendQrGuestOtp: vi.fn<Client['sendQrGuestOtp']>(),
  verifyQrGuestOtp: vi.fn<Client['verifyQrGuestOtp']>(),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  publicOrganizationApi: api,
}));
// Razorpay's script never loads in a test; opening its checkout is only recorded.
vi.mock('@/lib/razorpay-checkout', () => ({
  loadRazorpay: vi.fn(() => Promise.resolve()),
  openRazorpayCheckout: vi.fn(() => Promise.resolve()),
}));

const dish = (patch: Partial<QrMenuItem>): QrMenuItem => ({
  available: true,
  category: { categoryName: 'Starters', id: 'c1', sortOrder: 1 },
  foodType: 'VEG',
  gstPercent: 5,
  id: 'm1',
  isDiscountable: true,
  isGstInclusive: false,
  itemName: 'Paneer Tikka',
  preparationTimeMinutes: 15,
  price: 100,
  stock: null,
  ...patch,
});

const paneer = dish({});
const omelette = dish({
  category: { categoryName: 'Mains', id: 'c2', sortOrder: 2 },
  foodType: 'EGGETARIAN',
  id: 'm2',
  itemName: 'Bread Omelette',
  preparationTimeMinutes: 25,
  price: 150,
});
const biryani = dish({
  available: false,
  category: { categoryName: 'Mains', id: 'c2', sortOrder: 2 },
  foodType: 'NON_VEG',
  id: 'm3',
  itemName: 'Chicken Biryani',
  price: 250,
});

const menu = (patch: Partial<QrMenu> = {}): QrMenu => ({
  address: null,
  items: [paneer, omelette, biryani],
  locationName: 'Patparganj',
  open: true,
  pickupCounter: 'Counter 1',
  restaurantName: 'Cafe Max',
  roomDelivery: true,
  staffDiscount: true,
  ...patch,
});

const guest: QrGuest = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  guestToken: 'guest-token',
  mobile: '9876543210',
  name: 'Asha Rao',
};

const view = (patch: Partial<QrOrderView> = {}): QrOrderView => ({
  billNumber: 'INV-7',
  channel: 'COUNTER',
  checkout: null,
  deliveredAt: null,
  deliveryCode: null,
  grandTotal: 210,
  id: 'order-1',
  key: 'key-1',
  kitchenStatus: 'PLACED',
  lines: [{ amount: 210, itemName: 'Paneer Tikka', quantity: 2 }],
  message: null,
  orderNumber: 'A-12',
  paidAt: '2026-11-19T05:00:00.000Z',
  paymentUrl: null,
  provider: 'RAZORPAY',
  readyAt: null,
  readyBy: null,
  restaurantName: 'Cafe Max',
  roomNumber: null,
  status: 'BILLED',
  tableName: null,
  ...patch,
});

const signInSaved = () => window.localStorage.setItem('aahar:qr-guest', JSON.stringify(guest));

beforeEach(() => {
  vi.clearAllMocks();
  api.getQrMenu.mockImplementation(() => reply(menu()));
  api.getQrGuestDiscount.mockImplementation(() => reply({ discountPercent: 0 }));
  api.getQrOrder.mockImplementation(() => reply(view()));
});

/** The menu, then two Paneer Tikka in the order and its checkout open. */
async function toCheckout(user: ReturnType<typeof renderScreen>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add Paneer Tikka' }));
  await user.click(screen.getByRole('button', { name: 'One more Paneer Tikka' }));
  await user.click(screen.getByRole('button', { name: /View order/ }));
  await screen.findByRole('heading', { name: 'Your order' });
}

const billRow = (label: string) => screen.getByText(label).parentElement;

describe('the QR menu', () => {
  it('asks for the card to be scanned again when the link has no secret', () => {
    renderScreen(<QrOrder restaurantId="r1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('This QR code is incomplete');
    expect(api.getQrMenu).not.toHaveBeenCalled();
  });

  it('shows a restaurant QR as pickup at its counter, with categories, dishes and prices', async () => {
    renderScreen(<QrOrder restaurantId="r1" token="t" />);

    expect(await screen.findByRole('heading', { name: 'Cafe Max' })).toBeInTheDocument();
    expect(screen.getByText('Pick up at Counter 1')).toBeInTheDocument();
    expect(api.getQrMenu).toHaveBeenCalledWith('r1', 't', 'COUNTER');
    const tabs = within(screen.getByRole('navigation', { name: 'Categories' }));
    expect(tabs.getByRole('button', { name: 'Starters' })).toBeInTheDocument();
    expect(tabs.getByRole('button', { name: 'Mains' })).toBeInTheDocument();
    expect(screen.getByText('₹100')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });

  it('lists a sold-out dish as not available now, with nothing to add', async () => {
    renderScreen(<QrOrder restaurantId="r1" token="t" />);

    const row = (await screen.findByText('Chicken Biryani')).closest('li')!;
    expect(within(row).getByText('Not available now')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('narrows the dishes to the food types picked and to the search', async () => {
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await screen.findByText('Paneer Tikka');

    await user.click(screen.getByRole('button', { name: 'Egg' }));
    expect(screen.getByRole('button', { name: 'Egg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bread Omelette')).toBeInTheDocument();
    expect(screen.queryByText('Paneer Tikka')).not.toBeInTheDocument();
    expect(screen.queryByText('Chicken Biryani')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Veg' }));
    expect(screen.getByText('Paneer Tikka')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search for dishes' }), 'dosa');
    expect(screen.getByText('No dish matches.')).toBeInTheDocument();
  });

  it('says when nothing is on the menu', async () => {
    api.getQrMenu.mockImplementation(() => reply(menu({ items: [] })));
    renderScreen(<QrOrder restaurantId="r1" token="t" />);

    expect(await screen.findByText('Nothing is on the menu right now.')).toBeInTheDocument();
  });

  it('takes no orders while the restaurant is closed', async () => {
    api.getQrMenu.mockImplementation(() => reply(menu({ open: false })));
    renderScreen(<QrOrder restaurantId="r1" token="t" />);

    expect(await screen.findByText('Ordering is closed right now')).toBeInTheDocument();
    expect(screen.getByText('Paneer Tikka')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
  });

  it('turns a QR the server refuses into a plain message', async () => {
    api.getQrMenu.mockRejectedValue(new ApiClientError(404, 'Restaurant not found.'));
    renderScreen(<QrOrder restaurantId="r1" token="old" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This QR code is no longer valid' +
        'Restaurant not found. Please ask the staff for a new one.',
    );
  });

  it('tells a bed it cannot order from a restaurant that does not deliver to rooms', async () => {
    api.getQrMenu.mockImplementation(() => reply(menu({ roomDelivery: false })));
    renderScreen(<QrOrder restaurantId="r1" room="Bed 12" roomId="bed-12" token="t" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cafe Max does not deliver to rooms',
    );
    expect(api.getQrMenu).toHaveBeenCalledWith('r1', 't', 'ROOM');
  });

  it('counts the order in the bar at the bottom, and stops at what is left in stock', async () => {
    api.getQrMenu.mockImplementation(() => reply(menu({ items: [{ ...paneer, stock: 2 }] })));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);

    expect(screen.queryByRole('button', { name: /View order/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Add Paneer Tikka' }));
    expect(screen.getByRole('button', { name: /View order/ })).toHaveTextContent('1 item · ₹105');
    await user.click(screen.getByRole('button', { name: 'One more Paneer Tikka' }));
    expect(screen.getByRole('button', { name: /View order/ })).toHaveTextContent('2 items · ₹210');
    expect(screen.getByRole('button', { name: 'One more Paneer Tikka' })).toBeDisabled();
  });

  it('tells the guest when a dish in their order went off the menu', async () => {
    const { queryClient, user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await user.click(await screen.findByRole('button', { name: 'Add Paneer Tikka' }));
    await user.click(screen.getByRole('button', { name: 'Add Bread Omelette' }));

    api.getQrMenu.mockImplementation(() =>
      reply(menu({ items: [{ ...paneer, available: false }, omelette] })),
    );
    await act(() => queryClient.refetchQueries({ queryKey: ['qr-menu'] }));

    // React Query tells the screen a moment after the fetch ends.
    expect(await screen.findByText('Some dishes are no longer available')).toBeInTheDocument();
    expect(screen.getByText('Paneer Tikka came off your order.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View order/ })).toHaveTextContent('1 item · ₹158');
  });
});

describe('the QR checkout', () => {
  it('shows the short bill: item total, GST split in CGST and SGST, and what to pay', async () => {
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    expect(screen.getByText('Pick up at Counter 1')).toBeInTheDocument();
    expect(screen.getByText(/Ready in about 15 min\./)).toBeInTheDocument();
    expect(billRow('Item total')).toHaveTextContent('₹200.00');
    expect(billRow('GST (5%)')).toHaveTextContent('₹10.00');
    expect(billRow('CGST (2.5%)')).toHaveTextContent('₹5.00');
    expect(billRow('SGST (2.5%)')).toHaveTextContent('₹5.00');
    expect(billRow('To pay')).toHaveTextContent('₹210.00');
    expect(screen.getByRole('button', { name: /Pay ₹210 by UPI/ })).toHaveTextContent(
      'Confirm your mobile number above first',
    );
  });

  it('will not pay before the guest confirms their mobile', async () => {
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('Confirm your mobile number to pay.');
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(api.createQrOrder).not.toHaveBeenCalled();
  });

  it('signs the guest in with name, mobile and the OTP, and keeps it on the phone', async () => {
    api.sendQrGuestOtp.mockImplementation(() => reply({ sentTo: '******3210' }));
    api.verifyQrGuestOtp.mockImplementation(() => reply(guest));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    const send = screen.getByRole('button', { name: 'Send OTP' });
    await user.type(screen.getByLabelText('Your name'), '  Asha Rao ');
    await user.type(screen.getByLabelText(/Mobile number/), '12345');
    expect(send).toBeDisabled();
    await user.clear(screen.getByLabelText(/Mobile number/));
    // Only digits go in, so a pasted "+91 98765-43210" style number still reads.
    await user.type(screen.getByLabelText(/Mobile number/), '98765-43210');
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('9876543210');
    await user.click(send);

    expect(api.sendQrGuestOtp).toHaveBeenCalledWith('r1', 't', {
      mobile: '9876543210',
      name: 'Asha Rao',
    });
    // The sixth digit confirms it by itself.
    await user.type(await screen.findByLabelText('Enter the OTP sent to ******3210'), '123456');

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Mobile ******3210 · confirmed')).toBeInTheDocument();
    expect(api.verifyQrGuestOtp).toHaveBeenCalledWith('r1', 't', {
      mobile: '9876543210',
      otp: '123456',
    });
    expect(JSON.parse(window.localStorage.getItem('aahar:qr-guest')!)).toEqual(guest);
    expect(screen.getByRole('button', { name: /Pay ₹210 by UPI/ })).toHaveTextContent(
      'Google Pay · PhonePe · Paytm · any UPI app',
    );
  });

  it('shows a wrong OTP, and stays signed out', async () => {
    api.sendQrGuestOtp.mockImplementation(() => reply({ sentTo: '******3210' }));
    api.verifyQrGuestOtp.mockRejectedValue(new ApiClientError(400, 'The OTP is not correct.'));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.type(screen.getByLabelText('Your name'), 'Asha');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210{Enter}');
    await user.type(await screen.findByLabelText(/Enter the OTP/), '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('The OTP is not correct.');
    expect(window.localStorage.getItem('aahar:qr-guest')).toBeNull();
  });

  it('shows why an OTP could not be sent', async () => {
    api.sendQrGuestOtp.mockRejectedValue(new ApiClientError(429, 'Too many OTPs. Try later.'));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.type(screen.getByLabelText('Your name'), 'Asha');
    await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many OTPs. Try later.');
    expect(screen.queryByLabelText(/Enter the OTP/)).not.toBeInTheDocument();
  });

  describe('with a clock', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets the OTP be sent again only after a minute', async () => {
      // The clock moves on its own too, so typing and the screen's own waits still work.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.sendQrGuestOtp.mockImplementation(() => reply({ sentTo: '******3210' }));
      const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
      await toCheckout(user);

      await user.type(screen.getByLabelText('Your name'), 'Asha');
      await user.type(screen.getByLabelText(/Mobile number/), '9876543210');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      expect(await screen.findByRole('button', { name: /Resend OTP in \d+s/ })).toBeDisabled();
      // One second at a time: each tick of the countdown sets the next.
      for (let second = 0; second < 61; second += 1) {
        await act(() => vi.advanceTimersByTimeAsync(1000));
      }
      const resend = screen.getByRole('button', { name: 'Resend OTP' });
      expect(resend).toBeEnabled();

      await user.click(resend);
      expect(api.sendQrGuestOtp).toHaveBeenCalledTimes(2);
    });
  });

  it('applies an employee mobile’s staff discount by itself', async () => {
    signInSaved();
    api.getQrGuestDiscount.mockImplementation(() => reply({ discountPercent: 10 }));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    expect(await screen.findByText('Staff discount 10% applied')).toBeInTheDocument();
    expect(api.getQrGuestDiscount).toHaveBeenCalledWith('r1', 't', 'guest-token');
    expect(billRow('Item total')).toHaveTextContent('₹200.00');
    expect(billRow('Staff discount (10%)')).toHaveTextContent('−₹20.00');
    expect(billRow('GST (5%)')).toHaveTextContent('₹9.00');
    expect(billRow('To pay')).toHaveTextContent('₹189.00');
  });

  it('asks a guest whose sign-in lapsed to confirm their mobile again', async () => {
    signInSaved();
    api.getQrGuestDiscount.mockRejectedValue(new ApiClientError(403, 'Sign in again.'));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    expect(await screen.findByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('aahar:qr-guest')).toBeNull();
  });

  it('places a pickup order with the right lines, then follows it', async () => {
    signInSaved();
    api.createQrOrder.mockImplementation(() => reply(view()));
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.click(screen.getByText('Add cooking instructions'));
    await user.type(screen.getByLabelText('Cooking instructions'), '  Less spicy  ');
    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));

    expect(api.createQrOrder).toHaveBeenCalledWith('r1', 't', {
      channel: 'COUNTER',
      clientOrderId: expect.any(String) as string,
      guestToken: 'guest-token',
      instructions: 'Less spicy',
      lines: [{ menuId: 'm1', quantity: 2 }],
      returnUrl: expect.any(String) as string,
      roomId: undefined,
    });
    expect(await screen.findByRole('heading', { name: 'Order A-12' })).toBeInTheDocument();
    expect(screen.getByText('Collect it at the counter')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole('listitem'),
    ).toHaveLength(4);
    expect(screen.getByText('Ready to collect at the counter')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('aahar:qr-orders')!)).toEqual([
      { id: 'order-1', key: 'key-1' },
    ]);
  });

  it('opens Razorpay over the page when the server sends a checkout', async () => {
    signInSaved();
    const checkout = {
      amount: 21_000,
      currency: 'INR',
      keyId: 'rzp_test',
      name: 'Cafe Max',
      orderId: 'rzp-order',
      prefill: {},
    };
    api.createQrOrder.mockImplementation(() =>
      reply(view({ checkout, kitchenStatus: null, status: 'AWAITING_PAYMENT' })),
    );
    api.getQrOrder.mockImplementation(() =>
      reply(view({ checkout, kitchenStatus: null, status: 'AWAITING_PAYMENT' })),
    );
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));

    expect(openRazorpayCheckout).toHaveBeenCalledWith(checkout, expect.any(Object));
    expect(await screen.findByText('Waiting for your payment')).toBeInTheDocument();
  });

  it('signs the guest out and says why when the server refuses their sign-in at Pay', async () => {
    signInSaved();
    api.createQrOrder.mockRejectedValue(
      new ApiClientError(403, 'Please confirm your mobile again.'),
    );
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));

    expect(await screen.findByText('Please confirm your mobile again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
    expect(window.localStorage.getItem('aahar:qr-guest')).toBeNull();
  });

  it('goes back to the menu once the last dish is taken off', async () => {
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await toCheckout(user);

    await user.click(screen.getByRole('button', { name: 'One less Paneer Tikka' }));
    await user.click(screen.getByRole('button', { name: 'One less Paneer Tikka' }));

    expect(await screen.findByRole('heading', { name: 'Cafe Max' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View order/ })).not.toBeInTheDocument();
  });
});

describe('a bed QR order', () => {
  it('names the bed on the menu, at checkout and in a last check before paying', async () => {
    signInSaved();
    const placed = view({ channel: 'ROOM', roomNumber: 'Bed 12' });
    api.createQrOrder.mockImplementation(() => reply(placed));
    api.getQrOrder.mockImplementation(() => reply(placed));
    const { user } = renderScreen(
      <QrOrder restaurantId="r1" room="Bed 12" roomId="bed-12" token="t" />,
    );

    expect(await screen.findByText('To Bed 12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute(
      'href',
      '/fandb/order/room/bed-12',
    );
    await toCheckout(user);
    expect(screen.getByText('Delivering to Bed 12')).toBeInTheDocument();
    expect(screen.queryByText(/Pick up at/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));
    const sheet = screen.getByRole('dialog', { name: 'Deliver to Bed 12?' });
    expect(sheet).toHaveAttribute('open');
    await user.click(within(sheet).getByRole('button', { name: 'No, go back' }));
    expect(sheet).not.toHaveAttribute('open');
    expect(api.createQrOrder).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));
    await user.click(within(sheet).getByRole('button', { name: 'Yes, pay ₹210' }));

    expect(api.createQrOrder).toHaveBeenCalledWith(
      'r1',
      't',
      expect.objectContaining({ channel: 'ROOM', roomId: 'bed-12' }),
    );
    expect(await screen.findByText('Delivered to Bed 12')).toBeInTheDocument();
  });

  it('orders to a dine-in table from the counter menu, the table named, with no delivery check', async () => {
    signInSaved();
    const placed = view({ channel: 'TABLE', tableName: 'Window 2' });
    api.createQrOrder.mockImplementation(() => reply(placed));
    api.getQrOrder.mockImplementation(() => reply(placed));
    const { user } = renderScreen(
      <QrOrder restaurantId="r1" table="Window 2" tableId="t2" token="t" />,
    );

    expect(await screen.findByText('At table Window 2')).toBeInTheDocument();
    // The counter menu and prices: a table orders what the counter sells.
    expect(api.getQrMenu).toHaveBeenCalledWith('r1', 't', 'COUNTER');
    // Its QR opens the menu itself: there is no page to go back to.
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    await toCheckout(user);
    expect(screen.getByText('Served at your table, Window 2')).toBeInTheDocument();
    expect(screen.queryByText(/Pick up at/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pay ₹210 by UPI/ }));

    expect(api.createQrOrder).toHaveBeenCalledWith(
      'r1',
      't',
      expect.objectContaining({ channel: 'TABLE', roomId: undefined, tableId: 't2' }),
    );
    expect(await screen.findByText('Served at Window 2')).toBeInTheDocument();
    expect(screen.getByText('At table Window 2')).toBeInTheDocument();
  });
});

describe('a placed QR order', () => {
  const open = () =>
    renderScreen(<QrOrder orderId="order-1" orderKey="key-1" restaurantId="r1" token="t" />);

  it('waits for the payment and can open the payment page again', async () => {
    api.getQrOrder.mockImplementation(() =>
      reply(
        view({
          kitchenStatus: null,
          paymentUrl: 'https://pay.example/1',
          status: 'AWAITING_PAYMENT',
        }),
      ),
    );
    open();

    expect(await screen.findByText('Waiting for your payment')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the payment page again' })).toHaveAttribute(
      'href',
      'https://pay.example/1',
    );
    expect(api.getQrOrder).toHaveBeenCalledWith('order-1', 'key-1');
  });

  // The server gives the payment up at 3 minutes; the page keeps checking until it says so.
  it('checks a waiting payment every 5 s for 30 s, then every 10 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getQrOrder.mockImplementation(() =>
        reply(view({ kitchenStatus: null, status: 'AWAITING_PAYMENT' })),
      );
      open();
      await screen.findByText('Waiting for your payment');
      const checks = () => api.getQrOrder.mock.calls.length;
      const first = checks();

      await act(() => vi.advanceTimersByTimeAsync(29_000));
      expect(checks() - first).toBe(5);
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(checks() - first).toBe(8);
      // Past 3 minutes, still every 10 s until the server's answer arrives.
      await act(() => vi.advanceTimersByTimeAsync(150_000));
      expect(checks() - first).toBe(23);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows why Razorpay could not open', async () => {
    const checkout = {
      amount: 21_000,
      currency: 'INR',
      keyId: 'k',
      name: 'Cafe Max',
      orderId: 'o',
      prefill: {},
    };
    api.getQrOrder.mockImplementation(() =>
      reply(view({ checkout, kitchenStatus: null, status: 'AWAITING_PAYMENT' })),
    );
    vi.mocked(openRazorpayCheckout).mockRejectedValueOnce(
      new Error('The payment window could not load.'),
    );
    const { user } = open();

    await user.click(await screen.findByRole('button', { name: 'Pay ₹210.00 by UPI' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The payment window could not load.',
    );
  });

  it('says nothing was charged when the payment page closed unpaid', async () => {
    api.getQrOrder.mockImplementation(() => reply(view({ kitchenStatus: null, status: 'CLOSED' })));
    open();

    expect(await screen.findByText('This payment was not completed')).toBeInTheDocument();
  });

  it('gives the amount and a reference when a paid order could not be placed', async () => {
    api.getQrOrder.mockImplementation(() =>
      reply(
        view({
          id: 'abcdef1234',
          kitchenStatus: null,
          message: 'The dish sold out.',
          status: 'PAID_NOT_BILLED',
        }),
      ),
    );
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The dish sold out. Amount paid: ₹210.00. Reference: abcdef12.',
    );
  });

  it('points a cancelled order to the counter for a refund, without progress steps', async () => {
    api.getQrOrder.mockImplementation(() => reply(view({ kitchenStatus: 'CANCELLED' })));
    open();

    expect(
      await screen.findByText('Please ask at the counter about your refund.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Order progress' })).not.toBeInTheDocument();
  });

  it('lists the billed dishes and the invoice', async () => {
    open();

    const dishes = await screen.findByRole('region', { name: 'Your dishes' });
    expect(dishes).toHaveTextContent('2 × Paneer Tikka₹210.00');
    expect(dishes).toHaveTextContent('Invoice INV-7');
  });

  it('shows the guest a QR and code for the steward to scan at the bed', async () => {
    api.getQrOrder.mockImplementation(() =>
      reply(
        view({
          channel: 'ROOM',
          deliveryCode: '482913',
          kitchenStatus: 'READY',
          roomNumber: 'PG-ECO-06 (EWS)',
        }),
      ),
    );
    open();

    const card = await screen.findByRole('region', { name: 'Your delivery code' });
    expect(card).toHaveTextContent('Show this when your food arrives');
    expect(
      await within(card).findByRole('img', { name: 'QR code for the steward to scan' }),
    ).toBeInTheDocument();
    expect(card).toHaveTextContent('482 913');
    const QRCode = (await import('qrcode')).default;
    expect(QRCode.toDataURL).toHaveBeenCalledWith('fandb-delivery:482913', expect.anything());
  });

  it('starts a new order, forgetting the one on this phone', async () => {
    const { user } = open();

    await user.click(await screen.findByRole('button', { name: 'Order something else' }));

    expect(await screen.findByRole('heading', { name: 'Cafe Max' })).toBeInTheDocument();
    expect(window.localStorage.getItem('aahar:qr-order:r1')).toBeNull();
  });

  it('says so when the order cannot be found', async () => {
    api.getQrOrder.mockRejectedValue(new ApiClientError(404, 'Order not found.'));
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This order could not be found' + 'Order not found.',
    );
  });
});

describe('My orders', () => {
  it('says when this phone has placed none', async () => {
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await screen.findByText('Paneer Tikka');

    await user.click(screen.getByRole('button', { name: 'My orders' }));

    expect(screen.getByText('No orders from this phone yet.')).toBeInTheDocument();
  });

  it('lists every order from this phone with where it is and its total', async () => {
    window.localStorage.setItem(
      'aahar:qr-orders',
      JSON.stringify([
        { id: 'order-1', key: 'key-1' },
        { id: 'gone', key: 'k' },
      ]),
    );
    api.getQrOrder.mockImplementation((id) =>
      id === 'gone'
        ? Promise.reject(new ApiClientError(404, 'Not found'))
        : reply(view({ kitchenStatus: 'READY' })),
    );
    const { user } = renderScreen(<QrOrder restaurantId="r1" token="t" />);
    await screen.findByText('Paneer Tikka');

    await user.click(screen.getByRole('button', { name: 'My orders' }));

    const first = await screen.findByRole('button', { name: /Cafe Max/ });
    expect(first).toHaveTextContent('Order A-12 · Ready to collect at the counter');
    expect(first).toHaveTextContent('₹210.00');
    expect(await screen.findByRole('button', { name: /Order not found/ })).toBeInTheDocument();

    await user.click(first);
    expect(await screen.findByRole('button', { name: 'Back to my orders' })).toBeInTheDocument();
  });
});
