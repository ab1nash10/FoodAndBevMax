import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PosDevicesRepository } from './pos-devices.repository';
import { PosDevicesService } from './pos-devices.service';

interface Device {
  code: string;
  deletedAt: Date | null;
  hospitalId: string;
  hostName: string | null;
  id: string;
  isActive: boolean;
  legalEntityId: string | null;
  name: string;
  restaurantIds: string[];
}

const hospitals = [
  { id: 'saket', isActive: true, legalEntityId: 'entity-a' },
  { id: 'closed', isActive: false, legalEntityId: 'entity-a' },
  { id: 'patparganj', isActive: true, legalEntityId: 'entity-b' },
];
const restaurants = [
  { hospitalId: 'saket', id: 'cafe', legalEntityId: null, restaurantName: 'Cafe' },
  { hospitalId: 'saket', id: 'canteen', legalEntityId: 'entity-b', restaurantName: 'Canteen' },
  { hospitalId: 'patparganj', id: 'kiosk', legalEntityId: null, restaurantName: 'Kiosk' },
];
const entityName = (id: string | null) => (id ? { entityName: id, id } : null);

// Stands in for the repository and the transaction client: devices and their restaurant links in
// memory, filtered like the real queries (host names compared case-insensitively).
function serviceWith(devices: Device[]) {
  const audits: string[] = [];
  const synced: Array<{ id: string; restaurantIds: string[] }> = [];
  const withRelations = (device: Device) => ({
    ...device,
    hospital: {
      hospitalCode: device.hospitalId,
      hospitalName: device.hospitalId,
      id: device.hospitalId,
      isActive: true,
    },
    isInvoicePrintEnabled: false,
    isKotPrintEnabled: false,
    restaurants: device.restaurantIds.map((restaurantId) => ({
      restaurant: {
        ...restaurants.find((entry) => entry.id === restaurantId)!,
        isActive: true,
        restaurantCode: restaurantId,
      },
      restaurantId,
    })),
  });
  const tx = {
    legalEntity: {
      findFirst: ({ where }: { where: { id: string } }) =>
        ['entity-a', 'entity-b'].includes(where.id) ? { id: where.id } : null,
    },
    // The legal-entity check: every link of the device, with each side's entity.
    posDeviceRestaurant: {
      findMany: ({ where }: { where: { AND: Array<{ posDeviceId?: string }> } }) => {
        const device = devices.find((entry) => entry.id === where.AND[0]!.posDeviceId)!;
        const deviceHospital = hospitals.find((entry) => entry.id === device.hospitalId)!;
        return device.restaurantIds.map((restaurantId) => {
          const restaurant = restaurants.find((entry) => entry.id === restaurantId)!;
          const restaurantHospital = hospitals.find((entry) => entry.id === restaurant.hospitalId)!;
          return {
            posDevice: {
              hospital: { legalEntity: entityName(deviceHospital.legalEntityId) },
              legalEntity: entityName(device.legalEntityId),
              name: device.name,
            },
            restaurant: {
              hospital: { legalEntity: entityName(restaurantHospital.legalEntityId) },
              legalEntity: entityName(restaurant.legalEntityId),
              restaurantName: restaurant.restaurantName,
            },
          };
        });
      },
    },
  };
  const repository = {
    create: (data: Omit<Device, 'deletedAt' | 'id' | 'restaurantIds'>) => {
      const device = {
        ...data,
        deletedAt: null,
        id: `device-${devices.length + 1}`,
        restaurantIds: [],
      };
      devices.push(device);
      return withRelations(device);
    },
    findActiveById: (id: string) => {
      const device = devices.find((entry) => entry.id === id && !entry.deletedAt);
      return device ? withRelations(device) : null;
    },
    findActiveHospital: (id: string) => hospitals.find((entry) => entry.id === id) ?? null,
    findActiveRestaurants: (ids: string[], hospitalId: string) =>
      restaurants.filter((entry) => ids.includes(entry.id) && entry.hospitalId === hospitalId),
    findByCodeWithinHospital: (hospitalId: string, code: string, excludeId?: string) =>
      devices.find(
        (entry) => entry.hospitalId === hospitalId && entry.code === code && entry.id !== excludeId,
      ) ?? null,
    findByHostName: (hostName: string, excludeId?: string) => {
      const device = devices.find(
        (entry) =>
          !entry.deletedAt &&
          entry.hostName?.toLowerCase() === hostName.toLowerCase() &&
          entry.id !== excludeId,
      );
      return device ? withRelations(device) : null;
    },
    softDeleteChildren: (id: string) => {
      devices.find((entry) => entry.id === id)!.restaurantIds = [];
    },
    syncRestaurants: (id: string, restaurantIds: string[]) => {
      synced.push({ id, restaurantIds });
      devices.find((entry) => entry.id === id)!.restaurantIds = restaurantIds;
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (id: string, data: Record<string, unknown>) => {
      const device = devices.find((entry) => entry.id === id)!;
      const { hospital, legalEntity, ...rest } = data as {
        hospital?: { connect: { id: string } };
        legalEntity?: { connect?: { id: string }; disconnect?: true };
      };
      Object.assign(device, rest);
      if (hospital) device.hospitalId = hospital.connect.id;
      if (legalEntity) device.legalEntityId = legalEntity.connect?.id ?? null;
      return withRelations(device);
    },
  };
  const service = new PosDevicesService(
    {
      record: (entry: { action: string }) => {
        audits.push(entry.action);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as PosDevicesRepository,
  );

  return { audits, service, synced };
}

const device = (overrides: Partial<Device>): Device => ({
  code: 'POS-01',
  deletedAt: null,
  hospitalId: 'saket',
  hostName: 'MAX-SKT-POS-01',
  id: 'device-1',
  isActive: true,
  legalEntityId: null,
  name: 'Ground floor till',
  restaurantIds: ['cafe'],
  ...overrides,
});
const actor = { actorId: 'admin-1' };

test('a till host name is tagged to one POS device only, whatever its case', async () => {
  const { service } = serviceWith([device({})]);

  await assert.rejects(
    service.create(
      { code: 'POS-02', hospitalId: 'saket', hostName: ' max-skt-pos-01 ', name: 'Second till' },
      actor,
    ),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message ===
        'Host name max-skt-pos-01 is already tagged to Cafe (POS device Ground floor till)',
  );
  // A device keeps its own host name on an edit.
  await assert.doesNotReject(service.update('device-1', { hostName: 'MAX-SKT-POS-01' }, actor));
});

test('a host name freed by a deleted device can be used again', async () => {
  const { service } = serviceWith([device({ deletedAt: new Date() })]);

  const created = await service.create(
    { code: 'POS-02', hospitalId: 'saket', hostName: 'MAX-SKT-POS-01', name: 'Replacement' },
    actor,
  );
  assert.equal(created.hostName, 'MAX-SKT-POS-01');
});

test('a device code is unique within its location', async () => {
  const { service } = serviceWith([device({})]);

  await assert.rejects(
    service.create({ code: 'POS-01', hospitalId: 'saket', name: 'Clash' }, actor),
    ConflictException,
  );
  await assert.doesNotReject(
    service.create({ code: 'POS-01', hospitalId: 'patparganj', name: 'Other site' }, actor),
  );
});

test('a device serves only active restaurants of its own active location', async () => {
  const { service } = serviceWith([]);

  await assert.rejects(
    service.create({ code: 'P', hospitalId: 'closed', name: 'Till' }, actor),
    BadRequestException,
  );
  await assert.rejects(
    service.create(
      { code: 'P', hospitalId: 'saket', name: 'Till', restaurantIds: ['kiosk'] },
      actor,
    ),
    (error: unknown) => error instanceof BadRequestException && /do not belong/.test(error.message),
  );
  await assert.rejects(
    service.create({ code: 'P', hospitalId: 'saket', legalEntityId: 'gone', name: 'Till' }, actor),
    (error: unknown) => error instanceof BadRequestException && /active entity/.test(error.message),
  );
});

test('a device bills for one legal entity, so it cannot serve another entity’s restaurant', async () => {
  const { audits, service, synced } = serviceWith([]);

  await assert.rejects(
    service.create(
      { code: 'P', hospitalId: 'saket', name: 'Till', restaurantIds: ['cafe', 'canteen'] },
      actor,
    ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      /Till bills under entity-a, but Canteen belongs to entity-b/.test(error.message),
  );

  // The same restaurant twice is linked once.
  const created = await service.create(
    { code: 'Q', hospitalId: 'saket', name: 'Till', restaurantIds: ['cafe', 'cafe'] },
    actor,
  );
  assert.deepEqual(created.restaurantIds, ['cafe']);
  assert.deepEqual(synced.at(-1), { id: created.id, restaurantIds: ['cafe'] });
  assert.equal(created.isActive, true);
  assert.equal(audits.at(-1), 'POS_DEVICE_CREATE');
});

test('restaurant links change only when sent, or when the device moves location', async () => {
  const { service, synced } = serviceWith([device({})]);

  await service.update('device-1', { name: 'Renamed' }, actor);
  assert.equal(synced.length, 0);

  // Moving location drops links to the old location's restaurants.
  const moved = await service.update('device-1', { hospitalId: 'patparganj' }, actor);
  assert.deepEqual(synced, [{ id: 'device-1', restaurantIds: [] }]);
  assert.equal(moved.hospitalId, 'patparganj');
  assert.deepEqual(moved.restaurantIds, []);
});

test('switching a device off is logged as a status change; deleting it drops its links', async () => {
  const { audits, service } = serviceWith([device({})]);

  await service.update('device-1', { isActive: false }, actor);
  assert.equal(audits.at(-1), 'POS_DEVICE_STATUS_CHANGE');
  await service.update('device-1', { isActive: false, name: 'Same status' }, actor);
  assert.equal(audits.at(-1), 'POS_DEVICE_UPDATE');

  assert.deepEqual(await service.remove('device-1', actor), { id: 'device-1' });
  assert.equal(audits.at(-1), 'POS_DEVICE_DELETE');
  await assert.rejects(service.getById('device-1'), NotFoundException);
});

test('only a Super Admin may move a POS device to another legal entity', async () => {
  const { service } = serviceWith([device({ legalEntityId: 'entity-a', restaurantIds: [] })]);

  await assert.rejects(
    service.update('device-1', { legalEntityId: 'entity-b' }, actor),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === 'Only a Super Admin can change the legal entity',
  );
  await assert.rejects(
    service.update('device-1', { legalEntityId: null }, actor),
    ForbiddenException,
  );
  // The form sends the current entity back with every save.
  await assert.doesNotReject(
    service.update('device-1', { legalEntityId: 'entity-a', name: 'Till' }, actor),
  );

  const moved = await service.update(
    'device-1',
    { legalEntityId: 'entity-b' },
    { ...actor, roles: ['Super Admin'] },
  );
  assert.equal(moved.legalEntityId, 'entity-b');
});
