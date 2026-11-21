// The ERP GRN API end to end: the ERP sends a signed GRN as flat rows (its own field names);
// goods in go into the Main Store at once, a reverse takes what the store holds of the batch (the
// rest owed until the batch comes back, the F&B Admins emailed), the same grn_No again adds to that
// GRN, a GRN AAHAR cannot take is listed for the store team, and the ERP reads back what moved.
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
import { formatErpTimestamp, sign, stringToSign } from './erp-signature.js';

const apiKey = 'erp-test-key';
const secret = 'erp-test-secret-0123456789abcdef';
// Mail is "set up", and a stand-in for Microsoft Graph below catches what would be sent.
Object.assign(process.env, {
  ERP_API_KEY: apiKey,
  ERP_API_SECRET: secret,
  MAIL_CLIENT_ID: 'int-client',
  MAIL_CLIENT_SECRET: 'int-secret',
  MAIL_SENDER: 'aahar@example.test',
  MAIL_TENANT_ID: 'int-tenant',
});

/** Emails "sent" through the Graph stand-in: who to, subject and body. */
const mails: Array<{ html: string; subject: string; to: string[] }> = [];
const fetchBefore = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('https://login.microsoftonline.com/')) {
    return Response.json({ access_token: 'int-token', expires_in: 3600 });
  }
  if (url.startsWith('https://graph.microsoft.com/')) {
    const { message } = JSON.parse(init?.body as string) as {
      message: {
        body: { content: string };
        subject: string;
        toRecipients: Array<{ emailAddress: { address: string } }>;
      };
    };
    mails.push({
      html: message.body.content,
      subject: message.subject,
      to: message.toRecipients.map((r) => r.emailAddress.address),
    });
    return new Response(null, { status: 202 });
  }
  return fetchBefore(input, init);
};

interface ErpCall {
  body?: string;
  key?: string;
  secret?: string;
  timestamp?: string;
}

