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
    findByNormalizedName: (normalizedName: string, excludeId?: string) =>
      items.find((item) => item.normalizedName === normalizedName && item.id !== excludeId) ?? null,
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
const isDuplicate = (error: unknown) =>
  error instanceof ConflictException && error.message === 'An item with this name already exists';

test('an item name is used once in the whole catalogue', async () => {
  const service = serviceWith([]);

  await service.create(newItem('Samosa'), actor);
  await assert.rejects(service.create(newItem('SAMOSA '), actor), isDuplicate);
  await assert.doesNotReject(service.create(newItem('Kachori'), actor));
});

test('a rename is refused only when another item has that name', async () => {
  const items: StoredItem[] = [
    { categoryId: null, id: 'a', itemName: 'Samosa', normalizedName: 'samosa' },
    { categoryId: null, id: 'b', itemName: 'Kachori', normalizedName: 'kachori' },
  ];
  const service = serviceWith(items);

  await assert.rejects(service.update('b', { itemName: 'Samosa' }, actor), isDuplicate);
  // Saving an item without changing its name never clashes with itself.
  await assert.doesNotReject(service.update('a', { itemName: 'Samosa' }, actor));
  await assert.doesNotReject(service.update('b', { itemName: 'Vada' }, actor));
});

test('a refused item does not use up an item code', async () => {
  const service = serviceWith([]);

  const first = await service.create(newItem('Samosa'), actor);
  await assert.rejects(service.create(newItem('Samosa'), actor), isDuplicate);
  const next = await service.create(newItem('Kachori'), actor);

  assert.equal(first?.itemCode, 'ITM0001');
  assert.equal(next?.itemCode, 'ITM0002');
});
