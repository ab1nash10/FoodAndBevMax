import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QrOrderView } from '@aahar/api-client';
import {
  clockLabel,
  guestSession,
  isSettled,
  myOrders,
  orderStatus,
  progressSteps,
  readyLabel,
  rememberOrder,
  returnUrlFor,
  saveGuestSession,
  timeOf,
} from './qr-order';

const view = (patch: Partial<QrOrderView>) =>
  ({
    channel: 'ROOM',
    kitchenStatus: null,
    roomNumber: '412',
    status: 'BILLED',
    ...patch,
  }) as QrOrderView;

describe('QR order progress', () => {
  it('paid and with the kitchen: paid is done, preparing is now', () => {
    expect(progressSteps(view({ kitchenStatus: 'PLACED' }))).toEqual([
      { label: 'Paid', state: 'done' },
      { label: 'Being prepared', state: 'now' },
      { label: 'Ready', state: 'todo' },
      { label: 'Delivered to 412', state: 'todo' },
    ]);
  });

  it('picked up at the counter: ready to collect, then collected', () => {
    const pickup = view({ channel: 'COUNTER', kitchenStatus: 'READY', roomNumber: null });

    expect(progressSteps(pickup)).toEqual([
      { label: 'Paid', state: 'done' },
      { label: 'Being prepared', state: 'done' },
      { label: 'Ready to collect at the counter', state: 'now' },
      { label: 'Collected', state: 'todo' },
    ]);
  });

  it('at a dine-in table: ready, then served at the table', () => {
    const atTable = view({
      channel: 'TABLE',
      kitchenStatus: 'READY',
      roomNumber: null,
      tableName: 'T5',
    });

    expect(progressSteps(atTable)).toEqual([
      { label: 'Paid', state: 'done' },
      { label: 'Being prepared', state: 'done' },
      { label: 'Ready, coming to your table', state: 'now' },
      { label: 'Served at T5', state: 'todo' },
    ]);
    expect(orderStatus({ ...atTable, kitchenStatus: 'COLLECTED' })).toBe('Served at T5');
  });

  it('ready, then delivered', () => {
    expect(progressSteps(view({ kitchenStatus: 'READY' })).map((step) => step.state)).toEqual([
      'done',
      'done',
      'now',
      'todo',
    ]);
    expect(progressSteps(view({ kitchenStatus: 'COLLECTED' })).map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('stops checking once delivered, cancelled, closed or paid but not billed', () => {
    expect(isSettled(view({ status: 'AWAITING_PAYMENT' }))).toBe(false);
    expect(isSettled(view({ kitchenStatus: 'PREPARING' }))).toBe(false);
    expect(isSettled(view({ kitchenStatus: 'COLLECTED' }))).toBe(true);
    expect(isSettled(view({ kitchenStatus: 'CANCELLED' }))).toBe(true);
    expect(isSettled(view({ status: 'CLOSED' }))).toBe(true);
    expect(isSettled(view({ status: 'PAID_NOT_BILLED' }))).toBe(true);
  });

  it('comes back to this page with its link secret, without old order details', () => {
    expect(
      returnUrlFor(
        'https://fandb.example.in/fandb/order/r1?token=abc&order=o1&key=k&razorpay_payment_id=p',
      ),
    ).toBe('https://fandb.example.in/fandb/order/r1?token=abc');
  });

  it("keeps the room a room's QR filled in, and the way back to its restaurants", () => {
    expect(
      returnUrlFor(
        'https://h.in/order/r1?token=abc&room=PG-ECO-06+%28EWS%29&roomId=b1&order=o1&key=k',
      ),
    ).toBe('https://h.in/order/r1?token=abc&room=PG-ECO-06+%28EWS%29&roomId=b1');
  });
});

describe('times on the phone', () => {
  it("reads a restaurant's opening time the way people say it", () => {
    expect(clockLabel('07:00')).toBe('7:00 am');
    expect(clockLabel('19:30')).toBe('7:30 pm');
    expect(clockLabel('12:00')).toBe('12:00 pm');
    expect(clockLabel('00:15')).toBe('12:15 am');
  });

  it('says how long the dishes take', () => {
    expect(readyLabel({ max: 40, min: 25 })).toBe('Ready in 25–40 min');
    expect(readyLabel({ max: 40, min: 40 })).toBe('Ready in about 40 min');
  });

  it('shows a moment in India time, whatever the phone is set to', () => {
    expect(timeOf('2026-11-19T05:12:00Z')).toBe('10:42 am');
    expect(timeOf('2026-11-19T18:45:00Z')).toBe('12:15 am');
  });
});

/** The phone's storage, in memory. */
function stubStorage() {
  const saved = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (name: string) => saved.get(name) ?? null,
      removeItem: (name: string) => saved.delete(name),
      setItem: (name: string, value: string) => saved.set(name, value),
    },
  });
}

describe('the guest signed in on this phone', () => {
  beforeEach(stubStorage);

  it('stays signed in until the sign-in lapses', () => {
    const guest = {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      guestToken: 'signed',
      mobile: '9811122233',
      name: 'Meera Shah',
    };

    expect(guestSession()).toBeNull();
    saveGuestSession(guest);
    expect(guestSession()).toEqual(guest);

    saveGuestSession({ ...guest, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(guestSession()).toBeNull();

    saveGuestSession(guest);
    saveGuestSession(null);
    expect(guestSession()).toBeNull();
  });
});

describe('my orders on this phone', () => {
  beforeEach(stubStorage);

  it('keeps every order placed here, newest first, each once', () => {
    rememberOrder({ id: 'o1', key: 'k1' });
    rememberOrder({ id: 'o2', key: 'k2' });
    rememberOrder({ id: 'o1', key: 'k1' });

    expect(myOrders()).toEqual([
      { id: 'o1', key: 'k1' },
      { id: 'o2', key: 'k2' },
    ]);
  });

  it('says where each order is, in a word or two', () => {
    expect(orderStatus(view({ kitchenStatus: 'PREPARING' }))).toBe('Being prepared');
    expect(orderStatus(view({ kitchenStatus: 'COLLECTED' }))).toBe('Delivered to 412');
    expect(orderStatus(view({ kitchenStatus: 'CANCELLED' }))).toBe('Cancelled');
    expect(orderStatus(view({ status: 'AWAITING_PAYMENT' }))).toBe('Waiting for payment');
    expect(orderStatus(view({ status: 'CLOSED' }))).toBe('Not paid');
    expect(orderStatus(view({ status: 'PAID_NOT_BILLED' }))).toBe('Paid, not placed');
  });
});
