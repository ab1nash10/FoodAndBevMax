import { strict as assert } from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantOrdersService } from './restaurant-orders.service';

interface OrderRow {
  channel: 'COUNTER' | 'ROOM' | null;
  status: 'CANCELLED' | 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';
  stewardId: string | null;
}

/**
 * One order, and one steward (a Delivery Operator, steward-1) at its location. matches: rows a
 * conditional write finds (0: someone else changed the order since it was read).
 */
function setUp(row: Partial<OrderRow> = {}, matches = 1) {
  const order: OrderRow = { channel: 'ROOM', status: 'PLACED', stewardId: null, ...row };
  const updates: Array<Record<string, unknown>> = [];
  const conditions: Array<Record<string, unknown>> = [];
  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    // Orders pushed with a restaurant's own order key.
    posDevice: { findFirst: () => Promise.resolve(null) },
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
      findUnique: () => Promise.resolve({ status: order.status }),
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve(data);
      },
      updateMany: ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
      }) => {
        updates.push(data);
        conditions.push(where);
        return Promise.resolve({ count: matches });
      },
      upsert: ({ update }: { update: Record<string, unknown> }) => {
        updates.push(update);
        return Promise.resolve({ id: 'order-1', ...order, ...update });
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

  return { conditions, queries, service, updates };
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

test('every cancel says when it happened; an order sent back from ready is no longer ready', async () => {
  const kitchen = setUp({ channel: 'COUNTER', status: 'PREPARING' });
  await kitchen.service.setStatus('order-1', 'CANCELLED', admin);
  assert.ok(kitchen.updates[0]?.cancelledAt instanceof Date);

  const cancel = { orderId: 'ext-1', orderNumber: 'A-1', status: 'CANCELLED' as const };
  const external = setUp({ status: 'PLACED' });
  await external.service.pushOrder('order-key', cancel);
  assert.ok(external.updates[0]?.cancelledAt instanceof Date);

  // A retried cancel keeps the time of the first.
  const retried = setUp({ status: 'CANCELLED' });
  await retried.service.pushOrder('order-key', cancel);
  assert.equal(retried.updates[0]?.cancelledAt, undefined);

  const sentBack = setUp({ status: 'READY' });
  await sentBack.service.setStatus('order-1', 'PREPARING', admin);
  assert.equal(sentBack.updates[0]?.readyAt, null);
});

test('a steward is given only on the order as it was read: a change in between is refused', async () => {
  const { conditions, service } = setUp({ channel: 'ROOM', status: 'READY' });
  await service.setSteward('order-1', 'steward-1', admin);
  assert.deepEqual(conditions[0], {
    id: 'order-1',
    status: { notIn: ['COLLECTED', 'CANCELLED'] },
    stewardId: null,
  });

  const raced = setUp({ channel: 'ROOM', status: 'READY' }, 0);
  await assert.rejects(
    raced.service.setSteward('order-1', 'steward-1', admin),
    (error) =>
      error instanceof ConflictException && /Someone else just updated/.test(error.message),
  );
});
