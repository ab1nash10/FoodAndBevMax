import { strict as assert } from 'node:assert';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploymentType, Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { RestaurantMenuDayOfWeek } from '../restaurant-menus/dto/create-restaurant-menu.dto';
import { EmployeeDiscountsService } from './employee-discounts.service';

type StoredDiscount = {
  archivedAt: Date | null;
  createdAt: Date;
  createdBy?: string;
  daysOfWeek: string[];
  discountPercent: Prisma.Decimal | number;
  employmentType: EmploymentType | null;
  endTime: string | null;
  hospitalId: string;
  id: string;
  name: string;
  restaurantId: string;
  startTime: string | null;
  updatedAt: Date;
  updatedBy?: string;
};

type Restaurant = { deletedAt: Date | null; hospitalId: string; id: string };

// A fake Prisma: discounts and restaurants in memory, with each query's arguments kept.
function serviceWith(world: { discounts?: StoredDiscount[]; restaurants?: Restaurant[] }) {
  const discounts = world.discounts ?? [];
  const restaurants = world.restaurants ?? [];
  const audits: Array<{
    action: string;
    entityId: string;
    newValue?: unknown;
    oldValue?: unknown;
  }> = [];
  const queries = {
    count: [] as unknown[],
    findMany: [] as unknown[],
    restaurantLookups: [] as string[],
    updates: [] as Array<Record<string, unknown>>,
  };
  const withRestaurant = (discount: StoredDiscount) => ({
    ...discount,
    restaurant: {
      id: discount.restaurantId,
      restaurantCode: discount.restaurantId.toUpperCase(),
      restaurantName: discount.restaurantId,
    },
  });
  const tx = {
    employeeDiscount: {
      count: (args: unknown) => {
        queries.count.push(args);
        return discounts.length;
      },
      create: ({ data }: { data: Omit<StoredDiscount, 'archivedAt' | 'createdAt' | 'id'> }) => {
        const discount = {
          ...data,
          archivedAt: null,
          createdAt: now,
          id: `discount-${discounts.length + 1}`,
          updatedAt: now,
        };
        discounts.push(discount);
        return withRestaurant(discount);
      },
      findFirst: ({ where }: { where: { id: string } }) => {
        const found = discounts.find((discount) => discount.id === where.id);
        return found ? withRestaurant(found) : null;
      },
      findMany: (args: unknown) => {
        queries.findMany.push(args);
        return discounts.map(withRestaurant);
      },
      update: ({ data, where }: { data: Partial<StoredDiscount>; where: { id: string } }) => {
        queries.updates.push(data);
        const discount = discounts.find((stored) => stored.id === where.id)!;
        Object.assign(discount, data);
        return withRestaurant(discount);
      },
    },
    restaurant: {
      findFirst: ({ where }: { where: { deletedAt: null; id: string } }) => {
        queries.restaurantLookups.push(where.id);
        const found = restaurants.find((restaurant) => restaurant.id === where.id);
        return found && found.deletedAt === where.deletedAt
          ? { hospitalId: found.hospitalId, id: found.id }
          : null;
      },
    },
    user: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        [{ id: 'user-1', name: 'Vaibhav Singh' }].filter((user) => where.id.in.includes(user.id)),
    },
  };
  const prisma = { ...tx, $transaction: <T>(handler: (client: unknown) => T) => handler(tx) };
  const service = new EmployeeDiscountsService(
    {
      record: (entry: (typeof audits)[number]) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );

  return { audits, discounts, queries, service };
}

