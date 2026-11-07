import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShiftMode } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateRestaurantDto } from './dto/create-restaurant.dto';
import type { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';

type StoredRestaurant = Record<string, unknown> & {
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  kitchenId: string | null;
  /** The active restaurant-kitchen mappings, in the order they were chosen. */
  kitchenIds: string[];
  legalEntityId: string | null;
  locationId: string | null;
  restaurantCode: string;
  restaurantName: string;
  storeId: string | null;
};

type Place = { hospitalId: string; isActive: boolean };

type World = {
  /** Restaurants that already have counters, menus, prices, discounts or orders. */
  boundRestaurants?: string[];
  hospitals: Record<string, boolean>;
  kitchens?: Record<string, Place>;
  /** Active flag per legal entity. */
  legalEntities?: Record<string, boolean>;
  locations?: Record<string, Place>;
  /** POS devices serving a restaurant, with the entity each device bills under. */
  posLinks?: { device: string; deviceEntityId: string | null; restaurantId: string }[];
  restaurants?: StoredRestaurant[];
  /** Values the restaurant code sequence hands out, in order. */
  sequence?: number[];
  stores?: Record<string, Place>;
  /** Thrown by the next create or update, as the database would. */
  writeError?: Error;
};

type AuditInput = {
  action: string;
  actorId?: string;
  entityId: string;
  hospitalId?: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
};

// Stands in for the repository: keeps restaurants in memory and filters like the real queries.
function serviceWith(world: World) {
  const restaurants = world.restaurants ?? [];
  const sequence = [...(world.sequence ?? [])];
  let nextValue = 0;
  const audits: AuditInput[] = [];
  const creates: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const syncs: { actorId?: string; kitchenIds: string[]; restaurantId: string }[] = [];
  const retired: { deletedAt: Date; restaurantId: string }[] = [];
  const listCalls: { findMany?: Record<string, unknown>; count?: Record<string, unknown> } = {};

  const find = (id: string) => restaurants.find((stored) => stored.id === id);
  const place = (places: Record<string, Place> | undefined, id: string, hospitalId: string) => {
    const found = places?.[id];
    return found?.hospitalId === hospitalId ? { id, ...found } : null;
  };
  const kitchenOf = (id: string) => ({
    id,
    isActive: world.kitchens?.[id]?.isActive ?? false,
    kitchenCode: id.toUpperCase(),
    kitchenName: id,
  });
  const withRelations = (stored: StoredRestaurant) => ({
    ...stored,
    hospital: {
      city: null,
      displayName: null,
      hospitalCode: stored.hospitalId.toUpperCase(),
      hospitalName: stored.hospitalId,
      id: stored.hospitalId,
      isActive: world.hospitals[stored.hospitalId] ?? false,
      postalCode: null,
      state: null,
    },
    kitchen: stored.kitchenId ? kitchenOf(stored.kitchenId) : null,
    location: stored.locationId
      ? { id: stored.locationId, isActive: true, locationName: stored.locationId }
      : null,
    restaurantKitchens: stored.kitchenIds.map((kitchenId) => ({
      kitchen: kitchenOf(kitchenId),
      kitchenId,
    })),
    store: stored.storeId
      ? { id: stored.storeId, isActive: true, storeCode: 'S', storeName: stored.storeId }
      : null,
  });
  const entity = (id: string | null) => (id ? { entityName: id, id } : null);
  const throwIfFailing = () => {
    if (world.writeError) {
      const error = world.writeError;
      world.writeError = undefined;
      throw error;
    }
  };

  // What the legal-entity and POS-entity guards query directly on the transaction.
  const tx = {
    legalEntity: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(world.legalEntities?.[where.id] ? { id: where.id } : null),
    },
    posDeviceRestaurant: {
      findMany: ({ where }: { where: { AND: [{ restaurantId: string }] } }) =>
        Promise.resolve(
          (world.posLinks ?? [])
            .filter((link) => link.restaurantId === where.AND[0].restaurantId)
            .map((link) => {
              const served = find(link.restaurantId)!;
              return {
                posDevice: {
                  hospital: { legalEntity: null },
                  legalEntity: entity(link.deviceEntityId),
                  name: link.device,
                },
                restaurant: {
                  hospital: { legalEntity: null },
                  legalEntity: entity(served.legalEntityId),
                  restaurantName: served.restaurantName,
                },
              };
            }),
        ),
    },
  };

  const repository = {
    count: (args: Record<string, unknown>) => {
      listCalls.count = args;
      return restaurants.length;
    },
    create: (data: Record<string, unknown>) => {
      throwIfFailing();
      creates.push(data);
      const stored = {
        ...data,
        deletedAt: null,
        id: `r${restaurants.length + 1}`,
        kitchenIds: [],
      } as unknown as StoredRestaurant;
      restaurants.push(stored);
      return withRelations(stored);
    },
    findActiveById: (id: string) => {
      const stored = find(id);
      return stored && !stored.deletedAt ? withRelations(stored) : null;
    },
    findActiveHospital: (id: string) =>
      id in world.hospitals ? { id, isActive: world.hospitals[id] } : null,
    findActiveKitchens: (ids: string[], hospitalId: string) =>
      ids.filter((id) => place(world.kitchens, id, hospitalId)?.isActive).map(kitchenOf),
    findActiveLocation: (id: string, hospitalId: string) => place(world.locations, id, hospitalId),
    findActiveStore: (id: string, hospitalId: string) => place(world.stores, id, hospitalId),
    hasLocationBoundRecords: (id: string) => (world.boundRestaurants ?? []).includes(id),
    // Deleted restaurants keep their codes, as in the real queries.
    findByCode: (restaurantCode: string) =>
      restaurants.find((stored) => stored.restaurantCode === restaurantCode) ?? null,
    findByCodeWithinHospital: (hospitalId: string, restaurantCode: string, excludeId?: string) =>
      restaurants.find(
        (stored) =>
          stored.hospitalId === hospitalId &&
          stored.restaurantCode === restaurantCode &&
          stored.id !== excludeId,
      ) ?? null,
    findMany: (args: Record<string, unknown>) => {
      listCalls.findMany = args;
      return restaurants.map(withRelations);
    },
    getNextRestaurantCodeSequenceValue: () => sequence.shift() ?? (nextValue += 1),
    softDeleteCounters: (restaurantId: string, data: { deletedAt: Date }) => {
      retired.push({ deletedAt: data.deletedAt, restaurantId });
    },
    syncKitchens: (restaurantId: string, kitchenIds: string[], actorId?: string) => {
      syncs.push({ actorId, kitchenIds, restaurantId });
      find(restaurantId)!.kitchenIds = kitchenIds;
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (id: string, data: Record<string, unknown>) => {
      throwIfFailing();
      updates.push(data);
      const stored = find(id)!;
      const { hospital, kitchen, legalEntity, location, store, ...fields } = data as {
        hospital?: { connect: { id: string } };
        kitchen?: { connect?: { id: string } };
        legalEntity?: { connect?: { id: string } };
        location?: { connect?: { id: string } };
        store?: { connect?: { id: string } };
      };
      Object.assign(stored, fields);
      if (hospital) stored.hospitalId = hospital.connect.id;
      if (kitchen) stored.kitchenId = kitchen.connect?.id ?? null;
      if (legalEntity) stored.legalEntityId = legalEntity.connect?.id ?? null;
      if (location) stored.locationId = location.connect?.id ?? null;
      if (store) stored.storeId = store.connect?.id ?? null;
      return withRelations(stored);
    },
  };

  const service = new RestaurantsService(
    {
      record: (input: AuditInput) => {
        audits.push(input);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as RestaurantsRepository,
  );

  return { audits, creates, listCalls, restaurants, retired, service, syncs, updates };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
// Only a Super Admin may change which legal entity a restaurant bills under.
const superAdmin = { ...actor, roles: ['Super Admin'] };
const restaurant = (
  id: string,
  restaurantCode: string,
  hospitalId = 'saket',
  fields: Partial<StoredRestaurant> = {},
): StoredRestaurant => ({
  deletedAt: null,
  hospitalId,
  id,
  isActive: true,
  kitchenId: null,
  kitchenIds: [],
  legalEntityId: null,
  locationId: null,
  restaurantCode,
  restaurantName: id,
  storeId: null,
  ...fields,
});
const newCafe = (fields: Partial<CreateRestaurantDto> = {}): CreateRestaurantDto => ({
  hospitalId: 'saket',
  restaurantName: 'Cafe',
  ...fields,
});
const badRequest = (message: string) => (error: unknown) =>
  error instanceof BadRequestException && error.message === message;
const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { clientVersion: 'test', code: 'P2002' });

// ---- create ----

test('a new restaurant gets the next RST code not taken at any location, whatever code was sent', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('old', 'RST0001', 'vaishali')],
  });

  const created = await service.create(newCafe({ restaurantCode: 'MINE' }), actor);

  assert.equal(created?.restaurantCode, 'RST0002');
  assert.equal(created?.hospitalId, 'saket');
});

