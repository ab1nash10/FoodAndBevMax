import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readScope } from './hospital-scope.store';

const allowed = ['hospital-a'];

void test('a location-owned record is visible only at the user locations', () => {
  assert.deepEqual(readScope('Grn', allowed), { hospitalId: { in: allowed } });
});

void test('a shared master stays visible everywhere, a location one only there', () => {
  for (const model of ['Employee', 'Item', 'ItemCategory', 'TimeSlot']) {
    assert.deepEqual(readScope(model, allowed), {
      OR: [{ hospitalId: null }, { hospitalId: { in: allowed } }],
    });
  }
});

void test('mappings follow their store or kitchen; unrelated models are left alone', () => {
  assert.deepEqual(readScope('StoreItem', allowed), { store: { hospitalId: { in: allowed } } });
  assert.equal(readScope('Hospital', allowed), null);
});
