import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertCanMoveStockFrom,
  assertSupportedSource,
  dispatchTransactionType,
  sourceItemType,
} from './transfers.helpers';

test('a restaurant passes on READYMADE leftovers, logged as its own movement', () => {
  assert.equal(sourceItemType('RESTAURANT'), 'READYMADE');
  assert.equal(sourceItemType('KITCHEN'), 'READYMADE');
  assert.equal(sourceItemType('STORE'), 'MRP');
  assert.equal(dispatchTransactionType('RESTAURANT'), 'RESTAURANT_TRANSFER_OUT');
  assert.doesNotThrow(() => assertSupportedSource('RESTAURANT'));
  assert.throws(() => assertSupportedSource('COUNTER'));
});

test('restaurant staff may send from a restaurant only', () => {
  const staff = ['RESTAURANT_TRANSFER_SEND'];

  assert.doesNotThrow(() => assertCanMoveStockFrom('RESTAURANT', 'CREATE', staff));
  assert.doesNotThrow(() => assertCanMoveStockFrom('RESTAURANT', 'DISPATCH', staff));
  assert.throws(() => assertCanMoveStockFrom('STORE', 'CREATE', staff));
  assert.throws(() => assertCanMoveStockFrom('KITCHEN', 'DISPATCH', staff));
  assert.doesNotThrow(() => assertCanMoveStockFrom('RESTAURANT', 'CREATE', ['TRANSFER_CREATE']));
});
