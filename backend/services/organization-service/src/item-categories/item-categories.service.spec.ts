import { strict as assert } from 'node:assert';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import { Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { ItemCategoriesRepository } from './item-categories.repository';
import { ItemCategoriesService } from './item-categories.service';

type StoredCategory = {
  categoryName: string;
  deletedAt: Date | null;
  id: string;
  isActive: boolean;
  normalizedName: string;
  sortOrder: number;
};

// Stands in for the repository and transaction: categories live in memory; `failCreateWith`
// makes the insert throw that error.
function serviceWith(categories: StoredCategory[] = [], world: { failCreateWith?: Error } = {}) {
  const written: string[] = [];
  const live = () => categories.filter((category) => !category.deletedAt);
  const tx = {
    itemCategory: {
      aggregate: () => ({
        _max: { sortOrder: live().length ? Math.max(...live().map((c) => c.sortOrder)) : null },
      }),
      findMany: () =>
        live()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName))
          .map(({ id, sortOrder }) => ({ id, sortOrder })),
      update: ({ data, where }: { data: { sortOrder: number }; where: { id: string } }) => {
        written.push(where.id);
        Object.assign(
          categories.find((category) => category.id === where.id)!,
          data,
        );
      },
    },
  };
  const repository = {
    create: (data: Omit<StoredCategory, 'deletedAt' | 'id'>) => {
      if (world.failCreateWith) {
        throw world.failCreateWith;
      }

      const category = { ...data, deletedAt: null, id: `category-${categories.length + 1}` };
      categories.push(category);
      return { ...category };
    },
    findActiveById: (id: string) => {
      const category = live().find((stored) => stored.id === id);
      return category ? { ...category } : null;
    },
    // Like the real query: deleted categories still count.
    findByNormalizedName: (normalizedName: string, excludeId?: string) =>
      categories.find(
        (category) => category.normalizedName === normalizedName && category.id !== excludeId,
      ) ?? null,
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (id: string, data: Partial<StoredCategory>) => {
      const category = categories.find((stored) => stored.id === id)!;
      Object.assign(category, data);
      return { ...category };
    },
  };
  const service = new ItemCategoriesService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as ItemCategoriesRepository,
  );

  return { service, written };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const category = (
  id: string,
  sortOrder: number,
  deletedAt: Date | null = null,
): StoredCategory => ({
  categoryName: id,
  deletedAt,
  id,
  isActive: true,
  normalizedName: id.toLowerCase(),
  sortOrder,
});
const isSimilar = (error: unknown) =>
  error instanceof ConflictException && error.message === 'Similar category already exists';
const orderOf = (categories: StoredCategory[]) =>
  [...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id);

test('category names clash when they differ only in case, spaces or punctuation', async () => {
  const { service } = serviceWith();

  const created = await service.create({ categoryName: 'Hot Beverages' }, actor);
  await assert.rejects(service.create({ categoryName: 'hot-beverages!' }, actor), isSimilar);
  await assert.rejects(service.create({ categoryName: ' HOT_BEVERAGES ' }, actor), isSimilar);
  // Renaming a category to a spelling of its own name is not a clash.
  await assert.doesNotReject(service.update(created.id, { categoryName: 'Hot  Beverages' }, actor));
  await assert.doesNotReject(service.create({ categoryName: 'Cold Beverages' }, actor));
});

test('a new category goes after the last live one', async () => {
  const { service } = serviceWith([
    category('a', 1),
    category('b', 4),
    category('gone', 9, new Date()),
  ]);

  const created = await service.create({ categoryName: 'Snacks' }, actor);

  assert.equal(created?.sortOrder, 5);
  assert.equal(
    (await serviceWith().service.create({ categoryName: 'First' }, actor))?.sortOrder,
    1,
  );
});

test('a database clash on the normalised name reads as a similar category', async () => {
  const clash = (target: string) =>
    new Prisma.PrismaClientKnownRequestError('failed', {
      clientVersion: 'test',
      code: 'P2002',
      meta: { target: [target] },
    });

  await assert.rejects(
    serviceWith([], { failCreateWith: clash('normalized_name') }).service.create(
      { categoryName: 'Snacks' },
      actor,
    ),
    isSimilar,
  );
  await assert.rejects(
    serviceWith([], { failCreateWith: clash('category_name') }).service.create(
      { categoryName: 'Snacks' },
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Item category already exists',
  );
});

test('reordering puts the listed categories first and the rest after, in their old order', async () => {
  const categories = [category('a', 1), category('b', 2), category('c', 3), category('d', 4)];
  const { service, written } = serviceWith(categories);

  await service.reorder({ ids: ['c', 'a'] }, actor);

  assert.deepEqual(orderOf(categories), ['c', 'a', 'b', 'd']);
  // Only the categories whose place changed are written: d stays 4th.
  assert.deepEqual(written, ['c', 'a', 'b']);
});

test('a reorder naming an unknown or deleted category changes nothing', async () => {
  const categories = [category('a', 1), category('b', 2), category('gone', 3, new Date())];
  const { service, written } = serviceWith(categories);

  await assert.rejects(
    service.reorder({ ids: ['b', 'gone'] }, actor),
    (error: unknown) =>
      error instanceof NotFoundException && error.message === 'Item category not found: gone',
  );
  assert.deepEqual(written, []);
  assert.deepEqual(orderOf(categories.slice(0, 2)), ['a', 'b']);
});

test('only a user who reaches every location may add, change or reorder categories', async () => {
  const categories = [category('a', 1), category('b', 2)];
  const { service, written } = serviceWith(categories);
  const isRefused = (error: unknown) =>
    error instanceof ForbiddenException &&
    error.message === 'Only a Super Admin can change item categories shared by every location';

  // Categories have no location: every location's menus use the same list.
  await hospitalScopeStorage.run({ allowedHospitalIds: ['hospital-a'] }, async () => {
    await assert.rejects(service.create({ categoryName: 'Snacks' }, actor), isRefused);
    await assert.rejects(service.update('a', { isActive: false }, actor), isRefused);
    await assert.rejects(service.reorder({ ids: ['b', 'a'] }, actor), isRefused);
  });
  assert.deepEqual(written, []);
  assert.equal(categories.length, 2);

  await hospitalScopeStorage.run({ allowedHospitalIds: null }, async () => {
    await assert.doesNotReject(service.reorder({ ids: ['b', 'a'] }, actor));
    await assert.doesNotReject(service.create({ categoryName: 'Snacks' }, actor));
  });
});