test('restaurant codes pad to four digits and grow past them', async () => {
  const codeFor = async (value: number) =>
    (
      await serviceWith({ hospitals: { saket: true }, sequence: [value] }).service.create(
        newCafe(),
        actor,
      )
    )?.restaurantCode;

  assert.equal(await codeFor(7), 'RST0007');
  assert.equal(await codeFor(12345), 'RST12345');
});

test('a broken restaurant code sequence, or ten taken codes in a row, stops the save', async () => {
  for (const broken of [0, -1, Number.NaN]) {
    await assert.rejects(
      serviceWith({ hospitals: { saket: true }, sequence: [broken] }).service.create(
        newCafe(),
        actor,
      ),
      InternalServerErrorException,
    );
  }

  const taken = Array.from({ length: 10 }, (_, index) =>
    restaurant(`r${index}`, `RST${String(index + 1).padStart(4, '0')}`),
  );
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, restaurants: taken }).service.create(
      newCafe(),
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Restaurant code already exists',
  );
});

test('a restaurant needs an active location (hospital)', async () => {
  const { creates, service } = serviceWith({ hospitals: { closed: false } });
  const refused = badRequest('Hospital not found or inactive');

  await assert.rejects(service.create(newCafe({ hospitalId: 'closed' }), actor), refused);
  await assert.rejects(service.create(newCafe({ hospitalId: 'missing' }), actor), refused);
  assert.equal(creates.length, 0);
});

