import { strict as assert } from 'node:assert';
import type { StockBalance } from '@aahar/api-client';
import { test } from 'vitest';
import { allocateFefo, buildTransferItemGroups } from './fefo-allocation';

// A batch of stock: only what allocation and grouping read.
const stock = (id: string, availableQty: number, extra: Partial<StockBalance> = {}): StockBalance =>
  ({
    availableQty,
    businessDate: null,
    expiryDate: null,
    id,
    item: { itemCode: 'I-1', itemName: 'Milk' },
    itemId: 'milk',
    status: 'AVAILABLE',
    updatedAt: '2026-10-01T00:00:00Z',
    ...extra,
  }) as StockBalance;

const ids = (lines: Array<{ allocatedQty: number; stock: StockBalance }>) =>
  lines.map((line) => [line.stock.id, line.allocatedQty]);

test('a store gives the soonest expiry first, splitting across batches', () => {
  const batches = [
    stock('late', 10, { expiryDate: '2026-11-20' }),
    stock('soon', 4, { expiryDate: '2026-10-28' }),
    stock('mid', 5, { expiryDate: '2026-11-01' }),
  ];
  assert.deepEqual(ids(allocateFefo(batches, 7, 'STORE')), [
    ['soon', 4],
    ['mid', 3],
  ]);
});

test('batches without a date go last; equal dates go oldest-updated first', () => {
  const batches = [
    stock('undated', 5),
    stock('newer', 5, { expiryDate: '2026-11-01', updatedAt: '2026-10-05T00:00:00Z' }),
    stock('older', 5, { expiryDate: '2026-11-01', updatedAt: '2026-10-02T00:00:00Z' }),
  ];
  assert.deepEqual(ids(allocateFefo(batches, 12, 'STORE')), [
    ['older', 5],
    ['newer', 5],
    ['undated', 2],
  ]);
});

test('a kitchen gives the oldest business date first, not the expiry', () => {
  const batches = [
    stock('today', 5, { businessDate: '2026-10-26', expiryDate: '2026-10-27' }),
    stock('yesterday', 5, { businessDate: '2026-10-25', expiryDate: '2026-10-30' }),
  ];
  assert.deepEqual(ids(allocateFefo(batches, 6, 'KITCHEN')), [
    ['yesterday', 5],
    ['today', 1],
  ]);
});

test('empty batches are skipped and asking for more than there is takes it all', () => {
  const batches = [stock('a', 0, { expiryDate: '2026-10-27' }), stock('b', 2.5)];
  assert.deepEqual(ids(allocateFefo(batches, 10, 'STORE')), [['b', 2.5]]);
  assert.deepEqual(allocateFefo(batches, 0, 'STORE'), []);
});

test('quantities are kept to three decimals, without floating-point dust', () => {
  const batches = [
    stock('a', 0.1, { expiryDate: '2026-10-27' }),
    stock('b', 0.2, { expiryDate: '2026-10-28' }),
  ];
  assert.deepEqual(ids(allocateFefo(batches, 0.3, 'STORE')), [
    ['a', 0.1],
    ['b', 0.2],
  ]);
});

test('lines share what is left: a second line does not take stock the first already took', () => {
  const batches = [
    stock('soon', 4, { expiryDate: '2026-10-28' }),
    stock('late', 10, { expiryDate: '2026-11-20' }),
  ];
  const remaining = new Map<string, number>();
  assert.deepEqual(ids(allocateFefo(batches, 3, 'STORE', remaining)), [['soon', 3]]);
  assert.deepEqual(ids(allocateFefo(batches, 3, 'STORE', remaining)), [
    ['soon', 1],
    ['late', 2],
  ]);
  assert.deepEqual(
    [...remaining],
    [
      ['soon', 0],
      ['late', 8],
    ],
  );
});

test('store stock groups by item, soonest batch first, sorted by item name', () => {
  const groups = buildTransferItemGroups(
    [
      stock('m2', 3, { expiryDate: '2026-11-05T00:00:00Z', status: 'AVAILABLE' }),
      stock('m1', 1.25, { expiryDate: '2026-10-28T00:00:00Z', status: 'NEAR_EXPIRY' }),
      stock('b1', 2, {
        expiryDate: '2026-12-01',
        item: { itemCode: 'I-2', itemName: 'Bread' } as StockBalance['item'],
        itemId: 'bread',
      }),
    ],
    'STORE',
  );
  assert.deepEqual(
    groups.map((group) => [
      group.key,
      group.itemName,
      group.batchCount,
      group.nearestExpiryDate,
      group.businessDate,
      group.status,
      group.totalAvailableQty,
      group.stocks.map((entry) => entry.id),
    ]),
    [
      ['bread', 'Bread', 1, '2026-12-01', null, 'AVAILABLE', 2, ['b1']],
      ['milk', 'Milk', 2, '2026-10-28', null, 'NEAR_EXPIRY', 4.25, ['m1', 'm2']],
    ],
  );
});

test('kitchen stock groups by item and business date', () => {
  const groups = buildTransferItemGroups(
    [
      stock('a', 2, { businessDate: '2026-10-25T00:00:00Z' }),
      stock('b', 3, { businessDate: '2026-10-26T00:00:00Z' }),
      stock('c', 1, { businessDate: '2026-10-26T00:00:00Z' }),
    ],
    'KITCHEN',
  );
  assert.deepEqual(
    groups.map((group) => [group.key, group.businessDate, group.totalAvailableQty]),
    [
      ['milk:2026-10-25', '2026-10-25', 2],
      ['milk:2026-10-26', '2026-10-26', 4],
    ],
  );
});

test('a group is out of stock with nothing left, expired only if every batch with stock is', () => {
  const status = (...batches: StockBalance[]) =>
    buildTransferItemGroups(batches, 'STORE')[0]!.status;
  assert.equal(status(stock('a', 0, { status: 'AVAILABLE' })), 'OUT_OF_STOCK');
  assert.equal(
    status(stock('a', 2, { status: 'EXPIRED' }), stock('b', 0, { status: 'AVAILABLE' })),
    'EXPIRED',
  );
  assert.equal(
    status(stock('a', 2, { status: 'EXPIRED' }), stock('b', 1, { status: 'AVAILABLE' })),
    'AVAILABLE',
  );
});
