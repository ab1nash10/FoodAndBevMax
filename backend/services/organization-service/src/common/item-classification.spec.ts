import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { test } from 'vitest';
import { assertUsableCategory, classifyItem, releaseItemTypeIfUnused } from './item-classification';

interface FakeItem {
  categoryId: string | null;
  id: string;
  isActive: boolean;
  itemName: string;
  itemType: ItemType | null;
  normalizedName: string;
}

// An in-memory stand-in for the transaction: items, categories and usage counts.
function fakeTx(items: FakeItem[], usage: Record<string, number> = {}) {
  const categories = new Map([
    ['snacks', { isActive: true }],
    ['retired', { isActive: false }],
  ]);
  const count = (key: string) => () => Promise.resolve(usage[key] ?? 0);
  return {
    grnLine: { count: count('grnLines') },
    item: {
      findFirst: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          items.find((item) =>
            where.normalizedName
              ? item.normalizedName === where.normalizedName &&
                item.categoryId === where.categoryId &&
                item.id !== (where.id as { not: string }).not
              : item.id === where.id,
          ) ?? null,
        ),
      update: ({ data, where }: { data: Partial<FakeItem>; where: { id: string } }) => {
        Object.assign(
          items.find((item) => item.id === where.id)!,
          data,
        );
        return Promise.resolve();
      },
      updateMany: ({ data, where }: { data: Partial<FakeItem>; where: Partial<FakeItem> }) => {
        const item = items.find((i) => i.id === where.id && i.itemType === where.itemType);
        if (item) Object.assign(item, data);
        return Promise.resolve();
      },
    },
    itemCategory: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(categories.get(where.id) ?? null),
    },
    kitchenItem: { count: count('kitchenItems') },
    kitchenProductionLine: { count: count('productionLines') },
    stockLedger: { count: count('ledgers') },
    storeItem: { count: count('storeItems') },
  } as never;
}
const item = (overrides: Partial<FakeItem> = {}): FakeItem => ({
  categoryId: null,
  id: 'samosa',
  isActive: true,
  itemName: 'Samosa',
  itemType: null,
  normalizedName: 'samosa',
  ...overrides,
});

test('a mapping gives an unmapped item its type; more mappings of that kind are fine', async () => {
  const items = [item()];
  await classifyItem(fakeTx(items), 'samosa', ItemType.MRP, 'u');
  assert.equal(items[0]?.itemType, ItemType.MRP);
  await assert.doesNotReject(classifyItem(fakeTx(items), 'samosa', ItemType.MRP, 'u'));
});

test('an item of the other type is refused', async () => {
  await assert.rejects(
    classifyItem(fakeTx([item({ itemType: ItemType.MRP })]), 'samosa', ItemType.READYMADE, 'u'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message ===
        'Samosa is an MRP item (mapped to stores), so it cannot be mapped to a kitchen.',
  );
});

test('a mapping may only use an existing, active category', async () => {
  await assert.doesNotReject(assertUsableCategory(fakeTx([]), 'snacks'));
  await assert.rejects(assertUsableCategory(fakeTx([]), 'retired'), BadRequestException);
  await assert.rejects(assertUsableCategory(fakeTx([]), 'missing'), BadRequestException);
});

test('removing the last mapping of an unused item clears its type, but not once it is used', async () => {
  const items = [item({ categoryId: 'snacks', itemType: ItemType.MRP })];
  await releaseItemTypeIfUnused(fakeTx(items, { storeItems: 1 }), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, ItemType.MRP, 'still mapped to another store');
  await releaseItemTypeIfUnused(fakeTx(items, { ledgers: 3 }), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, ItemType.MRP, 'it has stock history');
  await releaseItemTypeIfUnused(fakeTx(items), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, null);
});
