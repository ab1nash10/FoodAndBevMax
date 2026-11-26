import {
  ApiClientError,
  type OnlinePayment,
  type PosBill,
  type PosCounter,
  type PosMenuItem,
  type PosShift,
} from '@aahar/api-client';
import { act, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderScreen, reply } from '@/test/harness';
import { BillingPageClient } from './billing-page';
import type * as ApiModule from '@/lib/api';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/components/location-context', () => import('@/test/location'));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
// jsdom has no canvas: the UPI QR is stood in for by a fixed picture.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  cancelOnlinePayment: vi.fn<Client['cancelOnlinePayment']>(),
  checkOnlinePayment: vi.fn<Client['checkOnlinePayment']>(),
  createPosBill: vi.fn<Client['createPosBill']>(),
  endPosShift: vi.fn<Client['endPosShift']>(),
  getCardMachine: vi.fn<Client['getCardMachine']>(),
  getPosMenu: vi.fn<Client['getPosMenu']>(),
  listPosBeds: vi.fn<Client['listPosBeds']>(),
  listOnlinePaymentProviders: vi.fn<Client['listOnlinePaymentProviders']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
  lookupPosEmployee: vi.fn<Client['lookupPosEmployee']>(),
  openPosShift: vi.fn<Client['openPosShift']>(),
  sendStaffDiscountOtp: vi.fn<Client['sendStaffDiscountOtp']>(),
  startOnlinePayment: vi.fn<Client['startOnlinePayment']>(),
  verifyStaffDiscountOtp: vi.fn<Client['verifyStaffDiscountOtp']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const shift: PosShift = {
  closedAt: null,
  closedByName: null,
  counterId: 'counter-1',
  countedCash: null,
  expectedCash: null,
  handoverStock: null,
  id: 'shift-1',
  name: null,
  note: null,
  openedAt: '2026-11-19T03:30:00.000Z',
  openedBy: 'user-1',
  openedByName: 'Asha',
  openingCash: 500,
  status: 'OPEN',
  summary: null,
  takenOverFromId: null,
};

const counter = (patch: Partial<PosCounter> = {}): PosCounter => ({
  counterCode: 'C1',
  counterName: 'Counter 1',
  hospital: {
    billPrefix: null,
    gstApplicable: true,
    hospitalCode: 'PPG',
    hospitalName: 'Patparganj',
    id: 'h-ppg',
  },
  hospitalId: 'h-ppg',
  id: 'counter-1',
  restaurant: {
    id: 'r1',
    inRoomDiningEnabled: true,
    legalName: null,
    restaurantCode: 'R1',
    restaurantName: 'Cafe Max',
    staffDiscountApplicable: true,
    upiId: null,
  },
  restaurantId: 'r1',
  shift: { dayClosed: false, elsewhere: null, handover: null, open: shift },
  ...patch,
});

const item = (patch: Partial<PosMenuItem>): PosMenuItem => ({
  availableFrom: null,
  availableTo: null,
  category: { categoryName: 'Snacks', id: 'c1', sortOrder: 1 },
  daysOfWeek: [],
  foodType: 'VEG',
  gstPercent: 5,
  id: 'm1',
  isAvailable: true,
  isDiscountable: true,
  isGstInclusive: false,
  isOnSale: true,
  itemCode: 'VS01',
  itemId: 'i1',
  itemName: 'Veg Sandwich',
  menuItemCode: 'M-VS01',
  preparationTimeMinutes: 10,
  price: 100,
  stock: null,
  ...patch,
});

const sandwich = item({});
const chai = item({
  category: { categoryName: 'Beverages', id: 'c2', sortOrder: 2 },
  id: 'm2',
  itemCode: 'CH01',
  itemName: 'Masala Chai',
  menuItemCode: 'M-CH01',
  price: 20,
  stock: 2,
});
const omelette = item({
  foodType: 'EGGETARIAN',
  id: 'm3',
  isAvailable: false,
  itemCode: 'OM01',
  itemName: 'Omelette',
  menuItemCode: 'M-OM01',
  price: 60,
});
const thali = item({
  id: 'm4',
  itemCode: 'TH01',
  itemName: 'Thali',
  menuItemCode: 'M-TH01',
  price: null,
});

