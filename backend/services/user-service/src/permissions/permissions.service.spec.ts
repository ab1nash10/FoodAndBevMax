import { strict as assert } from 'node:assert';
import { test, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { PermissionsService } from './permissions.service';

test('the permission list filters case-insensitively, hides deleted rows and pages', async () => {
  const row = {
    action: 'VIEW',
    code: 'KOT_VIEW',
    createdAt: new Date(),
    description: null,
    id: 'perm-1',
    module: 'KOT',
    updatedAt: new Date(),
  };
  const findMany = vi.fn((_args: object) => Promise.resolve([row]));
  const count = vi.fn((_args: object) => Promise.resolve(41));
  const prisma = {
    $transaction: (queries: Array<Promise<unknown>>) => Promise.all(queries),
    permission: { count, findMany },
  };
  const service = new PermissionsService(prisma as unknown as PrismaService);

  const result = await service.list({
    action: 'view',
    limit: 20,
    module: 'kot',
    page: 3,
    search: 'ko',
  });

  assert.deepEqual(result.items, [row]);
  assert.deepEqual(result.meta, { limit: 20, page: 3, total: 41, totalPages: 3 });
  const args = findMany.mock.calls[0]?.[0] as { skip: number; take: number; where: object };
  assert.equal(args.skip, 40);
  assert.equal(args.take, 20);
  assert.deepEqual(args.where, {
    action: { equals: 'view', mode: 'insensitive' },
    deletedAt: null,
    module: { equals: 'kot', mode: 'insensitive' },
    OR: ['code', 'module', 'action', 'description'].map((field) => ({
      [field]: { contains: 'ko', mode: 'insensitive' },
    })),
  });
  assert.deepEqual(
    count.mock.calls[0]?.[0],
    { where: args.where },
    'the total counts the same rows',
  );

  // No filters: every live permission, first page of 20.
  await service.list({});
  assert.deepEqual(findMany.mock.calls[1]?.[0], {
    orderBy: [{ module: 'asc' }, { action: 'asc' }, { code: 'asc' }],
    skip: 0,
    take: 20,
    where: { deletedAt: null },
  });
});

// A fake Prisma whose $transaction runs the page and count queries it is handed.
function serviceWith(rows: object[], total: number) {
  const findMany = vi.fn((_args: { where: object }) => Promise.resolve(rows));
  const count = vi.fn((_args: object) => Promise.resolve(total));
  const transaction = vi.fn((queries: Array<Promise<unknown>>) => Promise.all(queries));
  const prisma = { $transaction: transaction, permission: { count, findMany } };

  return {
    findMany,
    service: new PermissionsService(prisma as unknown as PrismaService),
    transaction,
  };
}

test('each permission filter narrows the list on its own', async () => {
  const { findMany, service } = serviceWith([], 0);

  await service.list({ action: 'Create' });
  await service.list({ module: 'Menu' });
  await service.list({ search: 'menu' });

  assert.deepEqual(
    findMany.mock.calls.map(([args]) => args.where),
    [
      { action: { equals: 'Create', mode: 'insensitive' }, deletedAt: null },
      { deletedAt: null, module: { equals: 'Menu', mode: 'insensitive' } },
      {
        deletedAt: null,
        OR: ['code', 'module', 'action', 'description'].map((field) => ({
          [field]: { contains: 'menu', mode: 'insensitive' },
        })),
      },
    ],
  );
});

test('the page of permissions and their total are read in one transaction', async () => {
  const { service, transaction } = serviceWith([], 0);

  await service.list({ limit: 5, page: 2 });

  assert.equal(transaction.mock.calls.length, 1);
  assert.equal(transaction.mock.calls[0]?.[0].length, 2);
});

test('a permission goes out with its public fields only', async () => {
  const createdAt = new Date('2026-10-01T00:00:00Z');
  const { service } = serviceWith(
    [
      {
        action: 'UPDATE',
        code: 'MENU_UPDATE',
        createdAt,
        createdBy: 'seed',
        deletedAt: null,
        description: 'Change menus',
        id: 'perm-2',
        module: 'MENU',
        updatedAt: createdAt,
      },
    ],
    1,
  );

  const { items } = await service.list({});

  assert.deepEqual(items, [
    {
      action: 'UPDATE',
      code: 'MENU_UPDATE',
      createdAt,
      description: 'Change menus',
      id: 'perm-2',
      module: 'MENU',
      updatedAt: createdAt,
    },
  ]);
});

test('the page count rounds up, and no permissions means no pages', async () => {
  const pages = async (total: number) =>
    (await serviceWith([], total).service.list({ limit: 20 })).meta.totalPages;

  assert.deepEqual(await Promise.all([0, 1, 20, 21, 40].map(pages)), [0, 1, 1, 2, 2]);
});
