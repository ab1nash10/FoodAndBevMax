// Restaurants send stock back to the store, and a transfer names the operator who must
// acknowledge it. The store counts a return in; stock reaching the store runs any ERP reverse
// waiting for that batch. Runs only with DATABASE_URL_TEST.
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

describe.skipIf(!databaseUrl)(
  'restaurant returns and named operators (integration)',
  { timeout: 30_000 },
  () => {
    let h: Harness;
    const fx = { hospitalId: '', itemId: '', restaurantId: '', storeId: '' };
    const operators = {
      other: '',
      otherToken: '',
      receiver: '',
      receiverName: '',
      receiverToken: '',
    };
    const today = new Date().toISOString().slice(0, 10);
    const idOf = (body: Body) => body.id as string;

    const qtyAt = async (locationId: string, batchNumber: string) => {
      const rows = await h.rawQuery<{ qty: string }>(
        `SELECT COALESCE(SUM(available_qty), 0)::text AS qty FROM stock_balances
        WHERE item_id = $1::uuid AND location_id = $2::uuid AND batch_number = $3 AND deleted_at IS NULL`,
        fx.itemId,
        locationId,
        batchNumber,
      );
      return Number(rows[0]!.qty);
    };

    /** A fresh batch of `qty` in the Main Store, through a posted Deliveries GRN. */
    async function stockBatch(label: string, qty: number) {
      const batchNumber = `${label}-${run}`;
      const expiryDate = day(60);
      const grn = await h.ok('POST', '/grns', {
        hospitalId: fx.hospitalId,
        items: [
          {
            acceptedQty: qty,
            batches: [
              { acceptedQty: qty, batchNumber, expiryDate, receivedQty: qty, rejectedQty: 0 },
            ],
            itemId: fx.itemId,
            receivedQty: qty,
            rejectedQty: 0,
          },
        ],
        receivedBy: 'Returns test',
        receivedDate: today,
        storeId: fx.storeId,
        vendorName: `Vendor ${run}`,
      });
      await h.ok('PATCH', `/grns/${idOf(grn)}/post-to-stock`);
      return { batchNumber, expiryDate };
    }

    type Batch = Awaited<ReturnType<typeof stockBatch>>;

    const transfer = (
      from: { id: string; type: string },
      to: { id: string; type: string },
      batch: Partial<Batch>,
      sentQty: number,
      extra: Body = {},
    ) =>
      h.api('POST', '/transfers', {
        businessDate: today,
        destinationId: to.id,
        destinationType: to.type,
        hospitalId: fx.hospitalId,
        items: [{ ...batch, itemId: fx.itemId, sentQty }],
        sourceId: from.id,
        sourceType: from.type,
        transferDate: new Date().toISOString(),
        ...extra,
      });

    const store = () => ({ id: fx.storeId, type: 'STORE' });
    const restaurant = () => ({ id: fx.restaurantId, type: 'RESTAURANT' });

    const acknowledge = (sent: Body, acceptedQty: number, rejectedQty: number, as?: string) =>
      h.api(
        'POST',
        '/transfer-acknowledgements',
        {
          items: [
            {
              acceptedQty,
              rejectedQty,
              ...(rejectedQty ? { rejectionReason: 'Missing at count' } : {}),
              transferLineId: idOf(firstOf(sent.lines as Body[])),
            },
          ],
          transferId: idOf(sent),
        },
        as,
      );

    /** A role that may receive transfers, and a user at the location who has it. */
    async function operator(name: string) {
      const id = randomUUID();
      await h.rawQuery(
        `INSERT INTO users (id, employee_code, name, mobile, status, hospital_id, updated_at)
       VALUES ($1::uuid, $2, $3, $4, 'ACTIVE', $5::uuid, now())`,
        id,
        `OP-${run}-${name}`,
        `${name} ${run}`,
        `7${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`,
        fx.hospitalId,
      );
      await h.rawQuery(
        `INSERT INTO user_roles (id, user_id, role_id, updated_at)
       SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = $2`,
        id,
        `Int Receiver ${run}`,
      );
      return { id, token: h.signFor({ id, sessionVersion: 0 }) };
    }

    beforeAll(async () => {
      h = await startHarness();
      // The oldest restaurant at a location with a Main Store, where returns and ERP GRNs land.
      const site = firstOf(
        await h.rawQuery<{ hospital_id: string; restaurant_id: string; store_id: string }>(
          `SELECT r.hospital_id, r.id AS restaurant_id, s.id AS store_id
             FROM restaurants r
             JOIN hospitals h ON h.id = r.hospital_id AND h.is_active AND h.deleted_at IS NULL
             JOIN stores s ON s.hospital_id = r.hospital_id AND s.store_name = 'Main Store'
                          AND s.is_active AND s.deleted_at IS NULL
            WHERE r.is_active AND r.deleted_at IS NULL
            ORDER BY r.created_at LIMIT 1`,
        ),
      );
      Object.assign(fx, {
        hospitalId: site.hospital_id,
        restaurantId: site.restaurant_id,
        storeId: site.store_id,
      });
      const categoryId = idOf(
        await h.ok('POST', '/item-categories', { categoryName: `Returns ${run}` }),
      );
      fx.itemId = idOf(
        await h.ok('POST', '/items', { itemName: `Returns cola ${run}`, type: 'VEG' }),
      );
      await h.ok('POST', '/store-items', { categoryId, itemId: fx.itemId, storeId: fx.storeId });

      await h.rawQuery(
        `INSERT INTO roles (id, name, location_scope, status, updated_at)
       VALUES (gen_random_uuid(), $1, 'SINGLE', 'ACTIVE', now())`,
        `Int Receiver ${run}`,
      );
      await h.rawQuery(
        `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
       SELECT gen_random_uuid(), r.id, p.id, now() FROM roles r, permissions p
        WHERE r.name = $1 AND p.code IN ('TRANSFER_ACKNOWLEDGE', 'TRANSFER_VIEW')`,
        `Int Receiver ${run}`,
      );
      const receiver = await operator('Ravi');
      const other = await operator('Meena');
      Object.assign(operators, {
        other: other.id,
        otherToken: other.token,
        receiver: receiver.id,
        receiverName: `Ravi ${run}`,
        receiverToken: receiver.token,
      });
    }, 60_000);

    afterAll(() => h?.app.close());

    it('lists the operators of a location who can receive stock', async () => {
      const receivers = (await h.ok(
        'GET',
        `/transfers/receivers?hospitalId=${fx.hospitalId}`,
      )) as unknown as Body[];
      const ids = receivers.map((user) => user.id);
      expect(ids).toEqual(expect.arrayContaining([operators.receiver, operators.other]));
      expect(receivers.find((user) => user.id === operators.receiver)).toMatchObject({
        name: operators.receiverName,
      });
    });

    it('a transfer named for an operator is acknowledged by that operator only', async () => {
      const batch = await stockBatch('NO', 4);
      const draft = await transfer(store(), restaurant(), batch, 4, {
        receiverId: operators.receiver,
      });
      expect(draft.status).toBe(201);
      expect(draft.data).toMatchObject({
        receiverId: operators.receiver,
        receiverName: operators.receiverName,
      });
      const sent = await h.ok('PATCH', `/transfers/${idOf(draft.data)}/dispatch`);

      const someoneElse = await acknowledge(sent, 4, 0, operators.otherToken);
      expect([someoneElse.status, someoneElse.body.message]).toEqual([
        403,
        `Only ${operators.receiverName}, the operator it was sent to, can acknowledge it`,
      ]);
      expect((await acknowledge(sent, 4, 0, operators.receiverToken)).status).toBe(201);
      expect(await qtyAt(fx.restaurantId, batch.batchNumber)).toBe(4);

      // A Super Admin may acknowledge one named for someone else.
      const more = await stockBatch('NS', 2);
      const named = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(store(), restaurant(), more, 2, { receiverId: operators.receiver })).data)}/dispatch`,
      );
      expect((await acknowledge(named, 2, 0)).status).toBe(201);

      // Only an operator of the location who can receive stock can be named.
      const stranger = await transfer(store(), restaurant(), batch, 1, {
        receiverId: randomUUID(),
      });
      expect([stranger.status, stranger.body.message]).toEqual([
        400,
        'Choose an operator of this location who can receive stock',
      ]);
    });

    it('a restaurant sends stock back to the store, and the store counts it in', async () => {
      const batch = await stockBatch('RT', 10);
      const out = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(store(), restaurant(), batch, 6)).data)}/dispatch`,
      );
      await acknowledge(out, 6, 0);
      expect([
        await qtyAt(fx.storeId, batch.batchNumber),
        await qtyAt(fx.restaurantId, batch.batchNumber),
      ]).toEqual([4, 6]);

      // Back to the store, batch by batch, as the restaurant holds it.
      const draft = await transfer(restaurant(), store(), batch, 5);
      expect(draft.status).toBe(201);
      const sent = await h.ok('PATCH', `/transfers/${idOf(draft.data)}/dispatch`);
      // On its way: gone from the restaurant, not yet in the store.
      expect([
        await qtyAt(fx.storeId, batch.batchNumber),
        await qtyAt(fx.restaurantId, batch.batchNumber),
      ]).toEqual([4, 1]);

      // The store counts 4 of the 5: they go into the store, the missing 1 back to the restaurant.
      const counted = await acknowledge(sent, 4, 1);
      expect(counted.status).toBe(201);
      expect([
        await qtyAt(fx.storeId, batch.batchNumber),
        await qtyAt(fx.restaurantId, batch.batchNumber),
      ]).toEqual([8, 2]);

      const ledger = await h.rawQuery<{ transaction_type: string; qty: string }>(
        `SELECT transaction_type, (qty_in + qty_out)::text AS qty FROM stock_ledgers
        WHERE item_id = $1::uuid AND batch_number = $2
          AND transaction_type IN ('RESTAURANT_RETURN_OUT', 'STORE_RETURN_IN')
        ORDER BY transaction_type`,
        fx.itemId,
        batch.batchNumber,
      );
      expect(ledger.map((r) => [r.transaction_type, Number(r.qty)])).toEqual([
        ['RESTAURANT_RETURN_OUT', 5],
        ['STORE_RETURN_IN', 4],
      ]);
    });

    it('a store keeper who may post GRNs counts a return in; restaurant staff find the store', async () => {
      /** A user at the location with only these permissions. */
      const withOnly = async (label: string, codes: string[]) => {
        const role = `Int ${label} ${run}`;
        await h.rawQuery(
          `INSERT INTO roles (id, name, location_scope, status, updated_at)
         VALUES (gen_random_uuid(), $1, 'SINGLE', 'ACTIVE', now())`,
          role,
        );
        await h.rawQuery(
          `INSERT INTO role_permissions (id, role_id, permission_id, updated_at)
         SELECT gen_random_uuid(), r.id, p.id, now() FROM roles r, permissions p
          WHERE r.name = $1 AND p.code = ANY($2)`,
          role,
          codes,
        );
        const id = randomUUID();
        await h.rawQuery(
          `INSERT INTO users (id, employee_code, name, mobile, status, hospital_id, updated_at)
         VALUES ($1::uuid, $2, $3, $4, 'ACTIVE', $5::uuid, now())`,
          id,
          `${label}-${run}`,
          `${label} ${run}`,
          `8${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`,
          fx.hospitalId,
        );
        await h.rawQuery(
          `INSERT INTO user_roles (id, user_id, role_id, updated_at)
         SELECT gen_random_uuid(), $1::uuid, id, now() FROM roles WHERE name = $2`,
          id,
          role,
        );
        return h.signFor({ id, sessionVersion: 0 });
      };
      const keeper = await withOnly('Keeper', ['GRN_POST']);
      const cafe = await withOnly('Cafe', ['RESTAURANT_TRANSFER_SEND']);

      // Restaurant staff can see which store to send stock back to.
      expect(
        (await h.api('GET', `/stores?hospitalId=${fx.hospitalId}`, undefined, cafe)).status,
      ).toBe(200);

      const batch = await stockBatch('KP', 2);
      await acknowledge(
        await h.ok(
          'PATCH',
          `/transfers/${idOf((await transfer(store(), restaurant(), batch, 2)).data)}/dispatch`,
        ),
        2,
        0,
      );
      const sent = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(restaurant(), store(), batch, 2)).data)}/dispatch`,
      );
      // The keeper sees the return and counts it in with GRN_POST alone.
      expect((await h.api('GET', `/transfers/${idOf(sent)}`, undefined, keeper)).status).toBe(200);
      expect((await acknowledge(sent, 2, 0, keeper)).status).toBe(201);
      expect(await qtyAt(fx.storeId, batch.batchNumber)).toBe(2);

      // GRN_POST alone does not receive a delivery at a restaurant.
      const delivery = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(store(), restaurant(), batch, 1)).data)}/dispatch`,
      );
      expect((await acknowledge(delivery, 1, 0, keeper)).status).toBe(403);
    });

    it('a return names its batch, and only a restaurant sends stock to a store', async () => {
      const batch = await stockBatch('RV', 3);
      const noBatch = await transfer(restaurant(), store(), {}, 1);
      expect([noBatch.status, noBatch.body.message]).toEqual([
        400,
        'Line 1: batch number is required',
      ]);
      const storeToStore = await transfer(store(), store(), batch, 1);
      expect(storeToStore.status).toBe(400);
      const tooMuch = await transfer(restaurant(), store(), batch, 1);
      expect(tooMuch.status).toBe(400);
      expect(String(tooMuch.body.message)).toContain('has available stock 0');
    });

    it('stock reaching the store runs an ERP reverse waiting for that batch', async () => {
      const batch = await stockBatch('WR', 3);
      const out = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(store(), restaurant(), batch, 3)).data)}/dispatch`,
      );
      await acknowledge(out, 3, 0);
      // An ERP reverse of the 3, waiting: the store has none of the batch.
      const grnNumber = `WR-${run}`;
      await h.rawQuery(
        `INSERT INTO grn_entries (grn_entry_id, transaction_number, grn_number, flag, hospital_id,
         store_id, item_id, hospital_code, store_code, item_code, batch_number, expiry_date,
         sent_qty, accepted_qty, rejected_qty, transaction_date, status, updated_at)
       SELECT gen_random_uuid(), gen_random_uuid()::text, $1, 1, $2::uuid, $3::uuid, $4::uuid,
              h.hospital_code, s.store_code, i.item_code, $5, $6::date, 3, 0, 0, now(), 'PENDING'::"GrnEntryStatus", now()
         FROM hospitals h, stores s, items i
        WHERE h.id = $2::uuid AND s.id = $3::uuid AND i.id = $4::uuid`,
        grnNumber,
        fx.hospitalId,
        fx.storeId,
        fx.itemId,
        batch.batchNumber,
        batch.expiryDate,
      );

      // The restaurant sends 2 back; once counted in, the reverse takes them at once.
      const sent = await h.ok(
        'PATCH',
        `/transfers/${idOf((await transfer(restaurant(), store(), batch, 2)).data)}/dispatch`,
      );
      await acknowledge(sent, 2, 0);
      expect(await qtyAt(fx.storeId, batch.batchNumber)).toBe(0);
      const [reverse] = await h.rawQuery<{ accepted: string; status: string }>(
        `SELECT accepted_qty::text AS accepted, status::text FROM grn_entries WHERE grn_number = $1`,
        grnNumber,
      );
      expect([Number(reverse!.accepted), reverse!.status]).toEqual([2, 'PENDING']);

      // Goods posted through Deliveries count too: the last 1 finishes it.
      const more = await h.ok('POST', '/grns', {
        hospitalId: fx.hospitalId,
        items: [
          {
            acceptedQty: 1,
            batches: [
              {
                acceptedQty: 1,
                batchNumber: batch.batchNumber,
                expiryDate: batch.expiryDate,
                receivedQty: 1,
                rejectedQty: 0,
              },
            ],
            itemId: fx.itemId,
            receivedQty: 1,
            rejectedQty: 0,
          },
        ],
        receivedBy: 'Returns test',
        receivedDate: today,
        storeId: fx.storeId,
        vendorName: `Vendor ${run}`,
      });
      await h.ok('PATCH', `/grns/${idOf(more)}/post-to-stock`);
      const [finished] = await h.rawQuery<{ accepted: string; status: string }>(
        `SELECT accepted_qty::text AS accepted, status::text FROM grn_entries WHERE grn_number = $1`,
        grnNumber,
      );
      expect([Number(finished!.accepted), finished!.status]).toEqual([3, 'VERIFIED']);
      expect(await qtyAt(fx.storeId, batch.batchNumber)).toBe(0);
    });
  },
);