const savedBill = (patch: Partial<PosBill> = {}) =>
  ({
    billNumber: 'PPG/2026/0042',
    grandTotal: 210,
    isComplimentary: false,
    orderNumber: '0042',
    paymentMode: 'CASH',
    roomNumber: null,
    ...patch,
  }) as PosBill;

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['POS_SHIFT_MANAGE']);
  api.listPosCounters.mockImplementation(() => reply([counter()]));
  api.getPosMenu.mockImplementation(() =>
    reply({ counter: counter(), items: [sandwich, chai, omelette, thali] }),
  );
  api.listPosBeds.mockImplementation(() => reply([]));
  api.listOnlinePaymentProviders.mockImplementation(() => reply([]));
  api.getCardMachine.mockImplementation(() => reply(null));
  api.createPosBill.mockImplementation(() => reply(savedBill()));
});

type User = ReturnType<typeof renderScreen>['user'];

async function openAllItems(user: User) {
  await user.click(await screen.findByRole('button', { name: 'All items (4)' }));
}

async function addTwoSandwiches(user: User) {
  await openAllItems(user);
  await user.click(screen.getByRole('button', { name: 'Add Veg Sandwich' }));
  await user.click(screen.getByRole('button', { name: 'Add Veg Sandwich' }));
}

const totalRow = (label: string | RegExp) => screen.getByText(label).parentElement;
const complete = (user: User) => user.click(screen.getByRole('button', { name: 'Complete order' }));

const paidOnline: OnlinePayment = {
  amount: 210,
  id: 'pay-1',
  paidReference: 'pay_123',
  paymentUrl: 'https://rzp.io/l/abc',
  provider: 'RAZORPAY',
  status: 'PAID',
};

/** Two sandwiches by UPI through Razorpay; the guest pays at once and the bill is sent. */
async function payOnline(user: User) {
  api.listOnlinePaymentProviders.mockImplementation(() => reply(['RAZORPAY']));
  api.startOnlinePayment.mockImplementation(() => reply({ ...paidOnline, status: 'PENDING' }));
  api.checkOnlinePayment.mockImplementation(() => reply(paidOnline));
  await addTwoSandwiches(user);
  await user.click(screen.getByRole('button', { name: 'UPI' }));
  await vi.waitFor(() => expect(api.listOnlinePaymentProviders).toHaveBeenCalled());
  await act(() => new Promise((done) => setTimeout(done, 20)));
  await complete(user);
}

const priceChanged = new ApiClientError(
  409,
  '₹210.00 was paid, but the bill now comes to ₹220.00. Put the bill back as it was, or take the difference another way.',
);

