import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, RateType } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateItemPriceDto } from './dto/create-item-price.dto';
import type { ItemPricesRepository } from './item-prices.repository';
import { ItemPricesService } from './item-prices.service';

type Price = {
  createdAt: Date;
  deletedAt: Date | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  gstPercent: Prisma.Decimal | null;
  hospitalId: string;
  id: string;
  isActive: boolean;
  isTaxInclusive: boolean;
  itemId: string;
  price: Prisma.Decimal;
  rateType: RateType;
  restaurantId: string | null;
};
type Scope = {
  hospitalId: string;
  itemId: string;
  rateType: RateType;
  restaurantId: string | null;
};

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const END_OF_TIME = day('9999-12-31');
const sameScope = (price: Price, scope: Scope) =>
  !price.deletedAt &&
  price.isActive &&
  price.hospitalId === scope.hospitalId &&
  price.itemId === scope.itemId &&
  price.rateType === scope.rateType &&
  price.restaurantId === scope.restaurantId;

// Location h1 with restaurant r1 (r2 is closed, r9 belongs to h2); samosa is active, retired is
// not. The overlap and resolve reads filter the stored prices the way the real queries do:
// both ends of a range count, and no end means open.
function setup(prices: Price[] = []) {
  const items: Record<string, { isActive: boolean }> = {
    retired: { isActive: false },
    samosa: { isActive: true },
  };
  const restaurants: Record<string, { hospitalId: string; isActive: boolean }> = {
    r1: { hospitalId: 'h1', isActive: true },
    r2: { hospitalId: 'h1', isActive: false },
    r9: { hospitalId: 'h2', isActive: true },
  };
  const repository = {
    create: (data: Omit<Price, 'createdAt' | 'deletedAt' | 'id'>) => {
      const price = {
        ...data,
        createdAt: new Date(),
        deletedAt: null,
        id: `price-${prices.length + 1}`,
      };
      prices.push(price);
      return Promise.resolve({ ...price });
    },
    findActiveById: (id: string) => {
      const price = prices.find((stored) => stored.id === id && !stored.deletedAt);
      return Promise.resolve(price ? { ...price } : null);
    },
    findActiveHospital: (id: string) =>
      Promise.resolve(id === 'h1' ? { id, isActive: true } : null),
    findActiveItem: (id: string) => Promise.resolve(items[id] ?? null),
    findActiveRestaurant: (id: string, hospitalId: string) =>
      Promise.resolve(restaurants[id]?.hospitalId === hospitalId ? restaurants[id] : null),
    findOverlappingActivePrice: (
      input: Scope & { effectiveFrom: Date; effectiveTo: Date | null; excludeId?: string },
    ) =>
      Promise.resolve(
        prices.find(
          (price) =>
            sameScope(price, input) &&
            price.id !== input.excludeId &&
            price.effectiveFrom <= (input.effectiveTo ?? END_OF_TIME) &&
            (price.effectiveTo === null || price.effectiveTo >= input.effectiveFrom),
        ) ?? null,
      ),
    findResolvedPrice: (input: Scope & { date: Date }) =>
      Promise.resolve(
        prices
          .filter(
            (price) =>
              sameScope(price, input) &&
              price.effectiveFrom <= input.date &&
              (price.effectiveTo === null || price.effectiveTo >= input.date),
          )
          .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0] ??
          null,
      ),
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler({}),
    update: (id: string, data: Partial<Price>) => {
      const price = prices.find((stored) => stored.id === id)!;
      Object.assign(price, data);
      return Promise.resolve({ ...price });
    },
  };
  const service = new ItemPricesService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as ItemPricesRepository,
  );

  return { prices, service };
}

const actor = { actorId: 'user-1' };
const priceDto = (over: Partial<Record<keyof CreateItemPriceDto, unknown>> = {}) =>
  ({
    effectiveFrom: '2026-10-01',
    gstPercent: 5,
    hospitalId: 'h1',
    itemId: 'samosa',
    price: 20,
    rateType: RateType.NORMAL,
    ...over,
  }) as CreateItemPriceDto;
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);
const isOverlap = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'An active price already exists for this item, rate type, and date range.';