test('its area, store and kitchens must be active and belong to the same location', async () => {
  const { creates, service } = serviceWith({
    hospitals: { saket: true },
    kitchens: {
      'saket-off': { hospitalId: 'saket', isActive: false },
      'saket-main': { hospitalId: 'saket', isActive: true },
      'vaishali-main': { hospitalId: 'vaishali', isActive: true },
    },
    locations: {
      'saket-old-wing': { hospitalId: 'saket', isActive: false },
      'vaishali-ground': { hospitalId: 'vaishali', isActive: true },
    },
    stores: {
      'saket-closed': { hospitalId: 'saket', isActive: false },
      'vaishali-store': { hospitalId: 'vaishali', isActive: true },
    },
  });
  const areaRefused = badRequest('Location not found or inactive');
  const storeRefused = badRequest('Store not found or inactive');
  const kitchenRefused = badRequest('One or more kitchens were not found for selected hospital');

  await assert.rejects(
    service.create(newCafe({ locationId: 'vaishali-ground' }), actor),
    areaRefused,
  );
  await assert.rejects(
    service.create(newCafe({ locationId: 'saket-old-wing' }), actor),
    areaRefused,
  );
  await assert.rejects(service.create(newCafe({ storeId: 'vaishali-store' }), actor), storeRefused);
  await assert.rejects(service.create(newCafe({ storeId: 'saket-closed' }), actor), storeRefused);
  await assert.rejects(
    service.create(newCafe({ kitchenId: 'vaishali-main' }), actor),
    kitchenRefused,
  );
  // One bad kitchen among good ones refuses the lot.
  await assert.rejects(
    service.create(newCafe({ kitchenIds: ['saket-main', 'saket-off'] }), actor),
    kitchenRefused,
  );
  assert.equal(creates.length, 0);
});

test('the first chosen kitchen is the primary one; repeats collapse, and the list beats the single id', async () => {
  const { service, syncs } = serviceWith({
    hospitals: { saket: true },
    kitchens: {
      k1: { hospitalId: 'saket', isActive: true },
      k2: { hospitalId: 'saket', isActive: true },
      k3: { hospitalId: 'saket', isActive: true },
    },
  });

  const many = await service.create(
    newCafe({ kitchenId: 'k3', kitchenIds: ['k2', 'k1', 'k2'] }),
    actor,
  );
  const single = await service.create(newCafe({ kitchenId: 'k1' }), actor);
  const none = await service.create(newCafe(), actor);

  assert.equal(many?.kitchenId, 'k2');
  assert.deepEqual(many?.kitchenIds, ['k2', 'k1']);
  assert.deepEqual(single?.kitchenIds, ['k1']);
  assert.equal(none?.kitchenId, undefined);
  assert.deepEqual(
    syncs.map((sync) => sync.kitchenIds),
    [['k2', 'k1'], ['k1'], []],
  );
  assert.equal(syncs[0]?.actorId, 'user-1');
});

