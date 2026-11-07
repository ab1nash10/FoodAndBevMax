import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { StoreItemsRepository } from './store-items.repository';
import { StoreItemsService } from './store-items.service';

type Mapping = {
  categoryId: string;
  deletedAt: Date | null;
  id: string;
  isActive: boolean;
  itemId: string;
  storeId: string;
};
type Item = { id: string; isActive: boolean; itemName: string; itemType: ItemType | null };

// Stores s1 (active) and s2 (switched off); categories snacks and drinks, and an inactive one.
// The transaction client answers the item-classification reads from the same mappings.
function setup(items: Item[], mappings: Mapping[] = [], received: string[] = []) {
  const live = () => mappings.filter((mapping) => !mapping.deletedAt);
  const categories: Record<string, { isActive: boolean }> = {
    drinks: { isActive: true },
    old: { isActive: false },
    snacks: { isActive: true },
  };
  const stores: Record<string, { isActive: boolean }> = {
    s1: { isActive: true },
    s2: { isActive: false },
  };
  const tx = {
    grnLine: {
      count: ({ where }: { where: { itemId: string } }) =>
        Promise.resolve(received.filter((itemId) => itemId === where.itemId).length),
    },
    item: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(items.find((item) => item.id === where.id) ?? null),
      update: ({ data, where }: { data: { itemType: ItemType }; where: { id: string } }) => {
        items.find((item) => item.id === where.id)!.itemType = data.itemType;
        return Promise.resolve();
      },
      updateMany: ({ where }: { where: { id: string; itemType: ItemType } }) => {
        const item = items.find((stored) => stored.id === where.id)!;
        if (item.itemType === where.itemType) item.itemType = null;
        return Promise.resolve();
      },
    },
    itemCategory: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(categories[where.id] ?? null),
    },
    stockLedger: { count: () => Promise.resolve(0) },
    storeItem: {
      count: ({ where }: { where: { itemId: string } }) =>
        Promise.resolve(live().filter((mapping) => mapping.itemId === where.itemId).length),
    },
  };
  const repository = {
    create: (data: Omit<Mapping, 'deletedAt' | 'id'>) => {
      const mapping = { ...data, deletedAt: null, id: `map-${mappings.length + 1}` };
      mappings.push(mapping);
      return Promise.resolve(mapping);
    },
    // Copies, like rows read from the database: an update never changes a row already read.
    findActiveById: (id: string) => {
      const mapping = live().find((stored) => stored.id === id);
      return Promise.resolve(mapping ? { ...mapping } : null);
    },
    findActiveMapping: (storeId: string, itemId: string, categoryId: string, excludeId?: string) =>
      Promise.resolve(
        live().find(
          (mapping) =>
            mapping.storeId === storeId &&
            mapping.itemId === itemId &&
            mapping.categoryId === categoryId &&
            mapping.id !== excludeId,
        ) ?? null,
      ),
    findActiveStore: (id: string) => Promise.resolve(stores[id] ?? null),
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (
      id: string,
      data: {
        category?: { connect: { id: string } };
        deletedAt?: Date;
        isActive?: boolean;
        item?: { connect: { id: string } };
      },
    ) => {
      const mapping = mappings.find((stored) => stored.id === id)!;
      mapping.categoryId = data.category?.connect.id ?? mapping.categoryId;
      mapping.itemId = data.item?.connect.id ?? mapping.itemId;
      mapping.isActive = data.isActive ?? mapping.isActive;
      mapping.deletedAt = data.deletedAt ?? mapping.deletedAt;
      return Promise.resolve({ ...mapping });
    },
  };
  const service = new StoreItemsService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as StoreItemsRepository,
  );

  return { items, mappings, service };
}

const actor = { actorId: 'user-1' };
const item = (id: string, itemType: ItemType | null = null): Item => ({
  id,
  isActive: true,
  itemName: id,
  itemType,
});
const map = (itemId: string, categoryId = 'snacks', storeId = 's1') => ({
  categoryId,
  itemId,
  storeId,
});
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);

test('mapping an item to a store makes it MRP; an exact repeat is a conflict', async () => {
  const { items, service } = setup([item('chips')]);

  const created = await service.create(map('chips'), actor);

  assert.equal(created?.isActive, true);
  assert.equal(items[0]?.itemType, ItemType.MRP);
  // The same item may sit under a second category in the same store.
  await assert.doesNotReject(service.create(map('chips', 'drinks'), actor));
  await assert.rejects(
    service.create(map('chips'), actor),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Store item mapping already exists for this category',
  );
});

test('a kitchen item, an inactive store or an inactive category cannot be mapped', async () => {
  const { service } = setup([item('chips'), item('thali', ItemType.READYMADE)]);

  await assert.rejects(
    service.create(map('thali'), actor),
    refusedWith(
      /^thali is a Readymade item \(mapped to kitchens\), so it cannot be mapped to a store\.$/,
    ),
  );
  await assert.rejects(
    service.create(map('chips', 'snacks', 's2'), actor),
    refusedWith(/^Store not found or inactive$/),
  );
  await assert.rejects(
    service.create(map('chips', 'old'), actor),
    refusedWith(/^This category is inactive and cannot be used\.$/),
  );
});

test('removing the last mapping of an item never received gives its type back', async () => {
  const { items, mappings, service } = setup([item('chips')]);
  await service.create(map('chips'), actor);
  await service.create(map('chips', 'drinks'), actor);

  await service.remove('map-1', actor);
  assert.equal(items[0]?.itemType, ItemType.MRP);
  await service.remove('map-2', actor);
  assert.equal(items[0]?.itemType, null);
  assert.deepEqual(
    mappings.map((mapping) => [Boolean(mapping.deletedAt), mapping.isActive]),
    [
      [true, false],
      [true, false],
    ],
  );
});

test('an item once received on a GRN stays MRP after its mapping is removed', async () => {
  const { items, service } = setup([item('chips')], [], ['chips']);
  await service.create(map('chips'), actor);

  await service.remove('map-1', actor);

  assert.equal(items[0]?.itemType, ItemType.MRP);
});

test('pointing a mapping at another item classifies the new one and releases the old one', async () => {
  const { items, service } = setup([item('chips'), item('nuts')]);
  await service.create(map('chips'), actor);

  const updated = await service.update('map-1', { itemId: 'nuts' }, actor);

  assert.equal(updated?.itemId, 'nuts');
  assert.deepEqual(
    items.map((stored) => [stored.id, stored.itemType]),
    [
      ['chips', null],
      ['nuts', ItemType.MRP],
    ],
  );
});

test('an edit into a mapping that already exists is a conflict, a no-op edit is not', async () => {
  const { service } = setup([item('chips')]);
  await service.create(map('chips'), actor);
  await service.create(map('chips', 'drinks'), actor);

  await assert.rejects(
    service.update('map-2', { categoryId: 'snacks' }, actor),
    (error: unknown) => error instanceof ConflictException,
  );
  await assert.doesNotReject(service.update('map-2', { categoryId: 'drinks' }, actor));
  assert.equal((await service.update('map-2', { isActive: false }, actor))?.isActive, false);
});
