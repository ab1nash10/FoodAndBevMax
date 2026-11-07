// A shift whose counter no till reaches any more (its till was removed while the shift was open)
// can never be ended on a till, and its cashier can open no other shift. The till says where it
// is, the Counters list flags it, and an admin ends it there with a reason.
//
// Runs only with DATABASE_URL_TEST. Every record is this run's own.
import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  firstOf,
  run,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;

describe.skipIf(!databaseUrl)('stuck shifts (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    keptCounterId: '', // on a till that stays
    keptTillKey: '',
    stuckCounterId: '', // its till is removed while a shift is open there
    stuckCounterName: '',
    stuckRestaurantName: '',
  };
  const cashier = { id: '', token: '' };
  let stuckShiftId = '';

  const withTill = <T>(tillKey: string, act: () => Promise<T>) => {
    const saved = h.tillKey;
    h.tillKey = tillKey;
    return act().finally(() => {
      h.tillKey = saved;
    });
  };
  const endWithoutTill = (id: string, body: Body, token?: string) =>
    h.api('PATCH', `/pos/shifts/${id}/end-without-till`, body, token);

  beforeAll(async () => {
    Object.assign(process.env, { PAYU_CLIENT_ID: ' ', RAZORPAY_KEY_ID: ' ' });
    h = await startHarness();
    const kitchen = firstOf(
      items(await h.ok('GET', '/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc')),
    );
    const hospitalId = kitchen.hospitalId as string;
    const storeId = idOf(
      firstOf(
        items(
          await h.ok(
            'GET',
            `/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc&hospitalId=${hospitalId}`,
          ),
        ),
      ),
    );
    const restaurant = async (name: string) =>
      await h.ok('POST', '/restaurants', { hospitalId, restaurantName: `${name} ${run}` });
    const kept = await restaurant('Int Kept');
    const stuck = await restaurant('Int Stuck');
    fx.stuckRestaurantName = stuck.restaurantName as string;

    // Tea at the stuck restaurant, so the stranded shift has a bill to tally.
    const categoryId = idOf(
      await h.ok('POST', '/item-categories', { categoryName: `Int Stuck ${run}` }),
    );
    const itemId = idOf(await h.ok('POST', '/items', { itemName: `Int Chai ${run}`, type: 'VEG' }));
    await h.ok('POST', '/store-items', { categoryId, itemId, storeId });
    const menuId = idOf(
      await h.ok('POST', '/restaurant-menus', {
        categoryId,
        gstPercent: 5,
        isGstInclusive: true,
        itemId,
        price: 25,
        restaurantId: idOf(stuck),
        serveAt: 'COUNTER',
        storeId,
      }),
    );

    const counter = async (code: string, restaurantId: string) =>
      await h.ok('POST', '/counters', {
        counterCode: `${code}${run}`,
        counterName: `Int ${code} ${run}`,
        hospitalId,
        restaurantId,
      });
    fx.keptCounterId = idOf(await counter('SK', idOf(kept)));
    const stuckCounter = await counter('SS', idOf(stuck));
    fx.stuckCounterId = idOf(stuckCounter);
    fx.stuckCounterName = stuckCounter.counterName as string;

    const till = async (code: string, restaurantId: string) => {
      const device = await h.ok('POST', '/pos-devices', {
        code: `${code}${run}`,
        hospitalId,
        hostName: `INT-${code}-${run}`,
        name: `Int ${code} ${run}`,
        restaurantIds: [restaurantId],
      });
      const { tillKey } = (await h.ok('POST', '/pos/till', {
        computerName: `INT-${code}-${run}`,
        posDeviceId: idOf(device),
      })) as { tillKey: string };
      return { id: idOf(device), tillKey };
    };
    fx.keptTillKey = (await till('TK', idOf(kept))).tillKey;
    const doomed = await till('TS', idOf(stuck));

    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `SC${run}`.toUpperCase(),
      `Int Stuck Cashier ${run}`,
      `6${String(randomInt(100_000_000, 999_999_999))}`,
      hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = 'POS Cashier' AND deleted_at IS NULL`,
      user!.id,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      hospitalId,
    );
    cashier.id = user!.id;
    cashier.token = h.signFor(user!);

    // The cashier opens a shift and bills twice; then the till is removed with the shift open.
    await withTill(doomed.tillKey, async () => {
      stuckShiftId = idOf(
        await h.ok(
          'POST',
          '/pos/shifts',
          { counterId: fx.stuckCounterId, openingCash: 100 },
          cashier.token,
        ),
      );
      for (const name of ['one', 'two']) {
        await h.ok(
          'POST',
          '/pos/orders',
          {
            channel: 'COUNTER',
            clientOrderId: `stuck-${name}-${run}`,
            counterId: fx.stuckCounterId,
            lines: [{ menuId, quantity: 1 }],
            paymentMode: 'CASH',
          },
          cashier.token,
        );
      }
    });
    await h.ok('DELETE', `/pos-devices/${doomed.id}`);
  }, 120_000);

  afterAll(() => h?.app.close());

  it('the till tells the cashier where their open shift is, and that no till reaches it', async () => {
    const counters = (await withTill(fx.keptTillKey, () =>
      h.ok('GET', '/pos/counters?till=true', undefined, cashier.token),
    )) as unknown as Body[];
    const kept = counters.find((entry) => entry.id === fx.keptCounterId)!;

    expect((kept.shift as Body).elsewhere).toEqual({
      counterName: fx.stuckCounterName,
      hasTill: false,
      openedAt: expect.any(String) as unknown,
      restaurantName: fx.stuckRestaurantName,
    });

    const refused = await withTill(fx.keptTillKey, () =>
      h.api('POST', '/pos/shifts', { counterId: fx.keptCounterId, openingCash: 0 }, cashier.token),
    );
    expect(refused.status).toBe(409);
  });

  it('signing out, any page asks where the user’s own open shift is; no till needed', async () => {
    expect(await h.ok('GET', '/pos/my-shift', undefined, cashier.token)).toEqual({
      counterName: fx.stuckCounterName,
      hasTill: false,
      openedAt: expect.any(String) as unknown,
      restaurantName: fx.stuckRestaurantName,
    });
    // The admin has none open.
    // (The body itself: the harness turns a null data into {}.)
    expect((await h.api('GET', '/pos/my-shift')).body.data).toBeNull();
  });

  it('the Counters list shows each open shift and whether a till can end it', async () => {
    const listed = items(await h.ok('GET', `/counters?search=${run}&limit=100`));
    const row = (id: string) => listed.find((entry) => entry.id === id)!;

    expect(row(fx.stuckCounterId)).toMatchObject({
      hasTill: false,
      openShift: {
        id: stuckShiftId,
        openedAt: expect.any(String) as unknown,
        openedByName: `Int Stuck Cashier ${run}`,
      },
    });
    expect(row(fx.keptCounterId)).toMatchObject({ hasTill: true, openShift: null });
  });

  it('an admin ends it with a reason; its bills are tallied and the cashier is free again', async () => {
    const refused = await endWithoutTill(stuckShiftId, { reason: 'Till removed' }, cashier.token);
    expect(refused.status).toBe(403);

    for (const body of [{}, { reason: '   ' }, { countedCash: -1, reason: 'Till removed' }]) {
      expect((await endWithoutTill(stuckShiftId, body)).status).toBe(400);
    }

    // A shift on a counter a till reaches is still ended on that till.
    const onTill = await withTill(fx.keptTillKey, () =>
      h.ok('POST', '/pos/shifts', { counterId: fx.keptCounterId, openingCash: 0 }),
    );
    const hasTill = await endWithoutTill(idOf(onTill), { reason: 'Not needed' });
    expect([hasTill.status, hasTill.body.message]).toEqual([
      409,
      'That counter has a till. End the shift on its till.',
    ]);
    await withTill(fx.keptTillKey, () =>
      h.ok('PATCH', `/pos/shifts/${idOf(onTill)}/end`, { countedCash: 0, handover: false }),
    );

    const ended = await h.ok('PATCH', `/pos/shifts/${stuckShiftId}/end-without-till`, {
      reason: 'Till removed with the shift open',
    });
    expect(ended).toMatchObject({
      countedCash: null,
      expectedCash: 150,
      note: 'Till removed with the shift open',
      status: 'CLOSED',
      summary: { bills: 2, sales: 50 },
    });

    const [audit] = await h.rawQuery<{ action: string; newValue: Body }>(
      `SELECT action, new_value AS "newValue" FROM audit_logs
       WHERE entity_id = $1::uuid AND action = 'SHIFT_CLOSE'`,
      stuckShiftId,
    );
    expect(audit?.newValue).toMatchObject({
      reason: 'Till removed with the shift open',
      withoutTill: true,
    });

    const again = await endWithoutTill(stuckShiftId, { reason: 'Again' });
    expect(again.status).toBe(409);
    // Ended, it no longer holds the cashier's sign-out.
    expect((await h.api('GET', '/pos/my-shift', undefined, cashier.token)).body.data).toBeNull();

    const opened = await withTill(fx.keptTillKey, () =>
      h.api('POST', '/pos/shifts', { counterId: fx.keptCounterId, openingCash: 0 }, cashier.token),
    );
    expect(opened.status).toBe(201);
  });
});
