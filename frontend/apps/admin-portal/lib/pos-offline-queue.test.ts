import { ApiClientError, type PosBillInput } from '@aahar/api-client';
import { beforeEach, expect, test, vi } from 'vitest';
import { discardBill, queueBill, readQueue, sendQueued } from './pos-offline-queue';

const offline = new ApiClientError(0, 'Unable to connect');
const outOfStock = new ApiClientError(422, 'Tea is out of stock.');

function bill(clientOrderId: string) {
  const payload: PosBillInput = {
    channel: 'COUNTER',
    clientOrderId,
    counterId: 'c1',
    lines: [{ menuId: 'm1', quantity: 1 }],
    paymentMode: 'CASH',
  };
  return { payload, summary: '1 × Tea', total: 20 };
}

const ids = () => readQueue('c1').map((queued) => queued.payload.clientOrderId);

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  });
});

test('still offline: nothing is sent and nothing is lost', async () => {
  queueBill(bill('a'));
  queueBill(bill('b'));
  const send = vi.fn().mockRejectedValue(offline);

  await expect(sendQueued('c1', send)).resolves.toBe(0);
  expect(send).toHaveBeenCalledTimes(1);
  expect(ids()).toEqual(['a', 'b']);
});

test('sent bills leave the queue; a refused one stays with the reason until retried', async () => {
  queueBill(bill('a'));
  queueBill(bill('b'));
  const send = vi.fn((payload: PosBillInput) =>
    payload.clientOrderId === 'a' ? Promise.reject(outOfStock) : Promise.resolve({}),
  );

  await expect(sendQueued('c1', send)).resolves.toBe(1);
  expect(readQueue('c1')).toMatchObject([
    { error: 'Tea is out of stock.', payload: { clientOrderId: 'a' } },
  ]);

  // Automatic tries leave it for the cashier; "Retry now" sends it again.
  send.mockClear();
  await sendQueued('c1', send);
  expect(send).not.toHaveBeenCalled();
  send.mockResolvedValue({});
  await expect(sendQueued('c1', send, true)).resolves.toBe(1);
  expect(ids()).toEqual([]);
});

test('a discarded bill is kept on record and never sent', async () => {
  queueBill(bill('a'));
  discardBill('c1', 'a');
  const send = vi.fn().mockResolvedValue({});

  await sendQueued('c1', send, true);
  expect(send).not.toHaveBeenCalled();
  expect(readQueue('c1')[0]?.discardedAt).toBeTruthy();
});

test('storage that refuses writes reports it, so the till keeps the bill on screen', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  });

  expect(queueBill(bill('a'))).toBe(false);
});
