import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CountersRepository } from './counters.repository';
import { CountersService } from './counters.service';

type StoredCounter = {
  counterCode: string;
  counterName: string;
  createdBy?: string;
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  paymentDeviceId?: string | null;
  pineLabsDeviceId?: string | null;
  posDeviceId?: string | null;
  restaurantId: string;
  updatedBy?: string;
};

type World = {
  hospitals: Record<string, boolean>;
  restaurants: Record<string, { hospitalId: string; isActive: boolean }>;
};
type Audit = {
  action: string;
  actorId: string;
  entityId: string;
  entityName: string;
  hospitalId: string;
  ipAddress?: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
};

// Stands in for the repository: keeps counters in memory and filters like the real queries.
// `fail.next` makes the next create or update throw, as the database would.
function serviceWith(world: World, counters: StoredCounter[] = []) {
  const actions: string[] = [];
  const audits: Audit[] = [];
  const listed: unknown[] = [];
  const updates: string[] = [];
  const fail: { next?: Error } = {};
  const failIfAsked = () => {
    const { next } = fail;
    delete fail.next;
    if (next) throw next;
  };
  const withRelations = (counter: StoredCounter) => ({
    ...counter,
    hospital: { id: counter.hospitalId, isActive: world.hospitals[counter.hospitalId] },
    restaurant: {
      id: counter.restaurantId,
      isActive: world.restaurants[counter.restaurantId]?.isActive ?? false,
    },
  });
  const repository = {
    count: (args: unknown) => {
      listed.push(args);
      return 3;
    },
    create: (data: Omit<StoredCounter, 'deletedAt' | 'id'>) => {
      failIfAsked();
      const counter = { ...data, deletedAt: null, id: `counter-${counters.length + 1}` };
      counters.push(counter);
      return withRelations(counter);
    },
    findActiveById: (id: string) => {
      const counter = counters.find((stored) => stored.id === id && !stored.deletedAt);
      return counter ? withRelations(counter) : null;
    },
    findActiveHospital: (id: string) =>
      id in world.hospitals ? { id, isActive: world.hospitals[id] } : null,
    findActiveRestaurant: (id: string, hospitalId: string) => {
      const restaurant = world.restaurants[id];
      return restaurant?.hospitalId === hospitalId ? { id, ...restaurant } : null;
    },
    findByCodeWithinRestaurant: (restaurantId: string, counterCode: string, excludeId?: string) =>
      counters.find(
        (counter) =>
          counter.restaurantId === restaurantId &&
          counter.counterCode === counterCode &&
          counter.id !== excludeId,
      ) ?? null,
    findMany: (args: unknown) => {
      listed.push(args);
      return counters.map((counter) => withRelations(counter));
    },
    shiftsAndTills: () => new Map(),
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (
      id: string,
      data: Partial<StoredCounter> & {
        hospital?: { connect: { id: string } };
        restaurant?: { connect: { id: string } };
      },
    ) => {
      failIfAsked();
      updates.push(id);
      const counter = counters.find((stored) => stored.id === id)!;
      const { hospital, restaurant, ...fields } = data;
      Object.assign(counter, fields);
      counter.hospitalId = hospital?.connect.id ?? counter.hospitalId;
      counter.restaurantId = restaurant?.connect.id ?? counter.restaurantId;
      return withRelations(counter);
    },
  };
  const service = new CountersService(
    {
      record: (input: Audit) => {
        audits.push(input);
        actions.push(input.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as CountersRepository,
  );

  return { actions, audits, counters, fail, listed, service, updates };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const world: World = {
  hospitals: { closed: false, saket: true, vaishali: true },
  restaurants: {
    cafe: { hospitalId: 'saket', isActive: true },
    'closed-cafe': { hospitalId: 'saket', isActive: false },
    'food-court': { hospitalId: 'saket', isActive: true },
    'vaishali-cafe': { hospitalId: 'vaishali', isActive: true },
  },
};
const counter = (id: string, counterCode: string, restaurantId = 'cafe'): StoredCounter => ({
  counterCode,
  counterName: id,
  deletedAt: null,
  hospitalId: world.restaurants[restaurantId]!.hospitalId,
  id,
  isActive: true,
  restaurantId,
});
const newCounter = (body: {
  counterCode?: string;
  hospitalId?: string;
  isActive?: boolean;
  paymentDeviceId?: string;
  pineLabsDeviceId?: string;
  posDeviceId?: string;
  restaurantId?: string;
}) => ({
  counterCode: 'C1',
  counterName: 'Counter 1',
  hospitalId: 'saket',
  restaurantId: 'cafe',
  ...body,
});
const isRestaurantRefused = (error: unknown) =>
  error instanceof BadRequestException && error.message === 'Restaurant not found or inactive';
const isHospitalRefused = (error: unknown) =>
  error instanceof BadRequestException && error.message === 'Hospital not found or inactive';
const isMissing = (error: unknown) =>
  error instanceof NotFoundException && error.message === 'Counter not found';
const uniqueClash = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { clientVersion: 'test', code: 'P2002' });
const isRaceConflict = (error: unknown) =>
  error instanceof ConflictException && error.message === 'Counter already exists';

test('a counter needs an active hospital and an active restaurant of that hospital', async () => {
  const { service } = serviceWith(world);

  await assert.rejects(
    service.create(newCounter({ hospitalId: 'closed' }), actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create(newCounter({ restaurantId: 'vaishali-cafe' }), actor),
    isRestaurantRefused,
  );
  await assert.rejects(
    service.create(newCounter({ restaurantId: 'closed-cafe' }), actor),
    isRestaurantRefused,
  );
  const created = await service.create(newCounter({}), actor);
  assert.equal(created?.isActive, true);
});

test('a counter code is used once within a restaurant, but may repeat in another', async () => {
  const { service } = serviceWith(world, [counter('c1', 'C1'), counter('c2', 'C2')]);
  const isDuplicate = (error: unknown) =>
    error instanceof ConflictException &&
    error.message === 'Counter code already exists within restaurant';

  await assert.rejects(service.create(newCounter({ counterCode: 'C1' }), actor), isDuplicate);
  await assert.rejects(service.update('c2', { counterCode: 'C1' }, actor), isDuplicate);
  await assert.doesNotReject(service.update('c1', { counterCode: 'C1' }, actor));
  await assert.doesNotReject(
    service.create(newCounter({ counterCode: 'C1', restaurantId: 'food-court' }), actor),
  );
  // Moving to a restaurant that already has the code clashes too.
  await assert.rejects(
    service.update('c2', { restaurantId: 'food-court', counterCode: 'C1' }, actor),
    isDuplicate,
  );
  // So does moving alone, keeping a code the new restaurant already uses.
  await assert.rejects(service.update('c1', { restaurantId: 'food-court' }, actor), isDuplicate);
});

test('moving a counter to another hospital checks its restaurant belongs there', async () => {
  const { service } = serviceWith(world, [counter('c1', 'C1')]);

  await assert.rejects(
    service.update('c1', { hospitalId: 'vaishali' }, actor),
    isRestaurantRefused,
  );
  const moved = await service.update(
    'c1',
    { hospitalId: 'vaishali', restaurantId: 'vaishali-cafe' },
    actor,
  );
  assert.equal(moved?.restaurantId, 'vaishali-cafe');
});

test('a counter cannot be switched on while its hospital is inactive', async () => {
  const off = { ...counter('c1', 'C1'), hospitalId: 'closed', isActive: false };
  const { service } = serviceWith(world, [off]);

  await assert.rejects(
    service.update('c1', { isActive: true }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Location is inactive. Counter cannot be activated.',
  );
  await assert.doesNotReject(service.update('c1', { isActive: false }, actor));
});

test('a counter cannot be switched on while its restaurant is inactive, unless it moves to an active one', async () => {
  const off = { ...counter('c1', 'C1', 'closed-cafe'), isActive: false };
  const { counters, service } = serviceWith(world, [off]);

  await assert.rejects(
    service.update('c1', { isActive: true }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Restaurant is inactive. Counter cannot be activated.',
  );
  await assert.doesNotReject(service.update('c1', { isActive: false }, actor));
  await service.update('c1', { isActive: true, restaurantId: 'cafe' }, actor);
  assert.equal(counters[0]?.isActive, true);
});

test('a status change and a delete are audited as such, and a deleted counter is gone', async () => {
  const { actions, counters, service } = serviceWith(world, [counter('c1', 'C1')]);

  await service.update('c1', { counterName: 'Front' }, actor);
  await service.update('c1', { isActive: false }, actor);
  await service.remove('c1', actor);

  assert.deepEqual(actions, ['COUNTER_UPDATE', 'COUNTER_STATUS_CHANGE', 'COUNTER_DELETE']);
  assert.ok(counters[0]?.deletedAt);
  await assert.rejects(service.getById('c1'), NotFoundException);
});

test('a new counter keeps its POS, payment and Pine Labs devices, its creator and an audit', async () => {
  const { audits, counters, service } = serviceWith(world);

  const created = await service.create(
    newCounter({
      isActive: false,
      paymentDeviceId: 'PAY-1',
      pineLabsDeviceId: 'PL-1',
      posDeviceId: 'POS-1',
    }),
    actor,
  );

  assert.equal(created?.posDeviceId, 'POS-1');
  assert.equal(created?.paymentDeviceId, 'PAY-1');
  assert.equal(created?.pineLabsDeviceId, 'PL-1');
  assert.equal(created?.isActive, false);
  assert.equal(created?.restaurant.id, 'cafe');
  assert.equal(counters[0]?.createdBy, 'user-1');
  assert.equal(counters[0]?.updatedBy, 'user-1');
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, 'COUNTER_CREATE');
  assert.equal(audits[0]?.entityId, 'counter-1');
  assert.equal(audits[0]?.entityName, 'counters');
  // Filed under the counter's hospital, so that hospital's admins see it.
  assert.equal(audits[0]?.hospitalId, 'saket');
  assert.equal(audits[0]?.ipAddress, '127.0.0.1');
  assert.equal(audits[0]?.newValue?.counterCode, 'C1');
});

test('a missing hospital is refused like an inactive one', async () => {
  const { counters, service } = serviceWith(world);

  await assert.rejects(
    service.create(newCounter({ hospitalId: 'nowhere' }), actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create(newCounter({ restaurantId: 'no-such-cafe' }), actor),
    isRestaurantRefused,
  );
  assert.equal(counters.length, 0);
});

test('a unique-index clash on save is reported as a conflict; other failures pass through', async () => {
  const { fail, service } = serviceWith(world, [counter('c1', 'C1')]);

  // Two saves racing past the code check: the database index catches the second.
  fail.next = uniqueClash();
  await assert.rejects(service.create(newCounter({ counterCode: 'C9' }), actor), isRaceConflict);
  fail.next = uniqueClash();
  await assert.rejects(service.update('c1', { counterCode: 'C9' }, actor), isRaceConflict);

  fail.next = new Error('connection lost');
  await assert.rejects(service.create(newCounter({ counterCode: 'C9' }), actor), /connection lost/);
  // A refusal from inside the save is not turned into a conflict.
  await assert.rejects(service.update('nope', { counterName: 'X' }, actor), isMissing);
});

test('a missing or deleted counter cannot be read, changed or deleted', async () => {
  const { service } = serviceWith(world, [{ ...counter('gone', 'C1'), deletedAt: new Date() }]);

  await assert.rejects(service.getById('gone'), isMissing);
  await assert.rejects(service.getById('nope'), isMissing);
  await assert.rejects(service.update('gone', { counterName: 'X' }, actor), isMissing);
  await assert.rejects(service.remove('gone', actor), isMissing);
});

test('a counter is read back with its hospital and restaurant, and only public fields', async () => {
  const { service } = serviceWith(world, [{ ...counter('c1', 'C1'), updatedBy: 'user-9' }]);

  const read = await service.getById('c1');

  assert.equal(read.counterCode, 'C1');
  assert.equal(read.hospital.id, 'saket');
  assert.equal(read.restaurant.id, 'cafe');
  assert.ok(!('updatedBy' in read));
});

test('the list shows live counters of live hospitals and restaurants, newest first', async () => {
  const { listed, service } = serviceWith(world, [counter('c1', 'C1')]);

  const page = await service.list({});

  const where = { deletedAt: null, hospital: { deletedAt: null }, restaurant: { deletedAt: null } };
  assert.deepEqual(listed[0], {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0,
    take: 20,
    where,
  });
  assert.deepEqual(listed[1], { where });
  assert.deepEqual(page.meta, { limit: 20, page: 1, total: 3, totalPages: 1 });
  assert.equal(page.items.length, 1);
});

test('the list filters by hospital, restaurant and status, and searches codes and names', async () => {
  const { listed, service } = serviceWith(world);

  const page = await service.list({
    hospitalId: 'saket',
    isActive: false,
    limit: 2,
    page: 2,
    restaurantId: 'cafe',
    search: 'front',
    sortBy: 'counterCode',
    sortOrder: 'asc',
  });

  const contains = { contains: 'front', mode: 'insensitive' };
  assert.deepEqual(listed[0], {
    orderBy: [{ counterCode: 'asc' }, { id: 'asc' }],
    skip: 2,
    take: 2,
    where: {
      deletedAt: null,
      hospital: { deletedAt: null },
      hospitalId: 'saket',
      isActive: false,
      OR: [
        { counterCode: contains },
        { counterName: contains },
        { hospital: { hospitalName: contains } },
        { restaurant: { restaurantName: contains } },
      ],
      restaurant: { deletedAt: null },
      restaurantId: 'cafe',
    },
  });
  assert.deepEqual(page.meta, { limit: 2, page: 2, total: 3, totalPages: 2 });
});

test("a counter's devices can be remapped without touching anything else", async () => {
  const { counters, service } = serviceWith(world, [
    {
      ...counter('c1', 'C1'),
      paymentDeviceId: 'PAY-1',
      pineLabsDeviceId: 'PL-1',
      posDeviceId: 'POS-1',
    },
  ]);

  const updated = await service.update(
    'c1',
    { pineLabsDeviceId: 'PL-2', posDeviceId: 'POS-2' },
    { actorId: 'user-2' },
  );

  assert.equal(updated?.posDeviceId, 'POS-2');
  assert.equal(updated?.pineLabsDeviceId, 'PL-2');
  assert.equal(updated?.paymentDeviceId, 'PAY-1');
  assert.equal(updated?.counterCode, 'C1');
  assert.equal(updated?.restaurantId, 'cafe');
  assert.equal(counters[0]?.updatedBy, 'user-2');

  await service.update('c1', { paymentDeviceId: 'PAY-2' }, actor);
  assert.equal(counters[0]?.paymentDeviceId, 'PAY-2');
});

test('a counter may move to another active restaurant of its hospital only', async () => {
  const { service } = serviceWith(world, [counter('c1', 'C1')]);

  await assert.rejects(
    service.update('c1', { restaurantId: 'closed-cafe' }, actor),
    isRestaurantRefused,
  );
  await assert.rejects(
    service.update('c1', { restaurantId: 'vaishali-cafe' }, actor),
    isRestaurantRefused,
  );
  const moved = await service.update('c1', { restaurantId: 'food-court' }, actor);

  assert.equal(moved?.restaurantId, 'food-court');
  assert.equal(moved?.hospitalId, 'saket');
});

test('a counter may not move to an inactive or unknown hospital', async () => {
  const { counters, service } = serviceWith(world, [counter('c1', 'C1')]);

  await assert.rejects(service.update('c1', { hospitalId: 'closed' }, actor), isHospitalRefused);
  await assert.rejects(service.update('c1', { hospitalId: 'nowhere' }, actor), isHospitalRefused);
  assert.equal(counters[0]?.hospitalId, 'saket');
});

test('a counter of an inactive hospital may be switched on while moving to an active one', async () => {
  const off = { ...counter('c1', 'C1'), hospitalId: 'closed', isActive: false };
  const { counters, service } = serviceWith(world, [off]);

  await service.update(
    'c1',
    { hospitalId: 'vaishali', isActive: true, restaurantId: 'vaishali-cafe' },
    actor,
  );

  assert.equal(counters[0]?.isActive, true);
  assert.equal(counters[0]?.hospitalId, 'vaishali');
});

test('renaming a counter does not recheck its restaurant or code', async () => {
  // The restaurant has since been switched off; the counter is still editable.
  const { service } = serviceWith(world, [counter('c1', 'C1', 'closed-cafe')]);

  const renamed = await service.update('c1', { counterName: 'Front' }, actor);

  assert.equal(renamed?.counterName, 'Front');
});

test('an empty edit writes nothing but is still audited', async () => {
  const { audits, service, updates } = serviceWith(world, [counter('c1', 'C1')]);

  const same = await service.update('c1', {}, actor);

  assert.equal(same?.id, 'c1');
  assert.deepEqual(updates, []);
  assert.equal(audits[0]?.action, 'COUNTER_UPDATE');
  assert.deepEqual(audits[0]?.newValue, audits[0]?.oldValue);
});

test('re-sending the status a counter already has is an update, not a status change', async () => {
  const { actions, service } = serviceWith(world, [counter('c1', 'C1')]);

  await service.update('c1', { isActive: true }, actor);
  await service.update('c1', { isActive: false }, actor);
  await service.update('c1', { isActive: true }, actor);

  assert.deepEqual(actions, ['COUNTER_UPDATE', 'COUNTER_STATUS_CHANGE', 'COUNTER_STATUS_CHANGE']);
});

test('a moved counter is audited under its new hospital, with the old one kept', async () => {
  const { audits, service } = serviceWith(world, [counter('c1', 'C1')]);

  await service.update('c1', { hospitalId: 'vaishali', restaurantId: 'vaishali-cafe' }, actor);

  assert.equal(audits[0]?.hospitalId, 'vaishali');
  assert.equal(audits[0]?.oldValue?.hospitalId, 'saket');
  assert.equal(audits[0]?.newValue?.hospitalId, 'vaishali');
});

test('deleting a counter switches it off, records who did it and audits what it was', async () => {
  const { audits, counters, service } = serviceWith(world, [counter('c1', 'C1')]);

  assert.deepEqual(await service.remove('c1', { actorId: 'user-2' }), { id: 'c1' });

  assert.ok(counters[0]?.deletedAt instanceof Date);
  assert.equal(counters[0]?.isActive, false);
  assert.equal(counters[0]?.updatedBy, 'user-2');
  assert.equal(audits[0]?.action, 'COUNTER_DELETE');
  assert.equal(audits[0]?.hospitalId, 'saket');
  assert.equal(audits[0]?.actorId, 'user-2');
  assert.equal(audits[0]?.oldValue?.isActive, true);
});