test('a restaurant may only bill under an active legal entity', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    legalEntities: { 'max-old': false, 'max-sk': true },
  });

  await assert.rejects(
    service.create(newCafe({ legalEntityId: 'max-old' }), actor),
    badRequest('Choose an active entity'),
  );
  await assert.rejects(
    service.create(newCafe({ legalEntityId: 'missing' }), actor),
    badRequest('Choose an active entity'),
  );
  assert.equal(
    (await service.create(newCafe({ legalEntityId: 'max-sk' }), actor))?.legalEntityId,
    'max-sk',
  );
  assert.equal((await service.create(newCafe(), actor))?.legalEntityId, null);
});

test('a new restaurant starts active, with every service switched off and no shift timings', async () => {
  const { creates, service } = serviceWith({ hospitals: { saket: true } });

  await service.create(newCafe(), actor);
  const data = creates[0]!;

  assert.equal(data.isActive, true);
  for (const flag of [
    'atTableDining',
    'b2cQrEnabled',
    'delivery',
    'homeDelivery',
    'ihcOnly',
    'inCarDining',
    'inRoomDiningEnabled',
    'inventory',
    'isRegisteredInGst',
    'normalDiscountApplicable',
    'offline',
    'onlineOrderingEnabled',
    'open24x7',
    'posOrders',
    'staffDiscountApplicable',
    'takeaway',
    'vegOnly',
  ]) {
    assert.equal(data[flag], false, flag);
  }
  assert.deepEqual(data.shiftTimings, []);
  assert.deepEqual([data.createdBy, data.updatedBy], ['user-1', 'user-1']);
});

test('on create the newer field names win over their older aliases', async () => {
  const { creates, service } = serviceWith({ hospitals: { saket: true } });

  await service.create(
    newCafe({
      bankName: 'Old Bank',
      bankNameBranch: 'HDFC Saket',
      delivery: true,
      fssaiNumber: 'old',
      fssaiNumbers: '100,200',
      inRoomDining: true,
      inRoomDiningEnabled: false,
      isActive: false,
      isDeliveryEnabled: false,
      isOnlineOrdersEnabled: true,
      onlineOrderingEnabled: false,
      qrUnitName: 'old',
      unitNameForQr: 'Cafe QR',
      vegOnly: true,
    }),
    actor,
  );

  assert.deepEqual(
    (({
      bankName,
      delivery,
      fssaiNumber,
      inRoomDiningEnabled,
      isActive,
      onlineOrderingEnabled,
      qrUnitName,
      vegOnly,
    }) => ({
      bankName,
      delivery,
      fssaiNumber,
      inRoomDiningEnabled,
      isActive,
      onlineOrderingEnabled,
      qrUnitName,
      vegOnly,
    }))(creates[0]!),
    {
      bankName: 'HDFC Saket',
      delivery: false,
      fssaiNumber: '100,200',
      // The middle alias still beats the oldest name when the newest is left out.
      inRoomDiningEnabled: true,
      isActive: false,
      onlineOrderingEnabled: true,
      qrUnitName: 'Cafe QR',
      vegOnly: true,
    },
  );
});

test('GST details and shift settings are saved as sent', async () => {
  const { creates, service } = serviceWith({ hospitals: { saket: true } });
  const shiftTimings = [{ endTime: '14:00', name: 'Lunch', startTime: '11:00' }];

  const created = await service.create(
    newCafe({
      gstAddress: 'Press Enclave Road',
      gstNumber: '07AADCM0815B1ZQ',
      isRegisteredInGst: true,
      legalName: 'Max Healthcare',
      panNumber: 'AADCM0815B',
      shiftMode: ShiftMode.CASHIER,
      shiftTimings,
    }),
    actor,
  );

  assert.equal(created?.gstNumber, '07AADCM0815B1ZQ');
  assert.equal(created?.isRegisteredInGst, true);
  assert.equal(created?.legalName, 'Max Healthcare');
  assert.equal(creates[0]?.shiftMode, ShiftMode.CASHIER);
  assert.deepEqual(created?.shiftTimings, shiftTimings);
});

test('creating a restaurant is audited with what was saved', async () => {
  const { audits, service } = serviceWith({ hospitals: { saket: true } });

  const created = await service.create(newCafe(), actor);

  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, 'RESTAURANT_CREATE');
  assert.equal(audits[0]?.actorId, 'user-1');
  assert.equal(audits[0]?.entityId, created?.id);
  assert.equal(audits[0]?.hospitalId, 'saket');
  assert.equal(audits[0]?.newValue?.restaurantCode, 'RST0001');
});

