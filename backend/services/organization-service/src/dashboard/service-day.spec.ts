import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import {
  channelMix,
  channelOf,
  compareDay,
  counterRows,
  istDay,
  istHour,
  itemSummary,
  salesByHour,
  totalsOf,
  whereServed,
  type DayBill,
} from './service-day';

const bill = (patch: Partial<DayBill>): DayBill => ({
  at: new Date('2026-11-22T07:00:00Z'), // 12:30 IST
  channel: 'COUNTER',
  counterId: 'c-1',
  grandTotal: 100,
  kiosk: false,
  qr: false,
  shiftId: 's-1',
  ...patch,
});

test('a bill is counted in the channel it was ordered through', () => {
  assert.equal(channelOf(bill({})), 'COUNTER');
  assert.equal(channelOf(bill({ channel: 'ROOM', qr: true })), 'ROOM');
  assert.equal(channelOf(bill({ channel: 'TABLE', qr: true })), 'TABLE');
  assert.equal(channelOf(bill({ qr: true })), 'QR');
  assert.equal(channelOf(bill({ kiosk: true })), 'KIOSK');
});

test('hours and days are India time', () => {
  assert.equal(istHour(new Date('2026-11-22T07:00:00Z')), 12);
  assert.equal(istHour(new Date('2026-11-22T19:00:00Z')), 0);
  assert.equal(istDay(new Date('2026-11-22T19:00:00Z')), '2026-11-23');
  assert.equal(istDay(new Date('2026-11-22T18:00:00Z')), '2026-11-22');
});

test('totals: bills, sales, average bill and room orders', () => {
  assert.deepEqual(
    totalsOf([bill({ grandTotal: 120 }), bill({ channel: 'ROOM', grandTotal: 80.5 })]),
    { averageBill: 100.25, bills: 2, roomOrders: 1, sales: 200.5 },
  );
  assert.deepEqual(totalsOf([]), { averageBill: 0, bills: 0, roomOrders: 0, sales: 0 });
});

test('the day compared with: the same day last week, or yesterday', () => {
  assert.equal(compareDay('2026-11-22', 'week'), '2026-11-15');
  assert.equal(compareDay('2026-11-22', 'day'), '2026-11-21');
  assert.equal(compareDay('2026-03-01', 'day'), '2026-02-28');
});

test('sales by hour sets today beside the day it is compared with', () => {
  const hours = salesByHour(
    [bill({ grandTotal: 50 }), bill({ at: new Date('2026-11-22T07:20:00Z'), grandTotal: 25 })],
    [bill({ at: new Date('2026-11-15T03:00:00Z'), grandTotal: 40 })],
  );

  assert.equal(hours.length, 24);
  assert.deepEqual(hours[12], { bills: 2, compareBills: 0, compareSales: 0, hour: 12, sales: 75 });
  assert.deepEqual(hours[8], { bills: 0, compareBills: 1, compareSales: 40, hour: 8, sales: 0 });
});

test('the channel mix lists every channel, busiest first', () => {
  const mix = channelMix([
    bill({ kiosk: true, grandTotal: 60 }),
    bill({ grandTotal: 30 }),
    bill({ grandTotal: 20 }),
    bill({ channel: 'ROOM', grandTotal: 90 }),
  ]);

  assert.deepEqual(
    mix.map((row) => [row.key, row.bills, row.sales]),
    [
      ['COUNTER', 2, 50],
      ['KIOSK', 1, 60],
      ['ROOM', 1, 90],
      ['QR', 0, 0],
      ['TABLE', 0, 0],
    ],
  );
});

test('a kitchen ticket names its dishes and where it goes', () => {
  assert.equal(
    itemSummary([
      { name: 'Masala Dosa', quantity: 3 },
      { name: 'Samosa (2 Pcs)', quantity: 1 },
    ]),
    'Masala Dosa ×3 · Samosa (2 Pcs) ×1',
  );
  assert.equal(itemSummary('not a list'), '');
  assert.equal(
    whereServed({ bedNumber: '2', roomNumber: '412', tableName: null }),
    'Room 412, bed 2',
  );
  assert.equal(whereServed({ bedNumber: null, roomNumber: null, tableName: 'T7' }), 'Table T7');
  assert.equal(
    whereServed({
      bedNumber: null,
      counter: { counterName: 'Counter 1' },
      roomNumber: null,
      tableName: null,
    }),
    'Counter 1',
  );
});

test('counters: open shifts with their takings, then counters that billed and closed', () => {
  const rows = counterRows(
    [
      bill({ grandTotal: 100 }),
      bill({ grandTotal: 50 }),
      bill({ counterId: 'c-2', grandTotal: 70, shiftId: 's-old' }),
    ],
    [
      {
        cashier: 'Ritu S.',
        counterId: 'c-1',
        counterName: 'Counter 1',
        id: 's-1',
        openedAt: new Date('2026-11-22T02:30:00Z'),
        restaurantName: 'Cafe Max',
      },
      {
        cashier: null,
        counterId: 'c-3',
        counterName: 'Counter 3',
        id: 's-3',
        openedAt: new Date('2026-11-22T05:00:00Z'),
        restaurantName: 'Cafe Max',
      },
    ],
    new Map([['c-2', { counterName: 'Counter 2', restaurantName: 'Test Restaurant' }]]),
  );

  assert.deepEqual(
    rows.map((row) => [row.counterName, row.open, row.cashier, row.bills, row.sales]),
    [
      ['Counter 1', true, 'Ritu S.', 2, 150],
      ['Counter 3', true, null, 0, 0],
      ['Counter 2', false, null, 1, 70],
    ],
  );
});
