import { strict as assert } from 'node:assert';
import { MenuServeAt, Prisma, type RestaurantMenu } from '@prisma/client';
import { test } from 'vitest';
import { planMenuImport, type MenuImportLookups } from './restaurant-menus-import.service';

const restaurant = (id: string, hospitalId: string, hospitalCode: string) => ({
  hospital: { hospitalCode, isActive: true },
  hospitalId,
  id,
  isActive: true,
  restaurantCode: 'RES0001',
  restaurantName: `Cafe ${hospitalCode}`,
});
const samosaOnMenu = {
  categoryId: 'snacks',
  gstPercent: new Prisma.Decimal(5),
  hospitalId: 'h1',
  id: 'menu-1',
  isActive: true,
  isAvailable: true,
  isDiscountable: false,
  isGstInclusive: false,
  itemId: 'samosa',
  kitchenId: 'k1',
  price: new Prisma.Decimal(40),
  restaurantId: 'r1',
  roomPrice: new Prisma.Decimal(60),
  serveAt: MenuServeAt.BOTH,
  storeId: null,
} as unknown as RestaurantMenu;
const lookups: MenuImportLookups = {
  categories: [
    { categoryName: 'Snacks', id: 'snacks', isActive: true, normalizedName: 'snacks' },
    { categoryName: 'Beverages', id: 'drinks', isActive: true, normalizedName: 'beverages' },
  ],
  items: [
    { id: 'samosa', isActive: true, itemCode: 'ITM0001', itemName: 'Samosa' },
    { id: 'tea', isActive: true, itemCode: 'ITM0002', itemName: 'Tea' },
    { id: 'coke', isActive: true, itemCode: 'ITM0003', itemName: 'Coke' },
    { id: 'vada', isActive: true, itemCode: 'ITM0004', itemName: 'Vada' },
  ],
  kitchens: [{ hospitalId: 'h1', id: 'k1', kitchenCode: 'KIT0001' }],
  menus: [samosaOnMenu],
  restaurants: [restaurant('r1', 'h1', 'SKT'), restaurant('r2', 'h2', 'VSL')],
  sources: [
    { categoryId: 'snacks', hospitalId: 'h1', itemId: 'samosa', kitchenId: 'k1', storeId: null },
    { categoryId: 'drinks', hospitalId: 'h1', itemId: 'tea', kitchenId: 'k1', storeId: null },
    // Coke is stocked two ways at h1, so a row has to say which.
    { categoryId: 'drinks', hospitalId: 'h1', itemId: 'coke', kitchenId: null, storeId: 's1' },
    { categoryId: 'snacks', hospitalId: 'h1', itemId: 'coke', kitchenId: null, storeId: 's1' },
  ],
  stores: [{ hospitalId: 'h1', id: 's1', storeCode: 'STR0001' }],
};
const everything = { permissions: ['RESTAURANT_MENU_CREATE', 'RESTAURANT_MENU_UPDATE'] };
const at = (cells: Record<string, string>) => ({
  itemCode: 'ITM0001',
  locationCode: 'SKT',
  restaurantCode: 'RES0001',
  ...cells,
});

test('the restaurant and item find the menu entry; blank cells keep its values', async () => {
  const plan = await planMenuImport(
    [
      at({ price: '45' }),
      at({ itemCode: 'ITM0002', price: '20', roomPrice: '25', serveAt: 'Counter only' }),
    ],
    lookups,
    everything,
  );

  assert.deepEqual(
    plan.rows.map((row) => row.action),
    ['update', 'create'],
  );
  assert.equal(plan.updates[0]?.data.price, 45);
  assert.equal(plan.updates[0]?.data.roomPrice, 60, 'a blank in-room price stays');
  assert.equal(plan.updates[0]?.data.categoryId, 'snacks');
  // A new entry takes its category and kitchen from its one mapping, and has no room price
  // when it is not served in rooms.
  assert.deepEqual(
    {
      categoryId: plan.creates[0]?.categoryId,
      kitchenId: plan.creates[0]?.kitchenId,
      price: plan.creates[0]?.price,
      roomPrice: plan.creates[0]?.roomPrice,
      storeId: plan.creates[0]?.storeId,
    },
    { categoryId: 'drinks', kitchenId: 'k1', price: 20, roomPrice: null, storeId: null },
  );

  const unchanged = await planMenuImport(
    [at({ price: '40', gstPercent: '5' })],
    lookups,
    everything,
  );

  assert.deepEqual(unchanged.rows, [{ action: 'skip', errors: [] }]);
});

test('each row says what is wrong with it', async () => {
  const plan = await planMenuImport(
    [
      at({ locationCode: '' }),
      at({ itemCode: 'ITM0003', price: '30', roomPrice: '30' }),
      at({ itemCode: 'ITM0004', price: '30', roomPrice: '30' }),
      at({ itemCode: 'ITM0002', price: '20' }),
      at({ gstPercent: '7', kitchenCode: 'KIT0009' }),
      at({
        itemCode: 'ITM0003',
        category: 'Beverages',
        storeCode: 'STR0001',
        price: '30',
        serveAt: 'Counter',
      }),
      at({ itemCode: 'ITM0003', category: 'beverages', price: '35', serveAt: 'Counter' }),
    ],
    lookups,
    everything,
  );

  assert.deepEqual(
    plan.rows.map((row) => row.errors),
    [
      ['Restaurant code RES0001 is used at more than one location; fill in Location code'],
      ['Coke is mapped more than one way here; fill in Category and Kitchen code or Store code'],
      [
        "Vada isn't mapped to a store or kitchen at Cafe SKT's location. Map it in Item Mapping first.",
      ],
      ['In-room price is required for an item served in rooms'],
      [
        "No kitchen at Cafe SKT's location has code KIT0009",
        'GST % must be one of the following values: 0, 5, 12, 18',
      ],
      [],
      ['Row 7 has the same restaurant, item and category'],
    ],
  );
});

test('adding needs the create permission and changing the update one', async () => {
  const plan = await planMenuImport(
    [at({ price: '50' }), at({ itemCode: 'ITM0002', price: '20', serveAt: 'Counter only' })],
    lookups,
    { permissions: ['RESTAURANT_MENU_CREATE'] },
  );

  assert.deepEqual(
    plan.rows.map((row) => row.errors),
    [["You can't change menu items; this row would change one"], []],
  );
});