describe('the till before billing', () => {
  it('says so when the user has no access to the till’s counter', async () => {
    api.listPosCounters.mockImplementation(() => reply([]));
    renderScreen(<BillingPageClient />);

    expect(
      await screen.findByText(
        'You don’t have access to this till’s counter. Ask an admin to give you access to its location.',
      ),
    ).toBeInTheDocument();
  });

  it('shows why the till’s counters could not be read', async () => {
    api.listPosCounters.mockRejectedValue(new ApiClientError(404, 'This computer is no till.'));
    renderScreen(<BillingPageClient />);

    expect(await screen.findByText('This computer is no till.')).toBeInTheDocument();
  });

  it('asks for a shift to be opened before billing, with the cash in the till', async () => {
    api.listPosCounters.mockImplementation(() =>
      reply([counter({ shift: { dayClosed: false, handover: null, open: null } })]),
    );
    api.openPosShift.mockImplementation(() => reply(shift));
    const { user } = renderScreen(<BillingPageClient />);

    expect(await screen.findByText('Start your shift to open the till.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete order' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Cash in the till'), '500');
    await user.click(screen.getByRole('button', { name: 'Open shift' }));

    expect(api.openPosShift).toHaveBeenCalledWith('counter-1', 500);
  });
});

describe('the till menu', () => {
  it('opens on the categories, in the order set, with their counts', async () => {
    renderScreen(<BillingPageClient />);

    const tiles = within(await screen.findByRole('list', { name: 'Categories' }));
    expect(tiles.getAllByRole('button').map((tile) => tile.textContent)).toEqual([
      'All items (4)',
      'Snacks (3)',
      'Beverages (1)',
    ]);
    expect(api.getPosMenu).toHaveBeenCalledWith('counter-1', 'COUNTER');
  });

  it('says why an item cannot be added: sold out, no price, or the stock left', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await openAllItems(user);

    const tile = (name: string) => screen.getByText(name).closest('li')!;
    expect(tile('Omelette')).toHaveTextContent('Sold out');
    expect(within(tile('Omelette')).getByRole('button', { name: 'Add Omelette' })).toBeDisabled();
    expect(tile('Thali')).toHaveTextContent('No price');
    expect(within(tile('Thali')).getByRole('button', { name: 'Add Thali' })).toBeDisabled();
    expect(tile('Masala Chai')).toHaveTextContent('2 left');
  });

  it('says when the stock left is on hold for a return to the vendor', async () => {
    api.getPosMenu.mockImplementation(() =>
      reply({
        counter: counter(),
        items: [sandwich, { ...chai, held: 3, stock: 0 }, omelette, thali],
      }),
    );
    const { user } = renderScreen(<BillingPageClient />);
    await openAllItems(user);

    const tile = screen.getByText('Masala Chai').closest('li')!;
    expect(tile).toHaveTextContent('On hold for return');
    expect(within(tile).getByRole('button', { name: 'Add Masala Chai' })).toBeDisabled();
  });

  it('stops at the stock the counter has', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await openAllItems(user);

    await user.click(screen.getByRole('button', { name: 'Add Masala Chai' }));
    await user.click(screen.getByRole('button', { name: 'Add Masala Chai' }));

    const tile = screen.getByText('Masala Chai').closest('li')!;
    expect(tile).toHaveTextContent('Out of stock');
    expect(within(tile).getByRole('button', { name: 'Add Masala Chai' })).toBeDisabled();
  });

  it('hides a food type switched off', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await openAllItems(user);

    await user.click(screen.getByRole('switch', { name: 'Show Egg' }));

    expect(screen.queryByText('Omelette')).not.toBeInTheDocument();
    expect(screen.getByText('Veg Sandwich')).toBeInTheDocument();
  });

  it('adds the item whose code is typed (or scanned) and Enter', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    const search = await screen.findByPlaceholderText('Search food items or code');

    await user.type(search, 'ch01{Enter}');

    expect(search).toHaveValue('');
    expect(
      within(screen.getByRole('list', { name: 'Items on the bill' })).getByText('1 × Masala Chai'),
    ).toBeInTheDocument();
  });

  it('says when a typed code matches nothing, or an item that cannot be sold', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    const search = await screen.findByPlaceholderText('Search food items or code');

    await user.type(search, 'xyz{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches “xyz”.');

    await user.clear(search);
    await user.type(search, 'om01{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('Omelette: sold out.');
  });
});

