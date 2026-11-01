import { strict as assert } from 'node:assert';
import { ROLES_KEY } from '@aahar/auth';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { LegalEntity } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import { LegalEntitiesController } from './legal-entities.controller';
import type { LegalEntitiesRepository } from './legal-entities.repository';
import { LegalEntitiesService } from './legal-entities.service';
import { normalizeGstNumber } from './legal-entity-guards';

type Audit = {
  action: string;
  actorId: string;
  entityId: string;
  entityName: string;
  ipAddress?: string;
  newValue?: Partial<LegalEntity>;
  oldValue?: Partial<LegalEntity>;
};

// Stands in for the repository: keeps entities in memory and filters like the real queries.
// Reads hand out copies, as Prisma does, so the service's "before" value stays as it was.
function setup(entities: LegalEntity[] = [], links: Record<string, number> = {}) {
  const audits: Audit[] = [];
  const listed: unknown[] = [];
  const updates: string[] = [];
  const repository = {
    count: (args: unknown) => {
      listed.push(args);
      return 41;
    },
    countLinks: (id: string) => links[id] ?? 0,
    create: (data: Partial<LegalEntity>) => {
      const entity = {
        ...data,
        deletedAt: null,
        id: `entity-${entities.length + 1}`,
      } as LegalEntity;
      entities.push(entity);
      return { ...entity };
    },
    findActiveById: (id: string) => {
      const entity = entities.find((stored) => stored.id === id && !stored.deletedAt);
      return entity ? { ...entity } : null;
    },
    findDuplicate: (gstNumber: string, entityAddress: string, excludeId?: string) =>
      entities.find(
        (entity) =>
          entity.gstNumber === gstNumber &&
          entity.entityAddress.toLowerCase() === entityAddress.toLowerCase() &&
          entity.id !== excludeId &&
          !entity.deletedAt,
      ) ?? null,
    findMany: (args: unknown) => {
      listed.push(args);
      return entities.map((entity) => ({ ...entity, createdBy: 'hidden' }));
    },
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (id: string, data: Partial<LegalEntity>) => {
      updates.push(id);
      const entity = entities.find((stored) => stored.id === id)!;
      Object.assign(entity, data);
      return { ...entity };
    },
  };
  const service = new LegalEntitiesService(
    {
      record: (entry: Audit) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as LegalEntitiesRepository,
  );

  return { audits, entities, listed, service, updates };
}

// The original helper: just the service.
const serviceWith = (entities: LegalEntity[], links: Record<string, number> = {}) =>
  setup(entities, links).service;

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const smart = {
  entityAddress: 'Mandir Marg, Press Enclave Road, Saket, Delhi-110017',
  entityName: 'MAX SMART SUPER SPECIALITY HOSPITAL',
  gstNumber: '07abcde 1234f1z5',
  locationName: 'SMART',
};
const panchsheel = {
  ...smart,
  entityAddress: 'N 110, Panchsheel Park',
  locationName: 'Panchsheel',
};
const refusedWith = (message: string) => (error: unknown) =>
  error instanceof BadRequestException && error.message === message;
const isMissing = (error: unknown) =>
  error instanceof NotFoundException && error.message === 'Entity not found';
const isDuplicate = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'An entity with this GST number and address already exists';

test('a GST number is stored without spaces in capitals, and must be a GSTIN', () => {
  assert.equal(normalizeGstNumber(' 07aadcm0815b1zq '), '07AADCM0815B1ZQ');
  for (const invalid of ['07AADCM0815B1Z', '07AADCM0815B1XQ', 'ABCDEFGHIJKLMNO']) {
    assert.throws(() => normalizeGstNumber(invalid), BadRequestException);
  }
});

test('one GST number may serve several sites, but an exact repeat is refused', async () => {
  const service = serviceWith([]);

  const created = await service.create(smart, actor);
  assert.equal(created.gstNumber, '07ABCDE1234F1Z5');
  assert.equal(created.locationName, 'SMART');
  // Another site of the same company, under the same GST number.
  await assert.doesNotReject(service.create(panchsheel, actor));
  await assert.rejects(
    service.create({ ...smart, entityAddress: smart.entityAddress.toUpperCase() }, actor),
    isDuplicate,
  );
  // Editing the entity itself with its own number is not a clash.
  await assert.doesNotReject(service.update(created.id, { gstNumber: smart.gstNumber }, actor));
});

test('an entity still linked to a location or restaurant cannot be deleted', async () => {
  const entities: LegalEntity[] = [];
  const service = serviceWith(entities, { 'entity-1': 2 });

  await service.create(smart, actor);
  await assert.rejects(
    service.remove('entity-1', actor),
    (error: unknown) => error instanceof BadRequestException && /linked/.test(error.message),
  );
  assert.equal(entities[0]?.deletedAt, null);
});

test('only a Super Admin may add, change or delete an entity; anyone permitted may read', () => {
  const roles = (method: keyof LegalEntitiesController) =>
    Reflect.getMetadata(
      ROLES_KEY,
      Object.getOwnPropertyDescriptor(LegalEntitiesController.prototype, method)!.value as object,
    ) as unknown;

  assert.deepEqual(roles('create'), ['Super Admin']);
  assert.deepEqual(roles('update'), ['Super Admin']);
  assert.deepEqual(roles('remove'), ['Super Admin']);
  assert.equal(roles('list'), undefined);
  assert.equal(roles('getById'), undefined);
});

test('a new entity has its text trimmed, starts active and is audited', async () => {
  const { audits, entities, service } = setup();

  const created = await service.create(
    {
      entityAddress: '  N 110, Panchsheel Park ',
      entityName: ' MAX HEALTHCARE ',
      gstNumber: '07ABCDE1234F1Z5',
      locationName: ' Panchsheel ',
    },
    actor,
  );

  assert.equal(created.entityAddress, 'N 110, Panchsheel Park');
  assert.equal(created.entityName, 'MAX HEALTHCARE');
  assert.equal(created.locationName, 'Panchsheel');
  assert.equal(created.isActive, true);
  assert.equal(entities[0]?.createdBy, 'user-1');
  assert.equal(entities[0]?.updatedBy, 'user-1');
  assert.equal(audits.length, 1);
  assert.equal(audits[0]?.action, 'LEGAL_ENTITY_CREATE');
  assert.equal(audits[0]?.entityId, 'entity-1');
  assert.equal(audits[0]?.entityName, 'legal_entities');
  assert.equal(audits[0]?.ipAddress, '127.0.0.1');
  assert.equal(audits[0]?.newValue?.gstNumber, '07ABCDE1234F1Z5');
});

test('an entity may be added already switched off', async () => {
  const { service } = setup();

  const created = await service.create({ ...smart, isActive: false }, actor);

  assert.equal(created.isActive, false);
});

test('a blank name, location, address or a bad GST number is refused before saving', async () => {
  const { entities, service } = setup();

  await assert.rejects(
    service.create({ ...smart, entityName: '   ' }, actor),
    refusedWith('Entity name is required'),
  );
  await assert.rejects(
    service.create({ ...smart, locationName: '' }, actor),
    refusedWith('Location name is required'),
  );
  await assert.rejects(
    service.create({ ...smart, entityAddress: ' \t ' }, actor),
    refusedWith('Entity address is required'),
  );
  await assert.rejects(
    service.create({ ...smart, gstNumber: '07ABCDE1234F1Z' }, actor),
    refusedWith('Enter a valid 15-character GST number, e.g. 07AADCM0815B1ZQ'),
  );
  assert.equal(entities.length, 0);
});

test('a missing or deleted entity cannot be read, changed or deleted', async () => {
  const { service } = setup();
  await service.create(smart, actor);
  await service.remove('entity-1', actor);

  await assert.rejects(service.getById('entity-1'), isMissing);
  await assert.rejects(service.getById('nope'), isMissing);
  await assert.rejects(service.update('entity-1', { entityName: 'X' }, actor), isMissing);
  await assert.rejects(service.remove('entity-1', actor), isMissing);
});

test('an entity is read back with only its public fields', async () => {
  const { service } = setup();
  await service.create(smart, actor);

  const read = await service.getById('entity-1');

  assert.equal(read.entityName, smart.entityName);
  assert.ok(!('createdBy' in read));
});

test('the list shows live entities, newest first, 20 to a page by default', async () => {
  const { listed, service } = setup();
  await service.create(smart, actor);

  const page = await service.list({});

  assert.deepEqual(listed[0], {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0,
    take: 20,
    where: { deletedAt: null },
  });
  assert.deepEqual(listed[1], { where: { deletedAt: null } });
  assert.deepEqual(page.meta, { limit: 20, page: 1, total: 41, totalPages: 3 });
  assert.equal(page.items.length, 1);
  assert.ok(!('createdBy' in page.items[0]!));
});

test('the list filters by status and searches name, location, address and GST', async () => {
  const { listed, service } = setup();

  await service.list({
    isActive: false,
    limit: 5,
    page: 2,
    search: '07ab',
    sortBy: 'entityName',
    sortOrder: 'asc',
  });

  const contains = { contains: '07ab', mode: 'insensitive' };
  assert.deepEqual(listed[0], {
    orderBy: [{ entityName: 'asc' }, { id: 'asc' }],
    skip: 5,
    take: 5,
    where: {
      deletedAt: null,
      isActive: false,
      OR: [
        { locationName: contains },
        { entityName: contains },
        { entityAddress: contains },
        { gstNumber: contains },
      ],
    },
  });
});

test('an edit trims names and refuses blanks', async () => {
  const { service } = setup();
  await service.create(smart, actor);

  const renamed = await service.update(
    'entity-1',
    { entityName: ' MAX SMART ', locationName: ' Saket ' },
    actor,
  );
  assert.equal(renamed.entityName, 'MAX SMART');
  assert.equal(renamed.locationName, 'Saket');

  await assert.rejects(
    service.update('entity-1', { entityName: ' ' }, actor),
    refusedWith('Entity name is required'),
  );
  await assert.rejects(
    service.update('entity-1', { locationName: '' }, actor),
    refusedWith('Location name is required'),
  );
  await assert.rejects(
    service.update('entity-1', { entityAddress: '  ' }, actor),
    refusedWith('Entity address is required'),
  );
  await assert.rejects(
    service.update('entity-1', { gstNumber: 'not a gstin' }, actor),
    refusedWith('Enter a valid 15-character GST number, e.g. 07AADCM0815B1ZQ'),
  );
});

test('changing only the address or only the GST number still checks the pair', async () => {
  const { entities, service } = setup();
  await service.create(smart, actor);
  await service.create({ ...smart, gstNumber: '07ZZZZZ9999Z1Z5' }, actor);
  await service.create(panchsheel, actor);

  // entity-2 shares entity-1's address: taking its GST number too makes an exact repeat.
  await assert.rejects(
    service.update('entity-2', { gstNumber: '07abcde1234f1z5' }, actor),
    isDuplicate,
  );
  // entity-3 shares entity-1's GST number: taking its address too makes an exact repeat.
  await assert.rejects(
    service.update('entity-3', { entityAddress: ` ${smart.entityAddress.toLowerCase()} ` }, actor),
    isDuplicate,
  );
  assert.equal(entities[1]?.gstNumber, '07ZZZZZ9999Z1Z5');
  assert.equal(entities[2]?.entityAddress, panchsheel.entityAddress);
});

test('a GST number sent in an edit is stored normalised', async () => {
  const { service } = setup();
  await service.create(smart, actor);

  const updated = await service.update('entity-1', { gstNumber: ' 07zzzzz 9999z1z5 ' }, actor);

  assert.equal(updated.gstNumber, '07ZZZZZ9999Z1Z5');
});

test('switching an entity off is a status change; anything else is an update', async () => {
  const { audits, entities, service } = setup();
  await service.create(smart, actor);

  await service.update('entity-1', { entityName: 'MAX SMART' }, { actorId: 'user-2' });
  await service.update('entity-1', { isActive: false }, actor);
  // Sending the status it already has is not a change.
  await service.update('entity-1', { isActive: false }, actor);

  assert.deepEqual(
    audits.slice(1).map((audit) => audit.action),
    ['LEGAL_ENTITY_UPDATE', 'LEGAL_ENTITY_STATUS_CHANGE', 'LEGAL_ENTITY_UPDATE'],
  );
  assert.equal(audits[1]?.oldValue?.entityName, smart.entityName);
  assert.equal(audits[1]?.newValue?.entityName, 'MAX SMART');
  assert.equal(audits[1]?.actorId, 'user-2');
  assert.equal(entities[0]?.isActive, false);
});

test('an edit records who made it; an empty edit writes nothing', async () => {
  const { audits, entities, service, updates } = setup();
  await service.create(smart, actor);

  await service.update('entity-1', {}, { actorId: 'user-2' });
  assert.deepEqual(updates, []);
  assert.equal(entities[0]?.updatedBy, 'user-1');
  assert.equal(audits.at(-1)?.action, 'LEGAL_ENTITY_UPDATE');

  await service.update('entity-1', { locationName: 'Saket' }, { actorId: 'user-2' });
  assert.equal(entities[0]?.updatedBy, 'user-2');
});

test('deleting an unlinked entity soft-deletes it, switches it off and audits it', async () => {
  const { audits, entities, service } = setup();
  await service.create(smart, actor);

  assert.deepEqual(await service.remove('entity-1', { actorId: 'user-2' }), { id: 'entity-1' });

  assert.ok(entities[0]?.deletedAt instanceof Date);
  assert.equal(entities[0]?.isActive, false);
  assert.equal(entities[0]?.updatedBy, 'user-2');
  assert.equal(audits.at(-1)?.action, 'LEGAL_ENTITY_DELETE');
  assert.equal(audits.at(-1)?.entityId, 'entity-1');
  assert.equal(audits.at(-1)?.oldValue?.isActive, true);
});

test('a deleted entity no longer blocks its GST number and address', async () => {
  const { service } = setup();
  await service.create(smart, actor);
  await service.remove('entity-1', actor);

  await assert.doesNotReject(service.create(smart, actor));
});
