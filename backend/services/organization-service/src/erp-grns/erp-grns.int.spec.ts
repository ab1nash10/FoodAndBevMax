// The ERP GRN API end to end: the ERP sends a signed GRN, the store verifies it in the portal,
// stock moves by exactly the accepted quantity, and the ERP reads back what was accepted and
// rejected. Runs only with DATABASE_URL_TEST.
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
Object.assign(process.env, { ERP_API_KEY: apiKey, ERP_API_SECRET: secret });

interface ErpCall {
  body?: string;
  key?: string;
  nonce?: string;
  secret?: string;
  /** Sent in place of the signed body, to prove a changed body is caught. */
  sentBody?: string;
  timestamp?: string;
}

describe.skipIf(!databaseUrl)('ERP GRN API (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    hospitalCode: '',
    hospitalId: '',
    itemCode: '',
    itemId: '',
    storeCode: '',
    storeId: '',
  };
  let grnSeq = 0;
  const newGrnNumber = () => `ERP-${run}-${++grnSeq}`;

  /** Calls /erp/* signed as the ERP would; any part can be overridden to test a refusal. */
  async function erp(method: string, path: string, call: ErpCall = {}) {
    const timestamp = call.timestamp ?? formatErpTimestamp(new Date());
    const nonce = call.nonce ?? randomUUID();
    const body = call.body ?? '';
    const url = new URL(`${h.baseUrl}${path}`);
    const signature = sign(
      call.secret ?? secret,
      stringToSign(method, url.pathname + url.search, timestamp, nonce, Buffer.from(body)),
    );
    const response = await fetch(url, {
      body: method === 'GET' ? undefined : (call.sentBody ?? body),
      headers: {
        'content-type': 'application/json',
        'x-api-key': call.key ?? apiKey,
        'x-nonce': nonce,
        'x-signature': signature,
        'x-timestamp': timestamp,
      },
      method,
    });
    const json = (await response.json()) as Body;
    return { body: json, data: (json.data ?? {}) as Body, status: response.status };
  }

  const send = (grn: Body, call: ErpCall = {}) =>
    erp('POST', '/erp/grns', { ...call, body: JSON.stringify(grn) });

  function grn(
    grnNumber: string,
    batches: { qty: number; batch: string; expiry?: string }[],
    extra: Body = {},
  ): Body {
    return {
      flag: 0,
      grnNumber,
      hospitalCode: fx.hospitalCode,
      issuedBy: 'M030634',
      items: [
        {
          batches: batches.map((b, index) => ({
            batchNumber: b.batch,
            expiryDate: b.expiry ?? day(90),
            qty: b.qty,
            totalValue: Math.round(b.qty * 980) / 100,
            transactionNumber: `${grnNumber}-${index + 1}`,
          })),
          discount: 0,
          hsnCode: '998313',
          itemCode: fx.itemCode,
          itemName: 'Kinley Water - 1000 Ml',
          mrp: 15,
          taxRate: 'IGST@18%',
          unitRate: 9.8,
          uom: 'No.',
        },
      ],
      purchaseOrder: '392851',
      requisitionNumber: '918590',
      storeCode: fx.storeCode,
      transactionDate: '2026-10-26T15:50:00+05:30',
      vendorCode: 'CAGR0008',
      ...extra,
    };
  }

  const storeQty = async (batchNumber: string) => {
    const rows = await h.rawQuery<{ qty: string }>(
      `SELECT available_qty::text AS qty FROM stock_balances
        WHERE item_id = $1::uuid AND location_id = $2::uuid AND batch_number = $3 AND deleted_at IS NULL`,
      fx.itemId,
      fx.storeId,
      batchNumber,
    );
    return rows.length ? Number(rows[0]!.qty) : 0;
  };

  const verify = (grnNumber: string, batches: Body[]) =>
    h.api('PATCH', `/grn-entries/${encodeURIComponent(grnNumber)}/verify`, { batches });

  beforeAll(async () => {
    h = await startHarness();
    const store = firstOf(
      (await h.ok('GET', '/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'))
        .items as Body[],
    );
    fx.storeId = store.id as string;
    fx.storeCode = store.storeCode as string;
    fx.hospitalId = store.hospitalId as string;
    fx.hospitalCode = (await h.ok('GET', `/hospitals/${fx.hospitalId}`)).hospitalCode as string;
    const categoryId = (await h.ok('POST', '/item-categories', { categoryName: `ERP GRN ${run}` }))
      .id;
    const item = await h.ok('POST', '/items', { itemName: `ERP GRN water ${run}`, type: 'VEG' });
    fx.itemId = item.id as string;
    fx.itemCode = item.itemCode as string;
    await h.ok('POST', '/store-items', { categoryId, itemId: fx.itemId, storeId: fx.storeId });
  }, 60_000);

  afterAll(() => h?.app.close());

  describe('only a correctly signed request gets in', () => {
    const body = () => JSON.stringify(grn(newGrnNumber(), [{ batch: `S-${run}`, qty: 1 }]));
    const refused = async (call: ErpCall, message: string) => {
      const result = await erp('POST', '/erp/grns', { body: body(), ...call });
      expect([result.status, result.body.message]).toEqual([401, message]);
    };

    it('refuses a wrong key, a wrong secret or a body changed after signing', async () => {
      await refused({ key: 'someone-else' }, 'Unknown API key');
      await refused({ secret: 'not-the-secret' }, 'Signature does not match');
      await refused({ sentBody: body() }, 'Signature does not match');
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

    it('refuses the same request sent twice (a replay)', async () => {
      const nonce = randomUUID();
      const first = await erp('POST', '/erp/grns', { body: body(), nonce });
      expect(first.status).toBe(200);
      await refused({ nonce }, 'This request was already received');
    });

    it('refuses a call with a user token instead of a signature', async () => {
      expect((await h.api('GET', '/erp/grns/anything')).status).toBe(401);
    });
  });

  it('the ERP sends a GRN, the store verifies it, and the ERP reads accepted and rejected back', async () => {
    const grnNumber = newGrnNumber();
    const [b1, b2] = [`A-${run}`, `B-${run}`];

    const sent = await send(
      grn(grnNumber, [
        { batch: b1, qty: 60 },
        { batch: b2, qty: 40 },
      ]),
    );
    expect([sent.status, sent.data]).toEqual([
      200,
      { batches: 2, grnNumber, replaced: false, status: 'PENDING' },
    ]);
    // Nothing reaches stock until the store verifies it.
    expect(await storeQty(b1)).toBe(0);

    // A resend while pending replaces it, so the ERP can correct a mistake.
    const corrected = await send(
      grn(grnNumber, [
        { batch: b1, qty: 60 },
        { batch: b2, qty: 45 },
      ]),
    );
    expect(corrected.data).toEqual({ batches: 2, grnNumber, replaced: true, status: 'PENDING' });

    const pending = await h.ok('GET', `/grn-entries?status=PENDING&search=${grnNumber}`);
    expect((pending.items as Body[]).map((g) => [g.grnNumber, g.status])).toEqual([
      [grnNumber, 'PENDING'],
    ]);
    const before = await erp('GET', `/erp/grns/${grnNumber}`);
    expect(before.data).toMatchObject({
      status: 'PENDING',
      totals: { acceptedQty: null, rejectedQty: null, sentQty: 105 },
    });

    // Every batch must be answered for, and accepted + rejected must equal what was sent.
    const t1 = `${grnNumber}-1`;
    const t2 = `${grnNumber}-2`;
    expect(
      (await verify(grnNumber, [{ acceptedQty: 60, rejectedQty: 0, transactionNumber: t1 }])).body
        .message,
    ).toBe(`Batch ${t2} is missing: every batch of the GRN must be accepted or rejected`);
    expect(
      (
        await verify(grnNumber, [
          { acceptedQty: 60, rejectedQty: 0, transactionNumber: t1 },
          { acceptedQty: 30, rejectedQty: 10, rejectionReason: 'Damaged', transactionNumber: t2 },
        ])
      ).body.message,
    ).toBe(`Batch ${t2}: accepted 30 + rejected 10 must equal the 45 sent`);
    expect(
      (
        await verify(grnNumber, [
          { acceptedQty: 60, rejectedQty: 0, transactionNumber: t1 },
          { acceptedQty: 35, rejectedQty: 10, transactionNumber: t2 },
        ])
      ).body.message,
    ).toBe(`Batch ${t2}: give a reason for the rejected quantity`);

    // Two verifies at once (a double click): stock moves once.
    const answer = [
      { acceptedQty: 60, rejectedQty: 0, transactionNumber: t1 },
      {
        acceptedQty: 35,
        rejectedQty: 10,
        rejectionReason: 'Damaged packing',
        transactionNumber: t2,
      },
    ];
    const both = await Promise.all([verify(grnNumber, answer), verify(grnNumber, answer)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await storeQty(b1)).toBe(60);
    expect(await storeQty(b2)).toBe(35);

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
      ['GRN_IN', 'GRN_ENTRY', 35],
    ]);

    const result = await erp('GET', `/erp/grns/${grnNumber}`);
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      flag: 0,
      grnNumber,
      hospitalCode: fx.hospitalCode,
      status: 'VERIFIED',
      storeCode: fx.storeCode,
      totals: { acceptedQty: 95, rejectedQty: 10, sentQty: 105 },
      vendorCode: 'CAGR0008',
    });
    expect(result.data.verifiedAt).toEqual(expect.any(String));
    expect(typeof (result.data.verifiedBy as Body).name).toBe('string');
    const batches = (firstOf(result.data.items as Body[]).batches as Body[]).map((b) => [
      b.transactionNumber,
      b.batchNumber,
      b.sentQty,
      b.acceptedQty,
      b.rejectedQty,
      b.rejectionReason,
    ]);
    expect(batches).toEqual([
      [t1, b1, 60, 60, 0, null],
      [t2, b2, 45, 35, 10, 'Damaged packing'],
    ]);

    // The ERP picks up everything verified since a time.
    const since = new Date(Date.now() - 60_000).toISOString();
    const picked = await erp(
      'GET',
      `/erp/grns?status=VERIFIED&verifiedSince=${encodeURIComponent(since)}&limit=100`,
    );
    expect((picked.data.items as Body[]).map((g) => g.grnNumber)).toContain(grnNumber);

    // Once verified, the GRN can no longer be replaced or verified again.
    const late = await send(grn(grnNumber, [{ batch: b1, qty: 1 }]));
    expect([late.status, late.body.message]).toEqual([
      409,
      `GRN ${grnNumber} is already verified. Send a return (flag 1) to reverse it.`,
    ]);
  });

  it('refuses unknown codes, listing each, and saves nothing', async () => {
    const grnNumber = newGrnNumber();
    const body = grn(grnNumber, [{ batch: `U-${run}`, qty: 5 }], { storeCode: 'NO-SUCH-STORE' });
    (body.items as Body[]).push({
      ...(body.items as Body[])[0],
      batches: [
        { batchNumber: 'X', expiryDate: day(30), qty: 1, transactionNumber: `${grnNumber}-9` },
      ],
      itemCode: 'NO-SUCH-ITEM',
    });
    const result = await send(body);
    expect(result.status).toBe(422);
    expect(result.body.errors).toEqual([
      `Store code NO-SUCH-STORE is not in hospital ${fx.hospitalCode}`,
      'Item code NO-SUCH-ITEM is not in AAHAR',
    ]);
    expect((await erp('GET', `/erp/grns/${grnNumber}`)).status).toBe(404);
  });

  it('refuses a transaction number sent twice, or already used by another GRN', async () => {
    const grnNumber = newGrnNumber();
    const twice = grn(grnNumber, [
      { batch: `D1-${run}`, qty: 1 },
      { batch: `D2-${run}`, qty: 1 },
    ]);
    const batches = firstOf(twice.items as Body[]).batches as Body[];
    batches[1]!.transactionNumber = batches[0]!.transactionNumber;
    expect((await send(twice)).body.errors).toEqual([
      `Transaction number ${grnNumber}-1 appears more than once`,
    ]);

    const first = newGrnNumber();
    await send(grn(first, [{ batch: `D3-${run}`, qty: 1 }]));
    const other = grn(newGrnNumber(), [{ batch: `D4-${run}`, qty: 1 }]);
    (firstOf(other.items as Body[]).batches as Body[])[0]!.transactionNumber = `${first}-1`;
    const clash = await send(other);
    expect([clash.status, clash.body.errors]).toEqual([
      422,
      [`Transaction number ${first}-1 already belongs to GRN ${first}`],
    ]);
  });

  it('will not accept an expired batch; it can only be rejected', async () => {
    const grnNumber = newGrnNumber();
    await send(grn(grnNumber, [{ batch: `E-${run}`, expiry: day(-1), qty: 3 }]));
    const t = `${grnNumber}-1`;
    const accepted = await verify(grnNumber, [
      { acceptedQty: 3, rejectedQty: 0, transactionNumber: t },
    ]);
    expect([accepted.status, accepted.body.message]).toEqual([
      400,
      `Batch ${t} has expired and cannot be accepted`,
    ]);
    const rejected = await verify(grnNumber, [
      { acceptedQty: 0, rejectedQty: 3, rejectionReason: 'Expired', transactionNumber: t },
    ]);
    expect(rejected.status).toBe(200);
    expect(await storeQty(`E-${run}`)).toBe(0);
  });

  it('a return (flag 1) takes stock out, and is refused when the store has too little', async () => {
    const batch = `R-${run}`;
    const receipt = newGrnNumber();
    await send(grn(receipt, [{ batch, qty: 10 }]));
    await verify(receipt, [{ acceptedQty: 10, rejectedQty: 0, transactionNumber: `${receipt}-1` }]);

    const tooMuch = newGrnNumber();
    await send(grn(tooMuch, [{ batch, qty: 25 }], { flag: 1 }));
    const refused = await verify(tooMuch, [
      { acceptedQty: 25, rejectedQty: 0, transactionNumber: `${tooMuch}-1` },
    ]);
    expect([refused.status, refused.body.message]).toEqual([
      400,
      `Batch ${tooMuch}-1: the store has only 10 of batch ${batch} to return`,
    ]);

    const giveBack = newGrnNumber();
    await send(grn(giveBack, [{ batch, qty: 4 }], { flag: 1 }));
    const returned = await verify(giveBack, [
      { acceptedQty: 4, rejectedQty: 0, transactionNumber: `${giveBack}-1` },
    ]);
    expect(returned.status).toBe(200);
    expect(await storeQty(batch)).toBe(6);
    const [out] = await h.rawQuery<{ transaction_type: string; qty_out: string }>(
      `SELECT transaction_type, qty_out::text FROM stock_ledgers
        WHERE item_id = $1::uuid AND batch_number = $2 AND qty_out > 0`,
      fx.itemId,
      batch,
    );
    expect([out?.transaction_type, Number(out?.qty_out)]).toEqual(['GRN_RETURN_OUT', 4]);
  });
});
