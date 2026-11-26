import { ApiClientError, type OnlinePayment, type OnlinePaymentInput } from '@aahar/api-client';
import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { OnlinePaymentDialog } from './online-payment-dialog';
import type * as ApiModule from '@/lib/api';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// jsdom has no canvas: the payment QR is stood in for by a fixed picture.
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,QR')) },
}));
type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  cancelOnlinePayment: vi.fn<Client['cancelOnlinePayment']>(),
  checkOnlinePayment: vi.fn<Client['checkOnlinePayment']>(),
  startOnlinePayment: vi.fn<Client['startOnlinePayment']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const request = (provider: OnlinePaymentInput['provider'] = 'RAZORPAY'): OnlinePaymentInput => ({
  channel: 'COUNTER',
  counterId: 'counter-1',
  lines: [{ menuId: 'm1', quantity: 2 }],
  provider,
});

const payment = (patch: Partial<OnlinePayment> = {}): OnlinePayment => ({
  amount: 210,
  id: 'pay-1',
  paidReference: null,
  paymentUrl: 'https://rzp.io/l/abc',
  provider: 'RAZORPAY',
  status: 'PENDING',
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.startOnlinePayment.mockImplementation(() => reply(payment()));
  api.checkOnlinePayment.mockImplementation(() => reply(payment()));
});

const dialog = () => screen.getByRole('dialog', { name: 'Waiting for payment' });

