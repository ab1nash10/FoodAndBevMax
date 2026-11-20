// ERP posting over HTTP: what may be sent (a past day, a restaurant at its location), a day with
// no bills kept as EMPTY without calling the ERP, the list and one attempt in full, location
// reach and the REPORT_ERP / ERP_POSTING_SEND gates. The ERP itself is never called here (its
// sending is unit-tested in erp-postings.service.spec.ts). Runs only with DATABASE_URL_TEST.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  firstOf,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

// Switched on, at an address nothing listens on: a day with bills would fail, not leave this PC.
process.env.ERP_REVENUE_URL = 'http://127.0.0.1:9/erp-revenue';
process.env.ERP_REVENUE_TOKEN = 'integration-token';

describe.skipIf(!databaseUrl)('ERP posting (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = { hospitalId: '', otherHospitalId: '', restaurantId: '' };
  // A day long before any bill in the test database: nothing to send, every run.
  const quietDay = '2001-02-03';
  const send = (body: Body, as?: string) => h.api('POST', '/erp-postings', body, as);

  /** A signed-in user of one location holding just these permissions. */
  async function userWith(hospitalId: string, permissions: string[]): Promise<string> {
    const [role] = await h.rawQuery<{ id: string }>(
      `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
      `Int ERP ${randomUUID().slice(0, 8)}`,
    );
    await h.rawQuery(
      `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions WHERE code = ANY($2::text[])`,
      role!.id,
      permissions,
    );
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'ERP Clerk', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `ER${randomUUID().slice(0, 8)}`,
      `7${String(Date.now()).slice(-9)}`,
      hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      role!.id,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      hospitalId,
    );
    return h.signFor(user!);
  }

  beforeAll(async () => {
    h = await startHarness();
    const restaurant = firstOf(
      (await h.ok('GET', '/restaurants?limit=1&isActive=true')).items as Body[],
    );
    fx.restaurantId = restaurant.id as string;
    fx.hospitalId = restaurant.hospitalId as string;
    const [other] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, 'Int ERP Other', now()) RETURNING id`,
      `ER${randomUUID().slice(0, 6)}`.toUpperCase(),
    );
    fx.otherHospitalId = other!.id;
  }, 60_000);

  afterAll(() => h?.app.close());

  it('sends only a day that is over, for a restaurant at that location', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const refused = async (body: Body) => {
      const response = await send(body);
      return [response.status, response.body.message];
    };
    const day = { hospitalId: fx.hospitalId, restaurantId: fx.restaurantId };

    expect(await refused({ ...day, businessDate: today })).toEqual([
      400,
      'A day is sent once it is over: pick yesterday or earlier.',
    ]);
    expect(await refused({ ...day, businessDate: '2026-13-01' })).toEqual([
      400,
      'businessDate must be a day, YYYY-MM-DD.',
    ]);
    expect(await refused({ ...day, businessDate: quietDay, restaurantId: randomUUID() })).toEqual([
      404,
      'Restaurant not found at this location.',
    ]);
    // A real restaurant, but named under another location: not found there.
    expect(
      await refused({ ...day, businessDate: quietDay, hospitalId: fx.otherHospitalId }),
    ).toEqual([404, 'Restaurant not found at this location.']);
  });

  it('a day without bills is kept as EMPTY, and the ERP is not called', async () => {
    const empty = await send({
      businessDate: quietDay,
      hospitalId: fx.hospitalId,
      restaurantId: fx.restaurantId,
    });

    expect([empty.status, empty.body.message]).toEqual([
      201,
      'No bills that day: nothing was sent.',
    ]);
    expect(empty.data).toMatchObject({
      billCount: 0,
      businessDate: quietDay,
      rowCount: 0,
      status: 'EMPTY',
    });
    // Not "already sent": only a day the ERP took blocks sending it again.
    expect(
      (
        await send({
          businessDate: quietDay,
          hospitalId: fx.hospitalId,
          restaurantId: fx.restaurantId,
        })
      ).status,
    ).toBe(201);
  });

  it('the list (newest first, filtered) and one attempt in full; another location sees neither', async () => {
    const listed = await h.ok(
      'GET',
      `/erp-postings?restaurantId=${fx.restaurantId}&status=EMPTY&from=${quietDay}&to=${quietDay}&limit=5`,
    );
    expect(listed).toMatchObject({ enabled: true, limit: 5, page: 1 });
    const [latest, earlier] = listed.items as Body[];
    expect(latest).toMatchObject({
      businessDate: quietDay,
      restaurantId: fx.restaurantId,
      restaurantName: expect.any(String) as unknown,
      status: 'EMPTY',
    });
    expect(Date.parse(latest!.createdAt as string)).toBeGreaterThanOrEqual(
      Date.parse(earlier!.createdAt as string),
    );

    const one = await h.ok('GET', `/erp-postings/${latest!.id as string}`);
    expect(one).toMatchObject({ id: latest!.id, report: expect.any(Object) as unknown });
    expect((await h.api('GET', `/erp-postings/${randomUUID()}`)).status).toBe(404);
    expect((await h.api('GET', '/erp-postings?status=LOST')).status).toBe(400);

    // A user of another location: not theirs to see.
    const elsewhere = await userWith(fx.otherHospitalId, ['REPORT_ERP']);
    expect(
      (await h.api('GET', `/erp-postings/${latest!.id as string}`, undefined, elsewhere)).status,
    ).toBe(404);
    const theirs = await h.api('GET', '/erp-postings?limit=100', undefined, elsewhere);
    expect((theirs.data.items as Body[]).map((row) => row.id)).not.toContain(latest!.id);
  });

  it('reading needs REPORT_ERP, sending needs ERP_POSTING_SEND', async () => {
    const reader = await userWith(fx.hospitalId, ['REPORT_ERP']);
    const sender = await userWith(fx.hospitalId, ['ERP_POSTING_SEND']);
    const day = {
      businessDate: quietDay,
      hospitalId: fx.hospitalId,
      restaurantId: fx.restaurantId,
    };

    expect((await h.api('GET', '/erp-postings', undefined, reader)).status).toBe(200);
    expect((await send(day, reader)).status).toBe(403);
    expect((await h.api('GET', '/erp-postings', undefined, sender)).status).toBe(403);
    expect((await send(day, sender)).status).toBe(201);
    expect((await h.api('GET', '/erp-postings', undefined, '')).status).toBe(401);
  });
});
