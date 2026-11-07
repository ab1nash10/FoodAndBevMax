import { strict as assert } from 'node:assert';
import type { PosBill, PosBillLine } from '@aahar/api-client';
import { beforeEach, test, vi } from 'vitest';
import { printHtml } from '@/lib/print';
import { counterLabel, formatMoney, printBill, printKot, upiPayLink } from './shared';

// Printing is swapped for a spy so the printed HTML can be read; the QR is its link as text.
vi.mock('@/lib/print', async (original) => ({
  ...(await original<object>()),
  printHtml: vi.fn(),
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: (text: string) => Promise.resolve(`data:qr,${encodeURIComponent(text)}`) },
}));

beforeEach(() => {
  vi.mocked(printHtml).mockClear();
});

/** The last printed document: its title, and its body with the markup's line breaks dropped. */
function printed() {
  const [title, body] = vi.mocked(printHtml).mock.calls.at(-1)!;
  return { body: body.replace(/\n/g, ''), title };
}

const line = (extra: Partial<PosBillLine>): PosBillLine => ({
  discountAmount: 0,
  gstAmount: 0,
  gstPercent: 0,
  hsnCode: '996331',
  id: 'l',
  isDiscountable: true,
  isGstInclusive: false,
  itemId: 'i',
  itemName: 'Item',
  lineTotal: 0,
  menuId: 'm',
  menuItemCode: 'M1',
  note: null,
  quantity: 1,
  taxableAmount: 0,
  unitPrice: 0,
  ...extra,
});

// Two Cokes with 10% staff discount, a Red Bull (no discount, 5% GST) and a sandwich (5% GST):
// list prices 260 + 117.14 + 80 = 457.14, less 26 discount, plus 9.86 GST = 441.
const bill = (extra: Partial<PosBill> = {}): PosBill =>
  ({
    bedNumber: null,
    billNumber: 'INV/0007',
    channel: 'COUNTER',
    cashierCode: 'E100',
    complimentaryReason: null,
    counter: { counterCode: 'C1', counterName: 'Counter 1', id: 'c1' },
    discountPercent: 10,
    discountTotal: 26,
    grandTotal: 441,
    gstTotal: 9.86,
    hospital: { address: null, city: null, hospitalName: 'Max Saket', id: 'h1', state: 'Delhi' },
    instructions: null,
    isComplimentary: false,
    kotNumber: 'COUNTER-01/261026/0003',
    lines: [
      line({ discountAmount: 26, itemName: 'Coke <can>', quantity: 2, taxableAmount: 234 }),
      line({
        gstAmount: 5.86,
        gstPercent: 5,
        isDiscountable: false,
        itemName: 'Red Bull',
        taxableAmount: 117.14,
      }),
      line({
        gstAmount: 4,
        gstPercent: 5,
        itemName: 'Sandwich',
        note: 'no onion',
        taxableAmount: 80,
      }),
    ],
    orderNumber: 'A 12',
    paymentMode: 'UPI',
    paymentReference: 'TXN9',
    placedAt: '2026-10-26T06:30:00Z',
    restaurant: {
      address: 'Ground floor',
      fssaiNumber: null,
      gstAddress: null,
      gstNumber: '07AAACM1234A1Z5',
      id: 'r1',
      legalEntity: null,
      legalName: null,
      restaurantName: 'Cafe',
      upiId: 'cafe@upi',
    },
    roomNumber: null,
    roundOff: 0,
    status: 'PLACED',
    subtotal: 457.14,
    ...extra,
  }) as PosBill;

test('money is rupees with two decimals and Indian grouping; nothing reads as zero', () => {
  assert.equal(formatMoney(123456.5), '₹1,23,456.50');
  assert.equal(formatMoney(null), '₹0.00');
  assert.equal(formatMoney(undefined), '₹0.00');
});

test('a counter is named with its restaurant', () => {
  assert.equal(
    counterLabel({ counterName: 'Counter 1', restaurant: { restaurantName: 'Cafe' } } as never),
    'Cafe · Counter 1',
  );
});

test('the UPI link carries payee, amount to the paisa and the bill, all encoded', () => {
  assert.equal(
    upiPayLink({ amount: 441, payee: 'Cafe & Co', reference: 'INV/0007', upiId: 'cafe@upi' }),
    'upi://pay?pa=cafe%40upi&pn=Cafe%20%26%20Co&am=441.00&cu=INR&tr=INV%2F0007&tn=Bill%20INV%2F0007',
  );
  assert.equal(
    upiPayLink({ amount: 5.5, payee: 'Cafe', upiId: 'cafe@upi' }),
    'upi://pay?pa=cafe%40upi&pn=Cafe&am=5.50&cu=INR',
  );
});

