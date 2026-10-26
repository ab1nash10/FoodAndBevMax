// Characterisation of the stock and money paths over HTTP: GRN → store stock, store transfer →
// acknowledgement (full, partial, rejected), kitchen production → kitchen transfer, and the stock
// views. It pins today's behaviour (statuses, quantities, ledger rows, messages and response
// shapes) so refactors can be checked against it.
//
// Runs only with DATABASE_URL_TEST: a migrated and seeded database it may write to. Each run adds
// its own uniquely named items, so it never touches existing stock and needs no cleanup.
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { superAdminForRun } from './testing/super-admin-for-run.js';

type Body = Record<string, unknown>;
interface Batch {
  batchNumber: string;
  expiryDate: string;
}

// The images set no TZ, so production runs in UTC and so does this suite. The last block pins
// what a server east of UTC (a developer laptop in IST) does differently.
process.env.TZ = 'UTC';

const databaseUrl = process.env.DATABASE_URL_TEST;
const run = Date.now().toString(36);
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const today = day(0);

/** Keys and value types only, so a shape change shows up without pinning ids and dates. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value === null) return null;
  if (typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, shape((value as Body)[key])]),
  );
}

function signAccessToken(secret: string, user: { id: string; sessionVersion: number }): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const claims = { exp: now + 3600, iat: now, sub: user.id, sv: user.sessionVersion };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}

/** [transactionType, referenceType, locationType, qtyIn, qtyOut, balanceAfter] of a ledger row. */
const ledgerRow = (e: Body): unknown[] => [
  e.transactionType,
  e.referenceType,
  e.locationType,
  e.qtyIn,
  e.qtyOut,
  e.balanceAfter,
];
const ledgerRows = (entries: Body[]) => entries.map(ledgerRow);

function firstOf(list: Body[]): Body {
  const [value] = list;
  if (!value) throw new Error('expected at least one row');
  return value;
}

