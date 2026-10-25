import assert from 'node:assert/strict';
import { test } from 'vitest';
import { erpJournal, erpUnit, type ErpBill } from './erp-journal';

const bill = (patch: Partial<ErpBill>): ErpBill => ({
  billedBy: 'Deepak',
  billNumber: 'MAXBLK/00656321',
  businessDate: new Date('2025-06-15T00:00:00Z'),
  cancelReason: null,
  cancelledAt: null,
  cancelledBy: null,
  complimentaryReason: null,
  counterCode: 'C1',
  discount: 0,
  discountPercent: null,
  employeeCode: null,
  employeeName: null,
  grandTotal: 380,
  gst: 18.1,
  isCancelled: false,
  isComplimentary: false,
  lines: [
    {
      category: 'Meals',
      code: 'M1',
      discount: 0,
      gst: 18.1,
      gstPercent: 5,
      hsn: '996331',
      name: 'Thali',
      qty: 2,
      rate: 190,
      taxable: 361.9,
      total: 380,
    },
  ],
  onlineProvider: null,
  operatorCode: 'Deepak',
  paidVia: 'UPI',
  paymentReference: '3065465465465',
  placedAt: new Date('2025-06-15T03:00:00Z'),
  restaurant: 'Cafe',
  room: null,
  roundOff: 0,
  source: 'POS',
  subtotal: 361.9,
  ...patch,
});

const brief = (rows: ReturnType<typeof erpJournal>['rows']) =>
  rows.map((row) => [row.JRNAL_TYPE, row.ACCOUNT_CODE, row.DC, row.AMOUNT].join(' '));

/** Every journal of every pass balances: its debits equal its credits. */
function assertBalanced(rows: ReturnType<typeof erpJournal>['rows']) {
  const net = new Map<string, number>();
  for (const row of rows) {
    const key = `${String(row.TREFERENCE)}|${String(row.JRNAL_TYPE)}`;
    const amount = Number(row.AMOUNT) * (row.DC === 'D' ? 1 : -1);
    net.set(key, Math.round(((net.get(key) ?? 0) + amount) * 100) / 100);
  }
  for (const [key, value] of net) assert.equal(value, 0, `${key} does not balance`);
}

test('a plain UPI bill posts as the template "Normal UPI ERp" sheet', () => {
  const { columns, rows, totals } = erpJournal([bill({})], 'BLK');

  assert.equal(columns.length, 69);
  assert.equal(totals, null);
  assert.deepEqual(brief(rows), [
    'ZHI01 42020075 C 361.9',
    'ZHI01 26110005 C 9.05',
    'ZHI01 26110001 C 9.05',
    'ZHI01 DINTF001 D 380',
    'ZHI02 13101259 D 380',
    'ZHI02 26106021 C 380',
    'ZHI03 26106021 D 380',
    'ZHI03 DINTF001 C 380',
  ]);
  assert.equal(rows[0]!.PERIOD, '0032025');
  assert.equal(rows[0]!.TRANSACTION_DATE, '15062025');
  assert.equal(rows[0]!.T9, 'JUN');
  assert.equal(rows[0]!.BATCH_CODE, 'ZHI01-0-15062025-BLK-H');
  assert.equal(rows[0]!.AFS_20, 'ZHI01-0-MAXBLK/00656321-BLK-H');
  assert.equal(rows[4]!.TREFERENCE, '3065465465465');
  assert.equal(rows[4]!.T5, '_NA');
  assert.equal(rows[6]!.TREFERENCE, 'MAXBLK/00656321');
  assertBalanced(rows);
});

test('discount and round-off post as the template "Discount,Roud & UPI" sheet', () => {
  const { rows } = erpJournal(
    [
      bill({
        billNumber: 'MAXBLK/00657039',
        discount: 7.62,
        discountPercent: 20,
        grandTotal: 72,
        gst: 3.42,
        lines: [{ ...bill({}).lines[0]!, gst: 3.42, gstPercent: 5 }],
        paymentReference: '+626552',
        roundOff: 0.01,
        subtotal: 76.19,
      }),
    ],
    'BLK',
  );

  assert.deepEqual(brief(rows), [
    'ZHI01 42020075 C 76.19',
    'ZHI01 26110005 C 1.71',
    'ZHI01 26110001 C 1.71',
    'ZHI01 32106008 C 0.01',
    'ZHI01 DINTF001 D 79.62',
    'ZHI02 13101259 D 72',
    'ZHI02 26106021 C 72',
    'ZHI03 26106021 D 72',
    'ZHI03 32501001 D 7.62',
    'ZHI03 DINTF001 C 79.62',
  ]);
  assert.equal(rows[8]!.AFS_10, 'Discount_20%');
  assert.equal(rows[8]!.MEMO_AMT, 76.19);
  assertBalanced(rows);
});

test('a cancelled cash bill posts, then posts reversed; complimentary posts nothing', () => {
  const cash = bill({
    grandTotal: 40,
    gst: 1.9,
    isCancelled: true,
    lines: [{ ...bill({}).lines[0]!, gst: 1.9 }],
    paidVia: 'CASH',
    paymentReference: null,
    subtotal: 38.1,
  });
  const { rows } = erpJournal([cash, bill({ isComplimentary: true, paidVia: null })], 'BLK');

  assert.equal(rows.length, 16);
  assert.deepEqual(brief(rows.slice(8)), [
    'ZHI01 42020075 D 38.1',
    'ZHI01 26110005 D 0.95',
    'ZHI01 26110001 D 0.95',
    'ZHI01 DINTF001 C 40',
    'ZHI02 13102016 C 40',
    'ZHI02 26106021 D 40',
    'ZHI03 26106021 C 40',
    'ZHI03 DINTF001 D 40',
  ]);
  assertBalanced(rows);
});

test('a January bill is period 010 of the year before; the unit comes from the bill prefix', () => {
  const { rows } = erpJournal([bill({ businessDate: new Date('2026-01-05T00:00:00Z') })], 'BLK');

  assert.equal(rows[0]!.PERIOD, '0102025');
  assert.equal(rows[0]!.T9, 'JAN');
  assert.equal(erpUnit({ billPrefix: 'MAXBLK', hospitalCode: 'MAX-02' }), 'BLK');
  assert.equal(erpUnit({ billPrefix: 'MAX-SAK', hospitalCode: 'MAX-01' }), 'SAK');
  assert.equal(erpUnit({ billPrefix: null, hospitalCode: 'MAX-02' }), 'MAX-02');
});
