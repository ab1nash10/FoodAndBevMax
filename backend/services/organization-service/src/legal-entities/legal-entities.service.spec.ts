import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { LegalEntity } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { LegalEntitiesRepository } from './legal-entities.repository';
import { LegalEntitiesService } from './legal-entities.service';
import { normalizeGstNumber } from './legal-entity-guards';

// Stands in for the repository: keeps entities in memory and filters like the real queries.
function serviceWith(entities: LegalEntity[], links: Record<string, number> = {}) {
  const repository = {
    countLinks: (id: string) => links[id] ?? 0,
    create: (data: Partial<LegalEntity>) => {
      const entity = {
        ...data,
        deletedAt: null,
        id: `entity-${entities.length + 1}`,
      } as LegalEntity;
      entities.push(entity);
      return entity;
    },
    findActiveById: (id: string) =>
      entities.find((entity) => entity.id === id && !entity.deletedAt) ?? null,
    findDuplicate: (gstNumber: string, entityAddress: string, excludeId?: string) =>
      entities.find(
        (entity) =>
          entity.gstNumber === gstNumber &&
          entity.entityAddress.toLowerCase() === entityAddress.toLowerCase() &&
          entity.id !== excludeId &&
          !entity.deletedAt,
      ) ?? null,
    transaction: <T>(handler: (tx: unknown) => Promise<T>) => handler({}),
    update: (id: string, data: Partial<LegalEntity>) => {
      const entity = entities.find((stored) => stored.id === id)!;
      Object.assign(entity, data);
      return entity;
    },
  };

  return new LegalEntitiesService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as LegalEntitiesRepository,
  );
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const smart = {
  entityAddress: 'Mandir Marg, Press Enclave Road, Saket, Delhi-110017',
  entityName: 'MAX SMART SUPER SPECIALITY HOSPITAL',
  gstNumber: '07abcde 1234f1z5',
  locationName: 'SMART',
};

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
  await assert.doesNotReject(
    service.create(
      { ...smart, entityAddress: 'N 110, Panchsheel Park', locationName: 'Panchsheel' },
      actor,
    ),
  );
  await assert.rejects(
    service.create({ ...smart, entityAddress: smart.entityAddress.toUpperCase() }, actor),
    (error: unknown) => error instanceof ConflictException,
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
