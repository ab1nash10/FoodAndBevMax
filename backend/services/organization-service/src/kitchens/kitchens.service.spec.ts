import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { KitchensRepository } from './kitchens.repository';
import { KitchensService } from './kitchens.service';

type StoredKitchen = {
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  locationId: string | null;
  kitchenCode: string;
  kitchenName: string;
};

type World = {
  hospitals: Record<string, boolean>;
  locations?: Record<string, { hospitalId: string; isActive: boolean }>;
  /** Values the kitchen code sequence hands out, in order. */
  sequence?: number[];
  kitchens?: StoredKitchen[];
};

// Stands in for the repository: keeps kitchens in memory and filters like the real queries.
function serviceWith(world: World) {
  const kitchens = world.kitchens ?? [];
  const sequence = [...(world.sequence ?? [])];
  let nextValue = 0;
  const actions: string[] = [];
  const unlinked: string[] = [];
  const withRelations = (kitchen: StoredKitchen) => ({
    ...kitchen,
    hospital: {
      hospitalCode: kitchen.hospitalId,
      hospitalName: kitchen.hospitalId,
      id: kitchen.hospitalId,
      isActive: world.hospitals[kitchen.hospitalId] ?? false,
    },
    location: null,
  });
  const repository = {
    create: (data: Omit<StoredKitchen, 'deletedAt' | 'id'>) => {
      const kitchen = { ...data, deletedAt: null, id: `kitchen-${kitchens.length + 1}` };
      kitchens.push(kitchen);
      return withRelations(kitchen);
    },
    findActiveById: (id: string) => {
      const kitchen = kitchens.find((stored) => stored.id === id && !stored.deletedAt);
      return kitchen ? withRelations(kitchen) : null;
    },
    findActiveHospital: (id: string) =>
      id in world.hospitals ? { id, isActive: world.hospitals[id] } : null,
    findActiveLocation: (id: string, hospitalId: string) => {
      const location = world.locations?.[id];
      return location?.hospitalId === hospitalId ? { id, ...location } : null;
    },
    findByCode: (kitchenCode: string) =>
      kitchens.find((kitchen) => kitchen.kitchenCode === kitchenCode) ?? null,
    findByCodeWithinHospital: (hospitalId: string, kitchenCode: string, excludeId?: string) =>
      kitchens.find(
        (kitchen) =>
          kitchen.hospitalId === hospitalId &&
          kitchen.kitchenCode === kitchenCode &&
          kitchen.id !== excludeId,
      ) ?? null,
    getNextKitchenCodeSequenceValue: () => sequence.shift() ?? (nextValue += 1),
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    unlinkRestaurants: (id: string) => {
      unlinked.push(id);
    },
    update: (
      id: string,
      data: Partial<StoredKitchen> & {
        hospital?: { connect: { id: string } };
        location?: { connect: { id: string } };
      },
    ) => {
      const kitchen = kitchens.find((stored) => stored.id === id)!;
      const { hospital, location, ...fields } = data;
      Object.assign(kitchen, fields);
      kitchen.hospitalId = hospital?.connect.id ?? kitchen.hospitalId;
      kitchen.locationId = location?.connect.id ?? kitchen.locationId;
      return withRelations(kitchen);
    },
  };
  const service = new KitchensService(
    {
      record: (input: { action: string }) => {
        actions.push(input.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as KitchensRepository,
  );

  return { actions, service, kitchens, unlinked };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const kitchen = (id: string, kitchenCode: string, hospitalId = 'saket'): StoredKitchen => ({
  deletedAt: null,
  hospitalId,
  id,
  isActive: true,
  locationId: null,
  kitchenCode,
  kitchenName: id,
});

test('a new kitchen gets the next kitchen code the sequence gives that is not taken', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true },
    kitchens: [kitchen('old', 'KIT0001')],
  });

  const created = await service.create({ hospitalId: 'saket', kitchenName: 'Main Kitchen' }, actor);

  assert.equal(created?.kitchenCode, 'KIT0002');
  assert.equal(created?.isActive, true);
});

test('a broken or exhausted kitchen code sequence stops the save', async () => {
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, sequence: [0] }).service.create(
      { hospitalId: 'saket', kitchenName: 'Main Kitchen' },
      actor,
    ),
    InternalServerErrorException,
  );

  // Ten codes in a row already taken.
  const taken = Array.from({ length: 10 }, (_, index) =>
    kitchen(`s${index}`, `KIT${String(index + 1).padStart(4, '0')}`),
  );
  await assert.rejects(
    serviceWith({ hospitals: { saket: true }, kitchens: taken }).service.create(
      { hospitalId: 'saket', kitchenName: 'Main Kitchen' },
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Kitchen code already exists',
  );
});

test('a kitchen needs an active location, and an area only of that location', async () => {
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
    service.create({ hospitalId: 'closed', kitchenName: 'S' }, actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'missing', kitchenName: 'S' }, actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'saket', locationId: 'vaishali-ground', kitchenName: 'S' }, actor),
    isAreaRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'saket', locationId: 'saket-old-wing', kitchenName: 'S' }, actor),
    isAreaRefused,
  );
});

test('a kitchen under an inactive location cannot be switched back on', async () => {
  const { actions, service } = serviceWith({
    hospitals: { closed: false },
    kitchens: [{ ...kitchen('s1', 'KIT0001', 'closed'), isActive: false }],
  });

  await assert.rejects(
    service.update('s1', { isActive: true }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Location is inactive. Kitchen cannot be activated.',
  );
  await assert.doesNotReject(service.update('s1', { kitchenName: 'Renamed' }, actor));
  assert.deepEqual(actions, ['KITCHEN_UPDATE']);
});

test('switching a kitchen off is audited as a status change', async () => {
  const { actions, service } = serviceWith({
    hospitals: { saket: true },
    kitchens: [kitchen('s1', 'KIT0001')],
  });

  await service.update('s1', { isActive: false }, actor);

  assert.deepEqual(actions, ['KITCHEN_STATUS_CHANGE']);
});

test('a kitchen code is used once within a location, but may repeat at another', async () => {
  const { service } = serviceWith({
    hospitals: { saket: true, vaishali: true },
    kitchens: [
      kitchen('s1', 'KIT0001'),
      kitchen('s2', 'KIT0002'),
      kitchen('v1', 'KIT0009', 'vaishali'),
    ],
  });

  await assert.rejects(
    service.update('s2', { kitchenCode: 'KIT0001' }, actor),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Kitchen code already exists within hospital',
  );
  // Moving to a location where its code is taken clashes too.
  await assert.rejects(
    service.update('v1', { hospitalId: 'saket', kitchenCode: 'KIT0002' }, actor),
    ConflictException,
  );
  await assert.doesNotReject(service.update('s1', { kitchenCode: 'KIT0001' }, actor));
  await assert.doesNotReject(service.update('s2', { kitchenCode: 'KIT0009' }, actor));
});

test('deleting a kitchen unlinks its restaurants and hides it', async () => {
  const { actions, service, kitchens, unlinked } = serviceWith({
    hospitals: { saket: true },
    kitchens: [kitchen('s1', 'KIT0001')],
  });

  await service.remove('s1', actor);

  assert.deepEqual(unlinked, ['s1']);
  assert.equal(kitchens[0]?.isActive, false);
  assert.ok(kitchens[0]?.deletedAt);
  assert.deepEqual(actions, ['KITCHEN_DELETE']);
  await assert.rejects(service.getById('s1'), NotFoundException);
});
