import {
  ApiClientError,
  type KioskMenu,
  type KioskMenuItem,
  type QrGuest,
  type QrOrderView,
} from '@aahar/api-client';
import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { KioskScreen } from './kiosk-screen';
import type * as ApiModule from '@/lib/api';
import type * as QrOrderModule from '@/lib/qr-order';

type Client = typeof ApiModule.publicOrganizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  cancelGuestOrder: vi.fn<Client['cancelGuestOrder']>(),
  createKioskPaidOrder: vi.fn<Client['createKioskPaidOrder']>(),
  getKioskMenu: vi.fn<Client['getKioskMenu']>(),
  getQrGuestDiscount: vi.fn<Client['getQrGuestDiscount']>(),
  getQrOrder: vi.fn<Client['getQrOrder']>(),
  sendQrGuestOtp: vi.fn<Client['sendQrGuestOtp']>(),
  verifyQrGuestOtp: vi.fn<Client['verifyQrGuestOtp']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  publicOrganizationApi: api,
}));
// jsdom has no canvas: the QR codes are stood in for by a fixed picture.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a plain stand-in for next/image
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
// The address phones reach this site by: asked of the server in the app.
vi.mock('@/lib/qr-order', async (importOriginal) => ({
  ...(await importOriginal<typeof QrOrderModule>()),
  fetchQrOrigin: vi.fn(() => Promise.resolve('http://10.0.0.5:3000')),
}));

const dish = (patch: Partial<KioskMenuItem>): KioskMenuItem => ({
  category: { categoryName: 'Snacks', id: 'c1', sortOrder: 1 },
  foodType: 'VEG',
  gstPercent: 5,
  id: 'm1',
  isDiscountable: true,
  isFeatured: false,
  isGstInclusive: true,
  itemName: 'Veg Sandwich',
  preparationTimeMinutes: 10,
  price: 100,
  ...patch,
});

const sandwich = dish({});
const chai = dish({
  category: { categoryName: 'Beverages', id: 'c2', sortOrder: 2 },
  id: 'm2',
  itemName: 'Masala Chai',
  price: 30,
});
const omelette = dish({ foodType: 'EGGETARIAN', id: 'm3', itemName: 'Omelette', price: 60 });

const menu = (patch: Partial<KioskMenu> = {}): KioskMenu => ({
  items: [sandwich, chai, omelette],
  locationName: 'Saket',
  open: true,
  payWith: ['UPI', 'CARD'],
  restaurantName: 'Cafe Max',
  staffDiscount: true,
  ...patch,
});

const guest: QrGuest = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  guestToken: 'guest-token',
  mobile: '9876543210',
  name: 'Asha Rao',
};

const order = (patch: Partial<QrOrderView> = {}): QrOrderView => ({
  billNumber: 'INV-9',
  channel: 'COUNTER',
  checkout: null,
  deliveredAt: null,
  grandTotal: 200,
  id: 'abcdef123456',
  key: 'key-1',
  kitchenStatus: null,
  lines: [],
  message: null,
  orderNumber: 'K-42',
  paidAt: null,
  paymentUrl: 'upi://pay?am=200',
  provider: 'RAZORPAY',
  readyAt: null,
  readyBy: null,
  restaurantName: 'Cafe Max',
  roomNumber: null,
  status: 'AWAITING_PAYMENT',
  tableName: null,
  ...patch,
});

const wakeLock = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getKioskMenu.mockImplementation(() => reply(menu()));
  api.sendQrGuestOtp.mockImplementation(() => reply({ sentTo: '******3210' }));
  api.verifyQrGuestOtp.mockImplementation(() => reply(guest));
  api.getQrGuestDiscount.mockImplementation(() => reply({ discountPercent: 0 }));
  api.createKioskPaidOrder.mockImplementation(() => reply(order()));
  api.getQrOrder.mockImplementation(() => reply(order()));
  // The kiosk keeps its screen awake; jsdom has no wake lock.
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: wakeLock },
  });
});

type User = ReturnType<typeof renderScreen>['user'];

async function pad(user: User, digits: string) {
  const keys = within(screen.getByRole('group', { name: 'Number pad' }));
  for (const digit of digits) await user.click(keys.getByRole('button', { name: digit }));
}

/** Past the welcome screen, two sandwiches in the order, and the order sheet open. */
async function toCart(user: User) {
  await user.click(await screen.findByRole('button', { name: /Tap to order/ }));
  await user.click(screen.getByRole('button', { name: /Veg Sandwich/ }));
  const sheet = screen.getByRole('dialog', { name: 'Veg Sandwich' });
  await user.click(within(sheet).getByRole('button', { name: 'One more Veg Sandwich' }));
  await user.click(within(sheet).getByRole('button', { name: /Add to order/ }));
  await user.click(screen.getByRole('button', { name: /Checkout/ }));
  return screen.getByRole('dialog', { name: 'Your order' });
}

