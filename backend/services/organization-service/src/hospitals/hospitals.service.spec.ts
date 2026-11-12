import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import type { Hospital } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateHospitalDto } from './dto/create-hospital.dto';
import type { HospitalsRepository } from './hospitals.repository';
import { HospitalsService } from './hospitals.service';

type Row = Record<string, unknown>;

// A Prisma table stand-in: findFirst matches each where field by plain equality.
function table(rows: Row[]) {
  return {
    create: ({ data }: { data: Row }) => {
      const row = { deletedAt: null, id: `row-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    },
    findFirst: ({ where }: { where: Row }) =>
      rows.find((row) =>
        Object.entries(where).every(([key, value]) => (row[key] ?? null) === value),
      ) ?? null,
  };
}

// Stands in for the repository and the transaction client: keeps everything in memory.
function serviceWith(
  hospitals: Hospital[],
  world: { activeEntities?: string[]; stores?: Row[] } = {},
) {
  const kitchens: Row[] = [];
  const stores = world.stores ?? [];
  const sequences = { kitchen: 0, store: 0 };
  const actions: string[] = [];
  const audits: unknown[] = [];
  const listed: unknown[] = [];
  const softDeletedChildrenOf: string[] = [];
  const tx = {
    $queryRawUnsafe: (sql: string) => {
      const name = sql.includes('store_code') ? 'store' : 'kitchen';
      sequences[name] += 1;
      return [{ nextValue: BigInt(sequences[name]) }];
    },
    kitchen: table(kitchens),
    legalEntity: {
      findFirst: ({ where }: { where: { id: string } }) =>
        world.activeEntities?.includes(where.id) ? { id: where.id } : null,
    },
    posDeviceRestaurant: { findMany: () => [] },
    store: table(stores),
  };
  const live = (hospital: Hospital, excludeId?: string) =>
    !hospital.deletedAt && hospital.id !== excludeId;
  const repository = {
    count: () => 0,
    create: (data: Row & { legalEntity?: { connect: { id: string } } }) => {
      const { legalEntity, ...rest } = data;
      const hospital = {
        ...rest,
        deletedAt: null,
        id: `hospital-${hospitals.length + 1}`,
        legalEntityId: legalEntity?.connect.id ?? null,
      } as unknown as Hospital;
      hospitals.push(hospital);
      return hospital;
    },
    // A copy, like a real query: later writes do not change what was read.
    findActiveById: (id: string) => {
      const hospital = hospitals.find((h) => h.id === id && !h.deletedAt);
      return hospital ? { ...hospital } : null;
    },
    findByBillPrefix: (billPrefix: string, excludeId?: string) =>
      hospitals.find((h) => h.billPrefix === billPrefix && live(h, excludeId)) ?? null,
    findByCode: (hospitalCode: string, excludeId?: string) =>
      hospitals.find((h) => h.hospitalCode === hospitalCode && live(h, excludeId)) ?? null,
    findMany: (args: unknown) => {
      listed.push(args);
      return [];
    },
    softDeleteChildren: (id: string) => {
      softDeletedChildrenOf.push(id);
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (id: string, data: Row & { legalEntity?: { connect?: { id: string } } }) => {
      const hospital = hospitals.find((stored) => stored.id === id)!;
      const { legalEntity, ...rest } = data;
      Object.assign(hospital, rest);
      if (legalEntity) hospital.legalEntityId = legalEntity.connect?.id ?? null;
      return { ...hospital };
    },
  };
  const service = new HospitalsService(
    {
      record: (input: { action: string }) => {
        actions.push(input.action);
        audits.push(input);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as HospitalsRepository,
  );

  return { actions, audits, kitchens, listed, service, softDeletedChildrenOf, stores };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const lucknow = {
  city: 'Lucknow',
  invoicePrefix: 'MAX-LKO',
  locationCode: 'ML29225',
  state: 'Uttar Pradesh',
  title: 'MAX LUCKNOW',
} as CreateHospitalDto;
const withMessage = (type: new (...args: never[]) => Error, message: string) => (error: unknown) =>
  error instanceof type && error.message === message;

test('a new location gets a Main Store, a Main Kitchen and a Counter Kitchen, skipping codes already taken', async () => {
  // STR0001 is already used by another location's store.
  const { kitchens, service, stores } = serviceWith([], {
    stores: [{ deletedAt: null, hospitalId: 'other', storeCode: 'STR0001', storeName: 'Old' }],
  });

  const created = await service.create(lucknow, actor);

  assert.equal(created?.title, 'MAX LUCKNOW');
  assert.equal(created?.displayName, 'MAX LUCKNOW');
  assert.equal(created?.locationCode, 'ML29225');
  assert.equal(created?.invoicePrefix, 'MAX-LKO');
  assert.equal(created?.onlinePaymentOption, 'NONE');
  assert.equal(created?.gstApplicable, true);
  assert.deepEqual(
    stores.filter((store) => store.hospitalId === created?.id).map((store) => store.storeCode),
    ['STR0002'],
  );
  assert.deepEqual(
    kitchens.map((kitchen) => [kitchen.kitchenName, kitchen.kitchenCode]),
    [
      ['Main Kitchen', 'KIT0001'],
      ['Counter Kitchen', 'KIT0002'],
    ],
  );
});

test('title, location code, city and state may not be blank', async () => {
  const { service } = serviceWith([]);

  await assert.rejects(
    service.create({ ...lucknow, title: '  ' }, actor),
    withMessage(BadRequestException, 'Title is required'),
  );
  await assert.rejects(
    service.create({ ...lucknow, locationCode: undefined }, actor),
    withMessage(BadRequestException, 'Location code is required'),
  );
  await assert.rejects(
    service.create({ ...lucknow, city: ' ' }, actor),
    withMessage(BadRequestException, 'City is required'),
  );
  await assert.rejects(
    service.create({ ...lucknow, state: undefined }, actor),
    withMessage(BadRequestException, 'State is required'),
  );
});

test('a location code or invoice prefix used by another live location is refused', async () => {
  const { service } = serviceWith([]);

  const created = await service.create(lucknow, actor);
  await assert.rejects(
    service.create({ ...lucknow, invoicePrefix: 'OTHER' }, actor),
    withMessage(ConflictException, 'Location code already exists'),
  );
  await assert.rejects(
    service.create({ ...lucknow, locationCode: 'OTHER' }, actor),
    withMessage(ConflictException, 'Invoice prefix already exists'),
  );
  // Saving a location with its own code and prefix never clashes with itself.
  await assert.doesNotReject(
    service.update(created.id, { invoicePrefix: 'MAX-LKO', locationCode: 'ML29225' }, actor),
  );
  const second = await service.create(
    { ...lucknow, invoicePrefix: 'MAX-SKT', locationCode: 'MS1' },
    actor,
  );
  await assert.rejects(
    service.update(second.id, { locationCode: 'ML29225' }, actor),
    withMessage(ConflictException, 'Location code already exists'),
  );
});

test('a location can only bill under an active legal entity', async () => {
  const entity = 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80';
  const { service } = serviceWith([], { activeEntities: [entity] });

  await assert.rejects(
    service.create({ ...lucknow, legalEntityId: 'ended-entity' }, actor),
    withMessage(BadRequestException, 'Choose an active entity'),
  );
  const created = await service.create({ ...lucknow, legalEntityId: entity }, actor);
  assert.equal(created?.legalEntityId, entity);
});

test('a blank optional field is cleared, and switching a location off is audited as a status change', async () => {
  const { actions, service } = serviceWith([]);
  const created = await service.create({ ...lucknow, address: 'Gomti Nagar' }, actor);

  const cleared = await service.update(created.id, { address: '  ' }, actor);
  assert.equal(cleared?.address, null);
  assert.equal(actions.at(-1), 'HOSPITAL_UPDATE');

  const switchedOff = await service.update(created.id, { isActive: false }, actor);
  assert.equal(switchedOff?.isActive, false);
  assert.equal(actions.at(-1), 'HOSPITAL_STATUS_CHANGE');
});

test('a user limited to some locations cannot see, change or delete another location', async () => {
  const hospitals = [
    { deletedAt: null, hospitalCode: 'A', hospitalName: 'A', id: 'hospital-a' },
    { deletedAt: null, hospitalCode: 'B', hospitalName: 'B', id: 'hospital-b' },
  ] as Hospital[];
  const { listed, service } = serviceWith(hospitals);
  const isNotFound = withMessage(NotFoundException, 'Location not found');

  await hospitalScopeStorage.run({ allowedHospitalIds: ['hospital-a'] }, async () => {
    await assert.doesNotReject(service.getById('hospital-a'));
    await assert.rejects(service.getById('hospital-b'), isNotFound);
    await assert.rejects(service.update('hospital-b', { city: 'Delhi' }, actor), isNotFound);
    await assert.rejects(service.remove('hospital-b', actor), isNotFound);
    await service.list({});
  });

  assert.deepEqual((listed[0] as { where: { id: unknown } }).where.id, { in: ['hospital-a'] });
  assert.equal(hospitals[1]?.deletedAt, null);
});

test('deleting a location soft-deletes it and everything under it', async () => {
  const { actions, service, softDeletedChildrenOf } = serviceWith([]);
  const created = await service.create(lucknow, actor);

  await service.remove(created.id, actor);

  assert.deepEqual(softDeletedChildrenOf, [created.id]);
  await assert.rejects(service.getById(created.id), NotFoundException);
  assert.equal(actions.at(-1), 'HOSPITAL_DELETE');
});

test('only a Super Admin may move a location to another legal entity', async () => {
  const [first, second] = [
    'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80',
    'f1e2d3c4-0d2d-4c94-8c8a-21d4f90c4f81',
  ];
  const { service } = serviceWith([], { activeEntities: [first, second] });
  const created = await service.create({ ...lucknow, legalEntityId: first }, actor);
  const id = created.id;

  await assert.rejects(
    service.update(id, { legalEntityId: second }, actor),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === 'Only a Super Admin can change the legal entity',
  );
  await assert.rejects(service.update(id, { legalEntityId: null }, actor), ForbiddenException);
  // The form sends the current entity back with every save.
  await assert.doesNotReject(service.update(id, { city: 'Delhi', legalEntityId: first }, actor));

  const moved = await service.update(
    id,
    { legalEntityId: second },
    {
      ...actor,
      roles: ['Super Admin'],
    },
  );
  assert.equal(moved?.legalEntityId, second);
});

test('a location keeps its own gateway keys; the secrets come back only masked, also in its audit', async () => {
  const { audits, service } = serviceWith([]);
  const created = await service.create(
    {
      ...lucknow,
      onlinePaymentOption: 'RAZORPAY',
      razorpayKeyId: 'rzp_live_lko',
      razorpayKeySecret: 'lucknow-razorpay-secret',
    },
    actor,
  );

  assert.equal(created.razorpayKeyId, 'rzp_live_lko');
  assert.equal(created.razorpayKeySecret, '••••cret');
  assert.equal(created.payuClientSecret, null);

  // Left out of an edit, a secret stays; sent blank, it is cleared.
  const edited = await service.update(
    created.id,
    {
      onlinePaymentOption: 'PAYU',
      payuClientId: 'lko-client',
      payuClientSecret: 'lucknow-payu-secret',
      payuMerchantId: 'lko-merchant',
    },
    actor,
  );
  assert.equal(edited?.razorpayKeySecret, '••••cret');
  assert.equal(edited?.payuClientSecret, '••••cret');
  const cleared = await service.update(created.id, { razorpayKeySecret: ' ' }, actor);
  assert.equal(cleared?.razorpayKeySecret, null);

  assert.doesNotMatch(JSON.stringify(audits), /lucknow-(razorpay|payu)-secret/);
});
