// node --test lib/*.test.ts (Node strips the types itself).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newAlerts } from './alerts.ts';
import type { Delivery } from './types.ts';

const order = (patch: Partial<Delivery>): Delivery => ({
  bedNumber: 'B',
  deliveredAt: null,
  id: 'o-1',
  instructions: null,
  items: [{ name: 'Veg thali', quantity: 2 }],
  orderNumber: '0142',
  placedAt: '2026-11-23T06:30:00.000Z',
  readyAt: '2026-11-23T06:45:00.000Z',
  restaurantName: 'BLK Main Restaurant',
  roomNumber: '304',
  status: 'READY',
  stewardAssignedAt: '2026-11-23T06:31:00.000Z',
  undeliveredAt: null,
  undeliveredReason: null,
  ...patch,
});
const ready = order({});
const cooking = order({ id: 'o-2', orderNumber: '0147', readyAt: null, status: 'PREPARING' });

test('rings for a new order and for one turning ready, never for what was already known', () => {
  assert.deepEqual(newAlerts(undefined, [ready]), []);
  assert.deepEqual(newAlerts([ready], [ready]), []);
  assert.deepEqual(newAlerts([ready], [ready, cooking]), [{ kind: 'new', order: cooking }]);

  const nowReady = { ...cooking, status: 'READY' as const };
  assert.deepEqual(newAlerts([cooking], [nowReady]), [{ kind: 'ready', order: nowReady }]);
  // Given to them already cooked: one ring, to go and take it.
  assert.deepEqual(newAlerts([], [ready]), [{ kind: 'ready', order: ready }]);
  // Given back, then given to them again.
  const givenBack = { ...ready, undeliveredReason: 'Patient not in room' };
  assert.deepEqual(newAlerts([givenBack], [ready]), [{ kind: 'ready', order: ready }]);
  // Delivered or given back: nothing to ring for.
  assert.deepEqual(newAlerts([ready], [{ ...ready, status: 'COLLECTED' }]), []);
});
