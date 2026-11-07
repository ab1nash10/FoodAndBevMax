import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

type StoredStore = {
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  locationId: string | null;
  storeCode: string;
  storeName: string;
};

type World = {
  hospitals: Record<string, boolean>;
  locations?: Record<string, { hospitalId: string; isActive: boolean }>;
  /** Values the store code sequence hands out, in order. */
  sequence?: number[];
  stores?: StoredStore[];
};

// Stands in for the repository: keeps stores in memory and filters like the real queries.
function serviceWith(world: World) {
  const stores = world.stores ?? [];
  const sequence = [...(world.sequence ?? [])];
  let nextValue = 0;
  const actions: string[] = [];
  const unlinked: string[] = [];
  const withRelations = (store: StoredStore) => ({
    ...store,
    hospital: {
      hospitalCode: store.hospitalId,
      hospitalName: store.hospitalId,
      id: store.hospitalId,
      isActive: world.hospitals[store.hospitalId] ?? false,
    },
    location: null,
  });
  const repository = {
    create: (data: Omit<StoredStore, 'deletedAt' | 'id'>) => {
      const store = { ...data, deletedAt: null, id: `store-${stores.length + 1}` };
      stores.push(store);
      return withRelations(store);
    },
    findActiveById: (id: string) => {
      const store = stores.find((stored) => stored.id === id && !stored.deletedAt);
      return store ? withRelations(store) : null;
    },
    findActiveHospital: (id: string) =>
      id in world.hospitals ? { id, isActive: world.hospitals[id] } : null,
    findActiveLocation: (id: string, hospitalId: string) => {
      const location = world.locations?.[id];
      return location?.hospitalId === hospitalId ? { id, ...location } : null;
    },
    findByCode: (storeCode: string) =>
      stores.find((store) => store.storeCode === storeCode) ?? null,
    findByCodeWithinHospital: (hospitalId: string, storeCode: string, excludeId?: string) =>
      stores.find(
        (store) =>
          store.hospitalId === hospitalId &&
          store.storeCode === storeCode &&
          store.id !== excludeId,
      ) ?? null,
    getNextStoreCodeSequenceValue: () => sequence.shift() ?? (nextValue += 1),
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    unlinkRestaurants: (id: string) => {
      unlinked.push(id);
    },
    update: (
      id: string,
      data: Partial<StoredStore> & {
        hospital?: { connect: { id: string } };
        location?: { connect?: { id: string }; disconnect?: true };
      },
    ) => {
      const store = stores.find((stored) => stored.id === id)!;
      const { hospital, location, ...fields } = data;
      Object.assign(store, fields);
      store.hospitalId = hospital?.connect.id ?? store.hospitalId;
      store.locationId = location?.disconnect ? null : (location?.connect?.id ?? store.locationId);
      return withRelations(store);
    },
  };
  const service = new StoresService(
    {
      record: (input: { action: string }) => {
        actions.push(input.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as StoresRepository,
  );

  return { actions, service, stores, unlinked };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const store = (id: string, storeCode: string, hospitalId = 'saket'): StoredStore => ({
  deletedAt: null,
  hospitalId,
  id,
  isActive: true,
  locationId: null,
  storeCode,
  storeName: id,
});

test('a new store gets the next store code the sequence gives that is not taken', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    stores: [store('old', 'STR0001')],
  });

  const created = await service.create({ hospitalId: 'saket', storeName: 'Main Store' }, actor);

  assert.equal(created?.storeCode, 'STR0002');
  assert.equal(created?.isActive, true);
});

test('a broken or exhausted store code sequence stops the save', async () => {
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, sequence: [0] }).service.create(
      { hospitalId: 'saket', storeName: 'Main Store' },
      actor,
    ),
    InternalServerErrorException,
  );

  // Ten codes in a row already taken.
  const taken = Array.from({ length: 10 }, (_, index) =>
    store(`s${index}`, `STR${String(index + 1).padStart(4, '0')}`),
  );
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, stores: taken }).service.create(
      { hospitalId: 'saket', storeName: 'Main Store' },
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Store code already exists',
  );
});

test('a store needs an active location, and an area only of that location', async () => {
  const { service } = serviceWith({
    hospitals: { closed: false, saket: true },
    locations: {
      'saket-old-wing': { hospitalId: 'saket', isActive: false },
      'vaishali-ground': { hospitalId: 'vaishali', isActive: true },
    },
  });
  const isHospitalRefused = (error: unknown) =>
    error instanceof BadRequestException && error.message === 'Hospital not found or inactive';
  const isAreaRefused = (error: unknown) =>
    error instanceof BadRequestException && error.message === 'Location not found or inactive';

  await assert.rejects(
    service.create({ hospitalId: 'closed', storeName: 'S' }, actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'missing', storeName: 'S' }, actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'saket', locationId: 'vaishali-ground', storeName: 'S' }, actor),
    isAreaRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'saket', locationId: 'saket-old-wing', storeName: 'S' }, actor),
    isAreaRefused,
  );
});

test('a store moved to another location leaves the old location\'s area behind', async () => {
  const { service, stores } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    locations: { 'saket-ground': { hospitalId: 'saket', isActive: true } },
    stores: [{ ...store('s1', 'STR0001'), locationId: 'saket-ground' }],
  });

  await service.update('s1', { storeName: 'Renamed' }, actor);
  assert.equal(stores[0]!.locationId, 'saket-ground');
  await service.update('s1', { hospitalId: 'vaishali' }, actor);
  assert.deepEqual([stores[0]!.hospitalId, stores[0]!.locationId], ['vaishali', null]);
});

test('a store under an inactive location cannot be switched back on', async () => {
  const { actions, service } = serviceWith({
    hospitals: { closed: false },
    stores: [{ ...store('s1', 'STR0001', 'closed'), isActive: false }],
  });

  await assert.rejects(
    service.update('s1', { isActive: true }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Location is inactive. Store cannot be activated.',
  );
  await assert.doesNotReject(service.update('s1', { storeName: 'Renamed' }, actor));
  assert.deepEqual(actions, ['STORE_UPDATE']);
});

test('switching a store off is audited as a status change', async () => {
  const { actions, service } = serviceWith({
    hospitals: { saket: true },
    stores: [store('s1', 'STR0001')],
  });

  await service.update('s1', { isActive: false }, actor);

  assert.deepEqual(actions, ['STORE_STATUS_CHANGE']);
});

test('a store code is used once within a location, but may repeat at another', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    stores: [store('s1', 'STR0001'), store('s2', 'STR0002'), store('v1', 'STR0009', 'vaishali')],
  });

  await assert.rejects(
    service.update('s2', { storeCode: 'STR0001' }, actor),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Store code already exists within hospital',
  );
  // Moving to a location where its code is taken clashes too.
  await assert.rejects(
    service.update('v1', { hospitalId: 'saket', storeCode: 'STR0002' }, actor),
    ConflictException,
  );
  await assert.doesNotReject(service.update('s1', { storeCode: 'STR0001' }, actor));
  await assert.doesNotReject(service.update('s2', { storeCode: 'STR0009' }, actor));
});

test('deleting a store unlinks its restaurants and hides it', async () => {
  const { actions, service, stores, unlinked } = serviceWith({
    hospitals: { saket: true },
    stores: [store('s1', 'STR0001')],
  });

  await service.remove('s1', actor);

  assert.deepEqual(unlinked, ['s1']);
  assert.equal(stores[0]?.isActive, false);
  assert.ok(stores[0]?.deletedAt);
  assert.deepEqual(actions, ['STORE_DELETE']);
  await assert.rejects(service.getById('s1'), NotFoundException);
});