const now = new Date('2026-10-01T00:00:00Z');
const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const cafe = { deletedAt: null, hospitalId: 'saket', id: 'cafe' };
const canteen = { deletedAt: null, hospitalId: 'vaishali', id: 'canteen' };
const discount = (id: string, overrides: Partial<StoredDiscount> = {}): StoredDiscount => ({
  archivedAt: null,
  createdAt: now,
  daysOfWeek: [],
  discountPercent: new Prisma.Decimal('12.5'),
  employmentType: null,
  endTime: null,
  hospitalId: 'saket',
  id,
  name: `Rule ${id}`,
  restaurantId: 'cafe',
  startTime: null,
  updatedAt: now,
  ...overrides,
});
const refused = (type: new (...args: never[]) => Error, message: string) => (error: unknown) =>
  error instanceof type && error.message === message;

test('the list shows live rules by default, filtered by restaurant, location and search', async () => {
  const { queries, service } = serviceWith({ discounts: [discount('d1')] });

  const result = await service.list({
    hospitalId: 'saket',
    limit: 10,
    page: 2,
    restaurantId: 'cafe',
    search: 'lunch',
    sortBy: 'discountPercent',
    sortOrder: 'asc',
  });

  const args = queries.findMany[0] as Record<string, unknown>;
  const where = {
    archivedAt: null,
    hospitalId: 'saket',
    OR: [
      { name: { contains: 'lunch', mode: 'insensitive' } },
      { restaurant: { restaurantName: { contains: 'lunch', mode: 'insensitive' } } },
    ],
    restaurantId: 'cafe',
  };
  assert.deepEqual(args.where, where);
  assert.deepEqual(args.orderBy, [{ discountPercent: 'asc' }, { id: 'asc' }]);
  assert.equal(args.skip, 10);
  assert.equal(args.take, 10);
  assert.deepEqual(queries.count[0], { where }, 'the total counts the same rows');
  assert.deepEqual(result.meta, { limit: 10, page: 2, total: 1, totalPages: 1 });
  // The stored Decimal goes out as a plain number.
  assert.equal(result.items[0]?.discountPercent, 12.5);
  assert.equal(result.items[0]?.restaurant.restaurantCode, 'CAFE');
});

