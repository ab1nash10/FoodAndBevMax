import { strict as assert } from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantOrdersService } from './restaurant-orders.service';

interface OrderRow {
  channel: 'COUNTER' | 'ROOM' | null;
  status: 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';
  stewardId: string | null;
}

/** One order, and one steward (a Delivery Operator, steward-1) at its location. */
function setUp(row: Partial<OrderRow> = {}) {
  const order: OrderRow = { channel: 'ROOM', status: 'PLACED', stewardId: null, ...row };
  const updates: Array<Record<string, unknown>> = [];
  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    restaurant: {
      findFirst: () =>
        Promise.resolve({
          closingTime: null,
          counters: [],
          hospital: { hospitalName: 'Patparganj' },
          hospitalId: 'hospital-1',
          id: 'restaurant-1',
          isActive: true,
          location: null,
          offline: false,
          open24x7: true,
          openingTime: null,
          restaurantName: 'Ppg Main Restaurant',
        }),
    },
    restaurantOrder: {
      findFirst: () =>
        Promise.resolve({ acceptedAt: null, hospitalId: 'hospital-1', source: 'QR', ...order }),
      // Read back after saving, as saved.
      findFirstOrThrow: () => Promise.resolve({ id: 'order-1', ...order, ...updates.at(-1) }),
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        queries.push(where);
        return Promise.resolve([]);
      },
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve(data);
      },
      updateMany: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({ count: 1 });
      },
    },
    timeSlot: { findMany: () => Promise.resolve([]) },
    user: {
      findFirst: () => Promise.resolve({ id: 'steward-1' }),
      findMany: () => Promise.resolve([{ id: 'steward-1', name: 'Kunal' }]),
    },
  };
  const service = new RestaurantOrdersService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );

  return { queries, service, updates };
}

const admin = { actorId: 'admin' };

test('a steward takes room orders to the room; a counter order is picked up and gets none', async () => {
  const room = setUp({ channel: 'ROOM' });
  await room.service.setSteward('order-1', 'steward-1', admin);
  assert.equal(room.updates[0]?.stewardId, 'steward-1');

  const counter = setUp({ channel: 'COUNTER' });
  await assert.rejects(
    counter.service.setSteward('order-1', 'steward-1', admin),
    (error) => error instanceof ConflictException && /picked up at the counter/.test(error.message),
  );
  assert.equal(counter.updates.length, 0);

  // Taking one off is always allowed: a steward given to a counter order before this rule.
  await counter.service.setSteward('order-1', null, admin);
  assert.equal(counter.updates[0]?.stewardId, null);
});

test('a room order is marked delivered only once a steward has it; a counter order needs none', async () => {
  const unassigned = setUp({ channel: 'ROOM', status: 'READY' });
  await assert.rejects(
    unassigned.service.setStatus('order-1', 'COLLECTED', admin),
    (error) => error instanceof ConflictException && /steward/.test(error.message),
  );
  assert.equal(unassigned.updates.length, 0);

  const assigned = setUp({ channel: 'ROOM', status: 'READY', stewardId: 'steward-1' });
  await assigned.service.setStatus('order-1', 'COLLECTED', admin);
  assert.equal(assigned.updates[0]?.status, 'COLLECTED');

  const counter = setUp({ channel: 'COUNTER', status: 'READY' });
  await counter.service.setStatus('order-1', 'COLLECTED', admin);
  assert.equal(counter.updates[0]?.status, 'COLLECTED');
});

test('a steward sees the room orders given to them, and marks only their own delivered', async () => {
  const { queries, service, updates } = setUp({ status: 'READY', stewardId: 'steward-1' });

  await service.myDeliveries('steward-1');
  assert.equal(queries[0]?.stewardId, 'steward-1');
  assert.equal(queries[0]?.channel, 'ROOM');

  // Someone else's order is not theirs to hand over: it is not even found.
  await assert.rejects(
    service.markDelivered('order-1', { actorId: 'steward-2' }),
    NotFoundException,
  );
  assert.equal(updates.length, 0);

  await service.markDelivered('order-1', { actorId: 'steward-1' });
  assert.equal(updates[0]?.status, 'COLLECTED');

  // Still in the kitchen: nothing to hand over yet.
  const cooking = setUp({ status: 'PREPARING', stewardId: 'steward-1' });
  await assert.rejects(
    cooking.service.markDelivered('order-1', { actorId: 'steward-1' }),
    (error) => error instanceof ConflictException && /not ready/.test(error.message),
  );
});

test('the pickup TV board leaves room and table orders off: nobody collects them at the counter', async () => {
  const { queries, service } = setUp();

  await service.board('restaurant-1', 'board-token');

  // Orders with no channel (sent by other apps) stay on the board.
  assert.deepEqual(queries[0]?.OR, [{ channel: null }, { channel: { notIn: ['ROOM', 'TABLE'] } }]);
});
