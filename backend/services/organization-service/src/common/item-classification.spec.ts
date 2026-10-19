import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { test } from 'vitest';
import { classifyItem, releaseItemTypeIfUnused } from './item-classification';

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

test('the first mapping sets the type from where it is mapped, and needs a category', async () => {
  const items = [item()];
  await assert.rejects(
    classifyItem(fakeTx(items), 'samosa', ItemType.MRP, undefined, 'u'),
    (error: unknown) =>
      error instanceof BadRequestException && /Choose a category/.test(error.message),
  );
  await classifyItem(fakeTx(items), 'samosa', ItemType.MRP, 'snacks', 'u');
  assert.deepEqual([items[0]?.itemType, items[0]?.categoryId], [ItemType.MRP, 'snacks']);
  // A second store mapping needs no category again.
  await assert.doesNotReject(classifyItem(fakeTx(items), 'samosa', ItemType.MRP, undefined, 'u'));
});

test('an item of the other type, an inactive category or a twin name is refused', async () => {
  await assert.rejects(
    classifyItem(
      fakeTx([item({ categoryId: 'snacks', itemType: ItemType.MRP })]),
      'samosa',
      ItemType.READYMADE,
      undefined,
      'u',
    ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message ===
        'Samosa is an MRP item (mapped to stores), so it cannot be mapped to a kitchen.',
  );
  await assert.rejects(
    classifyItem(fakeTx([item()]), 'samosa', ItemType.MRP, 'retired', 'u'),
    BadRequestException,
  );
  const twins = [item(), item({ categoryId: 'snacks', id: 'other' })];
  await assert.rejects(
    classifyItem(fakeTx(twins), 'samosa', ItemType.MRP, 'snacks', 'u'),
    ConflictException,
  );
});

test('removing the last mapping of an unused item clears its type, but not once it is used', async () => {
  const items = [item({ categoryId: 'snacks', itemType: ItemType.MRP })];
  await releaseItemTypeIfUnused(fakeTx(items, { storeItems: 1 }), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, ItemType.MRP, 'still mapped to another store');
  await releaseItemTypeIfUnused(fakeTx(items, { ledgers: 3 }), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, ItemType.MRP, 'it has stock history');
  await releaseItemTypeIfUnused(fakeTx(items), 'samosa', ItemType.MRP);
  assert.equal(items[0]?.itemType, null);
  assert.equal(items[0]?.categoryId, 'snacks', 'the category stays');
});
