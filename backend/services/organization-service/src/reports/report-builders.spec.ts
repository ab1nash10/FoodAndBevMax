import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  apcReport,
  dayItemSummaryReport,
  itemSalesReport,
  salesReport,
  taxReport,
  type Bill,
} from './report-builders';

const line = {
  category: 'Snacks',
  code: 'M1',
  discount: 0,
  gst: 5,
  gstPercent: 5,
  hsn: '996331',
  name: 'Samosa',
  qty: 2,
  rate: 50,
  taxable: 100,
  total: 105,
};
const bill = (patch: Partial<Bill>): Bill => ({
  billedBy: 'Asha',
  billNumber: 'MAX/1',
  cancelReason: null,
  cancelledAt: null,
  cancelledBy: null,
  complimentaryReason: null,
  counterCode: 'C1',
  discount: 0,
  employeeCode: null,
  employeeName: null,
  grandTotal: 105,
  gst: 5,
  isCancelled: false,
  isComplimentary: false,
  lines: [line],
  operatorCode: 'E1',
  paidVia: 'CASH',
  placedAt: new Date('2026-04-14T06:00:00Z'),
  restaurant: 'Cafe',
  room: null,
  roundOff: 0,
  source: 'POS',
  subtotal: 100,
  ...patch,
});
const bills = [
  bill({}),
  bill({ billNumber: 'MAX/2', paidVia: 'ONLINE', source: 'ROOM' }),
  bill({ billNumber: 'MAX/3', isCancelled: true }),
  bill({ billNumber: 'MAX/4', isComplimentary: true, paidVia: null }),
];

test('sales: paid bills only, each amount under how it was paid', () => {
  const { rows, totals } = salesReport(bills, false);
  assert.deepEqual(
    rows.map((row) => row.bill),
    ['MAX/1', 'MAX/2'],
  );
  assert.equal(rows[0]!.cash, 105);
  assert.equal(rows[1]!.online, 105);
  assert.equal(totals?.amount, 210);
});

test('APC: KOT counts complimentary bills, sales and the average do not', () => {
  const [row] = apcReport(bills).rows;
  assert.deepEqual(
    { apc: row!.apc, bills: row!.bills, kot: row!.kot, ncKot: row!.ncKot, net: row!.net },
    { apc: 105, bills: 2, kot: 3, ncKot: 1, net: 210 },
  );
});

test('item-wise: POS and room orders in their own columns; IHC is the complimentary ones', () => {
  const [row] = itemSalesReport(bills, false).rows;
  assert.equal(row!.POS_qty, 2);
  assert.equal(row!.ROOM_qty, 2);
  assert.equal(row!.QR_qty, 0);
  assert.equal(itemSalesReport(bills, true).rows[0]!.POS_qty, 2);
});

test('day-wise summary and tax split', () => {
  assert.equal(dayItemSummaryReport(bills, false, ['14-Apr-2026']).rows[0]!['day_14-Apr-2026'], 4);
  const [tax] = taxReport(bills).rows;
  assert.deepEqual([tax!.cgst, tax!.sgst, tax!.cgstPercent], [2.5, 2.5, 2.5]);
});
