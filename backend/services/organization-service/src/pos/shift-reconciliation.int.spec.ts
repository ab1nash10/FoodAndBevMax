// Payment reconciliation and Supervisor approval per shift (the user, 2026-11-26): a closed
// shift's cash, UPI and card checks; the restaurant admin's reasons; the Supervisor's approval
// (every shift, matched or not) or send-back; and approval making the shift's money final.
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

describe.skipIf(!databaseUrl)('shift reconciliation (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = { hospitalId: '', restaurantId: '', restaurantName: '' };
  // ₹100 opening + two ₹25 cash bills = ₹150 expected, ₹140 counted: ₹10 short.
  const short = { billId: '', shiftId: '' };
  // ₹0 opening + one ₹25 cash bill, ₹25 counted.
  const matched = { shiftId: '' };
  const tokens = { admin: '', cashier: '', supervisor: '' };
  const names = { admin: `Int Recon Admin ${run}`, supervisor: `Int Recon Supervisor ${run}` };

  const list = async (as?: string) =>
    items(
      await h.ok(
        'GET',
        `/pos/shift-reconciliations?hospitalId=${fx.hospitalId}&restaurantId=${fx.restaurantId}`,
        undefined,
        as,
      ),
    );
  const viewOf = async (shiftId: string) =>
    (await list()).find((entry) => entry.shiftId === shiftId)!;
  const reasons = (shiftId: string, body: Body, as = tokens.admin) =>
    h.api('PUT', `/pos/shift-reconciliations/${shiftId}/reasons`, { reasons: body }, as);
  const decide = (shiftId: string, action: 'approve' | 'send-back', body: Body = {}, as?: string) =>
    h.api('POST', `/pos/shift-reconciliations/${shiftId}/${action}`, body, as ?? tokens.supervisor);
  const message = (response: { body: Body }) => response.body.message;

  /** A user with this role at the location, signed in. */
  const userWith = async (role: string, name: string) => {
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `RC${randomInt(100_000, 999_999)}${run}`.toUpperCase(),
      name,
      `6${String(randomInt(100_000_000, 999_999_999))}`,
      fx.hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = $2 AND deleted_at IS NULL`,
      user!.id,
      role,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      fx.hospitalId,
    );
    return h.signFor(user!);
  };

  beforeAll(async () => {
    // No UPI gateway or card machine: these shifts are cash only.
    Object.assign(process.env, { PAYU_CLIENT_ID: ' ', RAZORPAY_KEY_ID: ' ' });
    h = await startHarness();
    const kitchen = firstOf(
      items(await h.ok('GET', '/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc')),
    );
    fx.hospitalId = kitchen.hospitalId as string;
    const storeId = idOf(
      firstOf(
        items(
          await h.ok(
            'GET',
            `/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc&hospitalId=${fx.hospitalId}`,
          ),
        ),
      ),
    );
    const restaurant = await h.ok('POST', '/restaurants', {
      hospitalId: fx.hospitalId,
      restaurantName: `Int Recon ${run}`,
    });
    fx.restaurantId = idOf(restaurant);
    fx.restaurantName = restaurant.restaurantName as string;
    const categoryId = idOf(
      await h.ok('POST', '/item-categories', { categoryName: `Int Recon ${run}` }),
    );
    const itemId = idOf(
      await h.ok('POST', '/items', { itemName: `Int Recon Tea ${run}`, type: 'VEG' }),
    );
    await h.ok('POST', '/store-items', { categoryId, itemId, storeId });
    const menuId = idOf(
      await h.ok('POST', '/restaurant-menus', {
        categoryId,
        gstPercent: 5,
        isGstInclusive: true,
        itemId,
        price: 25,
        restaurantId: fx.restaurantId,
        serveAt: 'COUNTER',
        storeId,
      }),
    );
    const counterId = idOf(
      await h.ok('POST', '/counters', {
        counterCode: `RC${run}`,
        counterName: `Int Recon ${run}`,
        hospitalId: fx.hospitalId,
        restaurantId: fx.restaurantId,
      }),
    );
    await h.ok('POST', '/pos-devices', {
      code: `RC${run}`,
      hospitalId: fx.hospitalId,
      hostName: `INT-RC-${run}`,
      name: `Int Recon ${run}`,
      restaurantIds: [fx.restaurantId],
      users: [{ hostName: `INT-RC-${run}`, userId: h.superAdmin.id }],
    });
    h.tillKey = (
      (await h.ok('POST', '/pos/till', { computerName: `INT-RC-${run}` })) as {
        tillKey: string;
      }
    ).tillKey;

    const shift = async (openingCash: number, bills: number, countedCash: number) => {
      const shiftId = idOf(await h.ok('POST', '/pos/shifts', { counterId, openingCash }));
      const billIds: string[] = [];
      for (let index = 0; index < bills; index += 1) {
        billIds.push(
          idOf(
            await h.ok('POST', '/pos/orders', {
              channel: 'COUNTER',
              clientOrderId: `recon-${shiftId}-${index}`,
              counterId,
              lines: [{ menuId, quantity: 1 }],
              paymentMode: 'CASH',
            }),
          ),
        );
      }
      await h.ok('PATCH', `/pos/shifts/${shiftId}/end`, { countedCash, handover: false });
      return { billIds, shiftId };
    };
    const first = await shift(100, 2, 140);
    short.shiftId = first.shiftId;
    short.billId = first.billIds[0]!;
    matched.shiftId = (await shift(0, 1, 25)).shiftId;

    tokens.admin = await userWith('Admin', names.admin);
    tokens.supervisor = await userWith('Supervisor', names.supervisor);
    tokens.cashier = await userWith('Restaurant/POS Operator', `Int Recon Cashier ${run}`);
  }, 120_000);

  afterAll(() => h?.app.close());

  it('lists the day’s ended shifts with their money: one ₹10 short, one matched', async () => {
    const shortView = await viewOf(short.shiftId);
    expect(shortView).toMatchObject({
      checks: [{ amount: 10, key: 'CASH', kind: 'short' }],
      money: [
        { billed: 150, difference: -10, mode: 'CASH', received: 140 },
        { billed: 0, difference: 0, mode: 'UPI', received: 0 },
        { billed: 0, difference: 0, mode: 'CARD', received: 0 },
      ],
      restaurantName: fx.restaurantName,
      status: 'NEEDS_REASON',
    });
    expect((shortView.checks as Body[])[0]!.reasons).toContain('Wrong change given');
    // Every shift waits for the Supervisor, matched or not.
    expect(await viewOf(matched.shiftId)).toMatchObject({ checks: [], status: 'WAITING' });
  });

  it('the restaurant admin gives the reasons; the cashier sees none of it', async () => {
    expect(
      (await h.api('GET', '/pos/shift-reconciliations', undefined, tokens.cashier)).status,
    ).toBe(403);
    // An admin gives the reasons, so does not approve them.
    expect((await decide(short.shiftId, 'approve', {}, tokens.admin)).status).toBe(403);
    expect(message(await decide(short.shiftId, 'approve'))).toBe(
      'This shift still needs the restaurant admin’s reason for each difference.',
    );
    expect(message(await reasons(short.shiftId, {}))).toBe(
      'Give a reason for the cash difference.',
    );
    expect(message(await reasons(short.shiftId, { CASH: { reason: 'Other' } }))).toBe(
      'Say what happened when the reason for the cash difference is Other.',
    );
    // The Supervisor does not give reasons.
    expect(
      (await reasons(short.shiftId, { CASH: { reason: 'Cash short' } }, tokens.supervisor)).status,
    ).toBe(403);

    const saved = await reasons(short.shiftId, {
      CASH: { note: 'A ₹10 note given as change twice', reason: 'Wrong change given' },
    });
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({
      reasons: { CASH: { note: 'A ₹10 note given as change twice', reason: 'Wrong change given' } },
      status: 'WAITING',
      submittedByName: names.admin,
    });
  });

  it('approval makes the shift’s money final: its bills can no longer be amended or cancelled', async () => {
    const approved = await decide(short.shiftId, 'approve', { comment: 'Checked the change log' });
    expect(approved.status).toBe(201);
    expect(approved.data).toMatchObject({
      comment: 'Checked the change log',
      decidedByName: names.supervisor,
      status: 'APPROVED',
    });

    expect(message(await decide(short.shiftId, 'approve'))).toBe('This shift is already approved.');
    expect(message(await reasons(short.shiftId, { CASH: { reason: 'Cash short' } }))).toBe(
      'This shift is approved, so its reasons can no longer change.',
    );
    expect(
      message(
        await h.api('POST', `/order-reports/${short.billId}/amendments`, {
          paymentMode: 'UPI',
          paymentReference: `RC-${run}`,
          remarks: 'Paid by UPI',
        }),
      ),
    ).toBe('This bill’s shift is approved, so its payment mode can no longer be changed.');
    expect(
      message(
        await h.api('PATCH', `/pos/orders/${short.billId}/cancel`, { reason: 'Guest returned it' }),
      ),
    ).toBe('This bill’s shift is approved, so it can no longer be cancelled.');
  });

  it('a Supervisor sends a shift back with a comment; sent again, it is approved', async () => {
    expect((await decide(matched.shiftId, 'send-back', { comment: '  ' })).status).toBe(400);

    const sentBack = await decide(matched.shiftId, 'send-back', {
      comment: 'Recount the cash with a second person',
    });
    expect(sentBack.data).toMatchObject({
      comment: 'Recount the cash with a second person',
      status: 'SENT_BACK',
    });
    expect(message(await decide(matched.shiftId, 'approve'))).toBe(
      'This shift was sent back: it waits for the restaurant admin to send it again.',
    );

    // Nothing to explain: sent again as it is.
    expect((await reasons(matched.shiftId, {})).data).toMatchObject({ status: 'WAITING' });
    expect((await decide(matched.shiftId, 'approve')).data).toMatchObject({ status: 'APPROVED' });
  });
});
