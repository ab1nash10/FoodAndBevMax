import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { toRestaurantResponse } from './restaurants.helpers';
import type { RestaurantWithRelations } from './restaurants.repository';

const kitchen = (id: string) => ({
  id,
  isActive: true,
  kitchenCode: id.toUpperCase(),
  kitchenName: id,
});
const stored = (fields: Record<string, unknown> = {}) =>
  ({
    atTableDining: true,
    bankName: 'HDFC Saket',
    delivery: false,
    fssaiNumber: '100',
    homeDelivery: true,
    hospital: {
      city: 'Delhi',
      displayName: 'Max Saket',
      hospitalCode: 'SKT',
      hospitalName: 'Saket',
      id: 'saket',
      isActive: true,
      postalCode: '110017',
      state: 'Delhi',
    },
    hospitalId: 'saket',
    id: 'r1',
    ihcOnly: false,
    inCarDining: false,
    inRoomDiningEnabled: true,
    inventory: true,
    kitchen: null,
    kitchenId: null,
    location: null,
    offline: false,
    onlineOrderingEnabled: true,
    open24x7: false,
    posOrders: true,
    qrUnitName: 'Cafe QR',
    restaurantKitchens: [],
    store: null,
    takeaway: false,
    vegOnly: true,
    ...fields,
  }) as unknown as RestaurantWithRelations;

test('every older and newer field name reads the same stored column', () => {
  const response = toRestaurantResponse(stored());

  const pairs: [keyof typeof response, keyof typeof response][] = [
    ['atTableDining', 'isAtTableDiningEnabled'],
    ['bankName', 'bankNameBranch'],
    ['delivery', 'isDeliveryEnabled'],
    ['fssaiNumber', 'fssaiNumbers'],
    ['homeDelivery', 'isHomeDeliveryEnabled'],
    ['ihcOnly', 'isIhcOnly'],
    ['inCarDining', 'isInCarDiningEnabled'],
    ['inRoomDining', 'isInRoomDiningEnabled'],
    ['inRoomDiningEnabled', 'isInRoomDiningEnabled'],
    ['inventory', 'isInventoryEnabled'],
    ['offline', 'isOffline'],
    ['onlineOrders', 'isOnlineOrdersEnabled'],
    ['onlineOrderingEnabled', 'isOnlineOrdersEnabled'],
    ['open24x7', 'isOpen24x7'],
    ['posOrders', 'isPosOrdersEnabled'],
    ['qrUnitName', 'unitNameForQr'],
    ['takeaway', 'isTakeawayEnabled'],
    ['vegOnly', 'isVegOnly'],
  ];
  for (const [older, newer] of pairs) {
    assert.equal(response[older], response[newer], `${older} / ${newer}`);
  }
  assert.deepEqual(
    [response.bankNameBranch, response.isInRoomDiningEnabled, response.unitNameForQr],
    ['HDFC Saket', true, 'Cafe QR'],
  );
});

test('the location is shown with its code and name under the older names too', () => {
  const { hospital } = toRestaurantResponse(stored());

  assert.equal(hospital.locationCode, 'SKT');
  assert.equal(hospital.title, 'Saket');
  assert.equal(hospital.displayName, 'Max Saket');
});

test('missing kitchen, area and store come back as null, and kitchens follow the mappings', () => {
  const bare = toRestaurantResponse(stored());

  assert.deepEqual([bare.kitchen, bare.location, bare.store], [null, null, null]);
  assert.deepEqual([bare.kitchenIds, bare.kitchens], [[], []]);

  const mapped = toRestaurantResponse(
    stored({
      kitchen: kitchen('k1'),
      kitchenId: 'k1',
      restaurantKitchens: [
        { kitchen: kitchen('k1'), kitchenId: 'k1' },
        { kitchen: kitchen('k2'), kitchenId: 'k2' },
      ],
    }),
  );

  assert.deepEqual(mapped.kitchen, kitchen('k1'));
  assert.deepEqual(mapped.kitchenIds, ['k1', 'k2']);
  assert.deepEqual(mapped.kitchens, [kitchen('k1'), kitchen('k2')]);
});