test('a duplicate caught by the database is a conflict; any other failure passes through', async () => {
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, writeError: uniqueViolation() }).service.create(
      newCafe(),
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Restaurant already exists',
  );

  const outage = new Error('connection lost');
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, writeError: outage }).service.create(
      newCafe(),
      actor,
    ),
    (error: unknown) => error === outage,
  );
});

// ---- getById ----

test('an unknown or deleted restaurant is not found', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [
      restaurant('r1', 'RST0001'),
      restaurant('gone', 'RST0002', 'saket', { deletedAt: new Date() }),
    ],
  });

  assert.equal((await service.getById('r1')).restaurantCode, 'RST0001');
  await assert.rejects(service.getById('gone'), NotFoundException);
  await assert.rejects(
    service.getById('missing'),
    (error: unknown) =>
      error instanceof NotFoundException && error.message === 'Restaurant not found',
  );
});

// ---- update ----

test('an edit changes only the fields sent and stamps the editor', async () => {
  const { restaurants, service, updates } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { email: 'cafe@max.in' })],
  });

  const updated = await service.update('r1', { restaurantName: 'Cafe Max' }, { actorId: 'user-2' });

  assert.deepEqual(updates, [{ restaurantName: 'Cafe Max', updatedBy: 'user-2' }]);
  assert.equal(updated?.restaurantName, 'Cafe Max');
  assert.equal(restaurants[0]?.email, 'cafe@max.in');
});

test('an edit with nothing to change writes nothing but is still audited', async () => {
  const { audits, service, syncs, updates } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
  });

  await service.update('r1', {}, actor);

  assert.equal(updates.length, 0);
  assert.equal(syncs.length, 0);
  assert.deepEqual(
    audits.map((audit) => audit.action),
    ['RESTAURANT_UPDATE'],
  );
});

test('editing an unknown restaurant is not found', async () => {
  const { service } = serviceWith({ hospitals: { saket: true } });

  await assert.rejects(
    service.update('missing', { restaurantName: 'X' }, actor),
    NotFoundException,
  );
});

test('a cleared bank name, FSSAI number or QR unit name stays cleared despite the older alias', async () => {
  const { service, updates } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
  });
  const cleared = null as unknown as string;

  await service.update(
    'r1',
    {
      bankName: 'Old Bank',
      bankNameBranch: cleared,
      fssaiNumber: 'old',
      fssaiNumbers: cleared,
      qrUnitName: 'old',
      unitNameForQr: cleared,
    },
    actor,
  );

  assert.deepEqual(updates[0], {
    bankName: null,
    fssaiNumber: null,
    qrUnitName: null,
    updatedBy: 'user-1',
  });
});

test('on edit the newer flag names win, and an older one alone still works', async () => {
  const { service, updates } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
  });

  await service.update(
    'r1',
    {
      inventory: true,
      isTakeawayEnabled: false,
      isVegOnly: false,
      onlineOrderingEnabled: true,
      takeaway: true,
      vegOnly: true,
    },
    actor,
  );

  assert.deepEqual(updates[0], {
    inventory: true,
    onlineOrderingEnabled: true,
    takeaway: false,
    updatedBy: 'user-1',
    vegOnly: false,
  });
});

test('a restaurant under an inactive location cannot be switched on unless it moves to an active one', async () => {
  const { audits, service } = serviceWith({
    hospitals: { closed: false, saket: true },
    restaurants: [restaurant('r1', 'RST0001', 'closed', { isActive: false })],
  });

  await assert.rejects(
    service.update('r1', { isActive: true }, actor),
    badRequest('Location is inactive. Restaurant cannot be activated.'),
  );
  await assert.doesNotReject(service.update('r1', { restaurantName: 'Renamed' }, actor));

  const moved = await service.update('r1', { hospitalId: 'saket', isActive: true }, actor);

  assert.equal(moved?.hospitalId, 'saket');
  assert.equal(moved?.isActive, true);
  assert.deepEqual(
    audits.map((audit) => audit.action),
    ['RESTAURANT_UPDATE', 'RESTAURANT_STATUS_CHANGE'],
  );
});

