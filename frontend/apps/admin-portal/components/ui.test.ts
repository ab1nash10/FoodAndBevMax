import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isCodeField, isNameField } from './ui';

test('name fields follow the naming convention; technical ones are left alone', () => {
  for (const key of [
    'name',
    'itemName',
    'storeName',
    'restaurantName',
    'categoryName',
    'bankName',
  ]) {
    assert.equal(isNameField(key), true, key);
  }

  for (const key of [
    undefined,
    '',
    'hostName',
    'username',
    'userName',
    'email',
    'item-name',
    'storeCode',
  ]) {
    assert.equal(isNameField(key), false, String(key));
  }

  assert.equal(isCodeField('storeCode'), true);
  assert.equal(isCodeField('hsnCode'), true);
  assert.equal(isCodeField('postalCode'), false);
  assert.equal(isCodeField('pinelabMerchantStorePosCode'), false);
  assert.equal(isCodeField('code'), false);
});

test('a field inside a list (users.0.hostName) is judged by its own name', () => {
  // A user's computer name typed in a POS device's list of users stays exactly as typed.
  assert.equal(isNameField('users.0.hostName'), false);
  assert.equal(isCodeField('lines.3.postalCode'), false);
  assert.equal(isNameField('shiftTimings.1.name'), true);
  assert.equal(isNameField('lines.0.itemName'), true);
  assert.equal(isCodeField('counters.2.counterCode'), true);
});
