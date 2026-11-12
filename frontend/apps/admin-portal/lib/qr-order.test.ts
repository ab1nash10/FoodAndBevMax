import { describe, expect, it } from 'vitest';
import type { QrOrderView } from '@aahar/api-client';
import { isSettled, progressSteps, returnUrlFor } from './qr-order';

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
      { label: 'Delivered to Room 412', state: 'todo' },
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
});
