import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import {
  actionLabel,
  actionTone,
  auditChanges,
  auditCsvToReport,
  dayRange,
  entityLabel,
  fieldLabel,
} from './audit';

test('actions read as what happened', () => {
  assert.equal(actionLabel('GRN_POST'), 'GRN posted');
  assert.equal(actionLabel('TRANSFER_ACKNOWLEDGE'), 'Transfer acknowledged');
  assert.equal(actionLabel('KITCHEN_PRODUCTION_CANCEL'), 'Kitchen production cancelled');
  assert.equal(actionLabel('ITEM_PRICE_STATUS_CHANGE'), 'Item price status changed');
  assert.equal(actionLabel('STATUS_CHANGE'), 'Status changed');
  assert.equal(actionLabel('LOGIN_FAILED'), 'Sign-in failed');
  assert.equal(actionLabel('SOMETHING_NEW'), 'Something new');
});

test('record types and fields get plain names', () => {
  assert.equal(entityLabel('kitchen_productions'), 'Kitchen production');
  assert.equal(entityLabel('grns'), 'GRN');
  assert.equal(entityLabel('mystery_things'), 'Mystery things');
  assert.equal(fieldLabel('acceptedQty'), 'Accepted qty');
  assert.equal(fieldLabel('hospitalId'), 'Hospital ID');
  assert.equal(fieldLabel('rejection_reason'), 'Rejection reason');
});

test('an update shows each changed field old to new', () => {
  assert.deepEqual(
    auditChanges({
      newValue: { remarks: 'ok', isActive: false },
      oldValue: { remarks: null, isActive: true },
    }),
    [
      { after: { text: 'ok' }, before: { text: '—' }, field: 'remarks', label: 'Remarks' },
      { after: { text: 'No' }, before: { text: 'Yes' }, field: 'isActive', label: 'Is active' },
    ],
  );
});

test('a create has only the new side, a delete only the old', () => {
  assert.deepEqual(auditChanges({ newValue: { name: 'Rice' }, oldValue: null }), [
    { after: { text: 'Rice' }, field: 'name', label: 'Name' },
  ]);
  assert.deepEqual(auditChanges({ newValue: null, oldValue: { qty: 2 } }), [
    { before: { text: '2' }, field: 'qty', label: 'Qty' },
  ]);
  assert.deepEqual(auditChanges({ newValue: null, oldValue: null }), []);
});

test('a list of records (acknowledged lines, posted batches) becomes a small table', () => {
  const [lines] = auditChanges({
    newValue: {
      lines: [
        { acceptedQty: 8, itemName: 'Rice', rejectedQty: 2, rejectionReason: 'Damaged packs' },
        { acceptedQty: 5, itemName: 'Dal', rejectedQty: 0, rejectionReason: null },
      ],
    },
    oldValue: null,
  });

  assert.deepEqual(lines?.after, {
    columns: [
      { key: 'acceptedQty', label: 'Accepted qty' },
      { key: 'itemName', label: 'Item name' },
      { key: 'rejectedQty', label: 'Rejected qty' },
      { key: 'rejectionReason', label: 'Rejection reason' },
    ],
    rows: [
      ['8', 'Rice', '2', 'Damaged packs'],
      ['5', 'Dal', '0', '—'],
    ],
  });
});

test('plain lists join, nested objects flatten, dates are not raw ISO', () => {
  const changes = auditChanges({
    newValue: { at: '2026-10-31T18:30:00.000Z', meta: { a: 1, b: 'x' }, tags: ['veg', 'hot'] },
    oldValue: null,
  });

  const at = changes[0]?.after;
  assert.ok(at && 'text' in at && at.text.includes('2026') && !at.text.includes('T18:30'));
  assert.deepEqual(changes[1]?.after, { text: 'A: 1 · B: x' });
  assert.deepEqual(changes[2]?.after, { text: 'veg, hot' });
});

test('a value that is not an object still shows', () => {
  assert.deepEqual(auditChanges({ newValue: 'reset', oldValue: undefined }), [
    { after: { text: 'reset' }, field: 'value', label: 'Value' },
  ]);
});

test('the day range: from that midnight to the midnight after the last day', () => {
  const range = dayRange('2026-10-01', '2026-10-31');

  assert.equal(range.from, new Date(2026, 9, 1).toISOString());
  assert.equal(range.to, new Date(2026, 10, 1).toISOString());
  assert.deepEqual(dayRange('', ''), { from: undefined, to: undefined });
});

test('the action chip warns on cancels, deletes and refusals', () => {
  assert.equal(actionTone('GRN_CANCEL'), 'danger');
  assert.equal(actionTone('PERMISSION_DENIED'), 'danger');
  assert.equal(actionTone('ITEM_CREATE'), 'success');
  assert.equal(actionTone('GRN_POST'), 'info');
  assert.equal(actionTone('UPDATE'), 'neutral');
});

test('the CSV export becomes a plain Excel sheet with headings in words', () => {
  const sheet = auditCsvToReport(
    'createdAt,action,recordName,summary\n2026-11-01T10:00:00.000Z,UPDATE,LXF 3- East Block,"Moved, then renamed"\n',
    new Date('2026-11-02T00:00:00.000Z'),
  );

  assert.equal(sheet.plain, true);
  assert.deepEqual(
    sheet.columns.map((column) => column.label),
    ['Created at', 'Action', 'Record name', 'Summary'],
  );
  assert.deepEqual(sheet.rows, [
    {
      action: 'UPDATE',
      createdAt: '2026-11-01T10:00:00.000Z',
      recordName: 'LXF 3- East Block',
      summary: 'Moved, then renamed',
    },
  ]);
  assert.equal(entityLabel('pos_devices'), 'POS device');
});