test('switching a restaurant off is audited as a status change; resending its status is an update', async () => {
  const { audits, service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001'), restaurant('r2', 'RST0002')],
  });

  await service.update('r1', { isActive: false }, actor);
  await service.update('r2', { isActive: true }, actor);

  assert.deepEqual(
    audits.map((audit) => [audit.action, audit.oldValue?.isActive, audit.newValue?.isActive]),
    [
      ['RESTAURANT_STATUS_CHANGE', true, false],
      ['RESTAURANT_UPDATE', true, true],
    ],
  );
});

test('a restaurant can only move to an active location', async () => {
  const { service } = serviceWith({
    hospitals: { closed: false, saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
  });
  const refused = badRequest('Hospital not found or inactive');

  await assert.rejects(service.update('r1', { hospitalId: 'closed' }, actor), refused);
  await assert.rejects(service.update('r1', { hospitalId: 'missing' }, actor), refused);
});

test('moving a restaurant drops its old area, store and kitchens unless new ones come with it', async () => {
  const { restaurants, service } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    restaurants: [
      restaurant('r1', 'RST0001', 'saket', {
        kitchenId: 'saket-main',
        kitchenIds: ['saket-main'],
        locationId: 'saket-ground',
        storeId: 'saket-store',
      }),
    ],
  });

  await service.update('r1', { hospitalId: 'vaishali' }, actor);

  assert.deepEqual(
    (({ hospitalId, kitchenId, kitchenIds, locationId, storeId }) => [
      hospitalId,
      kitchenId,
      kitchenIds,
      locationId,
      storeId,
    ])(restaurants[0]!),
    ['vaishali', null, [], null, null],
  );
});

test('a restaurant with counters, menus, prices, discounts or orders cannot move to another location', async () => {
  const { restaurants, service } = serviceWith({
    boundRestaurants: ['r1'],
    hospitals: { saket: true, vaishali: true },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { storeId: 'saket-store' })],
  });

  await assert.rejects(
    service.update('r1', { hospitalId: 'vaishali' }, actor),
    badRequest(
      'This restaurant already has counters, menus, prices, discounts or orders, so it cannot move to another location. Create a new restaurant there instead.',
    ),
  );
  // The edit form sends the location it already has: not a move, nothing dropped.
  await service.update('r1', { hospitalId: 'saket', restaurantName: 'Cafe' }, actor);
  assert.equal(restaurants[0]!.hospitalId, 'saket');
  assert.equal(restaurants[0]!.storeId, 'saket-store');
});

test('a restaurant code is used once within a location, but may repeat at another', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    restaurants: [
      restaurant('s1', 'RST0001'),
      restaurant('s2', 'RST0002'),
      restaurant('v1', 'RST0009', 'vaishali'),
      restaurant('v2', 'RST0001', 'vaishali'),
    ],
  });
  const clash = (error: unknown) =>
    error instanceof ConflictException &&
    error.message === 'Restaurant code already exists within hospital';

  await assert.rejects(service.update('s2', { restaurantCode: 'RST0001' }, actor), clash);
  // Moving to a location where its own code is taken clashes too.
  await assert.rejects(service.update('v2', { hospitalId: 'saket' }, actor), clash);
  await assert.doesNotReject(service.update('s1', { restaurantCode: 'RST0001' }, actor));
  await assert.doesNotReject(service.update('s2', { restaurantCode: 'RST0009' }, actor));
});

test('a new store, area or kitchen is checked against the location the restaurant ends up in', async () => {
  const { restaurants, service } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    kitchens: {
      'saket-main': { hospitalId: 'saket', isActive: true },
      'vaishali-main': { hospitalId: 'vaishali', isActive: true },
    },
    locations: {
      'saket-ground': { hospitalId: 'saket', isActive: true },
      'vaishali-ground': { hospitalId: 'vaishali', isActive: true },
    },
    restaurants: [restaurant('r1', 'RST0001')],
    stores: {
      'saket-store': { hospitalId: 'saket', isActive: true },
      'vaishali-store': { hospitalId: 'vaishali', isActive: true },
    },
  });

  await assert.rejects(
    service.update('r1', { storeId: 'vaishali-store' }, actor),
    badRequest('Store not found or inactive'),
  );
  await assert.rejects(
    service.update('r1', { locationId: 'vaishali-ground' }, actor),
    badRequest('Location not found or inactive'),
  );
  await assert.rejects(
    service.update('r1', { kitchenIds: ['vaishali-main'] }, actor),
    badRequest('One or more kitchens were not found for selected hospital'),
  );
  // Moving with them: checked against the new location, so the Saket ones are refused there.
  await assert.rejects(
    service.update('r1', { hospitalId: 'vaishali', storeId: 'saket-store' }, actor),
    badRequest('Store not found or inactive'),
  );

  await service.update(
    'r1',
    {
      hospitalId: 'vaishali',
      kitchenIds: ['vaishali-main'],
      locationId: 'vaishali-ground',
      storeId: 'vaishali-store',
    },
    actor,
  );

  assert.deepEqual(
    (({ hospitalId, kitchenId, locationId, storeId }) => [
      hospitalId,
      kitchenId,
      locationId,
      storeId,
    ])(restaurants[0]!),
    ['vaishali', 'vaishali-main', 'vaishali-ground', 'vaishali-store'],
  );
});