async function signIn(user: User) {
  await user.type(screen.getByLabelText('Your name'), 'Asha Rao');
  await pad(user, '9876543210');
  await user.click(screen.getByRole('button', { name: 'Send OTP' }));
  await screen.findByLabelText('OTP sent to ******3210');
  await pad(user, '123456');
  await screen.findByText(/Mobile \*\*\*\*\*\*3210 · confirmed/);
}

describe('the kiosk before ordering', () => {
  it('sends guests to the counter when its link has no secret', () => {
    renderScreen(<KioskScreen restaurantId="r1" />);

    expect(screen.getByText(/This kiosk is not set up/)).toBeInTheDocument();
    expect(api.getKioskMenu).not.toHaveBeenCalled();
  });

  it('sends guests to the counter when the server does not know the link', async () => {
    api.getKioskMenu.mockRejectedValue(new ApiClientError(404, 'Not found'));
    renderScreen(<KioskScreen restaurantId="r1" token="old" />);

    expect(await screen.findByText(/This kiosk is not set up/)).toBeInTheDocument();
  });

  it('takes no orders while its counter is closed', async () => {
    api.getKioskMenu.mockImplementation(() => reply(menu({ open: false })));
    renderScreen(<KioskScreen restaurantId="r1" token="t" />);

    expect(
      await screen.findByText(/This kiosk is not taking orders right now/),
    ).toBeInTheDocument();
  });

  it('welcomes guests with the restaurant and keeps the screen awake', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);

    const start = await screen.findByRole('button', { name: /Tap to order/ });
    expect(start).toHaveTextContent('Cafe Max · Saket');
    expect(api.getKioskMenu).toHaveBeenCalledWith('r1', 't');
    expect(wakeLock).toHaveBeenCalledWith('screen');

    await user.click(start);
    expect(screen.getByRole('heading', { name: 'What would you like today?' })).toBeInTheDocument();
  });
});

describe('the kiosk menu', () => {
  it('shows each category, and narrows the dishes to one category or to veg', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await user.click(await screen.findByRole('button', { name: /Tap to order/ }));
    const dishes = within(screen.getByRole('region', { name: 'Dishes' }));

    expect(dishes.getAllByRole('listitem')).toHaveLength(3);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('button', {
        name: /Beverages/,
      }),
    );
    expect(dishes.getAllByRole('listitem')).toHaveLength(1);
    expect(dishes.getByText('Masala Chai')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('button', {
        name: /All/,
      }),
    );
    await user.click(dishes.getByRole('button', { name: 'Veg' }));
    expect(dishes.queryByText('Omelette')).not.toBeInTheDocument();
    expect(dishes.getAllByRole('listitem')).toHaveLength(2);
  });

  it('sorts by price, low to high and back', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await user.click(await screen.findByRole('button', { name: /Tap to order/ }));
    const names = () =>
      within(screen.getByRole('region', { name: 'Dishes' }))
        .getAllByRole('listitem')
        .map((tile) => tile.textContent);

    await user.click(screen.getByRole('button', { name: 'Sort by price, low to high' }));
    expect(names()[0]).toContain('Masala Chai');
    await user.click(screen.getByRole('button', { name: 'Sort by price, high to low' }));
    expect(names()[0]).toContain('Veg Sandwich');
  });

  it('adds a dish from its sheet and counts it on its tile and at checkout', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await user.click(await screen.findByRole('button', { name: /Tap to order/ }));

    expect(screen.getByRole('button', { name: /Checkout/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Masala Chai/ }));
    const sheet = screen.getByRole('dialog', { name: 'Masala Chai' });
    expect(sheet).toHaveTextContent('ready in about 10 min');
    await user.click(within(sheet).getByRole('button', { name: 'One more Masala Chai' }));
    await user.click(within(sheet).getByRole('button', { name: /Add to order.*₹60/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Masala Chai/ })).toHaveTextContent('2 in order');
    expect(screen.getByRole('button', { name: /Checkout/ })).toHaveTextContent('Checkout· ₹60');
    expect(screen.getByRole('button', { name: /Cart/ })).toHaveTextContent('2');
  });

  it('takes a dish off from its sheet', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await toCart(user);
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]!);

    await user.click(screen.getByRole('button', { name: /Veg Sandwich/ }));
    const sheet = screen.getByRole('dialog', { name: 'Veg Sandwich' });
    await user.click(within(sheet).getByRole('button', { name: 'One less Veg Sandwich' }));
    await user.click(within(sheet).getByRole('button', { name: 'One less Veg Sandwich' }));
    await user.click(within(sheet).getByRole('button', { name: 'Remove from order' }));

    expect(screen.getByRole('button', { name: /Checkout/ })).toBeDisabled();
  });

  it('tells the guest when a dish in the order came off the menu', async () => {
    const { queryClient, user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await toCart(user);

    api.getKioskMenu.mockImplementation(() => reply(menu({ items: [chai, omelette] })));
    await act(() => queryClient.refetchQueries({ queryKey: ['kiosk-menu'] }));

    expect(
      await screen.findByRole('button', {
        name: /Veg Sandwich is no longer available and came off your order/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Checkout/ })).toBeDisabled();
  });
});