describe('the bill', () => {
  it('adds up the items: subtotal, GST and the grand total', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    expect(
      within(screen.getByRole('list', { name: 'Items on the bill' })).getByText('2 × Veg Sandwich'),
    ).toBeInTheDocument();
    expect(totalRow('Subtotal')).toHaveTextContent('₹200.00');
    expect(totalRow('GST total (5%)')).toHaveTextContent('₹10.00');
    expect(totalRow('Grand total')).toHaveTextContent('₹210.00');
    expect(screen.getByText('Total (2 items)')).toBeInTheDocument();
  });

  it('takes a typed quantity, within what one line may hold', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await openAllItems(user);
    await user.click(screen.getByRole('button', { name: 'Add Veg Sandwich' }));

    await user.click(screen.getByRole('button', { name: 'Type how many Veg Sandwich (now 1)' }));
    const dialog = screen.getByRole('dialog', { name: 'How many Veg Sandwich?' });
    const box = within(dialog).getByLabelText('Quantity');
    await user.clear(box);
    await user.type(box, '1000');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('At most 999 at a time.');
    expect(within(dialog).getByRole('button', { name: 'Set quantity' })).toBeDisabled();

    await user.clear(box);
    await user.type(box, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Set quantity' }));

    expect(screen.getByText('5 × Veg Sandwich')).toBeInTheDocument();
    expect(totalRow('Grand total')).toHaveTextContent('₹525.00');
  });

  it('works out the change from the cash handed over', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);
    const cash = within(screen.getByRole('group', { name: 'Cash received' }));

    expect(screen.getByText('Pending').nextElementSibling).toHaveTextContent('₹210.00');
    await user.click(cash.getByRole('button', { name: '₹500' }));

    expect(screen.getByText('Received').nextElementSibling).toHaveTextContent('₹500.00');
    expect(screen.getByText('Change').nextElementSibling).toHaveTextContent('₹290.00');
  });

  it('lists what is missing instead of completing', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });

    await complete(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one item.');

    await addTwoSandwiches(user);
    await user.type(screen.getByLabelText('Customer mobile'), '12345');
    await complete(user);

    expect(screen.getByRole('alert')).toHaveTextContent('Customer mobile must be 10 digits.');
    expect(api.createPosBill).not.toHaveBeenCalled();
  });

  it('completes a cash bill with the right lines and customer, then shows its numbers', async () => {
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.click(screen.getByRole('button', { name: /2 × Veg Sandwich/ }));
    await user.type(screen.getByLabelText('Note for Veg Sandwich'), 'No onion');
    await user.type(screen.getByLabelText('Customer name'), 'Ravi');
    await user.type(screen.getByLabelText('Customer mobile'), '98765 43210');
    await complete(user);

    expect(api.createPosBill).toHaveBeenCalledWith({
      bedNumber: undefined,
      channel: 'COUNTER',
      clientOrderId: expect.any(String) as string,
      complimentaryReason: undefined,
      counterId: 'counter-1',
      customerMobile: '9876543210',
      customerName: 'Ravi',
      employeeCode: undefined,
      instructions: undefined,
      isComplimentary: false,
      lines: [{ menuId: 'm1', note: 'No onion', quantity: 2 }],
      paymentMode: 'CASH',
      paymentReference: undefined,
      roomNumber: undefined,
    });
    const done = await screen.findByRole('dialog', { name: 'Bill completed' });
    expect(done).toHaveTextContent('PPG/2026/0042');
    expect(done).toHaveTextContent('₹210.00');
    expect(done).toHaveTextContent('Paid by Cash');
    expect(done).toHaveTextContent('Order number 0042');
    // The till is ready for the next bill.
    expect(screen.getByText('No items yet. Tap ADD on the menu.')).toBeInTheDocument();
  });

  it('keeps the bill and says why when the server refuses it', async () => {
    api.createPosBill.mockRejectedValue(new ApiClientError(409, 'Veg Sandwich is out of stock.'));
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await complete(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Veg Sandwich is out of stock.');
    expect(screen.getByText('2 × Veg Sandwich')).toBeInTheDocument();
  });

  it('keeps a bill on the till when the server cannot be reached', async () => {
    api.createPosBill.mockRejectedValue(new ApiClientError(0, 'Failed to fetch'));
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await complete(user);

    expect(await screen.findByText('Bill saved, not sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 waiting to send' })).toBeInTheDocument();
    expect(screen.getByText('No items yet. Tap ADD on the menu.')).toBeInTheDocument();
    // Whose it is: only they send it, so it lands in their shift.
    expect(
      JSON.parse(window.localStorage.getItem('aahar.pos.unsent-bills.counter-1') ?? '[]'),
    ).toMatchObject([{ cashierId: 'user-1', cashierName: 'Test Admin' }]);
  });

  it('keeps the guest’s online payment when the bill is refused, and bills it on the next Complete', async () => {
    api.createPosBill.mockRejectedValueOnce(priceChanged);
    const { user } = renderScreen(<BillingPageClient />);
    await payOnline(user);

    expect(await screen.findByText(/was paid, but the bill now comes to/)).toBeInTheDocument();
    expect(screen.getByText(/already received/)).toHaveTextContent(
      '₹210.00 already received through Razorpay (pay_123). Complete order bills it; the guest does not pay again.',
    );
    await complete(user);

    expect(await screen.findByRole('dialog', { name: 'Bill completed' })).toBeInTheDocument();
    expect(api.startOnlinePayment).toHaveBeenCalledTimes(1);
    expect(api.createPosBill).toHaveBeenCalledTimes(2);
    expect(api.createPosBill).toHaveBeenLastCalledWith(
      expect.objectContaining({
        onlinePaymentId: 'pay-1',
        paymentMode: 'UPI',
        paymentReference: 'pay_123',
      }),
    );
    expect(screen.queryByText(/already received/)).not.toBeInTheDocument();
  });

  it('gives up a kept online payment only after a check, and leaves a note to refund it', async () => {
    api.createPosBill.mockRejectedValue(priceChanged);
    const { user } = renderScreen(<BillingPageClient />);
    await payOnline(user);

    await user.click(await screen.findByRole('button', { name: 'Abandon payment' }));
    const check = screen.getByRole('dialog', { name: 'Abandon the ₹210.00 payment?' });
    await user.click(within(check).getByRole('button', { name: 'Abandon payment' }));

    expect(screen.queryByText(/already received/)).not.toBeInTheDocument();
    const note = screen.getByText(/refund the guest/);
    expect(note).toHaveTextContent(
      '₹210.00 paid through Razorpay (pay_123) was not billed: refund the guest.',
    );
    await user.click(screen.getByRole('button', { name: 'Refunded' }));
    expect(screen.queryByText(/refund the guest/)).not.toBeInTheDocument();
  });

  // A reload (or a sign-out and back) must not forget the guest has paid.
  it('brings a kept online payment back after the till reloads, and bills it', async () => {
    api.createPosBill.mockRejectedValueOnce(priceChanged);
    const first = renderScreen(<BillingPageClient />);
    await payOnline(first.user);
    await screen.findByText(/already received/);
    first.unmount();

    const { user } = renderScreen(<BillingPageClient />);
    expect(await screen.findByText(/already received/)).toHaveTextContent(
      '₹210.00 already received through Razorpay (pay_123).',
    );
    await addTwoSandwiches(user);
    await complete(user);

    expect(await screen.findByRole('dialog', { name: 'Bill completed' })).toBeInTheDocument();
    expect(api.startOnlinePayment).toHaveBeenCalledTimes(1);
    expect(api.createPosBill).toHaveBeenLastCalledWith(
      expect.objectContaining({ onlinePaymentId: 'pay-1' }),
    );
    expect(window.localStorage.getItem('aahar.pos.held-payment.counter-1')).toBeNull();
  });

  it('leaves another cashier’s kept payment for them, never on this cashier’s bill', async () => {
    window.localStorage.setItem(
      'aahar.pos.held-payment.counter-1',
      JSON.stringify([{ cashierId: 'user-2', cashierName: 'Ravi', payment: paidOnline }]),
    );
    const { user } = renderScreen(<BillingPageClient />);

    expect(await screen.findByText(/waits for Ravi/)).toHaveTextContent(
      '₹210.00 received through Razorpay (pay_123) waits for Ravi to sign in on this till and bill it.',
    );
    expect(screen.queryByRole('button', { name: 'Abandon payment' })).not.toBeInTheDocument();
    await addTwoSandwiches(user);
    await complete(user);

    await vi.waitFor(() => expect(api.createPosBill).toHaveBeenCalled());
    const sent = api.createPosBill.mock.calls[0]![0];
    expect(sent.paymentMode).toBe('CASH');
    expect(sent).not.toHaveProperty('onlinePaymentId');
  });

  const staffEmployee = () =>
    api.lookupPosEmployee.mockImplementation(() =>
      reply({
        discountName: null,
        discountPercent: 10,
        employeeCode: 'E100',
        employeeName: 'Neha Sharma',
        employmentType: 'ON_ROLL',
      }),
    );

  it('applies the staff discount once the employee reads out the code sent to their mobile', async () => {
    staffEmployee();
    api.sendStaffDiscountOtp.mockImplementation(() =>
      reply({ otpId: 'otp-1', sentTo: '******3210' }),
    );
    api.verifyStaffDiscountOtp.mockImplementation(() => reply({ employeeToken: 'token-1' }));
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.type(screen.getByLabelText('Employee ID'), 'E100');

    expect(await screen.findByText('Neha Sharma')).toBeInTheDocument();
    expect(screen.getByText('Neha Sharma').parentElement).toHaveTextContent(
      'Neha Sharma · On roll · 10% staff discount',
    );
    expect(api.lookupPosEmployee).toHaveBeenCalledWith('counter-1', 'E100');
    // A typed ID alone takes nothing off.
    expect(screen.queryByText('Staff discount (10%)')).not.toBeInTheDocument();
    expect(totalRow('Grand total')).toHaveTextContent('₹210.00');

    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(api.sendStaffDiscountOtp).toHaveBeenCalledWith('counter-1', 'E100');
    expect(await screen.findByText('Code sent to ******3210.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Code from the employee'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(api.verifyStaffDiscountOtp).toHaveBeenCalledWith('counter-1', 'otp-1', '123456');
    expect(await screen.findByText('Staff discount confirmed.')).toBeInTheDocument();
    expect(totalRow('Staff discount (10%)')).toHaveTextContent('−₹20.00');
    expect(totalRow('Grand total')).toHaveTextContent('₹189.00');

    await complete(user);
    expect(api.createPosBill).toHaveBeenCalledWith(
      expect.objectContaining({ employeeCode: 'E100', employeeToken: 'token-1' }),
    );
  });

  it('will not bill a staff discount the employee has not confirmed', async () => {
    staffEmployee();
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.type(screen.getByLabelText('Employee ID'), 'E100');
    expect(await screen.findByText('Neha Sharma')).toBeInTheDocument();
    await complete(user);

    expect(
      screen.getByText(/Confirm the staff discount with the code sent to the employee’s mobile/),
    ).toBeInTheDocument();
    expect(api.createPosBill).not.toHaveBeenCalled();
  });

  it('will not bill an Employee ID that matches no one', async () => {
    api.lookupPosEmployee.mockRejectedValue(new ApiClientError(404, 'No employee E999 here.'));
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.type(screen.getByLabelText('Employee ID'), 'E999');
    expect(await screen.findByText('No employee E999 here.')).toBeInTheDocument();
    await complete(user);

    expect(screen.getByText(/The Employee ID matches no employee here/)).toBeInTheDocument();
    expect(api.createPosBill).not.toHaveBeenCalled();
  });

  it('shows the restaurant’s own UPI QR for the total, with a reference to fill in', async () => {
    api.listPosCounters.mockImplementation(() =>
      reply([counter({ restaurant: { ...counter().restaurant, upiId: 'cafemax@upi' } })]),
    );
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.click(screen.getByRole('button', { name: 'UPI' }));

    expect(await screen.findByAltText('UPI payment QR')).toBeInTheDocument();
    expect(screen.getByText(/Customer scans to pay/)).toHaveTextContent(
      'Customer scans to pay ₹210.00 to cafemax@upi.',
    );
    await user.type(screen.getByLabelText('Payment reference'), 'UTR123');
    await complete(user);
    expect(api.createPosBill).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMode: 'UPI', paymentReference: 'UTR123' }),
    );
  });

  it('takes UPI through the location’s gateway before the bill is made', async () => {
    api.listOnlinePaymentProviders.mockImplementation(() => reply(['RAZORPAY']));
    api.startOnlinePayment.mockReturnValue(new Promise(() => undefined));
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    await user.click(screen.getByRole('button', { name: 'UPI' }));
    await vi.waitFor(() => expect(api.listOnlinePaymentProviders).toHaveBeenCalled());
    await act(() => new Promise((done) => setTimeout(done, 20)));
    await complete(user);

    expect(await screen.findByRole('dialog', { name: 'Waiting for payment' })).toHaveTextContent(
      'Getting a payment QR from Razorpay…',
    );
    expect(api.startOnlinePayment).toHaveBeenCalledWith({
      channel: 'COUNTER',
      counterId: 'counter-1',
      customerMobile: undefined,
      customerName: undefined,
      employeeCode: undefined,
      lines: [{ menuId: 'm1', note: undefined, quantity: 2 }],
      provider: 'RAZORPAY',
    });
    expect(api.createPosBill).not.toHaveBeenCalled();
  });
});

