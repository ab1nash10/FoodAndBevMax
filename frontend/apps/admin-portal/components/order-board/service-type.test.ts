import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import type { BoardOrder } from '@/lib/order-board/rules';
import { orderDetails } from './service-type';

const order = (extra: Partial<BoardOrder>): BoardOrder => ({
  itemCount: 0,
  orderNumber: 'A 1',
  status: 'PREPARING',
  ...extra,
});

test('the order line says how it is served and how many items, from what it has', () => {
  assert.equal(orderDetails(order({ itemCount: 3, serviceType: 'DINE_IN' })), 'Eat here · 3 items');
  assert.equal(orderDetails(order({ itemCount: 1, serviceType: 'TAKE_AWAY' })), 'Take away · 1 item');
  assert.equal(orderDetails(order({ itemCount: 2 })), '2 items');
  assert.equal(orderDetails(order({ serviceType: 'DINE_IN' })), 'Eat here');
  assert.equal(orderDetails(order({})), '');
});
