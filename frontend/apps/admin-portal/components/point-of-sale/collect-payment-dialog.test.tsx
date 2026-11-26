import type { OnlinePayment, PosCounter } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { CollectPaymentDialog } from './collect-payment-dialog';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// jsdom has no canvas: the payment QR is stood in for by a fixed picture.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));
type Client = typeof ApiModule.organizationApi;

const api = vi.hoisted(() => ({
  cancelOnlinePayment: vi.fn<Client['cancelOnlinePayment']>(),
  checkOnlinePayment: vi.fn<Client['checkOnlinePayment']>(),
  collectPosBillPayment: vi.fn<Client['collectPosBillPayment']>(),
  getCardMachine: vi.fn<Client['getCardMachine']>(),
  listOnlinePaymentProviders: vi.fn<Client['listOnlinePaymentProviders']>(),
  listPosCounters: vi.fn<Client['listPosCounters']>(),
  startOnlinePayment: vi.fn<Client['startOnlinePayment']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const shift = { id: 'shift-9', openedAt: new Date().toISOString() };
const counter = (patch: Partial<PosCounter> = {}) =>
  ({
    counterCode: 'C1',
    counterName: 'Counter 1',
    hospitalId: 'h-ppg',
    id: 'counter-1',
    restaurant: { id: 'r1', restaurantName: 'Cafe Max', upiId: null },
    shift: { dayClosed: false, elsewhere: null, handover: null, open: shift },
    ...patch,
  }) as unknown as PosCounter;

const bill = { billNumber: 'PPG/00000042', grandTotal: 210, id: 'bill-1' };
const paid = (patch: Partial<OnlinePayment> = {}): OnlinePayment => ({
  amount: 210,
  id: 'pay-1',
  paidReference: 'pay_X',
  paymentUrl: 'https://rzp.io/l/abc',
  provider: 'RAZORPAY',
  status: 'PAID',
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.listPosCounters.mockImplementation(() => reply([counter()]));
  api.listOnlinePaymentProviders.mockImplementation(() => reply([]));
  api.getCardMachine.mockImplementation(() => reply(null));
  api.collectPosBillPayment.mockImplementation(() => reply({} as never));
});

const dialog = () => within(screen.getByRole('dialog', { name: 'Collect payment' }));

describe('collecting a Pay later bill at the till', () => {
  it('takes it in cash, into this till’s open shift', async () => {
    const onCollected = vi.fn();
    const { user } = renderScreen(
      <CollectPaymentDialog bill={bill} onClose={vi.fn()} onCollected={onCollected} />,
    );

    await user.click(await dialog().findByRole('button', { name: 'Collect ₹210.00' }));

    expect(api.collectPosBillPayment).toHaveBeenCalledWith('bill-1', {
      counterId: 'counter-1',
      paymentMode: 'CASH',
    });
    expect(onCollected).toHaveBeenCalled();
  });

  it('takes UPI through the location’s gateway, then collects with that payment', async () => {
    api.listOnlinePaymentProviders.mockImplementation(() => reply(['RAZORPAY']));
    api.startOnlinePayment.mockImplementation(() => reply(paid({ status: 'PENDING' })));
    api.checkOnlinePayment.mockImplementation(() => reply(paid()));
    const { user } = renderScreen(
      <CollectPaymentDialog bill={bill} onClose={vi.fn()} onCollected={vi.fn()} />,
    );

    await user.click(await dialog().findByRole('button', { name: 'UPI' }));
    await user.click(await dialog().findByRole('button', { name: 'Collect ₹210.00' }));

    // The bill's own total, from the server: no lines to price.
    expect(api.startOnlinePayment).toHaveBeenCalledWith({
      counterId: 'counter-1',
      orderId: 'bill-1',
      provider: 'RAZORPAY',
    });
    await vi.waitFor(() =>
      expect(api.collectPosBillPayment).toHaveBeenCalledWith('bill-1', {
        counterId: 'counter-1',
        onlinePaymentId: 'pay-1',
      }),
    );
  });

  it('takes a typed card reference where the counter has no card machine', async () => {
    const { user } = renderScreen(
      <CollectPaymentDialog bill={bill} onClose={vi.fn()} onCollected={vi.fn()} />,
    );

    await user.click(await dialog().findByRole('button', { name: 'Card' }));
    await user.type(dialog().getByLabelText('Payment reference'), 'SLIP-77');
    await user.click(dialog().getByRole('button', { name: 'Collect ₹210.00' }));

    expect(api.collectPosBillPayment).toHaveBeenCalledWith('bill-1', {
      counterId: 'counter-1',
      paymentMode: 'CARD',
      paymentReference: 'SLIP-77',
    });
  });

  it('asks for a shift first: the money counts in the open shift that collects it', async () => {
    api.listPosCounters.mockImplementation(() =>
      reply([
        counter({ shift: { dayClosed: false, elsewhere: null, handover: null, open: null } }),
      ]),
    );
    renderScreen(<CollectPaymentDialog bill={bill} onClose={vi.fn()} onCollected={vi.fn()} />);

    expect(
      await dialog().findByText('Open a shift at Counter 1 before collecting a payment.'),
    ).toBeInTheDocument();
    expect(dialog().queryByRole('button', { name: /Collect ₹/ })).not.toBeInTheDocument();
  });
});