describe('the kiosk order sheet', () => {
  it('lists the order and what to pay, GST included', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);

    expect(within(sheet).getByText('Veg Sandwich')).toBeInTheDocument();
    expect(within(sheet).getByText('₹100 each')).toBeInTheDocument();
    expect(within(sheet).getByText('To pay').parentElement).toHaveTextContent('₹200');
    expect(sheet).toHaveTextContent('Includes GST. Pay here by UPI or card');
  });

  it('offers only the ways this kiosk takes payment', async () => {
    api.getKioskMenu.mockImplementation(() => reply(menu({ payWith: ['CARD'] })));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);

    expect(within(sheet).getByRole('button', { name: 'Pay by card' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Pay by UPI' })).not.toBeInTheDocument();
  });

  it('will not pay before the guest confirms their mobile', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      'Confirm your mobile number with the OTP to pay.',
    );
    expect(api.createKioskPaidOrder).not.toHaveBeenCalled();
  });

  it('takes the mobile on the number pad: ten digits at most, delete and clear', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await toCart(user);
    const mobile = screen.getByLabelText('Mobile number');

    await pad(user, '98765432109');
    expect(mobile).toHaveValue('9876543210');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mobile).toHaveValue('987654321');
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(mobile).toHaveValue('');
  });

  it('will not send an OTP to a number that cannot be an Indian mobile', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await toCart(user);

    await user.type(screen.getByLabelText('Your name'), 'Asha');
    await pad(user, '1234567890');

    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeDisabled();
  });

  it('confirms the guest with the OTP and brings an employee’s discount', async () => {
    api.getQrGuestDiscount.mockImplementation(() => reply({ discountPercent: 10 }));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);

    await signIn(user);

    expect(api.sendQrGuestOtp).toHaveBeenCalledWith('r1', 't', {
      mobile: '9876543210',
      name: 'Asha Rao',
    });
    expect(api.verifyQrGuestOtp).toHaveBeenCalledWith('r1', 't', {
      mobile: '9876543210',
      otp: '123456',
    });
    expect(api.getQrGuestDiscount).toHaveBeenCalledWith('r1', 't', 'guest-token');
    expect(sheet).toHaveTextContent('· 10% staff discount applied');
    expect(within(sheet).getByText('Staff discount').parentElement).toHaveTextContent('−₹19.05');
    expect(within(sheet).getByText('To pay').parentElement).toHaveTextContent('₹180');
  });

  it('shows a wrong OTP and lets the guest change the number', async () => {
    api.verifyQrGuestOtp.mockRejectedValue(new ApiClientError(400, 'The OTP is not correct.'));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    await toCart(user);

    await user.type(screen.getByLabelText('Your name'), 'Asha');
    await pad(user, '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send OTP' }));
    await screen.findByLabelText('OTP sent to ******3210');
    await pad(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('The OTP is not correct.');
    await user.click(screen.getByRole('button', { name: 'Change number' }));
    expect(screen.queryByLabelText(/OTP sent to/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeEnabled();
  });

  describe('with a clock', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets the OTP be sent again only after a minute', async () => {
      // The clock moves on its own too, so taps and the screen's own waits still work.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
      await toCart(user);
      await user.type(screen.getByLabelText('Your name'), 'Asha');
      await pad(user, '9876543210');
      await user.click(screen.getByRole('button', { name: 'Send OTP' }));

      expect(await screen.findByRole('button', { name: /Resend OTP in \d+s/ })).toBeDisabled();
      // One second at a time: each tick of the countdown sets the next.
      for (let second = 0; second < 61; second += 1) {
        await act(() => vi.advanceTimersByTimeAsync(1000));
      }
      await user.click(screen.getByRole('button', { name: 'Resend OTP' }));

      expect(api.sendQrGuestOtp).toHaveBeenCalledTimes(2);
    });

    it('asks whether anyone is still there, then starts over and forgets the order', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
      await user.click(await screen.findByRole('button', { name: /Tap to order/ }));
      await user.click(screen.getByRole('button', { name: /Masala Chai/ }));
      await user.click(screen.getByRole('button', { name: /Add to order/ }));

      await act(() => vi.advanceTimersByTimeAsync(61_000));
      const ask = screen.getByRole('alertdialog');
      expect(ask).toHaveTextContent('Still ordering?');
      expect(ask).toHaveTextContent(/The kiosk starts over in 1[3-5] seconds/);

      // Any tap means someone is there.
      await user.click(within(ask).getByRole('button', { name: /still here/ }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(76_000));
      expect(screen.getByRole('button', { name: /Tap to order/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Tap to order/ }));
      expect(screen.getByRole('button', { name: /Checkout/ })).toBeDisabled();
    });
  });
});

