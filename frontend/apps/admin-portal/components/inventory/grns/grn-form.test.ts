import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  checkHeader,
  checkLines,
  emptyLine,
  grnLinesSchema,
  headerSchema,
} from '@/components/inventory/grns/grn-form';

const itemId = '40afc7d0-d740-4e96-8625-80c7a8ffbe6f';
const line = (batch: { acceptedQty: string; rejectionReason?: string }, lineReason = '') => {
  const draft = emptyLine();

  return [
    {
      ...draft,
      batches: [
        {
          ...draft.batches[0]!,
          batchNumber: 'B1',
          expiryDate: '2099-12-31',
          receivedQty: '10',
          rejectionReason: '',
          ...batch,
        },
      ],
      itemId,
      rejectionReason: lineReason,
    },
  ];
};

test('a GRN needs a vendor, an accepted quantity, and a reason for anything rejected', () => {
  const header = {
    hospitalId: itemId,
    invoiceNumber: '',
    poNumber: '',
    receivedBy: 'Store',
    receivedDate: '2026-10-20T10:00',
    remarks: '',
    storeId: itemId,
    vendorName: ' ',
  };
  assert.equal(headerSchema.safeParse(header).success, false);
  assert.equal(headerSchema.safeParse({ ...header, vendorName: 'ABC' }).success, true);

  assert.equal(grnLinesSchema.safeParse(line({ acceptedQty: '10' })).success, true);
  assert.equal(grnLinesSchema.safeParse(line({ acceptedQty: '' })).success, false);
  assert.equal(grnLinesSchema.safeParse(line({ acceptedQty: '8' })).success, false);
  assert.equal(
    grnLinesSchema.safeParse(line({ acceptedQty: '8', rejectionReason: 'Damaged' })).success,
    true,
  );
  assert.equal(grnLinesSchema.safeParse(line({ acceptedQty: '8' }, 'Short')).success, true);
});

test('each step check names its fields and the line a problem is on', () => {
  const header = checkHeader({
    hospitalId: itemId,
    invoiceNumber: '',
    poNumber: '',
    receivedBy: 'Store',
    receivedDate: '2026-10-20T10:00',
    remarks: '',
    storeId: itemId,
    vendorName: '',
  });
  assert.equal(header.message, 'Vendor name is required.');
  assert.equal(header.errors.get('vendorName'), 'Vendor name is required.');

  const lines = checkLines(line({ acceptedQty: '8' }));
  assert.equal(
    lines.message,
    'Line 1: Enter a rejection reason for each batch with a rejected quantity.',
  );
  assert.ok(lines.errors.has('0.rejectionReason'));
  assert.equal(checkLines(line({ acceptedQty: '10' })).message, null);
});