test('a price is saved by calendar day, tax inclusive unless told otherwise', async () => {
  const { service } = setup();

  const created = await service.create(
    priceDto({ effectiveFrom: '2026-10-01T22:00:00+05:30', effectiveTo: '2026-10-31' }),
    actor,
  );

  assert.equal(created?.effectiveFrom.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(created?.effectiveTo?.toISOString(), '2026-10-31T00:00:00.000Z');
  assert.deepEqual(
    [
      created?.price,
      created?.gstPercent,
      created?.isTaxInclusive,
      created?.isActive,
      created?.restaurantId,
    ],
    [20, 5, true, true, null],
  );
});

test('Effective To may not be before Effective From, but a price may run for one day', async () => {
  const { prices, service } = setup();

  await assert.rejects(
    service.create(priceDto({ effectiveTo: '2026-09-30' }), actor),
    refusedWith(/^Effective To cannot be before Effective From$/),
  );
  assert.equal(prices.length, 0);

  const oneDay = await service.create(priceDto({ effectiveTo: '2026-10-01' }), actor);
  assert.equal(oneDay?.effectiveTo?.toISOString(), '2026-10-01T00:00:00.000Z');
});

test('a GST rate can be cleared, unless the price includes GST', async () => {
  const { service } = setup();
  await service.create(priceDto({ isTaxInclusive: false }), actor);
  await service.create(priceDto({ rateType: RateType.STAFF }), actor);

  const cleared = await service.update('price-1', { gstPercent: null }, actor);
  assert.equal(cleared?.gstPercent, null);
  await assert.rejects(
    service.update('price-2', { gstPercent: null }, actor),
    refusedWith(/^GST Percentage is required when Tax Inclusive is enabled\.$/),
  );
});

test('a tax-inclusive price needs a GST rate, and the rate is 0, 5, 12 or 18', async () => {
  const { service } = setup();

  await assert.rejects(
    service.create(priceDto({ gstPercent: undefined }), actor),
    refusedWith(/^GST Percentage is required when Tax Inclusive is enabled\.$/),
  );
  await assert.rejects(
    service.create(priceDto({ gstPercent: 28, isTaxInclusive: false }), actor),
    refusedWith(/^GST Percentage must be one of 0, 5, 12, or 18\.$/),
  );
  const exclusive = await service.create(
    priceDto({ gstPercent: undefined, isTaxInclusive: false }),
    actor,
  );
  assert.equal(exclusive?.gstPercent, null);
});

test('two active prices for the same item, rate and place may not share a day', async () => {
  const { service } = setup();
  await service.create(priceDto({ effectiveTo: '2026-10-31' }), actor);

  await assert.rejects(service.create(priceDto({ effectiveFrom: '2026-10-15' }), actor), isOverlap);
  // Both ends count: starting on the last day of the other is a clash, the next day is not.
  await assert.rejects(service.create(priceDto({ effectiveFrom: '2026-10-31' }), actor), isOverlap);
  await assert.doesNotReject(service.create(priceDto({ effectiveFrom: '2026-11-01' }), actor));
  // The November price has no end, so anything later clashes with it.
  await assert.rejects(service.create(priceDto({ effectiveFrom: '2027-06-01' }), actor), isOverlap);
});

test('another rate type, a restaurant price or an inactive price does not clash', async () => {
  const { service } = setup();
  await service.create(priceDto(), actor);

  await assert.doesNotReject(service.create(priceDto({ rateType: RateType.STAFF }), actor));
  await assert.doesNotReject(service.create(priceDto({ restaurantId: 'r1' }), actor));
  await assert.rejects(service.create(priceDto({ restaurantId: 'r1' }), actor), isOverlap);
  await assert.doesNotReject(service.create(priceDto({ isActive: false }), actor));
});

test('a price names an active item, and a restaurant of its own location', async () => {
  const { service } = setup();

  await assert.rejects(
    service.create(priceDto({ itemId: 'retired' }), actor),
    refusedWith(/^This item is inactive and cannot be priced\.$/),
  );
  await assert.rejects(
    service.create(priceDto({ itemId: 'nope' }), actor),
    refusedWith(/^Item not found$/),
  );
  await assert.rejects(
    service.create(priceDto({ restaurantId: 'r9' }), actor),
    refusedWith(/^Restaurant not found for selected location$/),
  );
  await assert.rejects(
    service.create(priceDto({ restaurantId: 'r2' }), actor),
    refusedWith(/^This restaurant is inactive\.$/),
  );
  await assert.rejects(
    service.create(priceDto({ hospitalId: 'h2' }), actor),
    refusedWith(/^Location not found$/),
  );
});

test('an edit is checked against the other prices, never against itself', async () => {
  const { service } = setup();
  await service.create(priceDto({ effectiveTo: '2026-10-31' }), actor);
  await service.create(priceDto({ effectiveFrom: '2026-11-01', isActive: false }), actor);

  await assert.doesNotReject(
    service.update('price-1', { effectiveTo: '2026-10-20', price: 25 }, actor),
  );
  // Switching the November price on is fine; stretching October into it is not.
  await assert.doesNotReject(service.update('price-2', { isActive: true }, actor));
  await assert.rejects(service.update('price-1', { effectiveTo: null }, actor), isOverlap);
  await assert.rejects(
    service.update('price-1', { effectiveTo: '2026-09-30' }, actor),
    refusedWith(/^Effective To cannot be before Effective From$/),
  );
});

test('switching a price off is not held up by its old GST setup', async () => {
  const { service } = setup([
    {
      createdAt: new Date(),
      deletedAt: null,
      effectiveFrom: day('2026-01-01'),
      effectiveTo: null,
      gstPercent: null,
      hospitalId: 'h1',
      id: 'legacy',
      isActive: true,
      isTaxInclusive: true,
      itemId: 'samosa',
      price: new Prisma.Decimal(15),
      rateType: RateType.NORMAL,
      restaurantId: null,
    },
  ]);

  assert.equal((await service.update('legacy', { isActive: false }, actor))?.isActive, false);
  await assert.rejects(
    service.update('legacy', { price: 16 }, actor),
    refusedWith(/^GST Percentage is required/),
  );
});

test("the restaurant's own price wins, then the location's, else the price is missing", async () => {
  const { service } = setup();
  await service.create(priceDto({ effectiveTo: '2026-10-31', price: 20 }), actor);
  await service.create(priceDto({ effectiveFrom: '2026-11-01', price: 22 }), actor);
  await service.create(
    priceDto({ effectiveTo: '2026-10-15', price: 18, restaurantId: 'r1' }),
    actor,
  );
  const resolve = (date: string, restaurantId?: string) =>
    service.resolve({
      date,
      hospitalId: 'h1',
      itemId: 'samosa',
      rateType: RateType.NORMAL,
      restaurantId,
    });

  assert.deepEqual(
    await Promise.all([
      resolve('2026-10-15', 'r1'),
      resolve('2026-10-16', 'r1'),
      resolve('2026-10-31'),
      resolve('2026-11-01'),
    ]).then((found) => found.map(({ price, source }) => [price, source])),
    [
      [18, 'RESTAURANT'],
      [20, 'LOCATION'],
      [20, 'LOCATION'],
      [22, 'LOCATION'],
    ],
  );
  assert.deepEqual(await resolve('2026-09-30'), {
    itemPrice: null,
    price: null,
    source: 'MISSING',
    status: 'PRICE_MISSING',
  });
  await assert.rejects(resolve('2026-10-15', 'r9'), refusedWith(/^Restaurant not found/));
});

test('a deleted price is switched off and stops resolving', async () => {
  const { prices, service } = setup();
  await service.create(priceDto(), actor);

  assert.deepEqual(await service.remove('price-1', actor), { id: 'price-1' });
  assert.equal(prices[0]?.isActive, false);
  assert.ok(prices[0]?.deletedAt);
  assert.equal(
    (
      await service.resolve({
        date: '2026-10-15',
        hospitalId: 'h1',
        itemId: 'samosa',
        rateType: RateType.NORMAL,
      })
    ).source,
    'MISSING',
  );
});