describe('what the till offers by the cashier’s rights', () => {
  it('bills counter orders only, never complimentary, without those rights', async () => {
    renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });

    expect(screen.queryByRole('group', { name: 'Order type' })).not.toBeInTheDocument();
    expect(screen.queryByText('Complimentary meal')).not.toBeInTheDocument();
  });

  it('bills a room order to a bed searched from the location’s beds, priced from the room menu', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'POS_ROOM_ORDER']);
    api.listPosBeds.mockImplementation(() =>
      reply([
        { id: 'b1', roomName: 'SMT-ICU-1-6' },
        { id: 'b2', roomName: 'SMT-ICU-1-7' },
        { id: 'b3', roomName: '1635-D' },
      ]),
    );
    api.createPosBill.mockImplementation(() => reply(savedBill({ roomNumber: 'SMT-ICU-1-6' })));
    const { user } = renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });

    await user.click(screen.getByRole('button', { name: 'Room' }));
    expect(api.getPosMenu).toHaveBeenLastCalledWith('counter-1', 'ROOM');
    // Only the bed: no room number to type.
    expect(screen.queryByLabelText('Room number')).not.toBeInTheDocument();
    await addTwoSandwiches(user);
    await complete(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the bed.');

    // Any case finds it, from the beds of this counter's location.
    const bed = screen.getByRole('combobox', { name: 'Bed number' });
    await user.type(bed, 'icu-1');
    const matches = within(await screen.findByRole('listbox', { name: 'Matching beds' }));
    expect(matches.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'SMT-ICU-1-6',
      'SMT-ICU-1-7',
    ]);
    expect(api.listPosBeds).toHaveBeenCalledWith('counter-1');
    await user.click(matches.getByRole('option', { name: 'SMT-ICU-1-6' }));
    expect(bed).toHaveValue('SMT-ICU-1-6');
    await complete(user);

    expect(api.createPosBill).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'ROOM', roomNumber: 'SMT-ICU-1-6' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Bill completed' })).toHaveTextContent(
      'Paid by Cash · Bed SMT-ICU-1-6',
    );
  });

  it('bills a room order Pay later: nothing taken now, collected later from Bill history', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'POS_ROOM_ORDER']);
    api.listPosBeds.mockImplementation(() => reply([{ id: 'b3', roomName: '1635-D' }]));
    api.createPosBill.mockImplementation(() =>
      reply(savedBill({ paymentMode: 'PAY_LATER', roomNumber: '1635-D' })),
    );
    const { user } = renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });
    const modes = () => within(screen.getByRole('group', { name: 'Payment mode' }));

    // Counter orders are paid there and then: no Pay later.
    expect(modes().queryByRole('button', { name: /Pay later/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Room' }));
    await user.click(modes().getByRole('button', { name: /Pay later/ }));
    await user.type(screen.getByRole('combobox', { name: 'Bed number' }), '1635-d{Enter}');
    await addTwoSandwiches(user);
    // Nothing to tender.
    expect(screen.queryByText('RECEIVED')).not.toBeInTheDocument();
    await complete(user);

    expect(api.createPosBill).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'ROOM', paymentMode: 'PAY_LATER', roomNumber: '1635-D' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Bill completed' })).toHaveTextContent(
      'Pay later: collect it in Bill history · Bed 1635-D',
    );
  });

  it('takes a typed bed only when it is on the list: Enter picks the first match', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'POS_ROOM_ORDER']);
    api.listPosBeds.mockImplementation(() => reply([{ id: 'b3', roomName: '1635-D' }]));
    const { user } = renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });
    await user.click(screen.getByRole('button', { name: 'Room' }));
    const bed = screen.getByRole('combobox', { name: 'Bed number' });

    await user.type(bed, '9999');
    expect(await screen.findByText('No bed here matches “9999”.')).toBeInTheDocument();
    await addTwoSandwiches(user);
    await complete(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the bed.');

    await user.clear(bed);
    await user.type(bed, '1635-d{Enter}');
    expect(bed).toHaveValue('1635-D');
  });

  it('offers Room only where the restaurant has In-room dining on', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'POS_ROOM_ORDER']);
    api.listPosCounters.mockImplementation(() =>
      reply([
        counter({
          restaurant: { ...counter().restaurant, inRoomDiningEnabled: false },
        }),
      ]),
    );
    renderScreen(<BillingPageClient />);
    await screen.findByRole('list', { name: 'Categories' });

    // Room access, but this restaurant does not deliver to rooms: counter orders only.
    expect(screen.queryByRole('group', { name: 'Order type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Room' })).not.toBeInTheDocument();
    expect(api.getPosMenu).toHaveBeenLastCalledWith('counter-1', 'COUNTER');
  });

  it('makes a complimentary bill only with a reason, and with no payment', async () => {
    signedIn(['POS_SHIFT_MANAGE', 'POS_COMPLIMENTARY_APPROVE']);
    api.createPosBill.mockImplementation(() =>
      reply(savedBill({ isComplimentary: true, paymentMode: null })),
    );
    const { user } = renderScreen(<BillingPageClient />);
    await addTwoSandwiches(user);

    // The shared Toggle shows its label beside the switch without naming the switch by it.
    await user.click(
      within(screen.getByText('Complimentary meal').parentElement!).getByRole('switch'),
    );
    expect(screen.queryByRole('group', { name: 'Payment mode' })).not.toBeInTheDocument();
    await complete(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Say why the meal is complimentary.');

    await user.type(screen.getByLabelText(/Reason/), 'Duty doctor');
    await complete(user);

    expect(api.createPosBill).toHaveBeenCalledWith(
      expect.objectContaining({
        complimentaryReason: 'Duty doctor',
        isComplimentary: true,
        paymentMode: undefined,
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Bill completed' })).toHaveTextContent(
      'Complimentary',
    );
  });
});
