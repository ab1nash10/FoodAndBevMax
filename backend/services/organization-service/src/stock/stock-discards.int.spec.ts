// Discarding stock over HTTP: a store batch is filled through a posted GRN, then part of it is
// thrown away. Pins the balance, the DISCARD_OUT ledger line, the audit row, the refusals, who
// may discard where, and that two discards at once never take a batch below zero.
// Runs only with DATABASE_URL_TEST.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

describe.skipIf(!databaseUrl)('stock discards (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = { hospitalId: '', itemId: '', otherHospitalId: '', storeId: '' };
  let batchSeq = 0;

  /** Puts `qty` of a fresh batch into the store through a posted GRN; returns its balance id. */
  async function stockBatch(qty: number): Promise<string> {
    const batchNumber = `D-${run}-${++batchSeq}`;
    const batch = { acceptedQty: qty, batchNumber, expiryDate: day(60), receivedQty: qty };
    const grn = await h.ok('POST', '/grns', {
      hospitalId: fx.hospitalId,
      items: [{ acceptedQty: qty, batches: [{ ...batch, rejectedQty: 0 }], itemId: fx.itemId }].map(
        (line) => ({ ...line, receivedQty: qty, rejectedQty: 0 }),
      ),
      receivedBy: 'Discard test',
      receivedDate: day(0),
      storeId: fx.storeId,
      vendorName: `Vendor ${run}`,
    });
    await h.ok('PATCH', `/grns/${grn.id as string}/post-to-stock`);
    const balances = (
      await h.ok('GET', `/stock-balances?itemId=${fx.itemId}&locationType=STORE&limit=100`)
    ).items as Body[];
    return balances.find((b) => b.batchNumber === batchNumber)!.id as string;
  }

  const availableQty = async (balanceId: string) => {
    const [row] = await h.rawQuery<{ qty: string }>(
      'SELECT available_qty::text AS qty FROM stock_balances WHERE stock_balance_id = $1::uuid',
      balanceId,
    );
    return Number(row!.qty);
  };

  const discard = (stockBalanceId: string, body: Body = {}, as?: string) =>
    h.api(
      'POST',
      '/stock-discards',
      { quantity: 1, reason: 'EXPIRED', stockBalanceId, ...body },
      as,
    );

  /** A user of `hospitalId` only, holding just these permissions. */
  async function userWith(hospitalId: string, permissions: string[]): Promise<string> {
    const [role] = await h.rawQuery<{ id: string }>(
      `INSERT INTO roles (id, name, location_scope, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', now()) RETURNING id`,
      `Int Discard ${run} ${randomUUID().slice(0, 8)}`,
    );
    await h.rawQuery(
      `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM permissions WHERE code = ANY($2::text[])`,
      role!.id,
      permissions,
    );
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Discard Tester', $2, $3::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `DS${run}${randomUUID().slice(0, 4)}`.toUpperCase(),
      `7${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, '0')}`,
      hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      role!.id,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      hospitalId,
    );
    return h.signFor(user!);
  }

  beforeAll(async () => {
    h = await startHarness();
    const store = firstOf(
      (await h.ok('GET', '/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'))
        .items as Body[],
    );
    fx.storeId = store.id as string;
    fx.hospitalId = store.hospitalId as string;
    const categoryId = (await h.ok('POST', '/item-categories', { categoryName: `Discard ${run}` }))
      .id;
    fx.itemId = (await h.ok('POST', '/items', { itemName: `Discard milk ${run}`, type: 'VEG' }))
      .id as string;
    await h.ok('POST', '/store-items', { categoryId, itemId: fx.itemId, storeId: fx.storeId });
    const [other] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      `DI${run}`.toUpperCase(),
      `Int Discard Other ${run}`,
    );
    fx.otherHospitalId = other!.id;
  }, 60_000);

  afterAll(() => h?.app.close());

  it('takes the quantity off the batch and records why in the ledger and the audit log', async () => {
    const balanceId = await stockBatch(10);

    const result = await discard(balanceId, {
      note: 'tin dented',
      quantity: 2.5,
      reason: 'DAMAGED',
    });
    expect(result.status).toBe(201);
    expect(result.data).toMatchObject({ availableQty: 7.5, stockBalanceId: balanceId });
    expect(await availableQty(balanceId)).toBe(7.5);

    const ledger = (
      await h.ok('GET', `/stock-ledgers?itemId=${fx.itemId}&transactionType=DISCARD_OUT&limit=100`)
    ).items as Body[];
    expect(
      ledger
        .filter((e) => e.id === result.data.ledgerId)
        .map((e) => [e.transactionType, e.locationType, e.qtyOut, e.balanceAfter, e.remarks]),
    ).toEqual([['DISCARD_OUT', 'STORE', 2.5, 7.5, 'Discarded: Damaged: tin dented']]);

    const audit = await h.rawQuery<{ action: string; newValue: Body }>(
      `SELECT action, new_value AS "newValue" FROM audit_logs WHERE entity_id = $1::uuid`,
      balanceId,
    );
    expect(audit.map((a) => [a.action, a.newValue.quantity])).toEqual([['STOCK_DISCARD', 2.5]]);
  });

  it('refuses more than is left, OTHER without a note, and an unknown batch', async () => {
    const balanceId = await stockBatch(3);

    const tooMuch = await discard(balanceId, { quantity: 3.001 });
    expect([tooMuch.status, tooMuch.body.message]).toEqual([
      400,
      'Only 3 left in this batch; discard that much or less.',
    ]);
    // One plain message each, not every rule the note has.
    for (const note of [undefined, '   ']) {
      const noNote = await discard(balanceId, { note, reason: 'OTHER' });
      expect([noNote.status, noNote.body.message]).toEqual([
        400,
        'Say what happened to the stock.',
      ]);
    }
    const longNote = await discard(balanceId, { note: 'x'.repeat(201), reason: 'OTHER' });
    expect([longNote.status, longNote.body.message]).toEqual([
      400,
      'Keep the note to 200 characters or fewer.',
    ]);
    const unknown = await discard(randomUUID());
    expect([unknown.status, unknown.body.message]).toEqual([404, 'Stock batch not found']);
    expect(await availableQty(balanceId)).toBe(3);

    // The whole batch may go, and then nothing more.
    expect((await discard(balanceId, { quantity: 3 })).data.availableQty).toBe(0);
    expect((await discard(balanceId, { quantity: 0.001 })).status).toBe(400);
  });

  it('needs STOCK_DISCARD, and only reaches batches at the user’s own locations', async () => {
    const balanceId = await stockBatch(5);

    const viewer = await userWith(fx.hospitalId, ['STOCK_VIEW']);
    expect((await discard(balanceId, {}, viewer)).status).toBe(403);
    const elsewhere = await userWith(fx.otherHospitalId, ['STOCK_DISCARD', 'STOCK_VIEW']);
    expect((await discard(balanceId, {}, elsewhere)).status).toBe(404);
    const local = await userWith(fx.hospitalId, ['STOCK_DISCARD', 'STOCK_VIEW']);
    expect((await discard(balanceId, {}, local)).status).toBe(201);

    expect(await availableQty(balanceId)).toBe(4);
  });

  it('two discards at once never take a batch below zero', async () => {
    const balanceId = await stockBatch(5);

    const results = await Promise.all([
      discard(balanceId, { quantity: 4 }),
      discard(balanceId, { quantity: 4 }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);
    expect(await availableQty(balanceId)).toBe(1);
  });
});
