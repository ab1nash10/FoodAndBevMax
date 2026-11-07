import { strict as assert } from 'node:assert';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { LocationsRepository } from './locations.repository';
import { LocationsService } from './locations.service';

type StoredLocation = {
  address?: string;
  area?: string;
  building?: string;
  createdBy?: string;
  deletedAt: Date | null;
  floor?: string;
  hospitalId: string;
  id: string;
  isActive: boolean;
  locationName: string;
  updatedBy?: string;
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

// Stands in for the repository: keeps locations in memory; hospitals map id to isActive.
function serviceWith(hospitals: Record<string, boolean>, locations: StoredLocation[] = []) {
  const audits: Audit[] = [];
  const actions: string[] = [];
  const listed: unknown[] = [];
  const updates: string[] = [];
  const softDeletedChildrenOf: string[] = [];
  const withHospital = (location: StoredLocation) => ({
    ...location,
    hospital: {
      hospitalCode: location.hospitalId,
      hospitalName: location.hospitalId,
      id: location.hospitalId,
      isActive: hospitals[location.hospitalId],
    },
  });
  const repository = {
    count: (args: unknown) => {
      listed.push(args);
      return 0;
    },
    create: (data: Omit<StoredLocation, 'deletedAt' | 'id'>) => {
      const location = { ...data, deletedAt: null, id: `location-${locations.length + 1}` };
      locations.push(location);
      return withHospital(location);
    },
    findActiveById: (id: string) => {
      const location = locations.find((stored) => stored.id === id && !stored.deletedAt);
      return location ? withHospital(location) : null;
    },
    findActiveHospital: (id: string) => (id in hospitals ? { id, isActive: hospitals[id] } : null),
    findMany: (args: unknown) => {
      listed.push(args);
      return locations.map((location) => ({ ...withHospital(location), createdBy: 'hidden' }));
    },
    softDeleteChildren: (id: string) => {
      softDeletedChildrenOf.push(id);
    },
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (
      id: string,
      data: Partial<StoredLocation> & { hospital?: { connect: { id: string } } },
    ) => {
      updates.push(id);
      const location = locations.find((stored) => stored.id === id)!;
      const { hospital, ...fields } = data;
      Object.assign(location, fields);
      location.hospitalId = hospital?.connect.id ?? location.hospitalId;
      return withHospital(location);
    },
  };
  const service = new LocationsService(
    {
      record: (input: Audit) => {
        audits.push(input);
        actions.push(input.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as LocationsRepository,
  );

  return { actions, audits, listed, locations, service, softDeletedChildrenOf, updates };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const blockA = (): StoredLocation => ({
  deletedAt: null,
  hospitalId: 'saket',
  id: 'l1',
  isActive: true,
  locationName: 'Block A',
});
const isHospitalRefused = (error: unknown) =>
  error instanceof BadRequestException && error.message === 'Hospital not found or inactive';
const isMissing = (error: unknown) =>
  error instanceof NotFoundException && error.message === 'Location not found';

test('a location is added only under an active hospital, and starts active', async () => {
  const { service } = serviceWith({ closed: false, saket: true });

  await assert.rejects(
    service.create({ hospitalId: 'closed', locationName: 'Old Wing' }, actor),
    isHospitalRefused,
  );
  await assert.rejects(
    service.create({ hospitalId: 'missing', locationName: 'Old Wing' }, actor),
    isHospitalRefused,
  );
  const created = await service.create({ hospitalId: 'saket', locationName: 'Main Block' }, actor);
  assert.equal(created.isActive, true);
  assert.equal(created.hospital.id, 'saket');
});

test('a location may move only to an active hospital', async () => {
  const { service } = serviceWith({ closed: false, saket: true, vaishali: true }, [blockA()]);

  await assert.rejects(service.update('l1', { hospitalId: 'closed' }, actor), isHospitalRefused);
  const moved = await service.update('l1', { hospitalId: 'vaishali' }, actor);
  assert.equal(moved.hospitalId, 'vaishali');
});

test('a location cannot be switched on while its hospital is inactive, unless it moves to an active one', async () => {
  const off = { ...blockA(), hospitalId: 'closed', isActive: false };
  const { locations, service } = serviceWith({ closed: false, saket: true }, [off]);

  await assert.rejects(
    service.update('l1', { isActive: true }, actor),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Location is inactive. Area cannot be activated.',
  );
  await assert.doesNotReject(service.update('l1', { isActive: false }, actor));
  await service.update('l1', { hospitalId: 'saket', isActive: true }, actor);
  assert.equal(locations[0]?.isActive, true);
});

test('switching a location off is audited as a status change, a rename as an update', async () => {
  const { actions, service } = serviceWith({ saket: true }, [blockA()]);

  await service.update('l1', { locationName: 'Block B' }, actor);
  await service.update('l1', { isActive: false }, actor);
  // Sending the status it already has is not a change.
  await service.update('l1', { isActive: false }, actor);

  assert.deepEqual(actions, ['LOCATION_UPDATE', 'LOCATION_STATUS_CHANGE', 'LOCATION_UPDATE']);
});

test('deleting a location soft-deletes it and what sits in it', async () => {
  const { actions, locations, service, softDeletedChildrenOf } = serviceWith({ saket: true }, [
    blockA(),
  ]);

  await service.remove('l1', actor);

  assert.deepEqual(softDeletedChildrenOf, ['l1']);
  assert.equal(locations[0]?.isActive, false);
  assert.ok(locations[0]?.deletedAt);
  assert.deepEqual(actions, ['LOCATION_DELETE']);
  await assert.rejects(service.getById('l1'), NotFoundException);
  await assert.rejects(service.remove('l1', actor), NotFoundException);
});

test('a new location keeps every detail sent, records its creator and is audited', async () => {
  const { audits, locations, service } = serviceWith({ saket: true });

  const created = await service.create(
    {
      address: 'Press Enclave Road',
      area: 'East',
      building: 'Tower 2',
      floor: 'Ground',
      hospitalId: 'saket',
      isActive: false,
      locationName: 'Food Court',
    },
    actor,
  );

  assert.equal(created.address, 'Press Enclave Road');
  assert.equal(created.area, 'East');
  assert.equal(created.building, 'Tower 2');
  assert.equal(created.floor, 'Ground');
  assert.equal(created.isActive, false);
  assert.equal(created.hospital.hospitalCode, 'saket');
  assert.equal(locations[0]?.createdBy, 'user-1');
  assert.equal(locations[0]?.updatedBy, 'user-1');
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, 'LOCATION_CREATE');
  assert.equal(audits[0]?.entityId, 'location-1');
  assert.equal(audits[0]?.entityName, 'locations');
  // The audit row is filed under the location's hospital, so that hospital's admins see it.
  assert.equal(audits[0]?.hospitalId, 'saket');
  assert.equal(audits[0]?.ipAddress, '127.0.0.1');
  assert.equal(audits[0]?.newValue?.locationName, 'Food Court');
});

test('a missing or deleted location cannot be read or changed', async () => {
  const { service } = serviceWith({ saket: true }, [
    { ...blockA(), deletedAt: new Date(), id: 'gone' },
  ]);

  await assert.rejects(service.getById('gone'), isMissing);
  await assert.rejects(service.getById('nope'), isMissing);
  await assert.rejects(service.update('gone', { locationName: 'X' }, actor), isMissing);
  await assert.rejects(service.remove('nope', actor), isMissing);
});

test('a location is read back with its hospital and only its public fields', async () => {
  const { service } = serviceWith({ saket: true }, [{ ...blockA(), updatedBy: 'user-9' }]);

  const read = await service.getById('l1');

  assert.equal(read.locationName, 'Block A');
  assert.deepEqual(read.hospital, {
    hospitalCode: 'saket',
    hospitalName: 'saket',
    id: 'saket',
    isActive: true,
  });
  assert.ok(!('updatedBy' in read));
});

test('the list shows live locations of live hospitals, newest first, 20 to a page', async () => {
  const { listed, service } = serviceWith({ saket: true }, [blockA()]);

  const page = await service.list({});

  const where = { deletedAt: null, hospital: { deletedAt: null } };
  assert.deepEqual(listed[0], {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0,
    take: 20,
    where,
  });
  assert.deepEqual(listed[1], { where });
  assert.deepEqual(page.meta, { limit: 20, page: 1, total: 0, totalPages: 0 });
  assert.equal(page.items.length, 1);
  assert.ok(!('createdBy' in page.items[0]!));
});

test('the list filters by hospital, status, building, floor and area, and searches', async () => {
  const { listed, service } = serviceWith({});

  await service.list({
    area: 'east',
    building: 'tower',
    floor: 'ground',
    hospitalId: 'saket',
    isActive: false,
    limit: 25,
    page: 4,
    search: 'court',
    sortBy: 'locationName',
    sortOrder: 'asc',
  });

  const contains = (text: string) => ({ contains: text, mode: 'insensitive' });
  assert.deepEqual(listed[0], {
    orderBy: [{ locationName: 'asc' }, { id: 'asc' }],
    skip: 75,
    take: 25,
    where: {
      area: contains('east'),
      building: contains('tower'),
      deletedAt: null,
      floor: contains('ground'),
      hospital: { deletedAt: null },
      hospitalId: 'saket',
      isActive: false,
      OR: [
        { address: contains('court') },
        { area: contains('court') },
        { building: contains('court') },
        { floor: contains('court') },
        { hospital: { hospitalName: contains('court') } },
        { locationName: contains('court') },
      ],
    },
  });
});

test('an edit changes only the fields sent and records who made it', async () => {
  const { locations, service } = serviceWith({ saket: true }, [
    { ...blockA(), area: 'East', building: 'Tower 1', floor: '1', updatedBy: 'user-0' },
  ]);

  const updated = await service.update(
    'l1',
    { address: 'Gate 3', building: 'Tower 2', floor: '2' },
    { actorId: 'user-2' },
  );

  assert.equal(updated.address, 'Gate 3');
  assert.equal(updated.building, 'Tower 2');
  assert.equal(updated.floor, '2');
  assert.equal(updated.area, 'East');
  assert.equal(updated.locationName, 'Block A');
  assert.equal(updated.hospitalId, 'saket');
  assert.equal(locations[0]?.updatedBy, 'user-2');

  await service.update('l1', { area: 'West' }, actor);
  assert.equal(locations[0]?.area, 'West');
});

test('an empty edit writes nothing but is still audited', async () => {
  const { audits, service, updates } = serviceWith({ saket: true }, [blockA()]);

  const same = await service.update('l1', {}, actor);

  assert.equal(same.id, 'l1');
  assert.deepEqual(updates, []);
  assert.equal(audits[0]?.action, 'LOCATION_UPDATE');
  assert.deepEqual(audits[0]?.newValue, audits[0]?.oldValue);
});

test('a moved location is audited under its new hospital, with the old one kept', async () => {
  const { audits, service } = serviceWith({ saket: true, vaishali: true }, [blockA()]);

  await service.update('l1', { hospitalId: 'vaishali' }, actor);

  assert.equal(audits[0]?.hospitalId, 'vaishali');
  assert.equal(audits[0]?.oldValue?.hospitalId, 'saket');
  assert.equal(audits[0]?.newValue?.hospitalId, 'vaishali');
});

test('a deleted location is audited under its hospital, with what it was', async () => {
  const { audits, locations, service } = serviceWith({ saket: true }, [blockA()]);

  assert.deepEqual(await service.remove('l1', { actorId: 'user-2' }), { id: 'l1' });

  assert.equal(locations[0]?.updatedBy, 'user-2');
  assert.equal(audits[0]?.hospitalId, 'saket');
  assert.equal(audits[0]?.actorId, 'user-2');
  assert.equal(audits[0]?.oldValue?.isActive, true);
});