describe.skipIf(!databaseUrl)('ERP GRN API (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    hospitalCode: '',
    hospitalId: '',
    hospitalName: '',
    itemCode: '',
    itemId: '',
    item2Code: '',
    item2Id: '',
    itemName: '',
    adminEmail: `fnb-admin-${run}@example.test`,
    storeCode: '',
    storeId: '',
  };
  let grnSeq = 0;
  const newGrnNumber = () => `ERP-${run}-${++grnSeq}`;

  /** Calls /erp/* signed as the ERP would; any part can be overridden to test a refusal. */
  async function erp(method: string, path: string, call: ErpCall = {}) {
    const timestamp = call.timestamp ?? formatErpTimestamp(new Date());
    const key = call.key ?? apiKey;
    const response = await fetch(new URL(`${h.baseUrl}${path}`), {
      body: method === 'GET' ? undefined : (call.body ?? ''),
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'x-signature': sign(stringToSign(key, timestamp, call.secret ?? secret)),
        'x-timestamp': timestamp,
      },
      method,
    });
    const json = (await response.json()) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  }

  const send = (rows: Body[], call: ErpCall = {}) =>
    erp('POST', '/erp/grns', { ...call, body: JSON.stringify(rows) });

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const received = (transactionNumber: unknown) => ({
    message: 'Request Sent Successfully!!',
    success: true,
    transaction_number: transactionNumber,
  });
  /** A refused send: AAHAR's own failure shape, with each reason in `errors`. */
  const failed = (errors: unknown[]) => ({
    errors,
    message: 'Request failed',
    requestId: expect.any(String) as unknown,
    success: false,
    transaction_number: null,
  });

  /** One row per batch, in the ERP's own field names, as in its sample (no transaction number). */
  function grn(
    grnNumber: string,
    batches: { qty: number; batch: string; expiry?: string }[],
    extra: Body = {},
  ): Body[] {
    return batches.map((b) => ({
      'Discount/Extra Charges': 0,
      'HSN No': '998313',
      MRP: 15,
      'Tax Rate': 'IGST@18%',
      'Total Value': Math.round(b.qty * 980) / 100,
      UOM: 'No.',
      'Unit Rate': 9.8,
      batch: b.batch,
      date: '2026-10-26T15:50:00+05:30',
      expiry_date: b.expiry ?? day(90),
      flag: 0,
      grn_No: grnNumber,
      issued_by: 'M030634',
      item_name: 'Kinley Water - 1000 Ml',
      location: fx.hospitalCode,
      part_item_code: fx.itemCode,
      purchase_order: '392851',
      requisition: '918590',
      supplier: 'CAGR0008',
      transaction_qty: b.qty,
      ...extra,
    }));
  }

  const storeQty = async (batchNumber: string, itemId = fx.itemId) => {
    const rows = await h.rawQuery<{ qty: string }>(
      `SELECT available_qty::text AS qty FROM stock_balances
        WHERE item_id = $1::uuid AND location_id = $2::uuid AND batch_number = $3 AND deleted_at IS NULL`,
      itemId,
      fx.storeId,
      batchNumber,
    );
    return rows.length ? Number(rows[0]!.qty) : 0;
  };

  /** A restaurant of the location, as far as stock goes: where issued stock sits. */
  const restaurantId = randomUUID();

  /** Stock issued from the Main Store to a restaurant (as a dispatched transfer leaves it). */
  async function issueToRestaurant(batch: string, qty: number) {
    await h.rawQuery(
      `UPDATE stock_balances SET available_qty = available_qty - $3
        WHERE item_id = $1::uuid AND location_id = $2::uuid AND batch_number = $4`,
      fx.itemId,
      fx.storeId,
      qty,
      batch,
    );
    await h.rawQuery(
      `INSERT INTO stock_balances (stock_balance_id, hospital_id, location_type, location_id, item_id,
         item_type, batch_number, expiry_date, available_qty, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'RESTAURANT', $2::uuid, $3::uuid, 'MRP', $4, $5::date, $6, now())`,
      fx.hospitalId,
      restaurantId,
      fx.itemId,
      batch,
      day(90),
      qty,
    );
  }

  const readBack = async (grnNumber: string) => (await erp('GET', `/erp/grns/${grnNumber}`)).data;

  /** The store's actions on a GRN with a reverse still waiting. */
  const runNow = (grnNumber: string) =>
    h.api('POST', `/grn-entries/${encodeURIComponent(grnNumber)}/run`);
  const autoRerun = (grnNumber: string, active: boolean) =>
    h.api('PATCH', `/grn-entries/${encodeURIComponent(grnNumber)}/rerun`, { active });
  const close = (grnNumber: string, body: Body = {}) =>
    h.api('PATCH', `/grn-entries/${encodeURIComponent(grnNumber)}/close`, body);

  /**
   * A reverse still waiting for its batch, as the earlier rule left them (a return must now be
   * in the store whole, so the ERP cannot make one): sent while the store held the batch, then
   * set back to nothing moved yet.
   */
  async function waitingReverse(grnNumber: string, batch: string, qty: number) {
    await send(grn(newGrnNumber(), [{ batch, qty }]));
    await send(grn(grnNumber, [{ batch, qty }], { flag: 1 }));
    await h.rawQuery(
      `UPDATE grn_entries SET accepted_qty = 0, rejected_qty = 0, status = 'PENDING', verified_at = NULL
        WHERE grn_number = $1`,
      grnNumber,
    );
  }

  beforeAll(async () => {
    h = await startHarness();
    // A location of its own: it comes with a Main Store, where the ERP's GRNs land.
    fx.hospitalName = `Int ERP Site ${run}`;
    const hospital = await h.ok('POST', '/hospitals', {
      city: 'New Delhi',
      invoicePrefix: `E${run.toUpperCase()}`,
      locationCode: `e${run}`,
      state: 'Delhi',
      title: fx.hospitalName,
    });
    fx.hospitalId = hospital.id as string;
    fx.hospitalCode = hospital.hospitalCode as string;
    const store = firstOf(
      ((await h.ok('GET', `/stores?hospitalId=${fx.hospitalId}&limit=100`)).items as Body[]).filter(
        (s) => s.storeName === 'Main Store',
      ),
    );
    fx.storeId = store.id as string;
    fx.storeCode = store.storeCode as string;
    const categoryId = (await h.ok('POST', '/item-categories', { categoryName: `ERP GRN ${run}` }))
      .id;
    const item = await h.ok('POST', '/items', {
      hsnCode: '220110',
      itemName: `ERP GRN water ${run}`,
      type: 'VEG',
    });
    fx.itemId = item.id as string;
    // As the Item master keeps it (it title-cases names).
    fx.itemName = item.itemName as string;
    fx.itemCode = item.itemCode as string;
    await h.ok('POST', '/store-items', { categoryId, itemId: fx.itemId, storeId: fx.storeId });
    const item2 = await h.ok('POST', '/items', { itemName: 'ERP GRN juice ' + run, type: 'VEG' });
    fx.item2Id = item2.id as string;
    fx.item2Code = item2.itemCode as string;
    await h.ok('POST', '/store-items', { categoryId, itemId: fx.item2Id, storeId: fx.storeId });

    // An F&B Admin of this location: hears about a return the Main Store could not cover.
    await h.rawQuery(
      `INSERT INTO roles (id, name, location_scope, status, updated_at)
       VALUES (gen_random_uuid(), 'F&B Admin', 'SINGLE', 'ACTIVE', now()) ON CONFLICT (name) DO NOTHING`,
    );
    const admin = randomUUID();
    await h.rawQuery(
      `INSERT INTO users (id, employee_code, name, email, mobile, status, hospital_id, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, 'ACTIVE', $6::uuid, now())`,
      admin,
      `FA-${run}`,
      `F&B Admin ${run}`,
      fx.adminEmail,
      // Other suites make users the same millisecond: another first digit and a random part.
      `8${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9)}`,
      fx.hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = 'F&B Admin'`,
      admin,
    );
  }, 60_000);

  afterAll(() => h?.app.close());

  describe('only a correctly signed request gets in', () => {
    const body = () => JSON.stringify(grn(newGrnNumber(), [{ batch: `S-${run}`, qty: 1 }]));
    const refused = async (call: ErpCall, reason: string) => {
      const result = await erp('POST', '/erp/grns', { body: body(), ...call });
      expect([result.status, result.body]).toEqual([401, failed([reason])]);
    };

    it('refuses a wrong key or a signature made with the wrong token', async () => {
      await refused({ key: 'someone-else' }, 'Unknown API key');
      await refused({ secret: 'not-the-token' }, 'Signature does not match');
    });

    it('refuses a timestamp in the wrong format or more than 5 minutes off', async () => {
      await refused(
        { timestamp: String(Math.floor(Date.now() / 1000)) },
        'X-Timestamp must be dd/MM/yyyy/HH/mm in India time',
      );
      await refused(
        { timestamp: '31/02/2026/10/00' },
        'X-Timestamp must be dd/MM/yyyy/HH/mm in India time',
      );
      await refused(
        { timestamp: formatErpTimestamp(new Date(Date.now() - 10 * 60_000)) },
        'X-Timestamp is more than 5 minutes from the server time',
      );
    });

    it('takes the same signed headers again within the minute (no one-time number)', async () => {
      const timestamp = formatErpTimestamp(new Date());
      expect((await erp('POST', '/erp/grns', { body: body(), timestamp })).status).toBe(200);
      expect((await erp('POST', '/erp/grns', { body: body(), timestamp })).status).toBe(200);
    });

    it('refuses a call with a user token instead of a signature', async () => {
      expect((await h.api('GET', '/erp/grns/anything')).status).toBe(401);
    });
  });

  it('goods in go into stock the moment the ERP sends them; the ERP reads them back', async () => {
    const grnNumber = newGrnNumber();
    const [b1, b2] = [`A-${run}`, `B-${run}`];

    const sent = await send(
      grn(grnNumber, [
        { batch: b1, qty: 60 },
        { batch: b2, qty: 40 },
      ]),
    );
    // The answer is only AAHAR's own number for the request, a message and success.
    expect([sent.status, sent.body]).toEqual([200, received(expect.stringMatching(uuid))]);
    const number = sent.body.transaction_number as string;
    // Kept on every row of the request, in AAHAR's database.
    const stored = await h.rawQuery<{ transaction_number: string }>(
      `SELECT DISTINCT transaction_number FROM grn_entries WHERE grn_number = $1`,
      grnNumber,
    );
    expect(stored.map((row) => row.transaction_number)).toEqual([number]);
    // The store person checked the goods in the ERP: AAHAR adds them at once.
    expect([await storeQty(b1), await storeQty(b2)]).toEqual([60, 40]);

    const ledger = await h.rawQuery<{
      transaction_type: string;
      reference_type: string;
      qty_in: string;
    }>(
      `SELECT transaction_type, reference_type, qty_in::text FROM stock_ledgers
        WHERE item_id = $1::uuid AND batch_number = ANY($2) ORDER BY batch_number`,
      fx.itemId,
      [b1, b2],
    );
    expect(ledger.map((r) => [r.transaction_type, r.reference_type, Number(r.qty_in)])).toEqual([
      ['GRN_IN', 'GRN_ENTRY', 60],
      ['GRN_IN', 'GRN_ENTRY', 40],
    ]);

    const result = await erp('GET', `/erp/grns/${grnNumber}`);
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      grn_No: grnNumber,
      location: fx.hospitalCode,
      status: 'VERIFIED',
      store_code: fx.storeCode,
      store_name: 'Main Store',
      totals: { accepted_qty: 100, pending_qty: 0, rejected_qty: 0, transaction_qty: 100 },
      transaction_number: number,
      verified_by: null,
    });
    expect(result.data.verified_at).toEqual(expect.any(String));
    // Every row comes back with every field the ERP sent, AAHAR's number and what moved.
    expect((result.data.rows as Body[])[1]).toEqual({
      'Discount/Extra Charges': 0,
      'HSN No': '998313',
      MRP: 15,
      'Tax Rate': 'IGST@18%',
      'Total Value': 392,
      UOM: 'No.',
      'Unit Rate': 9.8,
      accepted_qty: 40,
      batch: b2,
      date: '2026-10-26T10:20:00.000Z',
      expiry_date: day(90),
      flag: 0,
      grn_No: grnNumber,
      issued_by: 'M030634',
      item_name: 'Kinley Water - 1000 Ml',
      location: fx.hospitalCode,
      part_item_code: fx.itemCode,
      pending_qty: 0,
      purchase_order: '392851',
      rejected_qty: 0,
      rejection_reason: null,
      requisition: '918590',
      row_id: expect.stringMatching(uuid) as unknown,
      supplier: 'CAGR0008',
      transaction_number: number,
      transaction_qty: 40,
    });

    // The ERP picks up everything done since a time; the portal lists it as done.
    const since = new Date(Date.now() - 60_000).toISOString();
    const picked = await erp(
      'GET',
      `/erp/grns?status=VERIFIED&verifiedSince=${encodeURIComponent(since)}&limit=100`,
    );
    expect((picked.data.items as Body[]).map((g) => g.grn_No)).toContain(grnNumber);
    const listed = await h.ok('GET', `/grn-entries?search=${grnNumber}`);
    expect((listed.items as Body[]).map((g) => [g.grn_No, g.status])).toEqual([
      [grnNumber, 'VERIFIED'],
    ]);

    // The same grn_No again: its rows join that GRN and each moves stock by its flag. More of a
    // batch it has (flag 0) adds, a new batch is added to it, a return (flag 1) takes back.
    const b0 = `0-${run}`;
    const more = await send([
      ...grn(grnNumber, [{ batch: b1, qty: 5 }]),
      ...grn(grnNumber, [{ batch: b0, qty: 7 }]),
    ]);
    expect([more.status, more.body]).toEqual([200, received(expect.stringMatching(uuid))]);
    const second = more.body.transaction_number as string;
    const back = await send(grn(grnNumber, [{ batch: b2, qty: 15 }], { flag: 1 }));
    expect(back.status).toBe(200);
    const third = back.body.transaction_number as string;
    expect(new Set([number, second, third]).size).toBe(3);
    expect([await storeQty(b1), await storeQty(b2), await storeQty(b0)]).toEqual([65, 25, 7]);

    // One GRN with every row. It keeps its first request's number and time; each row keeps the
    // number of the request that sent it, and any of them finds the GRN.
    const whole = await erp('GET', `/erp/grns/${third}`);
    expect(whole.data).toMatchObject({
      grn_No: grnNumber,
      received_at: result.data.received_at,
      status: 'VERIFIED',
      totals: { accepted_qty: 127, pending_qty: 0, rejected_qty: 0, transaction_qty: 127 },
      transaction_number: number,
    });
    expect(
      (whole.data.rows as Body[]).map((row) => [
        row.batch,
        row.flag,
        row.accepted_qty,
        row.transaction_number,
      ]),
    ).toEqual([
      [b0, 0, 7, second],
      [b1, 0, 60, number],
      [b1, 0, 5, second],
      [b2, 0, 40, number],
      [b2, 1, 15, third],
    ]);
  });

  it('the same GRN sent twice at once goes into stock twice, one after the other', async () => {
    const grnNumber = newGrnNumber();
    const batch = `D-${run}`;
    const both = await Promise.all([
      send(grn(grnNumber, [{ batch, qty: 7 }])),
      send(grn(grnNumber, [{ batch, qty: 7 }])),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(await storeQty(batch)).toBe(14);
    expect((await readBack(grnNumber)).totals).toMatchObject({
      accepted_qty: 14,
      transaction_qty: 14,
    });
  });

  it('takes the sample as the ERP writes it: text numbers, India time, location by name', async () => {
    const grnNumber = newGrnNumber();
    const [row] = grn(grnNumber, [{ batch: '*', qty: 5 }]);
    const sample: Body = {
      ...row,
      'Discount/Extra Charges': '0',
      MRP: '15',
      'Total Value': '9.257',
      'Unit Rate': '9.80',
      date: '2026-10-26 15:50:00',
      expiry_date: '2027-10-26 15:50:00',
      flag: '0',
      // The location's name, in any case, stands for it as well as its code.
      location: fx.hospitalName.toUpperCase(),
      transaction_qty: '5',
    };
    const sent = await send([sample]);
    expect([sent.status, sent.body.success]).toEqual([200, true]);

    const saved = await readBack(grnNumber);
    expect(saved).toMatchObject({ location: fx.hospitalCode, store_name: 'Main Store' });
    expect(firstOf(saved.rows as Body[])).toMatchObject({
      'Discount/Extra Charges': 0,
      'HSN No': '998313',
      MRP: 15,
      'Total Value': 9.257,
      'Unit Rate': 9.8,
      batch: '*',
      date: '2026-10-26T10:20:00.000Z',
      expiry_date: '2027-10-26',
      item_name: 'Kinley Water - 1000 Ml',
      location: fx.hospitalCode,
      transaction_number: sent.body.transaction_number,
      transaction_qty: 5,
    });
  });

  it('refuses unknown codes, mixed GRNs and fields AAHAR gives itself, and saves nothing', async () => {
    const grnNumber = newGrnNumber();
    const unknown = [
      ...grn(grnNumber, [{ batch: `U-${run}`, qty: 5 }], { location: 'NO-SUCH-PLACE' }),
      ...grn(grnNumber, [{ batch: 'X', qty: 1 }], { part_item_code: 'NO-SUCH-ITEM' }),
    ];
    const result = await send(unknown);
    expect([result.status, result.body]).toEqual([
      422,
      failed([
        'Every row of a GRN must have the same location',
        'Location NO-SUCH-PLACE is not in AAHAR',
        'Item code NO-SUCH-ITEM is not in AAHAR',
      ]),
    ]);
    expect((await erp('GET', `/erp/grns/${grnNumber}`)).status).toBe(404);
    // Listed for the store team on ERP GRN errors: why, where it was for, and the rows as sent.
    const listed = await h.ok('GET', `/grn-entries/refusals?search=${grnNumber}`);
    expect(listed.items).toEqual([
      {
        errors: [
          'Every row of a GRN must have the same location',
          'Location NO-SUCH-PLACE is not in AAHAR',
          'Item code NO-SUCH-ITEM is not in AAHAR',
        ],
        grn_No: grnNumber,
        hospital_id: null,
        id: expect.stringMatching(uuid) as unknown,
        location: 'NO-SUCH-PLACE',
        location_name: null,
        received_at: expect.any(String) as unknown,
        rows: unknown,
      },
    ]);

    const mixed = [
      ...grn(grnNumber, [{ batch: `M1-${run}`, qty: 1 }]),
      ...grn(newGrnNumber(), [{ batch: `M2-${run}`, qty: 1 }]),
    ];
    expect((await send(mixed)).body).toEqual(
      failed(['Every row must have the same grn_No: send one GRN at a time']),
    );

    const missing = await send([{ ...grn(grnNumber, [{ batch: 'Y', qty: 1 }])[0], batch: '' }]);
    expect([missing.status, missing.body.message, missing.body.success]).toEqual([
      400,
      'Request failed',
      false,
    ]);

    // Every field is required: a row missing any one, or with it blank, is refused naming it.
    const [full] = grn(grnNumber, [{ batch: 'Z', qty: 1 }]);
    for (const field of Object.keys(full!)) {
      const { [field]: _left, ...rest } = full!;
      const without = await send([rest]);
      expect([field, without.status]).toEqual([field, 400]);
      expect(String(without.body.errors)).toContain(field);
    }
    expect((await send([{ ...full, supplier: '' }])).status).toBe(400);
    expect((await send(grn(grnNumber, [{ batch: 'Z', qty: 1 }], { flag: 2 }))).status).toBe(400);

    // The transaction number is AAHAR's to give: the ERP does not send one.
    const own = await send(
      grn(grnNumber, [{ batch: 'Z', qty: 1 }], { transaction_number: '724630' }),
    );
    expect(own.status).toBe(400);
    expect(String(own.body.errors)).toContain('transaction_number');
    expect((await erp('GET', `/erp/grns/${grnNumber}`)).status).toBe(404);
  });

  it('one GRN carries several items, each with several batches (the same batch name on both)', async () => {
    const grnNumber = newGrnNumber();
    const [a1, c2] = [`MA1-${run}`, `MC2-${run}`];
    const sent = await send([
      ...grn(grnNumber, [
        { batch: a1, qty: 6 },
        { batch: '*', qty: 4 },
      ]),
      ...grn(
        grnNumber,
        [
          { batch: '*', qty: 3 },
          { batch: c2, qty: 2 },
        ],
        { item_name: 'Juice', part_item_code: fx.item2Code },
      ),
    ]);
    expect(sent.body).toEqual(received(expect.stringMatching(uuid)));

    // One GRN, one transaction number, four rows, each in stock as its own item's batch.
    const saved = await readBack(grnNumber);
    expect(saved.totals).toEqual({
      accepted_qty: 15,
      pending_qty: 0,
      rejected_qty: 0,
      transaction_qty: 15,
    });
    const rows = saved.rows as Body[];
    expect(rows.map((r) => [r.part_item_code, r.batch, r.transaction_qty]).sort()).toEqual(
      [
        [fx.itemCode, a1, 6],
        [fx.itemCode, '*', 4],
        [fx.item2Code, '*', 3],
        [fx.item2Code, c2, 2],
      ].sort(),
    );
    expect(new Set(rows.map((r) => r.transaction_number))).toEqual(
      new Set([sent.body.transaction_number]),
    );
    expect(await storeQty(a1)).toBe(6);
    expect(await storeQty(c2, fx.item2Id)).toBe(2);
    expect(await storeQty('*', fx.item2Id)).toBe(3);
  });

  it('gives each request a number of its own, never reused', async () => {
    const numbers = new Set<string>();

    for (let index = 0; index < 3; index += 1) {
      const sent = await send(grn(newGrnNumber(), [{ batch: `N${index}-${run}`, qty: 1 }]));
      numbers.add(sent.body.transaction_number as string);
    }

    expect(numbers.size).toBe(3);

    // The ERP can read a GRN back by the number AAHAR gave it, as well as by its grn_No.
    const grnNumber = newGrnNumber();
    const sent = await send(grn(grnNumber, [{ batch: `T-${run}`, qty: 1 }]));
    const byNumber = await erp('GET', `/erp/grns/${sent.body.transaction_number as string}`);
    expect([byNumber.status, byNumber.data.grn_No]).toEqual([200, grnNumber]);

    // The log finds a GRN by its transaction number too, and by the day it arrived.
    const number = sent.body.transaction_number as string;
    const found = await h.ok('GET', `/grn-entries?search=${number.slice(0, 8)}`);
    expect((found.items as Body[]).map((g) => g.grn_No)).toEqual([grnNumber]);
    // India days, whatever the server's clock zone.
    const indiaDay = (offset: number) =>
      new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
    const onTheDay = await h.ok(
      'GET',
      `/grn-entries?search=${grnNumber}&receivedFrom=${indiaDay(0)}&receivedTo=${indiaDay(0)}`,
    );
    expect((onTheDay.items as Body[]).length).toBe(1);
    const later = await h.ok('GET', `/grn-entries?search=${grnNumber}&receivedFrom=${indiaDay(1)}`);
    expect(later.items).toEqual([]);

    // A failed read answers in the same shape as a failed send.
    const missing = await erp('GET', `/erp/grns/NO-SUCH-${run}`);
    expect([missing.status, missing.body]).toEqual([404, failed([`GRN NO-SUCH-${run} not found`])]);
  });

  it('refuses goods that have already expired; expired stock may still be sent back', async () => {
    const batch = `E-${run}`;
    const late = newGrnNumber();
    const refused = await send(grn(late, [{ batch, expiry: day(-1), qty: 3 }]));
    expect([refused.status, refused.body]).toEqual([
      422,
      failed([`Batch ${batch} of item ${fx.itemCode} has expired and cannot be received`]),
    ]);
    expect((await erp('GET', `/erp/grns/${late}`)).status).toBe(404);
    // A return is not refused for its expiry. The Main Store has none of it, so all of it is owed.
    const back = await send(grn(newGrnNumber(), [{ batch, expiry: day(-1), qty: 1 }], { flag: 1 }));
    expect([back.status, back.body.shortfalls]).toEqual([
      200,
      [{ batch, owed: 1, part_item_code: fx.itemCode, requested: 1, returned: 0 }],
    ]);
  });

  it('a reverse (flag 1) takes what the Main Store holds; the rest is owed until the batch comes back', async () => {
    const batch = `R-${run}`;
    // GRN 10 in; 6 go out to a restaurant.
    const reverse = newGrnNumber();
    await send(grn(reverse, [{ batch, qty: 10 }]));
    await issueToRestaurant(batch, 6);
    expect(await storeQty(batch)).toBe(4);

    // The same GRN returns 5 with 4 in the store: the 4 go back now and 1 is owed, the ERP is told
    // so, and the whole GRN is open again (one status per GRN).
    const sent = await send(grn(reverse, [{ batch, qty: 5 }], { flag: 1 }));
    expect([sent.status, sent.body]).toEqual([
      200,
      {
        ...received(expect.stringMatching(uuid)),
        shortfalls: [{ batch, owed: 1, part_item_code: fx.itemCode, requested: 5, returned: 4 }],
      },
    ]);
    expect(await storeQty(batch)).toBe(0);
    expect(await readBack(reverse)).toMatchObject({
      status: 'PENDING',
      totals: { accepted_qty: 14, pending_qty: 1, rejected_qty: 0, transaction_qty: 15 },
    });
    const [out] = await h.rawQuery<{ transaction_type: string; qty_out: string }>(
      `SELECT transaction_type, qty_out::text FROM stock_ledgers
        WHERE item_id = $1::uuid AND batch_number = $2 AND qty_out > 0`,
      fx.itemId,
      batch,
    );
    expect([out?.transaction_type, Number(out?.qty_out)]).toEqual(['GRN_RETURN_OUT', 4]);
    // Nothing was refused.
    expect((await h.ok('GET', `/grn-entries/refusals?search=${reverse}`)).items).toEqual([]);
    // The location's F&B Admins hear of it: what is owed, and where the batch is held.
    const told = mails.filter((mail) => mail.subject.includes(reverse));
    expect(told.map(({ subject, to }) => ({ subject, to }))).toEqual([
      {
        subject: `GRN reverse ${reverse} at ${fx.hospitalName}: 1 still owed to the vendor`,
        to: [fx.adminEmail],
      },
    ]);
    expect(told[0]!.html).toContain(batch);

    // The batch reaches the store again (here from the ERP): the 1 owed is taken by itself.
    await send(grn(newGrnNumber(), [{ batch, qty: 2 }]));
    expect(await storeQty(batch)).toBe(1);
    expect(await readBack(reverse)).toMatchObject({
      status: 'VERIFIED',
      totals: { accepted_qty: 15, pending_qty: 0 },
    });

    // A reverse the store covers owes nothing and tells no one; another expiry date on the batch
    // still finds the stock.
    const otherExpiry = newGrnNumber();
    const covered = await send(
      grn(otherExpiry, [{ batch, expiry: day(400), qty: 1 }], { flag: 1 }),
    );
    expect(covered.body).toEqual(received(expect.stringMatching(uuid)));
    expect(await storeQty(batch)).toBe(0);
    expect((await readBack(otherExpiry)).status).toBe('VERIFIED');
    expect(mails.filter((mail) => mail.subject.includes(otherExpiry))).toEqual([]);
  });

  it('a waiting reverse runs again by itself when the batch reaches the store; it can be paused and closed', async () => {
    const batch = `P-${run}`;
    const reverse = newGrnNumber();
    await waitingReverse(reverse, batch, 5);
    expect(await storeQty(batch)).toBe(0);
    expect((await readBack(reverse)).totals).toMatchObject({ accepted_qty: 0, pending_qty: 5 });

    // Paused: new goods of the batch stay in the store.
    expect((await autoRerun(reverse, false)).status).toBe(200);
    expect((await readBack(reverse)).rerun_active).toBe(false);
    await send(grn(newGrnNumber(), [{ batch, qty: 2 }]));
    expect(await storeQty(batch)).toBe(2);
    expect((await readBack(reverse)).totals).toMatchObject({ pending_qty: 5 });

    // Resumed: it runs at once and takes them.
    await autoRerun(reverse, true);
    expect(await storeQty(batch)).toBe(0);
    expect((await readBack(reverse)).totals).toMatchObject({ accepted_qty: 2, pending_qty: 3 });

    // Goods of the batch arriving from the ERP: taken by the waiting reverse on their own.
    await send(grn(newGrnNumber(), [{ batch, qty: 1 }]));
    expect(await storeQty(batch)).toBe(0);
    expect((await readBack(reverse)).totals).toMatchObject({ accepted_qty: 3, pending_qty: 2 });

    // The rest was sold at the café: the store closes it, with one of the reasons and a note.
    const noReason = await close(reverse);
    expect([noReason.status, noReason.body.message]).toEqual([400, 'Give a reason for closing it']);
    expect((await close(reverse, { reason: 'Sold at the café' })).status).toBe(400);
    const otherUnsaid = await close(reverse, { reason: 'OTHER' });
    expect([otherUnsaid.status, otherUnsaid.body.message]).toEqual([
      400,
      'Say what happened in the note',
    ]);
    expect((await close(reverse, { note: ' At the café ', reason: 'SOLD' })).status).toBe(200);
    const closed = await readBack(reverse);
    expect(closed).toMatchObject({
      status: 'CLOSED',
      totals: { accepted_qty: 3, pending_qty: 0, rejected_qty: 2, transaction_qty: 5 },
    });
    expect(firstOf(closed.rows as Body[]).rejection_reason).toBe('Sold or used: At the café');
    expect((await close(reverse, { reason: 'WASTED' })).status).toBe(409);
    expect((await runNow(reverse)).status).toBe(409);
  });

  it('before a return the ERP reads how much of the batch the Main Store holds, and where the rest is', async () => {
    const batch = `K-${run}`;
    await send(grn(newGrnNumber(), [{ batch, qty: 10 }]));
    await issueToRestaurant(batch, 4);
    const check = (query: string) => erp('GET', `/erp/stock?${query}`);
    const at = `location=${fx.hospitalCode}&part_item_code=${fx.itemCode.toLowerCase()}`;

    const held = await check(`${at}&batch=${batch}`);
    expect([held.status, held.body]).toEqual([
      200,
      {
        data: {
          batch,
          held_elsewhere: [{ name: 'A restaurant no longer in AAHAR', qty: 4 }],
          item_name: fx.itemName,
          location: fx.hospitalCode,
          location_name: fx.hospitalName,
          main_store_qty: 6,
          part_item_code: fx.itemCode,
        },
        message: 'Success',
        success: true,
      },
    ]);
    // A batch the location never had: none anywhere.
    expect((await check(`${at}&batch=NONE-${run}`)).data).toMatchObject({
      held_elsewhere: [],
      main_store_qty: 0,
    });

    // Codes AAHAR does not know are refused with why; it is a read, so not an ERP GRN error.
    const unknown = await check(
      `location=NOWHERE-${run}&part_item_code=${fx.itemCode}&batch=${batch}`,
    );
    expect([unknown.status, unknown.body]).toEqual([
      422,
      failed([`Location NOWHERE-${run} is not in AAHAR`]),
    ]);
    expect((await check(at)).status).toBe(400);
    expect((await h.api('GET', `/erp/stock?${at}&batch=${batch}`)).status).toBe(401);
  });

  it('one request may carry items coming in and a return; the stock comes in before it goes out', async () => {
    const grnNumber = newGrnNumber();
    const batch = `MX-${run}`;
    // The return is listed first, of a batch that only this GRN brings in.
    const rows = [
      ...grn(grnNumber, [{ batch, qty: 2 }], { flag: 1 }),
      ...grn(grnNumber, [{ batch, qty: 5 }]),
      ...grn(grnNumber, [{ batch: 'MX2', qty: 3 }], { part_item_code: fx.item2Code }),
    ];
    const sent = await send(rows);
    expect([sent.status, sent.body.success]).toEqual([200, true]);
    expect([await storeQty(batch), await storeQty('MX2', fx.item2Id)]).toEqual([3, 3]);
    expect((await readBack(grnNumber)).status).toBe('VERIFIED');

    // What a request brings in counts: 3 held + 5 coming = 8 go back now, and the 9th is owed.
    const over = await send(
      rows.map((row) => ({
        ...row,
        grn_No: `${grnNumber}-X`,
        ...(row.flag === 1 ? { transaction_qty: 9 } : {}),
      })),
    );
    expect([over.status, over.body.shortfalls]).toEqual([
      200,
      [{ batch, owed: 1, part_item_code: fx.itemCode, requested: 9, returned: 8 }],
    ]);
  });
});
