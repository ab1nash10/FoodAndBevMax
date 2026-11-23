import { strict as assert } from 'node:assert';
import { Prisma } from '@prisma/client';
import { test } from 'vitest';
import { addStock } from './stock-balances';

test('stock is added to its row in one insert-or-add statement, empty key parts included', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: strings.join('?').replace(/\s+/g, ' '), values });
      return Promise.resolve([{ availableQty: new Prisma.Decimal(7), id: 'balance-1' }]);
    },
  };

  const row = await addStock(
    client as unknown as Prisma.TransactionClient,
    {
      batchNumber: null,
      businessDate: new Date('2026-10-22T00:00:00Z'),
      expiryDate: null,
      hospitalId: 'hospital-1',
      itemId: 'item-1',
      itemType: 'READYMADE',
      locationId: 'kitchen-1',
      locationType: 'KITCHEN',
    },
    2,
    'user-1',
  );

  assert.deepEqual(row, { availableQty: new Prisma.Decimal(7), id: 'balance-1' });
  assert.equal(statements.length, 1);
  assert.match(
    statements[0]!.sql,
    /ON CONFLICT \(hospital_id, location_type, location_id, item_id, batch_number, expiry_date, business_date\) DO UPDATE SET available_qty = stock_balances\.available_qty \+ EXCLUDED\.available_qty/,
  );
  // Days go in as calendar days (what a DATE column holds), an empty one as NULL.
  assert.deepEqual(statements[0]!.values, [
    'hospital-1',
    'KITCHEN',
    'kitchen-1',
    'item-1',
    'READYMADE',
    null,
    null,
    '2026-10-22',
    2,
    'user-1',
    'user-1',
  ]);
});
