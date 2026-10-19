import { strict as assert } from 'node:assert';
import { ConflictException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

type StoredItem = {
  categoryId: string | null;
  id: string;
  itemName: string;
  normalizedName: string;
};

// Stands in for the repository: keeps items in memory and filters like the real queries.
function serviceWith(items: StoredItem[]) {
  // Like a Postgres sequence: every call takes a number, and none is ever given back.
  let sequence = 0;
  const withCategory = (item: StoredItem) => ({
    ...item,
    category: item.categoryId
      ? { categoryName: item.categoryId, id: item.categoryId, isActive: true }
      : null,
    hospitalId: null,
    isActive: true,
  });
  const repository = {
    create: (data: Omit<StoredItem, 'categoryId' | 'id'>) => {
      const item = { ...data, categoryId: null, id: `item-${items.length + 1}` };
      items.push(item);
      return withCategory(item);
    },
    findActiveById: (id: string) => {
      const item = items.find((stored) => stored.id === id);
      return item ? withCategory(item) : null;
    },
    findActiveCategory: (id: string) => ({ hospitalId: null, id, isActive: true }),
    findByCode: () => null,
    findByNormalizedName: (normalizedName: string, categoryId: string | null, excludeId?: string) =>
      items.find(
        (item) =>
          item.normalizedName === normalizedName &&
          item.categoryId === categoryId &&
          item.id !== excludeId,
      ) ?? null,
    getNextItemCodeSequenceValue: () => (sequence += 1),
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (
      id: string,
      data: { category?: { connect: { id: string } }; itemName?: string; normalizedName?: string },
    ) => {
      const item = items.find((stored) => stored.id === id)!;
      item.categoryId = data.category?.connect.id ?? item.categoryId;
      item.itemName = data.itemName ?? item.itemName;
      item.normalizedName = data.normalizedName ?? item.normalizedName;
      return withCategory(item);
    },
  };
  const auditLog = { record: () => Promise.resolve() };

  return new ItemsService(
    auditLog as unknown as AuditLogService,
    repository as unknown as ItemsRepository,
  );
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const newItem = (itemName: string) => ({ itemName, type: 'VEG' }) as never;
const isDuplicateInCategory = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'Similar item already exists in this category';
const isDuplicateUnmapped = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'An item with this name already exists and is waiting to be mapped';

test('a new item has no category or type until it is mapped, and is not entered twice', async () => {
  const service = serviceWith([]);

  const created = await service.create(newItem('Samosa'), actor);
  assert.equal(created?.categoryId, null);
  assert.equal(created?.category, null);
  await assert.rejects(service.create(newItem('SAMOSA '), actor), isDuplicateUnmapped);
  await assert.doesNotReject(service.create(newItem('Kachori'), actor));
});

test('a rename is refused only when it would repeat a name inside its category', async () => {
  const items: StoredItem[] = [
    { categoryId: 'snacks', id: 'a', itemName: 'Samosa', normalizedName: 'samosa' },
    { categoryId: 'sweets', id: 'b', itemName: 'Kachori', normalizedName: 'kachori' },
    { categoryId: 'snacks', id: 'c', itemName: 'Vada', normalizedName: 'vada' },
  ];
  const service = serviceWith(items);

  // Renaming the sweet to Samosa is fine: the other Samosa is a snack.
  await assert.doesNotReject(service.update('b', { itemName: 'Samosa' }, actor));
  // Renaming the other snack to Samosa would make two Samosas in Snacks.
  await assert.rejects(service.update('c', { itemName: 'Samosa' }, actor), isDuplicateInCategory);
  // Saving an item without changing its name never clashes with itself.
  await assert.doesNotReject(service.update('a', { itemName: 'Samosa' }, actor));
});

test('a refused item does not use up an item code', async () => {
  const service = serviceWith([]);

  const first = await service.create(newItem('Samosa'), actor);
  await assert.rejects(service.create(newItem('Samosa'), actor), isDuplicateUnmapped);
  const next = await service.create(newItem('Kachori'), actor);

  assert.equal(first?.itemCode, 'ITM0001');
  assert.equal(next?.itemCode, 'ITM0002');
});