test('changing kitchens re-maps them and moves the primary; an empty list unmaps them all', async () => {
  const { restaurants, service, syncs, updates } = serviceWith({
    hospitals: { saket: true },
    kitchens: {
      k1: { hospitalId: 'saket', isActive: true },
      k2: { hospitalId: 'saket', isActive: true },
    },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { kitchenId: 'k1', kitchenIds: ['k1'] })],
  });

  await service.update('r1', { restaurantName: 'Renamed' }, actor);
  assert.equal(syncs.length, 0);

  const moved = await service.update('r1', { kitchenIds: ['k2', 'k1'] }, actor);
  assert.equal(moved?.kitchenId, 'k2');
  assert.deepEqual(moved?.kitchenIds, ['k2', 'k1']);

  await service.update('r1', { kitchenId: 'k1' }, actor);
  assert.deepEqual(restaurants[0]?.kitchenIds, ['k1']);

  const cleared = await service.update('r1', { kitchenIds: [] }, actor);
  assert.equal(cleared?.kitchenId, null);
  assert.deepEqual(cleared?.kitchenIds, []);
  assert.deepEqual(updates.at(-1)?.kitchen, { disconnect: true });
  assert.deepEqual(
    syncs.map((sync) => sync.kitchenIds),
    [['k2', 'k1'], ['k1'], []],
  );
});

test('a new legal entity must be active; null unlinks it; resending the current one is not rechecked', async () => {
  const { restaurants, service, updates } = serviceWith({
    hospitals: { saket: true },
    // The current entity has since been switched off.
    legalEntities: { 'max-old': false, 'max-sk': true },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { legalEntityId: 'max-old' })],
  });

  await service.update('r1', { legalEntityId: 'max-old', restaurantName: 'Same entity' }, actor);
  assert.equal(updates[0]?.legalEntity, undefined);

  await assert.rejects(
    service.update('r1', { legalEntityId: 'missing' }, superAdmin),
    badRequest('Choose an active entity'),
  );

  await service.update('r1', { legalEntityId: 'max-sk' }, superAdmin);
  assert.equal(restaurants[0]?.legalEntityId, 'max-sk');

  await service.update('r1', { legalEntityId: null }, superAdmin);
  assert.equal(restaurants[0]?.legalEntityId, null);
  assert.deepEqual(updates.at(-1)?.legalEntity, { disconnect: true });
});

test('a restaurant cannot move to a legal entity its POS devices do not bill under', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    legalEntities: { 'max-sk': true, 'max-vs': true },
    posLinks: [{ device: 'Till 1', deviceEntityId: 'max-sk', restaurantId: 'r1' }],
    restaurants: [restaurant('r1', 'RST0001', 'saket', { legalEntityId: 'max-sk' })],
  });

  await assert.rejects(
    service.update('r1', { legalEntityId: 'max-vs' }, superAdmin),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message.startsWith('POS device Till 1 bills under max-sk, but r1 belongs to max-vs.'),
  );
});

test('a duplicate caught by the database on edit is a conflict', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
    writeError: uniqueViolation(),
  });

  await assert.rejects(
    service.update('r1', { restaurantName: 'Twin' }, actor),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Restaurant already exists',
  );
});

// ---- remove ----

test('deleting a restaurant retires its kitchen, POS and counter links, then hides it', async () => {
  const { audits, restaurants, retired, service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001')],
  });

  assert.deepEqual(await service.remove('r1', actor), { id: 'r1' });

  assert.equal(restaurants[0]?.isActive, false);
  assert.equal(restaurants[0]?.updatedBy, 'user-1');
  // Links and the restaurant share one deletion time.
  assert.deepEqual(retired, [{ deletedAt: restaurants[0]?.deletedAt, restaurantId: 'r1' }]);
  assert.deepEqual(
    audits.map((audit) => [audit.action, audit.oldValue?.restaurantCode, audit.hospitalId]),
    [['RESTAURANT_DELETE', 'RST0001', 'saket']],
  );
  await assert.rejects(service.getById('r1'), NotFoundException);
  await assert.rejects(service.remove('r1', actor), NotFoundException);
  assert.equal(retired.length, 1);
});

