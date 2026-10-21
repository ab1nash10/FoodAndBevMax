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
