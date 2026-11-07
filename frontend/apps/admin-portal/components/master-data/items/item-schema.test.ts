import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { itemSchema } from './item-schema';

const item = { hsnCode: '', isActive: true, itemName: 'Masala Dosa', preparationTimeMinutes: '', type: 'VEG' };
const messages = (values: object) =>
  itemSchema.safeParse(values).error?.issues.map((issue) => [issue.path[0], issue.message]) ?? [];

test('a valid item is trimmed and the prep time becomes a number, or nothing when blank', () => {
  assert.deepEqual(itemSchema.parse({ ...item, hsnCode: ' 2106 ', preparationTimeMinutes: ' 15 ' }), {
    ...item,
    hsnCode: '2106',
    preparationTimeMinutes: 15,
  });
  assert.equal(itemSchema.parse(item).preparationTimeMinutes, undefined);
});

test('name, food type, prep time and HSN each say what is wrong', () => {
  // Blank fails both name rules; the first is the one the create page shows.
  assert.deepEqual(messages({ ...item, itemName: ' ' })[0], ['itemName', 'Item name is required.']);
  assert.deepEqual(messages({ ...item, itemName: '***' }), [
    ['itemName', 'Item name must include at least one letter or number.'],
  ]);
  assert.deepEqual(messages({ ...item, type: '' }), [['type', 'Choose a food type.']]);
  assert.deepEqual(messages({ ...item, type: 'VEGAN' }), [['type', 'Choose a food type.']]);
  for (const time of ['1.5', '-5', 'ten']) {
    assert.deepEqual(messages({ ...item, preparationTimeMinutes: time }), [
      ['preparationTimeMinutes', 'Use a whole number.'],
    ]);
  }
  assert.deepEqual(messages({ ...item, hsnCode: '1'.repeat(51) }), [
    ['hsnCode', 'Use 50 characters or fewer.'],
  ]);
});
