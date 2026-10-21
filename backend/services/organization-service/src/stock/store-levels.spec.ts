import { strict as assert } from 'node:assert';
import { InventoryLocationType, ItemType, Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

const store = { hospitalId: 'h1', id: 's1', storeCode: 'S-01', storeName: 'Main Store' };
const restaurant = { hospitalId: 'h1', id: 'r1', restaurantCode: 'R-01', restaurantName: 'Cafe' };
const item = (id: string, itemName: string) => ({ itemCode: id.toUpperCase(), itemName });
const balance = (itemId: string, itemName: string, qty: number, expiryDate: string | null) => ({
  availableQty: new Prisma.Decimal(qty),
  batchNumber: `${itemId}-b`,
  createdAt: new Date('2026-10-01'),
  expiryDate: expiryDate ? new Date(expiryDate) : null,
  hospitalId: 'h1',
  item: item(itemId, itemName),
  itemId,
  locationId: 's1',
});

// A repository stand-in with one store and one restaurant, the batches at the location read and
// what each item gave out in 28 days. `reads` records what each read asked for.
function service(
  issued: Record<string, number>,
  balances: ReturnType<typeof balance>[],
  reads: unknown[] = [],
) {
  const repository = {
    findActiveRestaurants: () => Promise.resolve([restaurant]),
    findActiveStores: () => Promise.resolve([store]),
    findBalances: (args: Prisma.StockBalanceFindManyArgs) => {
      reads.push(args.where);
      return Promise.resolve(balances);
    },
    sumIssuedByLocationItem: (locationType: InventoryLocationType, locationIds: string[]) => {
      reads.push([locationType, locationIds]);
      return Promise.resolve(
        Object.entries(issued).map(([itemId, qty]) => ({
          _sum: { qtyOut: new Prisma.Decimal(qty) },
          itemId,
          locationId: locationIds[0],
        })),
      );
    },
  } as unknown as StockRepository;

  return new StockService(repository);
}

test('cover is on hand over the 28-day daily issue; under 3 days is LOW, nothing is OUT', async () => {
  const { items } = await service({ coke: 280, rice: 28, thali: 56 }, [
    balance('coke', 'Coke', 20, '2026-12-01'),
    balance('rice', 'Rice', 10, null),
    balance('thali', 'Veg Thali', 0, null),
    balance('tea', 'Tea', 5, '2026-11-02'),
    balance('tea', 'Tea', 3, '2026-11-20'),
  ]).listStoreLevels({});

  assert.deepEqual(
    items.map((row) => [row.itemName, row.onHand, row.coverDays, row.level, row.batches.length]),
    [
      // Out first, then running low (shortest cover first), then the rest by name.
      ['Veg Thali', 0, 0, 'OUT', 0],
      ['Coke', 20, 2, 'LOW', 1],
      ['Rice', 10, 10, 'OK', 1],
      // Nothing given out in 28 days: no cover figure, never LOW.
      ['Tea', 8, null, 'OK', 2],
    ],
  );
  assert.equal(
    items
      .find((row) => row.itemName === 'Tea')
      ?.nextExpiryDate?.toISOString()
      .slice(0, 10),
    '2026-11-02',
  );
  // The store read still names its store.
  assert.deepEqual(
    [items[0]?.storeId, items[0]?.storeCode, items[0]?.storeName],
    ['s1', 'S-01', 'Main Store'],
  );
});

test("a restaurant gets the same rule over its own issues, for the store's items only", async () => {
  const reads: unknown[] = [];
  const { items, lowCoverDays } = await service(
    { chips: 56, water: 28 },
    [
      { ...balance('chips', 'Chips', 3, null), locationId: 'r1' },
      { ...balance('water', 'Water', 12, null), locationId: 'r1' },
    ],
    reads,
  ).listRestaurantLevels({ hospitalId: 'h1' });

  assert.equal(lowCoverDays, 3);
  assert.deepEqual(
    items.map((row) => [row.itemName, row.locationName, row.coverDays, row.level]),
    [
      ['Chips', 'Cafe', 1.5, 'LOW'],
      ['Water', 'Cafe', 12, 'OK'],
    ],
  );
  assert.deepEqual(reads, [
    {
      deletedAt: null,
      itemType: { not: ItemType.READYMADE },
      locationId: { in: ['r1'] },
      locationType: InventoryLocationType.RESTAURANT,
    },
    [InventoryLocationType.RESTAURANT, ['r1']],
  ]);
});
