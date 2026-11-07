import { describe, expect, it } from 'vitest';
import { amendRefusal, reportFacts, type AmendableBill, type ReportSource } from './order-report';

const at = (time: string) => new Date(`2026-11-05T${time}+05:30`);

const paidCash: ReportSource = {
  acceptedAt: at('13:59:40'),
  cancelledAt: null,
  channel: 'COUNTER',
  deliveredAt: at('14:00:50'),
  discountTotal: 0,
  isComplimentary: false,
  onlinePaidAt: null,
  paymentMode: 'CASH',
  placedAt: at('13:59:30'),
  readyAt: at('14:00:10'),
  status: 'COLLECTED',
};

describe('reportFacts', () => {
  it('a delivered cash bill: paid when billed, each step done, minutes per step', () => {
    expect(reportFacts(paidCash)).toEqual({
      accepted: true,
      cancelled: false,
      delivered: true,
      deliveryMinutes: 1,
      discounted: false,
      finalStatus: 'Paid',
      ihc: false,
      inRoom: false,
      kitchenMinutes: 1,
      online: false,
      orderMinutes: 0,
      paid: true,
      paidAt: at('13:59:30'),
      ready: true,
      refunded: false,
      totalMinutes: 1,
    });
  });

  it('a bill not yet taken by the kitchen: no step after billing, no minutes', () => {
    expect(
      reportFacts({
        ...paidCash,
        acceptedAt: null,
        deliveredAt: null,
        readyAt: null,
        status: 'PLACED',
      }),
    ).toMatchObject({
      accepted: false,
      delivered: false,
      deliveryMinutes: null,
      kitchenMinutes: null,
      orderMinutes: null,
      ready: false,
      totalMinutes: null,
    });
  });

  it('an older bill past a step without its time still counts the step done', () => {
    expect(
      reportFacts({ ...paidCash, acceptedAt: null, deliveredAt: null, readyAt: null }),
    ).toMatchObject({ accepted: true, delivered: true, ready: true, totalMinutes: null });
  });

  it('a paid bill later cancelled is refunded; a complimentary one cancelled is not', () => {
    const cancelled = { ...paidCash, cancelledAt: at('15:00:00'), status: 'CANCELLED' as const };
    expect(reportFacts(cancelled)).toMatchObject({
      cancelled: true,
      finalStatus: 'Cancelled',
      paid: true,
      refunded: true,
    });
    expect(reportFacts({ ...cancelled, isComplimentary: true, paymentMode: null })).toMatchObject({
      ihc: true,
      paid: false,
      refunded: false,
    });
  });

  it('complimentary (IHC), discounted, in-room and paid online', () => {
    expect(reportFacts({ ...paidCash, isComplimentary: true, paymentMode: null })).toMatchObject({
      finalStatus: 'Complimentary',
      ihc: true,
      paid: false,
      paidAt: null,
    });
    expect(
      reportFacts({
        ...paidCash,
        channel: 'ROOM',
        discountTotal: 4.5,
        onlinePaidAt: at('13:59:55'),
        paymentMode: 'UPI',
      }),
    ).toMatchObject({ discounted: true, inRoom: true, online: true, paidAt: at('13:59:55') });
  });
});

describe('amendRefusal', () => {
  const now = at('20:00:00');
  const bill: AmendableBill = {
    erpSent: false,
    isComplimentary: false,
    onlinePaid: false,
    paymentMode: 'CASH',
    paymentReference: null,
    placedAt: at('13:59:30'),
    status: 'COLLECTED',
  };

  it('allows changing a manual payment mode within 48 hours', () => {
    expect(amendRefusal(bill, { paymentMode: 'UPI', paymentReference: '2611-9398837' }, now)).toBe(
      null,
    );
    expect(amendRefusal({ ...bill, paymentMode: 'UPI' }, { paymentMode: 'CASH' }, now)).toBe(null);
    expect(
      amendRefusal(
        bill,
        { paymentMode: 'UPI', paymentReference: 'x' },
        at('13:59:29').valueOf() + 1728e5,
      ),
    ).toBe(null);
  });

  it('refuses after 48 hours, a cancelled or complimentary bill, and a gateway-paid one', () => {
    const change = { paymentMode: 'UPI' as const, paymentReference: 'r1' };
    expect(amendRefusal(bill, change, at('13:59:31').valueOf() + 1728e5)).toBe(
      'A bill can be amended only within 48 hours of billing.',
    );
    expect(amendRefusal({ ...bill, status: 'CANCELLED' }, change, now)).toBe(
      'A cancelled bill cannot be amended.',
    );
    expect(amendRefusal({ ...bill, isComplimentary: true }, change, now)).toBe(
      'A complimentary bill has no payment mode to change.',
    );
    expect(amendRefusal({ ...bill, onlinePaid: true }, change, now)).toBe(
      'This bill was paid through the payment gateway or card machine, so its payment mode cannot be changed.',
    );
    expect(amendRefusal({ ...bill, erpSent: true }, change, now)).toBe(
      'This bill’s day has been sent to the ERP, so it can no longer be amended.',
    );
  });

  it('needs a transaction ID for UPI and card, and a change', () => {
    expect(amendRefusal(bill, { paymentMode: 'CARD', paymentReference: '  ' }, now)).toBe(
      'Enter the transaction ID for a UPI or card payment.',
    );
    expect(amendRefusal(bill, { paymentMode: 'CASH' }, now)).toBe(
      'The bill is already paid by Cash. Choose another payment mode or transaction ID.',
    );
  });
});
