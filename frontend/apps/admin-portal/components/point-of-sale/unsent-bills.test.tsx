import { ApiClientError } from '@aahar/api-client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedBill } from '@/lib/pos-offline-queue';
import { renderScreen, reply } from '@/test/harness';
import { UnsentBillsButton, UnsentBillsDialog, useUnsentBills } from './unsent-bills';
import type * as ApiModule from '@/lib/api';

type Client = typeof ApiModule.organizationApi;

// The API calls the screen makes, each a typed stand-in.
const api = vi.hoisted(() => ({
  createPosBill: vi.fn<Client['createPosBill']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  organizationApi: api,
}));

const queued = (id: string, patch: Partial<QueuedBill> = {}): QueuedBill => ({
  payload: {
    channel: 'COUNTER',
    clientOrderId: id,
    counterId: 'counter-1',
    lines: [{ menuId: 'm1', quantity: 2 }],
    paymentMode: 'CASH',
  },
  queuedAt: '2026-11-19T05:00:00.000Z',
  summary: '2 × Veg Sandwich',
  total: 210,
  ...patch,
});

/** Bills this till kept, as the device stores them. */
const kept = (...bills: QueuedBill[]) =>
  window.localStorage.setItem('aahar.pos.unsent-bills.counter-1', JSON.stringify(bills));

function Till() {
  const unsent = useUnsentBills('counter-1');

  return (
    <>
      <UnsentBillsButton unsent={unsent} />
      <UnsentBillsDialog unsent={unsent} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bills kept on the till', () => {
  it('shows nothing while every bill was sent', () => {
    renderScreen(<Till />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('counts the bills waiting and the ones the server refused', () => {
    kept(queued('a'), queued('b', { error: 'Item out of stock' }));
    renderScreen(<Till />);

    expect(
      screen.getByRole('button', { name: '1 waiting to send · 1 needs attention' }),
    ).toBeInTheDocument();
  });

  it('lists them and sends them on Retry now', async () => {
    kept(queued('a'));
    api.createPosBill.mockImplementation(() => reply({} as never));
    const { user } = renderScreen(<Till />);

    await user.click(screen.getByRole('button', { name: '1 waiting to send' }));
    const dialog = screen.getByRole('dialog', { name: 'Unsent bills' });
    const bill = within(dialog).getByText('2 × Veg Sandwich').closest('li')!;
    expect(bill).toHaveTextContent('₹210.00');
    expect(bill).toHaveTextContent('Cash · Not yet sent: no bill number');
    await user.click(within(dialog).getByRole('button', { name: 'Retry now' }));

    expect(api.createPosBill).toHaveBeenCalledWith(expect.objectContaining({ clientOrderId: 'a' }));
    expect(await screen.findByText('1 saved bill sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /waiting to send/ })).not.toBeInTheDocument();
  });

  it('keeps them while the server is still out of reach', async () => {
    kept(queued('a'));
    api.createPosBill.mockRejectedValue(new ApiClientError(0, 'Failed to fetch'));
    const { user } = renderScreen(<Till />);

    await user.click(screen.getByRole('button', { name: '1 waiting to send' }));
    await user.click(screen.getByRole('button', { name: 'Retry now' }));

    expect(await screen.findByText('Not sent yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 waiting to send' })).toBeInTheDocument();
  });

  it('marks a refused bill with why, and discards it only after a check', async () => {
    kept(queued('a', { error: 'Item out of stock' }));
    const { user } = renderScreen(<Till />);

    await user.click(screen.getByRole('button', { name: '1 needs attention' }));
    const dialog = screen.getByRole('dialog', { name: 'Unsent bills' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Item out of stock');
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    const check = screen.getByRole('dialog', { name: 'Discard this ₹210.00 bill?' });
    await user.click(within(check).getByRole('button', { name: 'Discard' }));

    expect(screen.getByRole('button', { name: '1 discarded' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Discarded at/)).toBeInTheDocument();
  });
});