describe('taking a payment online', () => {
  it('stays closed until there is a bill to pay', () => {
    renderScreen(<OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={null} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.startOnlinePayment).not.toHaveBeenCalled();
  });

  it('shows the provider’s QR and the amount while the guest pays', async () => {
    renderScreen(<OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={request()} />);

    expect(await within(dialog()).findByAltText('UPI payment QR')).toBeInTheDocument();
    expect(api.startOnlinePayment).toHaveBeenCalledWith(request());
    expect(dialog()).toHaveTextContent('₹210.00 by UPI through Razorpay');
    expect(
      within(dialog()).getByRole('link', { name: 'https://rzp.io/l/abc' }),
    ).toBeInTheDocument();
  });

  it('asks the card machine to take a card payment', async () => {
    api.startOnlinePayment.mockImplementation(() => reply(payment({ provider: 'PINELABS' })));
    renderScreen(
      <OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={request('PINELABS')} />,
    );

    expect(
      await within(dialog()).findByText(/The amount is on the card machine/),
    ).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('₹210.00 by card on the Pine Labs machine');
  });

  it('hands the paid payment back once, so the bill is made', async () => {
    const onPaid = vi.fn();
    api.checkOnlinePayment.mockImplementation(() =>
      reply(payment({ paidReference: 'pay_123', status: 'PAID' })),
    );
    renderScreen(<OnlinePaymentDialog onClose={vi.fn()} onPaid={onPaid} request={request()} />);

    expect(await within(dialog()).findByText('Paid. Completing the bill…')).toBeInTheDocument();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ paidReference: 'pay_123' }));
  });

  it('cancels a pending payment and closes', async () => {
    const onClose = vi.fn();
    api.cancelOnlinePayment.mockImplementation(() => reply(payment({ status: 'CANCELLED' })));
    const { user } = renderScreen(
      <OnlinePaymentDialog onClose={onClose} onPaid={vi.fn()} request={request()} />,
    );

    await user.click(await within(dialog()).findByRole('button', { name: 'Cancel payment' }));

    expect(api.cancelOnlinePayment).toHaveBeenCalledWith('pay-1');
    expect(onClose).toHaveBeenCalled();
  });

  // The cancel answered PAID while the last check still said PENDING: the bill must still be made.
  it('completes the bill when the guest paid just as it was cancelled', async () => {
    const onClose = vi.fn();
    const onPaid = vi.fn();
    api.cancelOnlinePayment.mockImplementation(() =>
      reply(payment({ paidReference: 'pay_9', status: 'PAID' })),
    );
    const { user } = renderScreen(
      <OnlinePaymentDialog onClose={onClose} onPaid={onPaid} request={request()} />,
    );

    await user.click(await within(dialog()).findByRole('button', { name: 'Cancel payment' }));

    expect(await within(dialog()).findByText('Paid. Completing the bill…')).toBeInTheDocument();
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ paidReference: 'pay_9' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says the provider closed a payment left unpaid', async () => {
    api.checkOnlinePayment.mockImplementation(() => reply(payment({ status: 'EXPIRED' })));
    renderScreen(<OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={request()} />);

    expect(
      await within(dialog()).findByText('Razorpay closed this payment unpaid. Take payment again.'),
    ).toBeInTheDocument();
    expect(
      within(dialog()).queryByRole('button', { name: 'Cancel payment' }),
    ).not.toBeInTheDocument();
  });

  it('stops checking once the payment is closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.checkOnlinePayment.mockImplementation(() => reply(payment({ status: 'EXPIRED' })));
      renderScreen(<OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={request()} />);
      await within(dialog()).findByText(/closed this payment unpaid/);

      await act(() => vi.advanceTimersByTimeAsync(15_000));

      expect(api.checkOnlinePayment).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('checks every 5 s for 30 s, then every 10 s, and cancels a payment unpaid after 3 minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.cancelOnlinePayment.mockImplementation(() => reply(payment({ status: 'CANCELLED' })));
      const onClose = vi.fn();
      renderScreen(<OnlinePaymentDialog onClose={onClose} onPaid={vi.fn()} request={request()} />);
      await within(dialog()).findByText(/The guest scans to pay/);
      const checks = () => api.checkOnlinePayment.mock.calls.length;

      // At once, then at 5, 10, 15, 20 and 25 s.
      await act(() => vi.advanceTimersByTimeAsync(29_000));
      expect(checks()).toBe(6);
      // At 30, 40 and 50 s.
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(checks()).toBe(9);

      await act(() => vi.advanceTimersByTimeAsync(119_000));
      expect(api.cancelOnlinePayment).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(2_000));

      expect(api.cancelOnlinePayment).toHaveBeenCalledWith('pay-1');
      expect(
        await within(dialog()).findByText(
          'Not paid within 3 minutes, so it was cancelled. Take payment again.',
        ),
      ).toBeInTheDocument();
      // The cashier sees why: the dialog stays until they close it.
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Left running, a guest paying it would be ignored, or taken for the next bill.
  it('cancels a payment that finishes starting after the dialog was closed', async () => {
    let started: (value: Awaited<ReturnType<Client['startOnlinePayment']>>) => void = () => {};
    api.startOnlinePayment.mockReturnValue(
      new Promise((resolve) => {
        started = resolve;
      }),
    );
    api.cancelOnlinePayment.mockImplementation(() => reply(payment({ status: 'CANCELLED' })));
    const onClose = vi.fn();
    const open = request();
    const { rerender, user } = renderScreen(
      <OnlinePaymentDialog onClose={onClose} onPaid={vi.fn()} request={open} />,
    );

    await user.click(within(dialog()).getAllByRole('button', { name: 'Close' })[0]!);
    expect(onClose).toHaveBeenCalled();
    rerender(<OnlinePaymentDialog onClose={onClose} onPaid={vi.fn()} request={null} />);
    await act(async () => {
      started({ data: payment(), message: 'Success', success: true });
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(api.cancelOnlinePayment).toHaveBeenCalledWith('pay-1'));
    expect(api.checkOnlinePayment).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows why the payment could not start, and tries again', async () => {
    api.startOnlinePayment.mockRejectedValueOnce(
      new ApiClientError(502, 'Razorpay is not answering.'),
    );
    const { user } = renderScreen(
      <OnlinePaymentDialog onClose={vi.fn()} onPaid={vi.fn()} request={request()} />,
    );

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Razorpay is not answering.',
    );
    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }));

    expect(api.startOnlinePayment).toHaveBeenCalledTimes(2);
    expect(await within(dialog()).findByAltText('UPI payment QR')).toBeInTheDocument();
  });
});