test('the invoice lists lines at their price before discount, marking undiscounted ones', async () => {
  await printBill(bill());
  const { body, title } = printed();
  assert.equal(title, 'INV/0007');
  assert.match(body, /TAX INVOICE/);
  // Two Cokes: rate 130, price 260 (234 taxable + 26 discount); the name is escaped.
  assert.match(
    body,
    /Coke &lt;can&gt;<\/span> x 2<\/td><td>996331<\/td><td class="num">130\.00<\/td><td class="num">260\.00/,
  );
  assert.match(body, /Red Bull\*<\/span> x 1/);
  assert.match(body, /Sandwich<\/span> x 1<small>no onion<\/small>/);
});

test('the totals: discount, taxable value, GST halved into CGST and SGST per rate', async () => {
  await printBill(bill());
  const { body } = printed();
  for (const text of [
    'SUBTOTAL</td><td class="num">₹457.14',
    'Staff discount (10%)</td><td class="num">-₹26.00',
    'Taxable value</td><td class="num">₹431.14',
    'CGST (2.5%)</td><td class="num">₹4.93',
    'SGST (2.5%)</td><td class="num">₹4.93',
    'GST TOTAL (5%)</td><td class="num">₹9.86',
    'GRAND TOTAL</td><td class="num">₹441.00',
  ]) {
    assert.ok(body.includes(text), text);
  }
  // No round off line when there is none, and no 0% GST line.
  assert.ok(!body.includes('Round off'));
  assert.ok(!body.includes('(0%)'));
});

test('the header: India time, issuer, UPI QR for the total, and the board number', async () => {
  await printBill(bill());
  const { body } = printed();
  assert.ok(body.includes('<td>Time:</td><td>12:00 PM</td>'));
  assert.ok(body.includes('<td>Date:</td><td>26 Oct 2026</td>'));
  assert.ok(body.includes('<td>Mode of Payment:</td><td>UPI</td>'));
  assert.ok(body.includes('<td>Place of Supply:</td><td>Delhi</td>'));
  assert.ok(body.includes('Cafe, Ground floor'));
  assert.ok(body.includes('GSTIN: 07AAACM1234A1Z5'));
  assert.ok(body.includes(encodeURIComponent('upi://pay?pa=cafe%40upi&pn=Cafe&am=441.00')));
  assert.ok(body.includes('Watch the board for</span><strong>A 12</strong>'));
  // Empty facts are left out.
  assert.ok(!body.includes('Room:'));
  assert.ok(!body.includes('Complimentary:'));
});

test('the legal entity names the issuer when the restaurant has no legal name or GST of its own', async () => {
  await printBill(
    bill({
      restaurant: {
        ...bill().restaurant,
        gstNumber: null,
        legalEntity: {
          entityAddress: 'Saket, Delhi',
          entityName: 'Max Foods Ltd',
          gstNumber: '07ENTITY',
        },
      },
    }),
  );
  const { body } = printed();
  assert.ok(body.includes('Max Foods Ltd, Saket, Delhi'));
  assert.ok(body.includes('GSTIN: 07ENTITY'));
});

test('complimentary and cancelled bills: no QR, no payment, and they say so', async () => {
  await printBill(
    bill({ complimentaryReason: 'Doctor on duty', isComplimentary: true, paymentMode: 'CASH' }),
  );
  let { body } = printed();
  assert.match(body, /COMPLIMENTARY BILL/);
  assert.ok(body.includes('<td>Complimentary:</td><td>Doctor on duty</td>'));
  assert.ok(!body.includes('data:qr'));
  assert.ok(!body.includes('Mode of Payment'));
  assert.ok(!body.includes('Txn Id'));

  await printBill(bill({ status: 'CANCELLED' }), { duplicate: true });
  ({ body } = printed());
  assert.ok(body.includes('*** CANCELLED ***'));
  assert.ok(body.includes('Duplicate Bill'));
  assert.ok(!body.includes('Watch the board'));
});

test('the order slip has the order number, room and bed, lines with notes, and instructions', () => {
  printKot(bill({ bedNumber: '4', instructions: 'Less spicy', roomNumber: '512' }));
  const { body, title } = printed();
  assert.equal(title, 'Order A 12');
  assert.ok(body.includes('ROOM 512 / BED 4'));
  assert.ok(body.includes('<span class="qty">2 x</span><span>Coke &lt;can&gt;</span>'));
  assert.ok(body.includes('Sandwich<span class="note">— no onion</span>'));
  assert.ok(body.includes('<td>Operator ID:</td><td>E100</td>'));
  assert.ok(body.includes('Note: Less spicy'));
});
