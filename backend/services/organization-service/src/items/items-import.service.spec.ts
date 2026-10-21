import { strict as assert } from 'node:assert';
import { FoodType, type Item } from '@prisma/client';
import { test } from 'vitest';
import { planItemImport } from './items-import.service';

const samosa = {
  hsnCode: '2106',
  id: 'item-1',
  isActive: true,
  itemCode: 'ITM0001',
  itemName: 'Samosa',
  normalizedName: 'samosa',
  preparationTimeMinutes: 10,
  type: FoodType.VEG,
} as Item;
const everything = { permissions: ['ITEM_CREATE', 'ITEM_UPDATE'] };

test('a code updates that item, no code adds one, and an unchanged row is skipped', async () => {
  const plan = await planItemImport(
    [
      { itemCode: 'itm0001', itemName: 'Samosa', type: 'Veg', preparationTimeMinutes: '12' },
      { itemName: 'masala dosa', type: 'non veg', isActive: 'Inactive' },
    ],
    [samosa],
    everything,
  );

  assert.deepEqual(
    plan.rows.map((row) => row.action),
    ['update', 'create'],
  );
  assert.equal(plan.updates[0]?.data.preparationTimeMinutes, 12);
  // Blank HSN keeps the item's own.
  assert.equal(plan.updates[0]?.data.hsnCode, undefined);
  assert.deepEqual(plan.creates[0], {
    hsnCode: undefined,
    isActive: false,
    itemName: 'Masala Dosa',
    normalizedName: 'masaladosa',
    preparationTimeMinutes: undefined,
    type: FoodType.NON_VEG,
  });

  const unchanged = await planItemImport(
    [{ itemCode: 'ITM0001', itemName: 'Samosa', type: 'Veg' }],
    [samosa],
    everything,
  );

  assert.deepEqual(unchanged.rows, [{ action: 'skip', errors: [] }]);
});

test('each row says what is wrong with it, by column', async () => {
  const plan = await planItemImport(
    [
      { itemName: '', type: '' },
      { itemCode: 'ITM9999', itemName: 'Kachori', type: 'Veg' },
      { itemName: 'SAMOSA!', type: 'Veg' },
      { itemName: 'Vada', type: 'Spicy', preparationTimeMinutes: '1.5', isActive: 'maybe' },
      { itemName: 'Pav', type: 'Veg' },
      { itemName: 'pav', type: 'Veg' },
    ],
    [samosa],
    everything,
  );

  assert.deepEqual(
    plan.rows.map((row) => row.errors),
    [
      ['Item name is required', 'Food type is required'],
      ['No item has code ITM9999; leave Item code blank to add a new item'],
      ['An item with this name already exists (ITM0001)'],
      [
        'Food type must be Veg, Non-veg or Egg',
        'Status must be Active or Inactive',
        'Prep time (min) must be an integer number',
      ],
      [],
      ['Row 6 has the same item name'],
    ],
  );
  assert.equal(plan.creates.length, 1, 'only the valid row is planned');
});

test('adding needs the create permission and changing the update one', async () => {
  const rows = [
    { itemCode: 'ITM0001', itemName: 'Samosa', type: 'Egg' },
    { itemName: 'Kachori', type: 'Veg' },
  ];
  const updateOnly = await planItemImport(rows, [samosa], { permissions: ['ITEM_UPDATE'] });

  assert.deepEqual(
    updateOnly.rows.map((row) => row.errors),
    [[], ["You can't add items; this row would add one"]],
  );
});
