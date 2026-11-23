import {
  ApiClientError,
  type AmendableBill,
  type OrderAmendment,
  type OrderReportRow,
  type PosBill,
} from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayInIndia } from '@/lib/today-in-india';
import { signedIn } from '@/test/auth';
import { page, renderScreen, reply } from '@/test/harness';
import { ppg } from '@/test/location';
import { at } from '@/test/next-navigation';
import { OrdersReportsPageClient } from './orders-reports-page';
import type * as ApiModule from '@/lib/api';
import type * as LocationModule from '@/components/location-context';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The location stand-in, with the module's own helpers (the empty list names the location).
vi.mock('@/components/location-context', async (importOriginal) => ({
  ...(await importOriginal<typeof LocationModule>()),
  ...(await import('@/test/location')),
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  amendBill: vi.fn<Client['amendBill']>(),
  findAmendableBills: vi.fn<Client['findAmendableBills']>(),
  getOrderReportBill: vi.fn<Client['getOrderReportBill']>(),
  listOrderAmendments: vi.fn<Client['listOrderAmendments']>(),
  listOrderReportOperators: vi.fn<Client['listOrderReportOperators']>(),
  listOrderReports: vi.fn<Client['listOrderReports']>(),
  listPaidNotBilled: vi.fn<Client['listPaidNotBilled']>(),
  listPosDevices: vi.fn<Client['listPosDevices']>(),
  listRestaurants: vi.fn<Client['listRestaurants']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const row = (patch: Partial<OrderReportRow> = {}): OrderReportRow => ({
  accepted: true,
  acceptedAt: '2026-11-19T05:02:00.000Z',
  bedNumber: 'B',
  billNumber: 'PPG/2026/0042',
  businessDate: '2026-11-19',
  cancelReason: null,
  cancelled: false,
  cancelledAt: null,
  channel: 'ROOM',
  complimentaryReason: null,
  counter: { counterCode: 'C1', counterName: 'Counter 1', posDeviceId: 'd1' },
  delivered: true,
  deliveredAt: '2026-11-19T05:30:00.000Z',
  deliveryMinutes: 10,
  discounted: true,
  discountTotal: 20,
  erpSent: false,
  finalStatus: 'Paid',
  grandTotal: 189,
  gstTotal: 9,
  id: 'o1',
  ihc: false,
  inRoom: true,
  isComplimentary: false,
  items: [
    { name: 'Veg Sandwich', quantity: 2 },
    { name: 'Masala Chai', quantity: 1 },
  ],
  kitchenMinutes: 15,
  online: true,
  onlineProvider: 'RAZORPAY',
  operatorName: 'Asha',
  orderMinutes: 3,
  orderNumber: '0042',
  paid: true,
  paidAt: '2026-11-19T05:01:00.000Z',
  paymentMode: 'UPI',
  paymentReference: 'pay_123',
  placedAt: '2026-11-19T05:00:00.000Z',
  posDevice: { code: 'POS-01', id: 'd1', name: 'Till 1' },
  posOrder: true,
  ready: true,
  readyAt: '2026-11-19T05:20:00.000Z',
  refunded: false,
  restaurant: { id: 'r1', restaurantName: 'Cafe Max' },
  restaurantId: 'r1',
  roomNumber: '412',
  roundOff: 0,
  stewardAssigned: true,
  stewardName: 'Ravi',
  tableName: null,
  status: 'COLLECTED',
  subtotal: 200,
  totalMinutes: 30,
  ...patch,
});

const amendable = (patch: Partial<AmendableBill> = {}): AmendableBill => ({
  ...row({ online: false, paymentMode: 'CASH', paymentReference: null }),
  refusal: null,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  at('/orders-reports');
  signedIn([]);
  api.listOrderReports.mockImplementation(() => page([row()]));
  api.listPaidNotBilled.mockImplementation(() => reply({ items: [] }));
  api.listRestaurants.mockImplementation(() =>
    page([{ id: 'r1', restaurantName: 'Cafe Max' }] as never),
  );
  api.listPosDevices.mockImplementation(() =>
    page([{ code: 'POS-01', id: 'd1', name: 'Till 1' }] as never),
  );
  api.listOrderReportOperators.mockImplementation(() =>
    reply({ items: [{ id: 'u1', name: 'Asha' }] }),
  );
  api.listOrderAmendments.mockImplementation(() => page([]));
});

const cellUnder = (header: string, tableRow: HTMLElement) => {
  const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
  return within(tableRow).getAllByRole('cell')[headers.indexOf(header)]!;
};

describe('Orders & reports', () => {
  it('lists each bill with its steps, money and payment', async () => {
    renderScreen(<OrdersReportsPageClient />);

    const bill = (await screen.findByText('PPG/2026/0042')).closest('tr')!;
    expect(cellUnder('Final status', bill)).toHaveTextContent('Paid');
    expect(cellUnder('Order', bill)).toHaveTextContent('2 x Veg Sandwich, 1 x Masala Chai');
    expect(cellUnder('POS Code', bill)).toHaveTextContent('POS-01Counter 1');
    expect(cellUnder('Room', bill)).toHaveTextContent('412 / Bed B');
    expect(cellUnder('Table', bill)).toHaveTextContent('');
    expect(cellUnder('Order time taken', bill)).toHaveTextContent(
      'Order Taken : 3 MinKitchen Taken : 15 MinDelivery Taken : 10 MinTotal Order Time : 30 Min',
    );
    expect(cellUnder('History', bill)).toHaveTextContent('Ordered at : 19 Nov, 10:30 AM');
    expect(cellUnder('Subtotal', bill)).toHaveTextContent('₹200.00');
    expect(cellUnder('Discount', bill)).toHaveTextContent('₹20.00');
    expect(cellUnder('Total', bill)).toHaveTextContent('₹189.00');
    expect(cellUnder('Mode of Payment', bill)).toHaveTextContent('UPI (Online)');
    expect(cellUnder('Transaction ID', bill)).toHaveTextContent('pay_123');
    expect(cellUnder('Steward assigned', bill)).toHaveTextContent('Ravi');
    expect(within(bill).getByRole('checkbox', { name: 'Completed' })).toBeChecked();
    expect(within(bill).getByRole('img', { name: 'Paid: yes' })).toBeInTheDocument();
    expect(within(bill).getByRole('img', { name: 'Cancelled: no' })).toBeInTheDocument();
    expect(within(bill).getByRole('img', { name: 'Sent on ERP: no' })).toBeInTheDocument();
  });

  it('names the table of a dine-in bill in its own column', async () => {
    api.listOrderReports.mockImplementation(() =>
      page([row({ channel: 'TABLE', inRoom: false, roomNumber: null, tableName: 'Window 2' })]),
    );
    renderScreen(<OrdersReportsPageClient />);

    const bill = (await screen.findByText('PPG/2026/0042')).closest('tr')!;
    expect(cellUnder('Table', bill)).toHaveTextContent('Window 2');
    expect(cellUnder('Room', bill)).toHaveTextContent('');
  });

  it('asks for today’s bills at the location by default', async () => {
    renderScreen(<OrdersReportsPageClient />);

    await screen.findByText('PPG/2026/0042');
    expect(api.listOrderReports).toHaveBeenCalledWith({
      discounted: undefined,
      from: todayInIndia(),
      hospitalId: ppg.id,
      isComplimentary: undefined,
      limit: 50,
      operatorId: undefined,
      page: 1,
      posDeviceId: undefined,
      restaurantId: undefined,
      search: '',
      to: undefined,
    });
  });

  it('filters by restaurant, device, operator and order type from the link', async () => {
    at(
      '/orders-reports',
      'from=2026-11-01&to=2026-11-18&restaurant=r1&device=d1&operator=u1&type=non-discounted',
    );
    renderScreen(<OrdersReportsPageClient />);

    await screen.findByText('PPG/2026/0042');
    expect(api.listOrderReports).toHaveBeenCalledWith(
      expect.objectContaining({
        discounted: false,
        from: '2026-11-01',
        operatorId: 'u1',
        posDeviceId: 'd1',
        restaurantId: 'r1',
        to: '2026-11-18',
      }),
    );
    expect(await screen.findByRole('option', { name: 'Till 1 (POS-01)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Restaurant')).toHaveValue('r1');
    expect(screen.getByLabelText('Order type')).toHaveValue('non-discounted');
  });

  it('shows a cancelled bill as not completed, with why', async () => {
    api.listOrderReports.mockImplementation(() =>
      page([
        row({
          cancelReason: 'Wrong item',
          cancelled: true,
          finalStatus: 'Cancelled',
          status: 'CANCELLED',
        }),
      ]),
    );
    renderScreen(<OrdersReportsPageClient />);

    const bill = (await screen.findByText('PPG/2026/0042')).closest('tr')!;
    expect(within(bill).getByRole('checkbox', { name: 'Not completed' })).not.toBeChecked();
    expect(cellUnder('Cancelled remarks', bill)).toHaveTextContent('Wrong item');
  });

  it('lists only complimentary bills on their tab, without the order type filter', async () => {
    at('/orders-reports', 'tab=complimentary');
    api.listOrderReports.mockImplementation(() =>
      page([row({ finalStatus: 'Complimentary', isComplimentary: true, paymentMode: null })]),
    );
    renderScreen(<OrdersReportsPageClient />);

    const bill = (await screen.findByText('PPG/2026/0042')).closest('tr')!;
    expect(cellUnder('Mode of Payment', bill)).toHaveTextContent('Complimentary');
    expect(api.listOrderReports).toHaveBeenCalledWith(
      expect.objectContaining({ discounted: undefined, isComplimentary: true }),
    );
    expect(screen.queryByLabelText('Order type')).not.toBeInTheDocument();
  });

  it('prints a duplicate invoice of a bill', async () => {
    api.getOrderReportBill.mockImplementation(() =>
      reply({
        billNumber: 'PPG/2026/0042',
        channel: 'ROOM',
        counter: { counterName: 'Counter 1' },
        discountTotal: 0,
        grandTotal: 189,
        gstTotal: 9,
        hospital: { state: 'Delhi' },
        isComplimentary: false,
        lines: [],
        orderNumber: '0042',
        placedAt: '2026-11-19T05:00:00.000Z',
        restaurant: { restaurantName: 'Cafe Max', upiId: null },
        roundOff: 0,
        status: 'COLLECTED',
        subtotal: 200,
      } as unknown as PosBill),
    );
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Invoice' }));

    expect(api.getOrderReportBill).toHaveBeenCalledWith('o1');
    await vi.waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    const slip = document.querySelector('iframe')!.contentDocument!.body;
    expect(slip).toHaveTextContent('Duplicate bill');
    expect(slip).toHaveTextContent('Invoice #PPG/2026/0042');
  });

  it('says why an invoice was not printed', async () => {
    api.getOrderReportBill.mockRejectedValue(new ApiClientError(404, 'Bill not found.'));
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'Invoice' }));

    expect(await screen.findByText('Invoice not printed')).toBeInTheDocument();
    expect(screen.getByText('Bill not found.')).toBeInTheDocument();
  });

  it('says when no bill matches', async () => {
    api.listOrderReports.mockImplementation(() => page([]));
    renderScreen(<OrdersReportsPageClient />);

    expect(await screen.findByText('No orders at Patparganj')).toBeInTheDocument();
  });

  it('shows why the bills could not be read', async () => {
    api.listOrderReports.mockRejectedValue(new ApiClientError(500, 'Reports are unavailable.'));
    renderScreen(<OrdersReportsPageClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Reports are unavailable.');
  });

  it('puts QR orders paid but not billed on top, to refund', async () => {
    api.listPaidNotBilled.mockImplementation(() =>
      reply({
        items: [
          {
            amount: 210,
            channel: 'ROOM',
            createdAt: '2026-11-19T05:00:00.000Z',
            id: 'q1',
            paidAt: '2026-11-19T05:01:00.000Z',
            paymentReference: 'pay_9',
            provider: 'RAZORPAY',
            reason: 'Paneer sold out',
            restaurantName: 'Cafe Max',
            roomNumber: '412',
          },
        ],
      }),
    );
    renderScreen(<OrdersReportsPageClient />);

    expect(
      await screen.findByRole('heading', { name: 'Paid, not billed: 1 QR order to refund' }),
    ).toBeInTheDocument();
    const refund = screen.getByText('Paneer sold out').closest('tr')!;
    expect(refund).toHaveTextContent('412');
    expect(refund).toHaveTextContent('₹210.00');
    expect(refund).toHaveTextContent('Razorpay · pay_9');
    expect(api.listPaidNotBilled).toHaveBeenCalledWith(ppg.id);
  });
});

describe('order amendments', () => {
  const amendment: OrderAmendment = {
    amendedAt: '2026-11-19T06:00:00.000Z',
    amendedByName: 'Admin',
    billNumber: 'PPG/2026/0042',
    fromPaymentMode: 'CASH',
    fromPaymentReference: null,
    id: 'a1',
    orderId: 'o1',
    orderNumber: '0042',
    remarks: 'Guest paid by UPI',
    toPaymentMode: 'UPI',
    toPaymentReference: 'UTR9',
    type: 'PAYMENT_MODE',
  };

  beforeEach(() => {
    at('/orders-reports', 'tab=amendments');
  });

  it('lists each amendment: the bill, what changed and who changed it', async () => {
    api.listOrderAmendments.mockImplementation(() => page([amendment]));
    renderScreen(<OrdersReportsPageClient />);

    const line = (await screen.findByText('Guest paid by UPI')).closest('tr')!;
    expect(line).toHaveTextContent('0042PPG/2026/0042Payment mode');
    expect(line).toHaveTextContent('Cash → UPI · UTR9');
    expect(line).toHaveTextContent('Admin');
    expect(screen.queryByRole('button', { name: 'New amendment' })).not.toBeInTheDocument();
  });

  it('finds a bill of the last 48 hours and changes how it was paid', async () => {
    signedIn(['ORDER_AMEND']);
    api.findAmendableBills.mockImplementation(() => reply({ items: [amendable()] }));
    api.amendBill.mockImplementation(() => reply({ id: 'a2' }));
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'New amendment' }));
    const panel = screen.getByRole('dialog', { name: 'New amendment' });
    await user.type(within(panel).getByLabelText('Order Number / Bill Number'), ' 0042 ');
    await user.click(within(panel).getByRole('button', { name: 'Find Order' }));
    const found = within(await within(panel).findByRole('list', { name: 'Bills found' }));
    expect(found.getByText('PPG/2026/0042 · Order 0042')).toBeInTheDocument();
    expect(api.findAmendableBills).toHaveBeenCalledWith('0042', ppg.id);
    await user.click(found.getByRole('button', { name: 'Amend this bill' }));

    // A cash bill is most likely being moved to UPI.
    expect(within(panel).getByLabelText(/New payment mode/)).toHaveValue('UPI');
    await user.click(within(panel).getByRole('button', { name: 'Save amendment' }));
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Enter the transaction ID for a UPI or card payment.',
    );
    await user.type(within(panel).getByLabelText(/Transaction ID/), 'UTR9');
    await user.click(within(panel).getByRole('button', { name: 'Save amendment' }));
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'Enter remarks: why the bill is amended.',
    );
    await user.type(within(panel).getByLabelText(/Remarks/), 'Guest paid by UPI');
    await user.click(within(panel).getByRole('button', { name: 'Save amendment' }));

    expect(api.amendBill).toHaveBeenCalledWith('o1', {
      paymentMode: 'UPI',
      paymentReference: 'UTR9',
      remarks: 'Guest paid by UPI',
    });
    expect(await screen.findByText('Bill amended')).toBeInTheDocument();
    expect(screen.getByText('PPG/2026/0042 is now paid by UPI.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'New amendment' })).not.toBeInTheDocument();
  });

  it('sends no reference for a move to cash', async () => {
    signedIn(['ORDER_AMEND']);
    api.findAmendableBills.mockImplementation(() =>
      reply({ items: [amendable({ paymentMode: 'UPI', paymentReference: 'UTR1' })] }),
    );
    api.amendBill.mockImplementation(() => reply({ id: 'a2' }));
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'New amendment' }));
    await user.type(screen.getByLabelText('Order Number / Bill Number'), '0042{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Amend this bill' }));
    expect(screen.getByLabelText(/New payment mode/)).toHaveValue('CASH');
    expect(screen.queryByLabelText(/Transaction ID/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Remarks/), 'Paid in cash after all');
    await user.click(screen.getByRole('button', { name: 'Save amendment' }));

    expect(api.amendBill).toHaveBeenCalledWith('o1', {
      paymentMode: 'CASH',
      paymentReference: undefined,
      remarks: 'Paid in cash after all',
    });
  });

  it('says why a bill cannot be amended, with nothing to press', async () => {
    signedIn(['ORDER_AMEND']);
    api.findAmendableBills.mockImplementation(() =>
      reply({ items: [amendable({ refusal: 'Billed more than 48 hours ago.' })] }),
    );
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'New amendment' }));
    await user.type(screen.getByLabelText('Order Number / Bill Number'), '0042{Enter}');

    expect(await screen.findByText('Billed more than 48 hours ago.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Amend this bill' })).not.toBeInTheDocument();
  });

  it('says when no recent bill has that number', async () => {
    signedIn(['ORDER_AMEND']);
    api.findAmendableBills.mockImplementation(() => reply({ items: [] }));
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'New amendment' }));
    await user.type(screen.getByLabelText('Order Number / Bill Number'), '9999{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No bill of the last 48 hours has order or bill number “9999”.',
    );
  });

  it('shows why the amendment was refused', async () => {
    signedIn(['ORDER_AMEND']);
    api.findAmendableBills.mockImplementation(() => reply({ items: [amendable()] }));
    api.amendBill.mockRejectedValue(new ApiClientError(409, 'The day is posted to the ERP.'));
    const { user } = renderScreen(<OrdersReportsPageClient />);

    await user.click(await screen.findByRole('button', { name: 'New amendment' }));
    await user.type(screen.getByLabelText('Order Number / Bill Number'), '0042{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Amend this bill' }));
    await user.type(screen.getByLabelText(/Transaction ID/), 'UTR9');
    await user.type(screen.getByLabelText(/Remarks/), 'Guest paid by UPI');
    await user.click(screen.getByRole('button', { name: 'Save amendment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The day is posted to the ERP.');
    expect(screen.getByRole('dialog', { name: 'New amendment' })).toBeInTheDocument();
  });
});
