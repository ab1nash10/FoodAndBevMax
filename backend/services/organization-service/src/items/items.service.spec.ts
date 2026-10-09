import { strict as assert } from 'node:assert';
import { ConflictException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

type StoredItem = { categoryId: string; id: string; itemName: string; normalizedName: string };

// Stands in for the repository: keeps items in memory and filters like the real queries.
function serviceWith(items: StoredItem[]) {
  // Like a Postgres sequence: every call takes a number, and none is ever given back.
  let sequence = 0;
  const withCategory = (item: StoredItem) => ({
    ...item,
    category: { categoryName: item.categoryId, id: item.categoryId, isActive: true },
    hospitalId: null,
    isActive: true,
  });
  const repository = {
    create: (data: StoredItem) => {
      const item = { ...data, id: `item-${items.length + 1}` };
      items.push(item);
      return withCategory(item);
    },
    findActiveById: (id: string) => {
      const item = items.find((stored) => stored.id === id);
      return item ? withCategory(item) : null;
    },
    findActiveCategory: (id: string) => ({ hospitalId: null, id, isActive: true }),
    findByCode: () => null,
    findByNormalizedName: (normalizedName: string, categoryId: string, excludeId?: string) =>
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
const newItem = (itemName: string, categoryId: string) =>
  ({ categoryId, itemName, itemType: 'MRP', type: 'VEG' }) as never;
const isDuplicate = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'Similar item already exists in this category';

test('the same item name may be used once in each category', async () => {
  const service = serviceWith([]);

  await service.create(newItem('Samosa', 'snacks'), actor);
  await assert.doesNotReject(service.create(newItem('samosa', 'sweets'), actor));
  await assert.rejects(service.create(newItem('SAMOSA ', 'snacks'), actor), isDuplicate);
});

test('an edit is refused only when it would repeat a name inside one category', async () => {
  const items: StoredItem[] = [
    { categoryId: 'snacks', id: 'a', itemName: 'Samosa', normalizedName: 'samosa' },
    { categoryId: 'sweets', id: 'b', itemName: 'Kachori', normalizedName: 'kachori' },
  ];
  const service = serviceWith(items);

  // Renaming the sweet to Samosa is fine: the other Samosa is a snack.
  await assert.doesNotReject(service.update('b', { itemName: 'Samosa' }, actor));
  // Moving it into Snacks would make two Samosas there.
  await assert.rejects(service.update('b', { categoryId: 'snacks' }, actor), isDuplicate);
  // Saving an item without changing its name or category never clashes with itself.
  await assert.doesNotReject(service.update('a', { itemName: 'Samosa' }, actor));
});

test('a refused item does not use up an item code', async () => {
  const service = serviceWith([]);

  const first = await service.create(newItem('Samosa', 'snacks'), actor);
  await assert.rejects(service.create(newItem('Samosa', 'snacks'), actor), isDuplicate);
  const next = await service.create(newItem('Kachori', 'snacks'), actor);

  assert.equal(first?.itemCode, 'ITM0001');
  assert.equal(next?.itemCode, 'ITM0002');
});
