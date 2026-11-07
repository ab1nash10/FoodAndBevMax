import { strict as assert } from 'node:assert';
import type { Grn, GrnBatch, GrnLine } from '@aahar/api-client';
import { test, vi } from 'vitest';
import { printHtml } from '@/lib/print';
import { printGrn } from './grn-print';

// Printing is swapped for a spy so the printed sheet can be read.
vi.mock('@/lib/print', async (original) => ({
  ...(await original<object>()),
  printHtml: vi.fn(),
}));

const batch = (batchNumber: string, receivedQty: number, rejectedQty = 0): GrnBatch =>
  ({
    acceptedQty: receivedQty - rejectedQty,
    batchNumber,
    expiryDate: '2026-12-01',
    receivedQty,
    rejectedQty,
    rejectionReason: rejectedQty ? 'Damaged' : null,
  }) as GrnBatch;

const line = (itemName: string, batches: GrnBatch[], extra: Partial<GrnLine> = {}): GrnLine =>
  ({
    acceptedQty: batches.reduce((sum, entry) => sum + entry.acceptedQty, 0),
    batches,
    item: { itemCode: itemName.slice(0, 3).toUpperCase(), itemName },
    receivedQty: batches.reduce((sum, entry) => sum + entry.receivedQty, 0),
    rejectedQty: batches.reduce((sum, entry) => sum + entry.rejectedQty, 0),
    rejectionReason: null,
    remarks: null,
    ...extra,
  }) as GrnLine;

const grn = {
  grnNumber: 'GRN/0042',
  hospital: { hospitalName: 'Max Saket' },
  invoiceNumber: null,
  lines: [
    line('Milk', [batch('B1', 0.1), batch('B2', 0.2, 0.05)]),
    line('Rice <Basmati>', [batch('R1', 25)], { remarks: 'Sacks torn' }),
    line('Salt', []),
  ],
  poNumber: 'PO-9',
  receivedBy: 'Asha',
  receivedDate: '2026-10-26T06:30:00Z',
  remarks: null,
  status: 'POSTED_TO_STOCK',
  store: { storeCode: 'S1', storeName: 'Main Store' },
  vendorName: 'Amul',
} as unknown as Grn;

test('the GRN prints on A4 with its number as the title', () => {
  printGrn(grn);
  const [title, , css] = vi.mocked(printHtml).mock.calls.at(-1)!;
  assert.equal(title, 'GRN/0042');
  assert.match(css!, /size: A4/);
});

test('totals add every line, to three decimals without floating-point dust', () => {
  printGrn(grn);
  const body = vi.mocked(printHtml).mock.calls.at(-1)![1];
  // 0.1 + 0.2 + 25 received; 0.05 rejected.
  assert.ok(
    body.includes(
      'Total · 3 lines</td><td class="num">25.300</td><td class="num">25.250</td><td class="num">0.050</td>',
    ),
  );
});

test('one batch shows inline; several get a row each; none shows a dash', () => {
  printGrn(grn);
  const body = vi.mocked(printHtml).mock.calls.at(-1)![1];
  assert.ok(body.includes('<td class="mono">2 batches</td>'));
  assert.equal(body.match(/<tr class="sub">/g)?.length, 2);
  assert.ok(body.includes('Rice &lt;Basmati&gt;<small>Sacks torn</small>'));
  assert.ok(body.includes('<td class="mono">R1</td>'));
  assert.ok(body.includes('Salt</td><td>SAL</td><td class="mono">—</td><td>—</td>'));
  // A rejection shows its reason; nothing rejected shows a dash.
  assert.ok(body.includes('<td class="num">0.050</td><td>Damaged</td>'));
});

test('missing details print as a dash and the store shows its code and location', () => {
  printGrn(grn);
  const body = vi.mocked(printHtml).mock.calls.at(-1)![1];
  assert.ok(body.includes('<dt>Invoice no</dt><dd>—</dd>'));
  assert.ok(body.includes('<dt>Store</dt><dd>Main Store (S1) · Max Saket</dd>'));
  assert.ok(!body.includes('Remarks:'));
});
