import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantsRepository } from './restaurants.repository';

type Mapping = { id: string; kitchenId: string };
type Call = { data: unknown; where?: unknown };

// Only the Prisma calls these repository methods make; each write is recorded per table.
function prismaWith(mappings: Mapping[] = [], sequenceRows: unknown[] = []) {
  const writes: Record<string, Call[]> = {};
  const record = (table: string, op: string) => (call: Call) => {
    (writes[`${table}.${op}`] ??= []).push(call);
    return Promise.resolve({ count: 0 });
  };
  const prisma = {
    $queryRaw: () => Promise.resolve(sequenceRows),
    counter: { updateMany: record('counter', 'updateMany') },
    posDeviceRestaurant: { updateMany: record('posDeviceRestaurant', 'updateMany') },
    restaurantKitchen: {
      createMany: record('restaurantKitchen', 'createMany'),
      findMany: () => Promise.resolve(mappings),
      updateMany: record('restaurantKitchen', 'updateMany'),
    },
  } as unknown as PrismaService;

  return { prisma, repository: new RestaurantsRepository(prisma), writes };
}

test('re-mapping kitchens revives kept ones, retires dropped ones and adds only new ones', async () => {
  const { prisma, repository, writes } = prismaWith([
    { id: 'm1', kitchenId: 'k1' },
    { id: 'm2', kitchenId: 'k2' },
  ]);

  await repository.syncKitchens('r1', ['k2', 'k3'], 'user-1', prisma);

  const [kept, dropped] = writes['restaurantKitchen.updateMany']!;
  assert.deepEqual(kept, {
    data: { deletedAt: null, isActive: true, updatedBy: 'user-1' },
    where: { id: { in: ['m2'] } },
  });
  assert.deepEqual(dropped?.where, { id: { in: ['m1'] } });
  assert.equal((dropped?.data as { isActive: boolean }).isActive, false);
  assert.ok((dropped?.data as { deletedAt: Date }).deletedAt instanceof Date);
  assert.deepEqual(writes['restaurantKitchen.createMany'], [
    {
      data: [{ createdBy: 'user-1', kitchenId: 'k3', restaurantId: 'r1', updatedBy: 'user-1' }],
    },
  ]);
});

test('re-mapping to the same kitchens, or none to none, adds nothing', async () => {
  const same = prismaWith([{ id: 'm1', kitchenId: 'k1' }]);
  await same.repository.syncKitchens('r1', ['k1'], 'user-1', same.prisma);
  assert.equal(same.writes['restaurantKitchen.updateMany']?.length, 1);
  assert.equal(same.writes['restaurantKitchen.createMany'], undefined);

  const empty = prismaWith();
  await empty.repository.syncKitchens('r1', [], 'user-1', empty.prisma);
  assert.deepEqual(empty.writes, {});
});

test("retiring a restaurant's links switches off its kitchen, POS and counter rows at one time", async () => {
  const { prisma, repository, writes } = prismaWith();
  const deletedAt = new Date('2026-11-01T10:00:00Z');

  await repository.softDeleteCounters('r1', { deletedAt, updatedBy: 'user-1' }, prisma);

  for (const table of ['restaurantKitchen', 'posDeviceRestaurant', 'counter']) {
    assert.deepEqual(
      writes[`${table}.updateMany`],
      [
        {
          data: { deletedAt, isActive: false, updatedBy: 'user-1' },
          where: { deletedAt: null, restaurantId: 'r1' },
        },
      ],
      table,
    );
  }
});

test('the code sequence value arrives as a number, and as 0 when the database returns none', async () => {
  const big = prismaWith([], [{ nextValue: 42n }]);
  assert.equal(await big.repository.getNextRestaurantCodeSequenceValue(big.prisma), 42);

  // 0 is what makes the service refuse to make up a code.
  const none = prismaWith([], []);
  assert.equal(await none.repository.getNextRestaurantCodeSequenceValue(none.prisma), 0);
});
