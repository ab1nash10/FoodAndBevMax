import { describe, expect, it } from 'vitest';
import type { OrderReportRow } from '@aahar/api-client';
import { historyOf, minutesLabel, orderTypeQuery, paymentLabel } from './shared';

const row = {
  acceptedAt: '2026-11-05T08:29:40.000Z',
  deliveredAt: null,
  isComplimentary: false,
  online: false,
  paidAt: '2026-11-05T08:29:30.000Z',
  paymentMode: 'CARD',
  placedAt: '2026-11-05T08:29:30.000Z',
  readyAt: '2026-11-05T08:30:10.000Z',
} as OrderReportRow;

describe('orders & reports helpers', () => {
  it('payment: the mode and whether a gateway or machine took it, or complimentary', () => {
    expect(paymentLabel(row)).toBe('Card (Manual)');
    expect(paymentLabel({ ...row, online: true, paymentMode: 'UPI' })).toBe('UPI (Online)');
    expect(paymentLabel({ ...row, isComplimentary: true, paymentMode: null })).toBe(
      'Complimentary',
    );
    expect(paymentLabel({ ...row, paymentMode: null })).toBe('–');
  });

  it('minutes: whole minutes, a dash when not known', () => {
    expect(minutesLabel(0)).toBe('0 Min');
    expect(minutesLabel(12)).toBe('12 Min');
    expect(minutesLabel(null)).toBe('–');
  });

  it('history: each step that happened, in order, in India time', () => {
    expect(historyOf(row)).toEqual([
      ['Ordered At', '05 Nov, 01:59 PM'],
      ['Paid At', '05 Nov, 01:59 PM'],
      ['Accepted At', '05 Nov, 01:59 PM'],
      ['Ready At', '05 Nov, 02:00 PM'],
    ]);
  });

  it('order type: both, discounted or not discounted', () => {
    expect(orderTypeQuery('')).toBeUndefined();
    expect(orderTypeQuery('discounted')).toBe(true);
    expect(orderTypeQuery('non-discounted')).toBe(false);
  });
});