describe.skipIf(!databaseUrl)('stock and money paths (integration)', { timeout: 30_000 }, () => {
  let app: INestApplication | undefined;
  let rawQuery: <T>(sql: string, ...values: unknown[]) => Promise<T[]> = () => Promise.resolve([]);
  let baseUrl = '';
  let token = '';
  let signFor: (user: { id: string; sessionVersion: number }) => string = () => '';
  const fx = {
    categoryId: '',
    hospitalId: '',
    kitchenId: '',
    mrpItemId: '',
    readyItemId: '',
    restaurantId: '',
    storeId: '',
  };

  async function api(method: string, path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      method,
    });
    const json = (await response.json()) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  }

  async function ok(method: string, path: string, body?: unknown): Promise<Body> {
    const result = await api(method, path, body);
    if (result.status >= 300) {
      throw new Error(`${method} ${path} -> ${result.status} ${JSON.stringify(result.body)}`);
    }
    return result.data;
  }

  const items = (data: Body) => data.items as Body[];
  const idOf = (data: Body) => data.id as string;
  const first = async (path: string) => firstOf(items(await ok('GET', path)));
  const balances = async (itemId: string, locationType: string) =>
    items(
      await ok('GET', `/stock-balances?itemId=${itemId}&locationType=${locationType}&limit=100`),
    );
  const ledger = async (itemId: string, referenceId: string) =>
    items(await ok('GET', `/stock-ledgers?itemId=${itemId}&limit=100`)).filter(
      (entry) => entry.referenceId === referenceId,
    );
  const storeBatch = async (batchNumber: string) =>
    (await balances(fx.mrpItemId, 'STORE')).find((b) => b.batchNumber === batchNumber);
  const restaurantBatch = async (batchNumber: string) =>
    (await balances(fx.mrpItemId, 'RESTAURANT')).find((b) => b.batchNumber === batchNumber);
  const lineIdOf = (transfer: Body) => idOf(firstOf(transfer.lines as Body[]));

  function grnBody(
    batches: {
      acceptedQty: number;
      batchNumber: string;
      expiryDate?: string;
      rejectedQty: number;
    }[],
  ) {
    const lineBatches = batches.map((batch) => ({
      acceptedQty: batch.acceptedQty,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate ?? day(60),
      receivedQty: batch.acceptedQty + batch.rejectedQty,
      rejectedQty: batch.rejectedQty,
      ...(batch.rejectedQty ? { rejectionReason: 'Damaged' } : {}),
    }));
    const total = (key: 'acceptedQty' | 'receivedQty' | 'rejectedQty') =>
      lineBatches.reduce((sum, batch) => sum + batch[key], 0);
    return {
      hospitalId: fx.hospitalId,
      items: [
        {
          acceptedQty: total('acceptedQty'),
          batches: lineBatches,
          itemId: fx.mrpItemId,
          receivedQty: total('receivedQty'),
          rejectedQty: total('rejectedQty'),
        },
      ],
      receivedBy: 'Characterisation',
      receivedDate: today,
      storeId: fx.storeId,
      vendorName: `Vendor ${run}`,
    };
  }

  /** Puts `qty` of a fresh batch into the store through a posted GRN. */
  async function stockBatch(label: string, qty: number): Promise<Batch> {
    const batchNumber = `${label}-${run}`;
    const grn = await ok(
      'POST',
      '/grns',
      grnBody([{ acceptedQty: qty, batchNumber, rejectedQty: 0 }]),
    );
    await ok('PATCH', `/grns/${idOf(grn)}/post-to-stock`);
    const balance = await storeBatch(batchNumber);
    return { batchNumber, expiryDate: String(balance?.expiryDate).slice(0, 10) };
  }

  const storeTransfer = (batch: Batch, sentQty: number) =>
    ok('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.restaurantId,
      destinationType: 'RESTAURANT',
      hospitalId: fx.hospitalId,
      items: [{ ...batch, itemId: fx.mrpItemId, sentQty }],
      sourceId: fx.storeId,
      sourceType: 'STORE',
      transferDate: new Date().toISOString(),
    });

  const acknowledge = (transfer: Body, line: Body) =>
    api('POST', '/transfer-acknowledgements', {
      items: [{ ...line, transferLineId: lineIdOf(transfer) }],
      transferId: idOf(transfer),
    });

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      NODE_ENV: 'test',
      REDIS_URL: '',
      SWAGGER_ENABLED: 'false',
      THROTTLE_LIMIT: '100000',
    });
    process.env.JWT_ACCESS_SECRET ||= 'characterisation-access-secret-0123456789';
    process.env.JWT_REFRESH_SECRET ||= 'characterisation-refresh-secret-0123456789';

    // Imported here: ConfigModule reads the environment when app.module is first evaluated.
    const { configureSecurityBaseline, getSharedRedis } = await import('@aahar/auth');
    // Caches "no Redis" while REDIS_URL is still blank: ConfigModule refills it from .env.
    getSharedRedis();
    const { ConfigService } = await import('@nestjs/config');
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('./app.module.js');
    const { PrismaService } = await import('./common/prisma/prisma.service.js');

    const nest = await NestFactory.create(AppModule, { logger: false });
    app = nest;
    const config = nest.get(ConfigService);
    configureSecurityBaseline(nest, config, {
      serviceName: 'organization-service',
      swaggerDescription: '',
      swaggerTitle: '',
    });
    await nest.listen(0, '127.0.0.1');
    const { port } = (nest.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${port}/api/v1`;
    const prisma = nest.get(PrismaService);
    rawQuery = <T>(sql: string, ...values: unknown[]) =>
      prisma.$queryRawUnsafe<T[]>(sql, ...values);

    const superAdmin = await superAdminForRun(prisma, 'sf');
    signFor = (user) => signAccessToken(config.getOrThrow<string>('JWT_ACCESS_SECRET'), user);
    token = signFor(superAdmin);

    const kitchen = await first('/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc');
    fx.hospitalId = kitchen.hospitalId as string;
    fx.kitchenId = idOf(kitchen);
    fx.storeId = idOf(await first(`/stores?limit=1&isActive=true&hospitalId=${fx.hospitalId}`));
    fx.restaurantId = idOf(
      // The oldest one: later runs add restaurants of their own (restaurant leftovers).
      await first(
        `/restaurants?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc&hospitalId=${fx.hospitalId}`,
      ),
    );
    const categoryId = (fx.categoryId = idOf(
      await ok('POST', '/item-categories', { categoryName: `Characterisation ${run}` }),
    ));
    // An item's type comes from its first mapping: a store makes it MRP, a kitchen READYMADE.
    const item = async (itemType: string) =>
      idOf(
        await ok('POST', '/items', {
          itemName: `Characterisation ${itemType} ${run}`,
          type: 'VEG',
        }),
      );
    fx.mrpItemId = await item('MRP');
    fx.readyItemId = await item('READYMADE');
    await ok('POST', '/store-items', { categoryId, itemId: fx.mrpItemId, storeId: fx.storeId });
    await ok('POST', '/kitchen-items', {
      categoryId,
      itemId: fx.readyItemId,
      kitchenId: fx.kitchenId,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GRN: draft, post to stock per accepted batch, then refuses a second post', async () => {
    const accepted = `GA-${run}`;
    const partial = `GB-${run}`;
    const created = await api(
      'POST',
      '/grns',
      grnBody([
        { acceptedQty: 30, batchNumber: accepted, rejectedQty: 0 },
        { acceptedQty: 6, batchNumber: partial, rejectedQty: 4 },
      ]),
    );
    expect(created.status).toBe(201);
    expect(created.data.status).toBe('DRAFT');
    expect(shape(created.body)).toMatchSnapshot('grn created');
    // Nothing reaches stock while the GRN is a draft.
    expect(await storeBatch(accepted)).toBeUndefined();

    const grnId = idOf(created.data);
    const posted = await api('PATCH', `/grns/${grnId}/post-to-stock`);
    expect(posted.status).toBe(200);
    expect(posted.data.status).toBe('POSTED_TO_STOCK');
    expect(shape(posted.body)).toMatchSnapshot('grn posted');

    // Only accepted quantity is stocked; rejected quantity never is.
    expect(await storeBatch(accepted)).toMatchObject({
      availableQty: 30,
      locationType: 'STORE',
      reservedQty: 0,
    });
    expect(await storeBatch(partial)).toMatchObject({ availableQty: 6, reservedQty: 0 });
    expect(String((await storeBatch(accepted))?.expiryDate).slice(0, 10)).toBe(day(60));
    const entries = await ledger(fx.mrpItemId, grnId);
    expect(entries.map((e) => [e.batchNumber, ...ledgerRow(e)]).sort()).toEqual([
      [accepted, 'GRN_IN', 'GRN', 'STORE', 30, 0, 30],
      [partial, 'GRN_IN', 'GRN', 'STORE', 6, 0, 6],
    ]);
    expect(shape(entries[0])).toMatchSnapshot('stock ledger entry');

    const again = await api('PATCH', `/grns/${grnId}/post-to-stock`);
    expect([again.status, again.body.message]).toEqual([400, 'GRN is already posted to stock']);
    expect(shape(again.body)).toMatchSnapshot('error body');
  });

  it('GRN: validation messages for quantities and expired batches', async () => {
    const mismatch = grnBody([{ acceptedQty: 5, batchNumber: `GM-${run}`, rejectedQty: 0 }]);
    mismatch.items = mismatch.items.map((line) => ({ ...line, receivedQty: 6 }));
    const unequal = await api('POST', '/grns', mismatch);
    expect([unequal.status, unequal.body.message]).toEqual([
      400,
      'Line 1: received quantity must equal accepted plus rejected quantity',
    ]);

    const expired = await api(
      'POST',
      '/grns',
      grnBody([{ acceptedQty: 5, batchNumber: `GX-${run}`, expiryDate: day(-1), rejectedQty: 0 }]),
    );
    expect([expired.status, expired.body.message]).toEqual([
      400,
      'Line 1, batch 1: expired batch cannot be accepted',
    ]);
  });

  it('store transfer: nothing moves on create, dispatch deducts, ACCEPTED_FULL credits the restaurant', async () => {
    const batch = await stockBatch('TF', 30);

    const created = await api('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.restaurantId,
      destinationType: 'RESTAURANT',
      hospitalId: fx.hospitalId,
      items: [{ ...batch, itemId: fx.mrpItemId, sentQty: 10 }],
      sourceId: fx.storeId,
      sourceType: 'STORE',
      transferDate: new Date().toISOString(),
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe('DRAFT');
    expect(shape(created.body)).toMatchSnapshot('transfer created');
    // Creating a transfer neither deducts nor reserves stock.
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 30, reservedQty: 0 });

    const transferId = idOf(created.data);
    const dispatched = await api('PATCH', `/transfers/${transferId}/dispatch`);
    expect(dispatched.status).toBe(200);
    expect(dispatched.data.status).toBe('PENDING_ACKNOWLEDGEMENT');
    expect(shape(dispatched.body)).toMatchSnapshot('transfer dispatched');
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 20, reservedQty: 0 });

    const ack = await acknowledge(dispatched.data, { acceptedQty: 10, rejectedQty: 0 });
    expect(ack.status).toBe(201);
    expect(ack.data.status).toBe('ACCEPTED_FULL');
    expect(shape(ack.body)).toMatchSnapshot('acknowledgement created');
    expect((await ok('GET', `/transfers/${transferId}`)).status).toBe('ACKNOWLEDGED');

    expect(await restaurantBatch(batch.batchNumber)).toMatchObject({
      availableQty: 10,
      locationId: fx.restaurantId,
      reservedQty: 0,
    });
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 20 });
    expect(ledgerRows(await ledger(fx.mrpItemId, transferId))).toEqual([
      ['STORE_TO_RESTAURANT_OUT', 'TRANSFER', 'STORE', 0, 10, 20],
    ]);
    expect(ledgerRows(await ledger(fx.mrpItemId, idOf(ack.data)))).toEqual([
      ['RESTAURANT_TRANSFER_IN', 'TRANSFER_ACKNOWLEDGEMENT', 'RESTAURANT', 10, 0, 10],
    ]);

    const twice = await acknowledge(dispatched.data, { acceptedQty: 10, rejectedQty: 0 });
    expect([twice.status, twice.body.message]).toEqual([
      400,
      'Only pending transfers can be acknowledged',
    ]);
  });

  it('store transfer: ACCEPTED_PARTIAL returns the rejected quantity to the store', async () => {
    const batch = await stockBatch('TP', 20);
    const transfer = await ok(
      'PATCH',
      `/transfers/${idOf(await storeTransfer(batch, 6))}/dispatch`,
    );
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 14 });

    const noReason = await acknowledge(transfer, { acceptedQty: 4, rejectedQty: 2 });
    expect([noReason.status, noReason.body.message]).toEqual([
      400,
      'Line 1: rejection reason is required',
    ]);
    const overCount = await acknowledge(transfer, {
      acceptedQty: 5,
      rejectedQty: 2,
      rejectionReason: 'Damaged',
    });
    expect([overCount.status, overCount.body.message]).toEqual([
      400,
      'Line 1: accepted plus rejected quantity must equal sent quantity',
    ]);

    const ack = await acknowledge(transfer, {
      acceptedQty: 4,
      rejectedQty: 2,
      rejectionReason: 'Damaged',
    });
    expect(ack.data.status).toBe('ACCEPTED_PARTIAL');
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 16, reservedQty: 0 });
    expect(await restaurantBatch(batch.batchNumber)).toMatchObject({ availableQty: 4 });
    const entries = await ledger(fx.mrpItemId, idOf(ack.data));
    expect(entries.map((e) => [...ledgerRow(e), e.remarks]).sort()).toEqual([
      ['RESTAURANT_TRANSFER_IN', 'TRANSFER_ACKNOWLEDGEMENT', 'RESTAURANT', 4, 0, 4, null],
      ['TRANSFER_REJECTED_RETURN_IN', 'TRANSFER_ACKNOWLEDGEMENT', 'STORE', 2, 0, 16, 'Damaged'],
    ]);
  });

  it('store transfer: REJECTED_FULL puts it all back and credits the restaurant nothing', async () => {
    const batch = await stockBatch('TR', 12);
    const transfer = await ok(
      'PATCH',
      `/transfers/${idOf(await storeTransfer(batch, 5))}/dispatch`,
    );
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 7 });

    const ack = await acknowledge(transfer, {
      acceptedQty: 0,
      rejectedQty: 5,
      rejectionReason: 'Expired',
    });
    expect(ack.data.status).toBe('REJECTED_FULL');
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 12 });
    expect(await restaurantBatch(batch.batchNumber)).toBeUndefined();
    expect(ledgerRows(await ledger(fx.mrpItemId, idOf(ack.data)))).toEqual([
      ['TRANSFER_REJECTED_RETURN_IN', 'TRANSFER_ACKNOWLEDGEMENT', 'STORE', 5, 0, 12],
    ]);
  });

  it('store transfer: refuses more than the batch holds, and dispatches drafts only', async () => {
    const batch = await stockBatch('TX', 8);
    const tooMuch = await api('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.restaurantId,
      destinationType: 'RESTAURANT',
      hospitalId: fx.hospitalId,
      items: [{ ...batch, itemId: fx.mrpItemId, sentQty: 1000 }],
      sourceId: fx.storeId,
      sourceType: 'STORE',
      transferDate: new Date().toISOString(),
    });
    expect([tooMuch.status, tooMuch.body.message]).toEqual([
      400,
      `Selected batch ${batch.batchNumber} has available stock 8. Requested quantity 1000.`,
    ]);

    const transferId = idOf(await storeTransfer(batch, 3));
    await ok('PATCH', `/transfers/${transferId}/dispatch`);
    const again = await api('PATCH', `/transfers/${transferId}/dispatch`);
    expect([again.status, again.body.message]).toEqual([
      400,
      'Only draft transfers can be dispatched',
    ]);
  });

  it('kitchen production: accepted = produced − wastage, posted to kitchen stock, then transferred', async () => {
    const production = (line: Body) =>
      api('POST', '/kitchen-productions', {
        businessDate: today,
        hospitalId: fx.hospitalId,
        items: [{ itemId: fx.readyItemId, ...line }],
        kitchenId: fx.kitchenId,
        productionDate: new Date().toISOString(),
      });

    // With no explicit accepted quantity, too much wastage reads as a negative acceptance.
    const negative = await production({ producedQty: 12, wastageQty: 15 });
    expect([negative.status, negative.body.message]).toEqual([
      400,
      'Line 1: accepted quantity cannot be negative',
    ]);
    const wastage = await production({ acceptedQty: 0, producedQty: 12, wastageQty: 15 });
    expect([wastage.status, wastage.body.message]).toEqual([
      400,
      'Line 1: wastage quantity cannot exceed produced quantity',
    ]);

    const created = await production({ producedQty: 12, wastageQty: 2 });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe('DRAFT');
    expect((created.data.lines as Body[])[0]).toMatchObject({
      acceptedQty: 10,
      producedQty: 12,
      wastageQty: 2,
    });
    expect(shape(created.body)).toMatchSnapshot('production created');

    const productionId = idOf(created.data);
    const posted = await api('PATCH', `/kitchen-productions/${productionId}/post`);
    expect(posted.status).toBe(200);
    expect(posted.data.status).toBe('POSTED');
    const kitchenStock = (await balances(fx.readyItemId, 'KITCHEN')).find(
      (b) => b.locationId === fx.kitchenId,
    );
    expect(kitchenStock).toMatchObject({
      availableQty: 10,
      batchNumber: null,
      expiryDate: null,
      reservedQty: 0,
    });
    expect(String(kitchenStock?.businessDate).slice(0, 10)).toBe(today);
    expect(ledgerRows(await ledger(fx.readyItemId, productionId))).toEqual([
      ['KITCHEN_PRODUCTION_IN', 'KITCHEN_PRODUCTION', 'KITCHEN', 10, 0, 10],
    ]);

    const again = await api('PATCH', `/kitchen-productions/${productionId}/post`);
    expect([again.status, again.body.message]).toEqual([
      400,
      'Kitchen production is already posted',
    ]);

    const draft = await ok('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.restaurantId,
      destinationType: 'RESTAURANT',
      hospitalId: fx.hospitalId,
      items: [{ itemId: fx.readyItemId, sentQty: 4 }],
      sourceId: fx.kitchenId,
      sourceType: 'KITCHEN',
      transferDate: new Date().toISOString(),
    });
    const transfer = await ok('PATCH', `/transfers/${idOf(draft)}/dispatch`);
    expect(ledgerRows(await ledger(fx.readyItemId, idOf(draft)))).toEqual([
      ['KITCHEN_TRANSFER_OUT', 'TRANSFER', 'KITCHEN', 0, 4, 6],
    ]);
    const ack = await acknowledge(transfer, { acceptedQty: 4, rejectedQty: 0 });
    expect(ack.data.status).toBe('ACCEPTED_FULL');
    const restaurant = (await balances(fx.readyItemId, 'RESTAURANT')).find(
      (b) => b.locationId === fx.restaurantId,
    );
    expect(restaurant).toMatchObject({ availableQty: 4, batchNumber: null });
    expect(String(restaurant?.businessDate).slice(0, 10)).toBe(today);
  });

  it('restaurant leftovers: ready-made only, to another restaurant, the receiver accepts', async () => {
    const other = idOf(
      await ok('POST', '/restaurants', {
        hospitalId: fx.hospitalId,
        restaurantName: `Leftovers ${run}`,
      }),
    );
    const production = await ok('POST', '/kitchen-productions', {
      businessDate: today,
      hospitalId: fx.hospitalId,
      items: [{ itemId: fx.readyItemId, producedQty: 6, wastageQty: 0 }],
      kitchenId: fx.kitchenId,
      productionDate: new Date().toISOString(),
    });
    await ok('PATCH', `/kitchen-productions/${idOf(production)}/post`);
    const fromKitchen = await ok('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.restaurantId,
      destinationType: 'RESTAURANT',
      hospitalId: fx.hospitalId,
      items: [{ itemId: fx.readyItemId, sentQty: 6 }],
      sourceId: fx.kitchenId,
      sourceType: 'KITCHEN',
      transferDate: new Date().toISOString(),
    });
    await acknowledge(await ok('PATCH', `/transfers/${idOf(fromKitchen)}/dispatch`), {
      acceptedQty: 6,
      rejectedQty: 0,
    });
    const atRestaurant = async (restaurantId: string) =>
      Number(
        (await balances(fx.readyItemId, 'RESTAURANT')).find((b) => b.locationId === restaurantId)
          ?.availableQty ?? 0,
      );
    const before = await atRestaurant(fx.restaurantId);
    const leftovers = (body: Body) =>
      api('POST', '/transfers', {
        businessDate: today,
        destinationId: other,
        destinationType: 'RESTAURANT',
        hospitalId: fx.hospitalId,
        items: [{ itemId: fx.readyItemId, sentQty: 3 }],
        sourceId: fx.restaurantId,
        sourceType: 'RESTAURANT',
        transferDate: new Date().toISOString(),
        ...body,
      });

    const toCounter = await leftovers({ destinationType: 'COUNTER' });
    expect([toCounter.status, toCounter.body.message]).toEqual([
      400,
      'A restaurant sends its leftovers to another restaurant only',
    ]);
    const mrp = await leftovers({ items: [{ itemId: fx.mrpItemId, sentQty: 1 }] });
    expect([mrp.status, mrp.body.message]).toEqual([
      400,
      'Line 1: restaurant transfers support only READYMADE items',
    ]);

    const draft = await leftovers({});
    expect(draft.status).toBe(201);
    const sent = await ok('PATCH', `/transfers/${idOf(draft.data)}/dispatch`);
    expect(ledgerRows(await ledger(fx.readyItemId, idOf(sent)))).toEqual([
      ['RESTAURANT_TRANSFER_OUT', 'TRANSFER', 'RESTAURANT', 0, 3, before - 3],
    ]);
    // Nothing reaches the other restaurant until it accepts; a rejected part goes back.
    expect(await atRestaurant(other)).toBe(0);
    const ack = await acknowledge(sent, {
      acceptedQty: 2,
      rejectedQty: 1,
      rejectionReason: 'Spoilt',
    });
    expect(ack.data.status).toBe('ACCEPTED_PARTIAL');
    expect(await atRestaurant(other)).toBe(2);
    expect(await atRestaurant(fx.restaurantId)).toBe(before - 2);
  });

  it('stock views: balances list and the grouped store summary agree', async () => {
    await stockBatch('SV', 9);
    const list = await api(
      'GET',
      `/stock-balances?itemId=${fx.mrpItemId}&locationType=STORE&limit=100`,
    );
    expect(list.status).toBe(200);
    expect(shape(list.body)).toMatchSnapshot('stock balances');

    const summary = await api(
      'GET',
      `/store-stock/summary?itemId=${fx.mrpItemId}&locationType=STORE&limit=100`,
    );
    expect(summary.status).toBe(200);
    expect(shape(summary.body)).toMatchSnapshot('store stock summary');
    const rows = items(list.data);
    expect(items(summary.data)).toHaveLength(1);
    expect(items(summary.data)[0]).toMatchObject({
      batchCount: rows.length,
      totalAvailableQty: rows.reduce((sum, b) => sum + Number(b.availableQty), 0),
      totalReservedQty: 0,
    });
  });

  it('GRN lifecycle: drafts can be edited, cancelled or deleted; posted ones cannot', async () => {
    const draft = await ok(
      'POST',
      '/grns',
      grnBody([{ acceptedQty: 4, batchNumber: `GL-${run}`, rejectedQty: 0 }]),
    );
    const edited = await api('PUT', `/grns/${idOf(draft)}`, {
      ...grnBody([{ acceptedQty: 7, batchNumber: `GL-${run}`, rejectedQty: 1 }]),
      vendorName: `Edited ${run}`,
    });
    expect(edited.status).toBe(200);
    expect(edited.data).toMatchObject({
      status: 'DRAFT',
      vendorName: `Edited ${run[0]!.toUpperCase()}${run.slice(1)}`,
    });
    expect((edited.data.lines as Body[])[0]).toMatchObject({
      acceptedQty: 7,
      receivedQty: 8,
      rejectedQty: 1,
    });

    const cancelled = await api('PATCH', `/grns/${idOf(draft)}/cancel`);
    expect([cancelled.status, cancelled.data.status]).toEqual([200, 'CANCELLED']);
    // Cancelling again is a no-op, not an error.
    expect((await api('PATCH', `/grns/${idOf(draft)}/cancel`)).data.status).toBe('CANCELLED');
    for (const [method, path, message] of [
      ['PATCH', `/grns/${idOf(draft)}/post-to-stock`, 'Cancelled GRN cannot be posted to stock'],
      ['PUT', `/grns/${idOf(draft)}`, 'Cancelled GRN cannot be edited'],
    ] as const) {
      const refused = await api(method, path, method === 'PUT' ? { vendorName: 'x' } : undefined);
      expect([refused.status, refused.body.message]).toEqual([400, message]);
    }
    expect(await storeBatch(`GL-${run}`)).toBeUndefined();

    const doomed = await ok(
      'POST',
      '/grns',
      grnBody([{ acceptedQty: 2, batchNumber: `GD-${run}`, rejectedQty: 0 }]),
    );
    const removed = await api('DELETE', `/grns/${idOf(doomed)}`);
    expect([removed.status, removed.data]).toEqual([200, { id: idOf(doomed) }]);
    const gone = await api('GET', `/grns/${idOf(doomed)}`);
    expect([gone.status, gone.body.message]).toEqual([404, 'GRN not found']);

    const posted = await ok(
      'POST',
      '/grns',
      grnBody([{ acceptedQty: 2, batchNumber: `GP-${run}`, rejectedQty: 0 }]),
    );
    await ok('PATCH', `/grns/${idOf(posted)}/post-to-stock`);
    for (const [method, path, message] of [
      ['PATCH', `/grns/${idOf(posted)}/cancel`, 'Posted GRN cannot be cancelled'],
      ['PUT', `/grns/${idOf(posted)}`, 'Posted GRN cannot be edited'],
      ['DELETE', `/grns/${idOf(posted)}`, 'Posted GRN cannot be edited'],
    ] as const) {
      const refused = await api(method, path, method === 'PUT' ? { vendorName: 'x' } : undefined);
      expect([refused.status, refused.body.message]).toEqual([400, message]);
    }
  });

  it('kitchen production lifecycle: edit recalculates acceptance; cancel and delete drafts only', async () => {
    const body = (line: Body) => ({
      businessDate: today,
      hospitalId: fx.hospitalId,
      items: [{ itemId: fx.readyItemId, ...line }],
      kitchenId: fx.kitchenId,
      productionDate: new Date().toISOString(),
    });
    const draft = await ok('POST', '/kitchen-productions', body({ producedQty: 3 }));
    const edited = await api(
      'PUT',
      `/kitchen-productions/${idOf(draft)}`,
      body({ producedQty: 9, wastageQty: 1.5 }),
    );
    expect(edited.status).toBe(200);
    expect((edited.data.lines as Body[])[0]).toMatchObject({
      acceptedQty: 7.5,
      producedQty: 9,
      wastageQty: 1.5,
    });

    const cancelled = await api('PATCH', `/kitchen-productions/${idOf(draft)}/cancel`);
    expect([cancelled.status, cancelled.data.status]).toEqual([200, 'CANCELLED']);
    for (const [method, path, message] of [
      [
        'PATCH',
        `/kitchen-productions/${idOf(draft)}/cancel`,
        'Kitchen production is already cancelled',
      ],
      [
        'PATCH',
        `/kitchen-productions/${idOf(draft)}/post`,
        'Cancelled kitchen production cannot be posted',
      ],
      [
        'PUT',
        `/kitchen-productions/${idOf(draft)}`,
        'Cancelled kitchen production cannot be edited',
      ],
    ] as const) {
      const refused = await api(method, path, method === 'PUT' ? { remarks: 'x' } : undefined);
      expect([refused.status, refused.body.message]).toEqual([400, message]);
    }

    const doomed = await ok('POST', '/kitchen-productions', body({ producedQty: 1 }));
    expect((await api('DELETE', `/kitchen-productions/${idOf(doomed)}`)).status).toBe(200);
    const gone = await api('GET', `/kitchen-productions/${idOf(doomed)}`);
    expect([gone.status, gone.body.message]).toEqual([404, 'Kitchen production not found']);

    const posted = await ok('POST', '/kitchen-productions', body({ producedQty: 1 }));
    await ok('PATCH', `/kitchen-productions/${idOf(posted)}/post`);
    for (const [method, path, message] of [
      [
        'PATCH',
        `/kitchen-productions/${idOf(posted)}/cancel`,
        'Posted kitchen production cannot be cancelled',
      ],
      ['PUT', `/kitchen-productions/${idOf(posted)}`, 'Posted kitchen production cannot be edited'],
      [
        'DELETE',
        `/kitchen-productions/${idOf(posted)}`,
        'Posted kitchen production cannot be edited',
      ],
    ] as const) {
      const refused = await api(method, path, method === 'PUT' ? { remarks: 'x' } : undefined);
      expect([refused.status, refused.body.message]).toEqual([400, message]);
    }
  });

  it('store transfer: a cancelled draft moves no stock and can no longer be dispatched', async () => {
    const batch = await stockBatch('TC', 6);
    const transferId = idOf(await storeTransfer(batch, 4));
    const cancelled = await api('PATCH', `/transfers/${transferId}/cancel`);
    expect([cancelled.status, cancelled.data.status]).toEqual([200, 'CANCELLED']);
    expect(await storeBatch(batch.batchNumber)).toMatchObject({ availableQty: 6 });
    const dispatch = await api('PATCH', `/transfers/${transferId}/dispatch`);
    expect([dispatch.status, dispatch.body.message]).toEqual([
      400,
      'Only draft transfers can be dispatched',
    ]);

    const sent = idOf(await storeTransfer(batch, 1));
    await ok('PATCH', `/transfers/${sent}/dispatch`);
    const late = await api('PATCH', `/transfers/${sent}/cancel`);
    expect([late.status, late.body.message]).toEqual([
      400,
      'Only draft transfers can be cancelled',
    ]);
  });

  // The number defaults used to pad with lpad, which also truncates, so the 10,000th transfer or
  // production (and the 1,000,000th GRN) repeated an earlier number and every create failed from
  // then on (migration 20261006030000). Read-only: each column's real default is evaluated with a
  // given sequence value.
  it('document numbers keep their padding, then keep growing past it', async () => {
    const nextNumber = async (table: string, column: string, sequenceValue: number) => {
      const [row] = await rawQuery<{ expr: string }>(
        'SELECT column_default AS expr FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
        table,
        column,
      );
      const expression = (row?.expr ?? '').replace(
        /nextval\('[^']+'::regclass\)/,
        String(sequenceValue),
      );
      const [result] = await rawQuery<{ value: string }>(`SELECT ${expression} AS value`);
      return result?.value;
    };
    expect(await nextNumber('transfers', 'transfer_number', 42)).toBe('TRF0042');
    expect(await nextNumber('transfers', 'transfer_number', 9_999)).toBe('TRF9999');
    expect(await nextNumber('transfers', 'transfer_number', 10_000)).toBe('TRF10000');
    expect(await nextNumber('kitchen_productions', 'production_number', 7)).toBe('PRD0007');
    expect(await nextNumber('kitchen_productions', 'production_number', 10_000)).toBe('PRD10000');
    expect(await nextNumber('grns', 'grn_number', 123)).toBe('GRN000123');
    expect(await nextNumber('grns', 'grn_number', 1_000_000)).toBe('GRN1000000');
  });

  // Sorting the number's text would put TRF10000 between TRF1000 and TRF1001; a sort by number
  // follows creation order instead, which is the numbers' own order.
  it('sorting by document number follows the numbers, not their text', async () => {
    for (const [path, field] of [
      ['/transfers', 'transferNumber'],
      ['/grns', 'grnNumber'],
      ['/kitchen-productions', 'productionNumber'],
    ] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const rows = items(
          await ok('GET', `${path}?page=1&limit=100&sortBy=${field}&sortOrder=${order}`),
        );
        const numbers = rows.map((row) => Number(String(row[field]).replace(/^\D+/, '')));
        const expected = [...numbers].sort((a, b) => (order === 'asc' ? a - b : b - a));
        expect(rows.length).toBeGreaterThan(0);
        expect(numbers).toEqual(expected);
      }
    }
  });

  it('counter POS: receive at a counter, bill from its stock, resend, comp, cancel and restock', async () => {
    const counter = await ok('POST', '/counters', {
      counterCode: `PC${run}`,
      counterName: `POS ${run}`,
      hospitalId: fx.hospitalId,
      restaurantId: fx.restaurantId,
    });
    const counterId = idOf(counter);
    const menu = await ok('POST', '/restaurant-menus', {
      categoryId: fx.categoryId,
      gstPercent: 18,
      isGstInclusive: false,
      isDiscountable: true,
      itemId: fx.mrpItemId,
      price: 49.5,
      restaurantId: fx.restaurantId,
      roomPrice: 60,
      serveAt: 'BOTH',
      storeId: fx.storeId,
    });
    const menuId = idOf(menu);
    const counterQty = async () =>
      items(
        await ok('GET', `/counter-stock?itemId=${fx.mrpItemId}&locationId=${counterId}`),
      ).reduce((sum, balance) => sum + Number(balance.availableQty), 0);

    // Stock reaches the counter through a transfer the counter acknowledges.
    const batch = await stockBatch('PC', 10);
    const transfer = await ok('POST', '/transfers', {
      businessDate: today,
      destinationId: counterId,
      destinationType: 'COUNTER',
      hospitalId: fx.hospitalId,
      items: [{ ...batch, itemId: fx.mrpItemId, sentQty: 5 }],
      sourceId: fx.storeId,
      sourceType: 'STORE',
      transferDate: new Date().toISOString(),
    });
    const dispatched = await ok('PATCH', `/transfers/${idOf(transfer)}/dispatch`);
    const ack = await acknowledge(dispatched, { acceptedQty: 5, rejectedQty: 0 });
    expect(ack.status).toBe(201);
    expect(await counterQty()).toBe(5);
    expect(ledgerRows(await ledger(fx.mrpItemId, idOf(ack.data)))).toEqual([
      ['COUNTER_RECEIVE_IN', 'TRANSFER_ACKNOWLEDGEMENT', 'COUNTER', 5, 0, 5],
    ]);

    const menuFor = async (channel: string) =>
      firstOf(
        (
          (await ok('GET', `/pos/menu?counterId=${counterId}&channel=${channel}`)).items as Body[]
        ).filter((entry) => entry.id === menuId),
      );
    expect(await menuFor('COUNTER')).toMatchObject({ isOnSale: true, price: 49.5, stock: 5 });
    expect(await menuFor('ROOM')).toMatchObject({ price: 60 });

    // 2 x 49.50 + 18% = 116.82, rounded to 117. The till's prices are never used.
    const bill = {
      channel: 'COUNTER',
      clientOrderId: `bill-${run}`,
      counterId,
      lines: [{ menuId, quantity: 2 }],
      paymentMode: 'UPI',
    };
    // A till bills only inside an open shift.
    const noShift = await api('POST', '/pos/orders', bill);
    expect([noShift.status, noShift.body.message]).toEqual([
      400,
      'Open a shift at this counter before billing.',
    ]);
    const till = await ok('POST', '/pos/shifts', { counterId, openingCash: 0 });
    const created = await api('POST', '/pos/orders', bill);
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({
      grandTotal: 117,
      gstTotal: 17.82,
      isComplimentary: false,
      paymentMode: 'UPI',
      roundOff: 0.18,
      status: 'PLACED',
      subtotal: 99,
    });
    // The location's invoice series (PREFIX/00000042); the counter's first order of the day.
    expect(created.data.billNumber).toMatch(/^[^/]+\/\d{8}$/);
    expect(created.data.orderNumber).toBe('0001');
    const invoiceNo = (bill: Body) => Number(String(bill.billNumber).split('/')[1]);
    expect(await counterQty()).toBe(3);
    expect(ledgerRows(await ledger(fx.mrpItemId, idOf(created.data)))).toEqual([
      ['SALE_OUT', 'ORDER', 'COUNTER', 0, 2, 3],
    ]);

    // A resend (double tap, retry) returns the same bill and takes no more stock.
    const resent = await ok('POST', '/pos/orders', bill);
    expect(idOf(resent)).toBe(idOf(created.data));
    expect(await counterQty()).toBe(3);

    const oversold = await api('POST', '/pos/orders', {
      ...bill,
      clientOrderId: `over-${run}`,
      lines: [{ menuId, quantity: 4 }],
    });
    expect(oversold.status).toBe(400);
    expect(String(oversold.body.message)).toMatch(/^Only 3 of /);

    const noReason = await api('POST', '/pos/orders', {
      ...bill,
      clientOrderId: `comp0-${run}`,
      isComplimentary: true,
      paymentMode: undefined,
    });
    expect(noReason.status).toBe(400);
    const comp = await ok('POST', '/pos/orders', {
      ...bill,
      clientOrderId: `comp-${run}`,
      complimentaryReason: 'Duty doctor',
      isComplimentary: true,
      lines: [{ menuId, quantity: 1 }],
      paymentMode: undefined,
    });
    expect(comp).toMatchObject({ isComplimentary: true, paymentMode: null });
    // Failed bills use no number: the next bill is the next invoice and the next order.
    expect(invoiceNo(comp)).toBe(invoiceNo(created.data) + 1);
    expect(comp.orderNumber).toBe('0002');
    expect(await counterQty()).toBe(2);

    const cancelled = await api('PATCH', `/pos/orders/${idOf(created.data)}/cancel`, {
      reason: 'Wrong item',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data).toMatchObject({ cancelReason: 'Wrong item', status: 'CANCELLED' });
    expect(await counterQty()).toBe(4);
    expect(ledgerRows(await ledger(fx.mrpItemId, idOf(created.data)))).toEqual(
      expect.arrayContaining([['SALE_CANCEL_IN', 'ORDER', 'COUNTER', 2, 0, 4]]),
    );
    const twice = await api('PATCH', `/pos/orders/${idOf(created.data)}/cancel`, { reason: 'x' });
    expect(twice.status).toBe(409);

    expect(await ok('GET', `/pos/summary?counterId=${counterId}`)).toMatchObject({
      bills: 0,
      cancelled: { amount: 117, count: 1 },
      complimentary: { count: 1 },
      sales: 0,
    });
    expect(items(await ok('GET', `/pos/orders?counterId=${counterId}`))).toHaveLength(2);
    expect(
      items(await ok('GET', `/pos/orders?counterId=${counterId}&isComplimentary=true`)),
    ).toHaveLength(1);

    // Staff discount: the restaurant's Employee Discount rule for the employee's level, off the
    // value before GST, while the restaurant gives staff discount.
    const rates = await ok('PUT', `/pos/staff-discounts/${fx.restaurantId}`, {
      rates: [],
      staffDiscountApplicable: true,
    });
    expect(rates).toMatchObject({ staffDiscountApplicable: true });
    for (const [employmentType, discountPercent] of [
      ['ON_ROLL', 10],
      ['OUTSOURCED', 5],
    ] as const) {
      await ok('POST', '/employee-discounts', {
        discountPercent,
        employmentType,
        name: `Staff ${employmentType} ${run}`,
        restaurantId: fx.restaurantId,
      });
    }
    await ok('POST', '/employees', {
      employeeCode: `E${run}`,
      employeeName: 'Staff Member',
      employmentType: 'ON_ROLL',
      hospitalId: fx.hospitalId,
    });
    expect(await ok('GET', `/pos/employee?counterId=${counterId}&code=e${run}`)).toMatchObject({
      discountPercent: 10,
      employmentType: 'ON_ROLL',
    });

    // 49.50 - 10% = 44.55, GST 2 x 4.01 = 8.02, 52.57 -> 53.
    const staffBill = await ok('POST', '/pos/orders', {
      ...bill,
      clientOrderId: `staff-${run}`,
      employeeCode: `E${run}`,
      lines: [{ menuId, quantity: 1 }],
    });
    expect(staffBill).toMatchObject({
      discountPercent: 10,
      discountTotal: 4.95,
      grandTotal: 53,
      gstTotal: 8.02,
      subtotal: 49.5,
    });
    expect((staffBill.lines as Body[])[0]).toMatchObject({
      discountAmount: 4.95,
      taxableAmount: 44.55,
    });

    const unknown = await api('POST', '/pos/orders', {
      ...bill,
      clientOrderId: `nobody-${run}`,
      employeeCode: 'NOBODY',
    });
    expect([unknown.status, unknown.body.message]).toEqual([
      400,
      'No active employee with ID NOBODY.',
    ]);

    // Staff get their discount at every Max location: a cashier who sees only this location
    // still finds an employee registered at another one; nothing else widens.
    const [elsewhere] = await rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      `OT${run}`.toUpperCase(),
      `Other ${run}`,
    );
    await rawQuery(
      `INSERT INTO employees (id, employee_code, employee_name, employment_type, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Elsewhere Staff', 'OUTSOURCED', $2::uuid, now())`,
      `X${run}`.toUpperCase(),
      elsewhere!.id,
    );
    const [cashier] = await rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Test Cashier', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `C${run}`.toUpperCase(),
      `7${String(Date.now()).slice(-9)}`,
      fx.hospitalId,
    );
    await rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = 'POS Cashier'`,
      cashier!.id,
    );
    await rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      cashier!.id,
      fx.hospitalId,
    );
    const admin = token;
    token = signFor(cashier!);
    try {
      expect(await ok('GET', `/pos/employee?counterId=${counterId}&code=X${run}`)).toMatchObject({
        discountPercent: 5,
        employeeName: 'Elsewhere Staff',
      });
      // Everything else stays limited to the cashier's own location.
      expect((await api('GET', `/pos/orders?hospitalId=${elsewhere!.id}`)).status).toBe(403);
      // A cashier bills room orders, but only an approver may make a meal complimentary.
      const comp = await api('POST', '/pos/orders', {
        channel: 'COUNTER',
        clientOrderId: `cashier-comp-${run}`,
        complimentaryReason: 'Duty doctor',
        counterId,
        isComplimentary: true,
        lines: [{ menuId: randomUUID(), quantity: 1 }],
      });
      expect(comp.status).toBe(403);
      expect(String(comp.body.message)).toMatch(/complimentary/);
    } finally {
      token = admin;
    }
    // One open shift per user: close this till so the next tests can open their own.
    await ok('PATCH', `/pos/shifts/${idOf(till)}/end`, { countedCash: 0, handover: false });
  });

  it('shifts: count the cash, hand over, close; a closed day bills on the next one', async () => {
    const counterId = idOf(
      await ok('POST', '/counters', {
        counterCode: `SH${run}`,
        counterName: `Shift ${run}`,
        hospitalId: fx.hospitalId,
        restaurantId: fx.restaurantId,
      }),
    );
    // The counter POS test put this item on the restaurant's menu; this counter keeps no stock
    // of it, so it sells freely.
    const menuId = idOf(
      firstOf(
        (
          (await ok('GET', `/pos/menu?counterId=${counterId}&channel=COUNTER`)).items as Body[]
        ).filter((entry) => entry.itemId === fx.mrpItemId),
      ),
    );
    const bill = (name: string, paymentMode = 'CASH') =>
      api('POST', '/pos/orders', {
        channel: 'COUNTER',
        clientOrderId: `shift-${name}-${run}`,
        counterId,
        lines: [{ menuId, quantity: 1 }],
        paymentMode,
      });
    const shiftState = async () =>
      ((await ok('GET', '/pos/counters')) as unknown as Body[]).find(
        (counter) => counter.id === counterId,
      )?.shift as Body;

    const first = await ok('POST', '/pos/shifts', { counterId, openingCash: 500 });
    expect(first).toMatchObject({ openingCash: 500, status: 'OPEN', takenOverFromId: null });
    expect((await api('POST', '/pos/shifts', { counterId, openingCash: 0 })).status).toBe(409);
    expect((await shiftState()).open).toMatchObject({ id: idOf(first) });

    // 49.50 + 18% = 58.41 -> 58 each; only the cash one is in the till.
    const cashBill = await bill('cash');
    expect(cashBill.data.grandTotal).toBe(58);
    expect((await bill('upi', 'UPI')).status).toBe(201);

    const handed = await ok('PATCH', `/pos/shifts/${idOf(first)}/end`, {
      countedCash: 550,
      handover: true,
    });
    expect(handed).toMatchObject({ countedCash: 550, expectedCash: 558, status: 'HANDED_OVER' });
    expect(handed.summary).toMatchObject({ bills: 2, sales: 116 });
    expect(
      (
        await api('PATCH', `/pos/shifts/${idOf(first)}/end`, {
          countedCash: 0,
          handover: false,
        })
      ).status,
    ).toBe(409);
    expect(await shiftState()).toMatchObject({ handover: { id: idOf(first) }, open: null });

    // The next cashier takes the handover on.
    const second = await ok('POST', '/pos/shifts', { counterId, openingCash: 550 });
    expect(second.takenOverFromId).toBe(idOf(first));
    expect((await shiftState()).handover).toBeNull();
    expect((await api('POST', '/pos/day-closes', { counterId })).status).toBe(409);
    await ok('PATCH', `/pos/shifts/${idOf(second)}/end`, { countedCash: 550, handover: false });

    const closed = await ok('POST', '/pos/day-closes', { counterId });
    const summary = await ok('GET', `/pos/summary?counterId=${counterId}`);
    expect(closed.businessDate).toBe(summary.date);
    expect(summary.dayClose).not.toBeNull();
    expect((summary.shifts as Body[]).map((shift) => shift.status)).toEqual([
      'HANDED_OVER',
      'CLOSED',
    ]);
    expect((await api('POST', '/pos/day-closes', { counterId })).status).toBe(409);
    expect((await shiftState()).dayClosed).toBe(true);

    // After the day is closed: its bills are final, and new ones go on the next day.
    const cancelClosed = await api('PATCH', `/pos/orders/${idOf(cashBill.data)}/cancel`, {
      reason: 'x',
    });
    expect(cancelClosed.status).toBe(409);
    const third = await ok('POST', '/pos/shifts', { counterId, openingCash: 0 });
    const nextDay = await bill('next');
    expect(String(nextDay.data.businessDate).slice(0, 10)).toBe(
      new Date(Date.parse(String(summary.date)) + 86_400_000).toISOString().slice(0, 10),
    );
    await ok('PATCH', `/pos/shifts/${idOf(third)}/end`, { countedCash: 58, handover: false });
  });

  it('online UPI: the server prices it, the bill must match it, and it pays one bill only', async () => {
    const counterId = idOf(
      await ok('POST', '/counters', {
        counterCode: `OP${run}`,
        counterName: `Online ${run}`,
        hospitalId: fx.hospitalId,
        restaurantId: fx.restaurantId,
      }),
    );
    const menuId = idOf(
      firstOf(
        (
          (await ok('GET', `/pos/menu?counterId=${counterId}&channel=COUNTER`)).items as Body[]
        ).filter((entry) => entry.itemId === fx.mrpItemId),
      ),
    );
    const draft = { channel: 'COUNTER', counterId, lines: [{ menuId, quantity: 1 }] };
    const shift = await ok('POST', '/pos/shifts', { counterId, openingCash: 0 });
    const providers = (await ok('GET', '/pos/online-payments/providers')) as unknown as string[];

    // A real sandbox round trip when Razorpay test keys are set: link made, still unpaid, let go.
    if (providers.includes('RAZORPAY')) {
      const started = await ok('POST', '/pos/online-payments', { ...draft, provider: 'RAZORPAY' });
      expect(started).toMatchObject({ amount: 58, provider: 'RAZORPAY', status: 'PENDING' });
      expect(String(started.paymentUrl)).toMatch(/^https:\/\//);
      expect((await ok('GET', `/pos/online-payments/${idOf(started)}`)).status).toBe('PENDING');
      expect((await ok('POST', `/pos/online-payments/${idOf(started)}/cancel`, {})).status).toBe(
        'CANCELLED',
      );
    }

    // A paid one, as the provider would report it.
    const [paid] = await rawQuery<{ id: string }>(
      `INSERT INTO online_payments (id, hospital_id, counter_id, provider, status, amount, provider_ref,
         payment_url, paid_reference, paid_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'RAZORPAY', 'PAID', 58, $3, 'https://rzp.io/x',
         'pay_test_1', now(), now()) RETURNING id`,
      fx.hospitalId,
      counterId,
      `plink_${run}`,
    );
    const billWith = (name: string, quantity: number) =>
      api('POST', '/pos/orders', {
        ...draft,
        clientOrderId: `online-${name}-${run}`,
        lines: [{ menuId, quantity }],
        onlinePaymentId: paid!.id,
        paymentMode: 'UPI',
      });

    const tooMuch = await billWith('two', 2);
    expect(tooMuch.status).toBe(409);
    expect(String(tooMuch.body.message)).toMatch(
      /^₹58.00 was paid, but the bill now comes to ₹117.00/,
    );
    const billed = await billWith('one', 1);
    expect(billed.status).toBe(201);
    expect(billed.data).toMatchObject({
      grandTotal: 58,
      paymentMode: 'UPI',
      paymentReference: 'pay_test_1',
    });
    expect((await billWith('again', 1)).status).toBe(409);
    await ok('PATCH', `/pos/shifts/${idOf(shift)}/end`, { countedCash: 0, handover: false });
  });

  // Dates are kept as UTC calendar days whatever the server's zone: these used to land a day early
  // east of UTC (Bugs found in OPTIMIZE-PROGRESS.md).
  describe('on a server east of UTC', () => {
    async function inKolkata(check: () => Promise<void>) {
      process.env.TZ = 'Asia/Kolkata';
      try {
        await check();
      } finally {
        process.env.TZ = 'UTC';
      }
    }

    it('a GRN batch keeps the expiry date it was received with', () =>
      inKolkata(async () => {
        expect((await stockBatch('IST', 3)).expiryDate).toBe(day(60));
      }));

    it('stock filters by expiry date find the batch received with that date', () =>
      inKolkata(async () => {
        const batch = await stockBatch('ISF', 2);
        const found = await ok(
          'GET',
          `/stock-balances?itemId=${fx.mrpItemId}&expiryDate=${day(60)}&locationType=STORE&limit=100`,
        );
        expect(items(found).map((b) => b.batchNumber)).toContain(batch.batchNumber);
        const summary = await ok(
          'GET',
          `/store-stock/summary?itemId=${fx.mrpItemId}&expiryDate=${day(60)}&locationType=STORE&limit=100`,
        );
        expect(items(summary)).toHaveLength(1);
      }));

    it('ready-made stock received at a restaurant keeps the transfer business date', () =>
      inKolkata(async () => {
        const production = await ok('POST', '/kitchen-productions', {
          businessDate: today,
          hospitalId: fx.hospitalId,
          items: [{ itemId: fx.readyItemId, producedQty: 5 }],
          kitchenId: fx.kitchenId,
          productionDate: new Date().toISOString(),
        });
        await ok('PATCH', `/kitchen-productions/${idOf(production)}/post`);
        const draft = await ok('POST', '/transfers', {
          businessDate: today,
          destinationId: fx.restaurantId,
          destinationType: 'RESTAURANT',
          hospitalId: fx.hospitalId,
          items: [{ itemId: fx.readyItemId, sentQty: 2 }],
          sourceId: fx.kitchenId,
          sourceType: 'KITCHEN',
          transferDate: new Date().toISOString(),
        });
        const transfer = await ok('PATCH', `/transfers/${idOf(draft)}/dispatch`);
        await acknowledge(transfer, { acceptedQty: 2, rejectedQty: 0 });
        const dates = (await balances(fx.readyItemId, 'RESTAURANT'))
          .filter((b) => b.locationId === fx.restaurantId)
          .map((b) => String(b.businessDate).slice(0, 10));
        expect(dates).toEqual([today]);
      }));

    it('an item price keeps the effective dates it was saved with', () =>
      inKolkata(async () => {
        const price = await ok('POST', '/item-prices', {
          effectiveFrom: day(5),
          effectiveTo: day(40),
          hospitalId: fx.hospitalId,
          isTaxInclusive: false,
          itemId: fx.mrpItemId,
          price: 25,
          rateType: 'STAFF',
        });
        expect(String(price.effectiveFrom).slice(0, 10)).toBe(day(5));
        expect(String(price.effectiveTo).slice(0, 10)).toBe(day(40));
      }));
  });
});
