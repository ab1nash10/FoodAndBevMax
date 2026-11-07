import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { test } from 'vitest';
import { auditWhere, csvField, decodeCursor, encodeCursor } from './audit-logs.service';

const row = {
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  id: '6f1c2e9a-4b7d-4c1e-9a35-0b8f2d7e6a11',
};

test('a cursor round-trips, and a forged one is refused', () => {
  assert.deepEqual(decodeCursor(encodeCursor(row)), row);
  assert.throws(() => decodeCursor('bm9wZQ'), BadRequestException);
  assert.throws(
    () => decodeCursor(Buffer.from('2026-11-01|x').toString('base64url')),
    BadRequestException,
  );
});

test('a limited user only ever sees rows of their own locations', () => {
  assert.deepEqual(auditWhere({}, ['h-1', 'h-2']), {
    AND: [{ deletedAt: null }, { hospitalId: { in: ['h-1', 'h-2'] } }],
  });
  assert.deepEqual(auditWhere({}, null), { AND: [{ deletedAt: null }] }, 'Super Admin: every row');
  assert.deepEqual(auditWhere({ hospitalId: 'h-1' }, ['h-1']).AND, [
    { deletedAt: null },
    { hospitalId: 'h-1' },
  ]);
});

test('filters and the cursor narrow newest-first pages', () => {
  const where = auditWhere(
    {
      action: 'GRN_POST',
      cursor: encodeCursor(row),
      entityName: 'grns',
      from: '2026-10-01T00:00:00Z',
      q: ' basmati ',
      to: '2026-11-01T00:00:00Z',
    },
    null,
  );
  assert.deepEqual(where.AND, [
    { deletedAt: null },
    { entityName: 'grns' },
    { action: 'GRN_POST' },
    { createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } },
    { summary: { contains: 'basmati', mode: 'insensitive' } },
    {
      OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }],
    },
  ]);
});

test('CSV fields are quoted when needed and never run as spreadsheet formulas', () => {
  assert.equal(csvField(null), '');
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a, "b"'), '"a, ""b"""');
  assert.equal(csvField('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvField('-2'), "'-2");
  assert.equal(csvField({ qty: 2 }), '"{""qty"":2}"');
  assert.equal(csvField(row.createdAt), '2026-11-01T10:00:00.000Z');
});