// ---- list ----

test('the list hides deleted restaurants and those of deleted locations, newest first, 20 a page', async () => {
  const { listCalls, service } = serviceWith({
    hospitals: { saket: true },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { kitchenIds: ['k1'] })],
  });

  const result = await service.list({});

  assert.deepEqual(listCalls.findMany, {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0,
    take: 20,
    where: { deletedAt: null, hospital: { deletedAt: null } },
  });
  assert.deepEqual(listCalls.count, { where: listCalls.findMany?.where });
  assert.deepEqual(result.meta, { limit: 20, page: 1, total: 1, totalPages: 1 });
  assert.deepEqual(result.items[0]?.kitchenIds, ['k1']);
});

test('the list pages, sorts by the chosen field, and with limit 0 only counts', async () => {
  const { listCalls, service } = serviceWith({ hospitals: { saket: true } });

  await service.list({ limit: 10, page: 3, sortBy: 'restaurantName', sortOrder: 'asc' });
  assert.deepEqual((({ orderBy, skip, take }) => ({ orderBy, skip, take }))(listCalls.findMany!), {
    orderBy: [{ restaurantName: 'asc' }, { id: 'asc' }],
    skip: 20,
    take: 10,
  });

  const counted = await service.list({ limit: 0 });
  assert.equal(listCalls.findMany?.take, 0);
  assert.equal(counted.meta.totalPages, 0);
});

test('the list filters by location, area, store and active state, inactive included', async () => {
  const { listCalls, service } = serviceWith({ hospitals: { saket: true } });

  await service.list({
    hospitalId: 'saket',
    isActive: false,
    locationId: 'ground',
    storeId: 'main',
  });

  assert.deepEqual(listCalls.findMany?.where, {
    deletedAt: null,
    hospital: { deletedAt: null },
    hospitalId: 'saket',
    isActive: false,
    locationId: 'ground',
    storeId: 'main',
  });
});

test('a kitchen filter matches the primary kitchen or any active kitchen mapping', async () => {
  const { listCalls, service } = serviceWith({ hospitals: { saket: true } });

  await service.list({ kitchenId: 'k1' });

  assert.deepEqual((listCalls.findMany?.where as { AND: unknown }).AND, [
    {
      OR: [
        { kitchenId: 'k1' },
        { restaurantKitchens: { some: { deletedAt: null, isActive: true, kitchenId: 'k1' } } },
      ],
    },
  ]);
});

test('search matches names, codes, contacts, GST/FSSAI and related names, ignoring case', async () => {
  const { listCalls, service } = serviceWith({ hospitals: { saket: true } });

  await service.list({ kitchenId: 'k1', search: 'cafe' });

  const [kitchenFilter, searchFilter] = (listCalls.findMany?.where as { AND: { OR: object[] }[] })
    .AND;
  assert.ok(kitchenFilter);
  const searched = JSON.stringify(searchFilter);
  for (const field of [
    'restaurantName',
    'restaurantCode',
    'email',
    'mobile',
    'gstNumber',
    'fssaiNumber',
    'hospitalName',
    'locationName',
    'storeName',
    'kitchenName',
  ]) {
    assert.ok(searched.includes(`"${field}":{"contains":"cafe","mode":"insensitive"}`), field);
  }
  // The kitchen name is searched on the primary kitchen and on every mapped one.
  assert.equal(searchFilter?.OR.length, 11);
});

test('only a Super Admin may move a restaurant to another legal entity', async () => {
  const { restaurants, service } = serviceWith({
    hospitals: { saket: true },
    legalEntities: { 'max-sk': true, 'max-vs': true },
    restaurants: [restaurant('r1', 'RST0001', 'saket', { legalEntityId: 'max-sk' })],
  });

  await assert.rejects(
    service.update('r1', { legalEntityId: 'max-vs' }, actor),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === 'Only a Super Admin can change the legal entity',
  );
  await assert.rejects(service.update('r1', { legalEntityId: null }, actor), ForbiddenException);
  // The form sends the current entity back with every save.
  await assert.doesNotReject(
    service.update('r1', { legalEntityId: 'max-sk', restaurantName: 'Cafe' }, actor),
  );
  assert.equal(restaurants[0]?.legalEntityId, 'max-sk');
});