test('archived rules are listed only when asked for, newest first by default', async () => {
  const { queries, service } = serviceWith({});

  await service.list({ archived: true });
  await service.list({ archived: false });

  const [archived, live] = queries.findMany as Array<Record<string, unknown>>;
  assert.deepEqual(archived?.where, { archivedAt: { not: null } });
  assert.deepEqual(live?.where, { archivedAt: null });
  assert.deepEqual(live?.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(live?.skip, 0);
  assert.equal(live?.take, 20);
});

test('each listed rule names who created it; none for an unknown or missing creator', async () => {
  const { service } = serviceWith({
    discounts: [
      discount('d1', { createdBy: 'user-1' }),
      discount('d2', { createdBy: 'gone' }),
      discount('d3'),
    ],
  });

  const { items } = await service.list({});

  assert.deepEqual(
    items.map((item) => item.createdByName),
    ['Vaibhav Singh', null, null],
  );
});

test('a limit of 0 counts the rules without reading any', async () => {
  const { queries, service } = serviceWith({ discounts: [discount('d1'), discount('d2')] });

  const result = await service.list({ limit: 0 });

  assert.equal(queries.findMany.length, 0);
  assert.deepEqual(result, { items: [], meta: { limit: 0, page: 1, total: 2, totalPages: 0 } });
});

test('a rule is read with its restaurant; an unknown one is not found', async () => {
  const { service } = serviceWith({ discounts: [discount('d1', { archivedAt: now })] });

  const found = await service.getById('d1');
  assert.equal(found.name, 'Rule d1');
  assert.equal(found.archivedAt, now, 'an archived rule can still be opened');

  await assert.rejects(
    service.getById('nothing'),
    refused(NotFoundException, 'Employee discount not found'),
  );
});

test("a new rule takes its restaurant's location and defaults to every day, all day, everyone", async () => {
  const { audits, discounts, service } = serviceWith({ restaurants: [canteen] });

  const created = await service.create(
    { discountPercent: 30, endTime: '', name: 'Staff 30%', restaurantId: 'canteen', startTime: '' },
    actor,
  );

  assert.deepEqual(
    { ...created, createdAt: undefined, restaurant: undefined, updatedAt: undefined },
    {
      archivedAt: null,
      createdAt: undefined,
      daysOfWeek: [],
      discountPercent: 30,
      employmentType: null,
      endTime: null,
      hospitalId: 'vaishali',
      id: 'discount-1',
      name: 'Staff 30%',
      restaurant: undefined,
      restaurantId: 'canteen',
      startTime: null,
      updatedAt: undefined,
    },
  );
  assert.equal(discounts[0]?.createdBy, 'user-1');
  assert.equal(discounts[0]?.updatedBy, 'user-1');
  assert.deepEqual(
    audits.map(({ action, entityId, newValue }) => ({ action, entityId, newValue })),
    [{ action: 'EMPLOYEE_DISCOUNT_CREATE', entityId: 'discount-1', newValue: created }],
  );
});

test('a new rule keeps its level, serve days and special timings', async () => {
  const { service } = serviceWith({ restaurants: [cafe] });

  const created = await service.create(
    {
      daysOfWeek: [RestaurantMenuDayOfWeek.MONDAY, RestaurantMenuDayOfWeek.FRIDAY],
      discountPercent: 15.5,
      employmentType: EmploymentType.OUTSOURCED,
      endTime: '15:00',
      name: 'Lunch',
      restaurantId: 'cafe',
      startTime: '12:00',
    },
    actor,
  );

  assert.deepEqual(created.daysOfWeek, ['MONDAY', 'FRIDAY']);
  assert.equal(created.discountPercent, 15.5);
  assert.equal(created.employmentType, EmploymentType.OUTSOURCED);
  assert.deepEqual([created.startTime, created.endTime], ['12:00', '15:00']);
});

test('special timings need both ends, and different ones, before the restaurant is looked up', async () => {
  const { discounts, queries, service } = serviceWith({ restaurants: [cafe] });
  const lunch = { discountPercent: 10, name: 'Lunch', restaurantId: 'cafe' };
  const bothOrNeither = refused(
    BadRequestException,
    'Give both a start and an end time, or neither for all day.',
  );

  await assert.rejects(service.create({ ...lunch, startTime: '12:00' }, actor), bothOrNeither);
  await assert.rejects(service.create({ ...lunch, endTime: '15:00' }, actor), bothOrNeither);
  await assert.rejects(
    service.create({ ...lunch, endTime: '12:00', startTime: '12:00' }, actor),
    refused(BadRequestException, 'The end time must differ from the start time.'),
  );
  assert.equal(queries.restaurantLookups.length, 0);
  assert.equal(discounts.length, 0);
});

test('a rule needs a live restaurant', async () => {
  const { discounts, service } = serviceWith({
    restaurants: [{ deletedAt: now, hospitalId: 'saket', id: 'closed' }],
  });

  for (const restaurantId of ['closed', 'nowhere']) {
    await assert.rejects(
      service.create({ discountPercent: 10, name: 'Lunch', restaurantId }, actor),
      refused(NotFoundException, 'Restaurant not found'),
    );
  }
  assert.equal(discounts.length, 0);
});

test('an update changes only the fields given and logs old and new values', async () => {
  const { audits, queries, service } = serviceWith({
    discounts: [discount('d1', { endTime: '15:00', startTime: '12:00' })],
  });

  const updated = await service.update(
    'd1',
    {
      daysOfWeek: [RestaurantMenuDayOfWeek.SUNDAY],
      discountPercent: 40,
      employmentType: EmploymentType.ON_ROLL,
      name: 'Weekend',
    },
    actor,
  );

  assert.deepEqual(queries.updates[0], {
    daysOfWeek: ['SUNDAY'],
    discountPercent: 40,
    employmentType: EmploymentType.ON_ROLL,
    // Timings not given keep what the rule had.
    endTime: '15:00',
    name: 'Weekend',
    startTime: '12:00',
    updatedBy: 'user-1',
  });
  assert.equal(updated.restaurantId, 'cafe');
  assert.equal(audits[0]?.action, 'EMPLOYEE_DISCOUNT_UPDATE');
  assert.equal((audits[0]?.oldValue as { name: string }).name, 'Rule d1');
  assert.equal((audits[0]?.newValue as { name: string }).name, 'Weekend');
});

test('a rule for one level can go back to every employee', async () => {
  const { service } = serviceWith({
    discounts: [discount('d1', { employmentType: EmploymentType.ON_ROLL })],
  });

  assert.equal((await service.update('d1', { employmentType: null }, actor)).employmentType, null);
});

test('clearing both times makes a rule all day; changing one end is checked against the other', async () => {
  const { service } = serviceWith({
    discounts: [discount('d1', { endTime: '15:00', startTime: '12:00' })],
  });

  await assert.rejects(
    service.update('d1', { startTime: '' }, actor),
    refused(BadRequestException, 'Give both a start and an end time, or neither for all day.'),
  );
  await assert.rejects(
    service.update('d1', { endTime: '12:00' }, actor),
    refused(BadRequestException, 'The end time must differ from the start time.'),
  );

  const allDay = await service.update('d1', { endTime: '', startTime: '' }, actor);
  assert.deepEqual([allDay.startTime, allDay.endTime], [null, null]);

  const evening = await service.update('d1', { endTime: '22:00', startTime: '18:00' }, actor);
  assert.deepEqual([evening.startTime, evening.endTime], ['18:00', '22:00']);
});

test("moving a rule to another restaurant moves it to that restaurant's location", async () => {
  const { queries, service } = serviceWith({
    discounts: [discount('d1')],
    restaurants: [cafe, canteen],
  });

  // The same restaurant is not looked up again.
  await service.update('d1', { restaurantId: 'cafe' }, actor);
  assert.equal(queries.restaurantLookups.length, 0);
  assert.equal('restaurantId' in (queries.updates[0] ?? {}), false);

  const moved = await service.update('d1', { restaurantId: 'canteen' }, actor);
  assert.deepEqual([moved.restaurantId, moved.hospitalId], ['canteen', 'vaishali']);

  await assert.rejects(
    service.update('d1', { restaurantId: 'nowhere' }, actor),
    refused(NotFoundException, 'Restaurant not found'),
  );
});

test('archiving stamps the rule once and restoring clears it, each logged as such', async () => {
  const { audits, queries, service } = serviceWith({ discounts: [discount('d1')] });

  const archived = await service.update('d1', { archived: true }, actor);
  const firstArchivedAt = archived.archivedAt;
  assert.ok(firstArchivedAt instanceof Date);

  // Archiving again keeps the first date.
  await service.update('d1', { archived: true }, actor);
  assert.equal((queries.updates[1] as { archivedAt: Date }).archivedAt, firstArchivedAt);

  assert.equal((await service.update('d1', { archived: false }, actor)).archivedAt, null);

  // An update that doesn't mention archiving leaves it alone.
  await service.update('d1', { name: 'Renamed' }, actor);
  assert.equal('archivedAt' in (queries.updates[3] ?? {}), false);

  assert.deepEqual(
    audits.map((entry) => entry.action),
    [
      'EMPLOYEE_DISCOUNT_ARCHIVE',
      'EMPLOYEE_DISCOUNT_ARCHIVE',
      'EMPLOYEE_DISCOUNT_RESTORE',
      'EMPLOYEE_DISCOUNT_UPDATE',
    ],
  );
});

test('an unknown rule cannot be changed', async () => {
  const { queries, service } = serviceWith({});

  await assert.rejects(
    service.update('nothing', { name: 'X' }, actor),
    refused(NotFoundException, 'Employee discount not found'),
  );
  assert.equal(queries.updates.length, 0);
});