describe('paying at the kiosk', () => {
  it('starts a UPI payment with the order and shows its QR and amount', async () => {
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    expect(api.createKioskPaidOrder).toHaveBeenCalledWith('r1', 't', {
      clientOrderId: expect.any(String) as string,
      guestToken: 'guest-token',
      lines: [{ menuId: 'm1', quantity: 2 }],
      method: 'UPI',
    });
    expect(await screen.findByText('Scan to pay by UPI')).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
    expect(await screen.findByAltText('QR code to pay ₹200 by UPI')).toHaveAttribute(
      'src',
      'data:image/png;base64,QR',
    );
    expect(screen.getByText(/Waiting for payment · [34]:\d\d/)).toBeInTheDocument();
  });

  it('asks for the card machine when paying by card', async () => {
    api.createKioskPaidOrder.mockImplementation(() => reply(order({ paymentUrl: null })));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by card' }));

    expect(await screen.findByText('Pay on the card machine')).toBeInTheDocument();
    expect(api.createKioskPaidOrder).toHaveBeenCalledWith(
      'r1',
      't',
      expect.objectContaining({ method: 'CARD' }),
    );
  });

  it('shows why a payment could not start, back on the order sheet', async () => {
    api.createKioskPaidOrder.mockRejectedValue(new ApiClientError(409, 'The counter is closed.'));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('The counter is closed.');
  });

  it('hands over the order number, the take-away QR and the dishes once paid', async () => {
    api.getQrOrder.mockImplementation(() =>
      reply(
        order({
          kitchenStatus: 'PLACED',
          lines: [{ amount: 200, itemName: 'Veg Sandwich', quantity: 2 }],
          status: 'BILLED',
        }),
      ),
    );
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    expect(await screen.findByText('K-42')).toBeInTheDocument();
    expect(screen.getByText('Paid · ₹200 by UPI')).toBeInTheDocument();
    expect(screen.getByText('Invoice INV-9')).toBeInTheDocument();
    expect(screen.getByText('2 × Veg Sandwich')).toBeInTheDocument();
    expect(await screen.findByAltText('QR code to take your order with you')).toBeInTheDocument();
    const QRCode = (await import('qrcode')).default;
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'http://10.0.0.5:3000/fandb/order/r1?key=key-1&order=abcdef123456&token=t',
      expect.any(Object),
    );

    // Done: ready for the next guest, who is not signed in as this one.
    await user.click(screen.getByRole('button', { name: /Done · next order in \d+s/ }));
    await user.click(await screen.findByRole('button', { name: /Tap to order/ }));
    await user.click(screen.getByRole('button', { name: /Masala Chai/ }));
    await user.click(screen.getByRole('button', { name: /Add to order/ }));
    await user.click(screen.getByRole('button', { name: /Checkout/ }));
    expect(screen.getByRole('button', { name: 'Send OTP' })).toBeInTheDocument();
  });

  it('gives a payment up on Cancel and says nothing was charged', async () => {
    api.cancelGuestOrder.mockImplementation(() => reply(order({ status: 'CLOSED' })));
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);
    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    await user.click(await screen.findByRole('button', { name: 'Cancel payment' }));

    expect(api.cancelGuestOrder).toHaveBeenCalledWith('abcdef123456', 'key-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment cancelled. Nothing was charged.',
    );
    expect(screen.getByRole('dialog', { name: 'Your order' })).toBeInTheDocument();
  });

  it('says to ask for a refund when it was paid but could not be placed', async () => {
    api.getQrOrder.mockImplementation(() =>
      reply(order({ message: 'Veg Sandwich sold out.', status: 'PAID_NOT_BILLED' })),
    );
    const { user } = renderScreen(<KioskScreen restaurantId="r1" token="t" />);
    const sheet = await toCart(user);
    await signIn(user);

    await user.click(within(sheet).getByRole('button', { name: 'Pay by UPI' }));

    expect(await screen.findByText('Payment received, order not placed')).toBeInTheDocument();
    expect(
      screen.getByText('Veg Sandwich sold out. Amount: ₹200. Reference: ABCDEF12.'),
    ).toBeInTheDocument();
  });
});
