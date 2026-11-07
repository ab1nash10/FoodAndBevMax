// Characterisation over HTTP of the guest-order paths: orders pushed with an order key, the
// kitchen screen's status lifecycle, the TV pickup board (its own secret link), the self-service
// kiosk (order at the kiosk, pay at a counter) and online UPI payments at the till.
//
// Online payments have no webhook or signed callback today: the till polls the provider
// (GET /pos/online-payments/:id). The provider's HTTP calls are answered here by a fake, so no
// real gateway is ever called: every request to a host other than the test server is answered
// by it.
//
// Runs only with DATABASE_URL_TEST. Every record is named with `run`; the board link is only
// ever read or made for this suite's own restaurant, never regenerated.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  databaseUrl,
  firstOf,
  run,
  shape,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

process.env.TZ = 'UTC';

const Run = run.charAt(0).toUpperCase() + run.slice(1); // names are stored title-cased

const RAZORPAY = 'https://api.razorpay.com/v1/payment_links';
const RAZORPAY_KEY_ID = 'rzp_test_int';
const RAZORPAY_KEY_SECRET = 'int-secret';

interface GatewayCall {
  authorization: string | null;
  body: Body | null;
  method: string;
  url: string;
}

describe.skipIf(!databaseUrl)(
  'restaurant orders, board, kiosk and online payments (integration)',
  { timeout: 30_000 },
  () => {
    let h: Harness;
    const fx = {
      boardToken: '',
      counterCode: '',
      counterId: '',
      elsewhereId: '',
      hospitalId: '',
      inclusiveMenuId: '',
      menuId: '',
      orderKey: '',
      restaurantCode: '',
      restaurantId: '',
    };
    const as = { cashier: '', elsewhere: '', stock: '' };

    // The fake gateway: every call off the test server lands here and is answered with `gatewayReply`.
    const gatewayCalls: GatewayCall[] = [];
    let gatewayReply: (call: GatewayCall) => { body: unknown; status: number } = () => ({
      body: {},
      status: 500,
    });

    const idOf = (data: Body) => data.id as string;
    const listOrders = async (restaurantId = fx.restaurantId, token?: string) =>
      (await h.ok(
        'GET',
        `/restaurant-orders?restaurantId=${restaurantId}`,
        undefined,
        token,
      )) as unknown as Body[];

    /** POST /orders with an order key in x-order-key (none when key is ''). */
    async function push(body: Body, key = fx.orderKey) {
      const response = await fetch(`${h.baseUrl}/orders`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...(key ? { 'x-order-key': key } : {}) },
        method: 'POST',
      });
      const json = (await response.json()) as Body;
      return { body: json, data: (json.data ?? {}) as Body, status: response.status };
    }

    const board = (query = `?token=${fx.boardToken}`, restaurantId = fx.restaurantId) =>
      h.api('GET', `/order-board/${restaurantId}${query}`, undefined, '');

    /** A user holding one seeded role at one location, and their token. */
    async function userWith(role: string, hospitalId: string, tag: string) {
      const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
        `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
        `RO${tag}${run}`.toUpperCase(),
        `Orders ${tag} ${run}`,
        `6${String(Date.now()).slice(-7)}${tag.length}${Math.floor(Math.random() * 10)}`,
        hospitalId,
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
        hospitalId,
      );
      return h.signFor(user!);
    }

    beforeAll(async () => {
      // Razorpay "set up" with fake keys (the fake gateway answers). PayU is turned off with blanks
      // that are not empty: dotenv-expand replaces an empty value with the .env file's real key.
      Object.assign(process.env, {
        PAYU_CLIENT_ID: ' ',
        PAYU_CLIENT_SECRET: ' ',
        PAYU_MERCHANT_ID: ' ',
        RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET,
      });
      const realFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
        const headers = new Headers(init?.headers);
        const call: GatewayCall = {
          authorization: headers.get('authorization'),
          body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Body) : null,
          method: init?.method ?? 'GET',
          url,
        };
        gatewayCalls.push(call);
        const reply = gatewayReply(call);
        return new Response(JSON.stringify(reply.body), {
          headers: { 'content-type': 'application/json' },
          status: reply.status,
        });
      });

      h = await startHarness();

      const kitchen = firstOf(
        (await h.ok('GET', '/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc'))
          .items as Body[],
      );
      fx.hospitalId = kitchen.hospitalId as string;
      const storeId = idOf(
        firstOf(
          (await h.ok('GET', `/stores?limit=1&isActive=true&hospitalId=${fx.hospitalId}`))
            .items as Body[],
        ),
      );
      const restaurant = await h.ok('POST', '/restaurants', {
        hospitalId: fx.hospitalId,
        open24x7: true,
        restaurantName: `Int Orders ${run}`,
      });
      fx.restaurantId = idOf(restaurant);
      fx.restaurantCode = restaurant.restaurantCode as string;
      // This run's browser is the till of a POS device for its restaurant, set up by name.
      const till = await h.ok('POST', '/pos-devices', {
        code: `OT${run}`,
        hospitalId: fx.hospitalId,
        hostName: `ORD-TILL-${run}`,
        name: `Orders Till ${run}`,
        restaurantIds: [fx.restaurantId],
      });
      h.tillKey = (
        (await h.ok('POST', '/pos/till', {
          computerName: `ORD-TILL-${run}`,
          posDeviceId: idOf(till),
        })) as { tillKey: string }
      ).tillKey;
      const categoryId = idOf(
        await h.ok('POST', '/item-categories', { categoryName: `Int Orders ${run}` }),
      );
      const menuItem = async (name: string, menu: Body) => {
        const itemId = idOf(
          await h.ok('POST', '/items', { itemName: `${name} ${run}`, type: 'VEG' }),
        );
        await h.ok('POST', '/store-items', { categoryId, itemId, storeId });
        return idOf(
          await h.ok('POST', '/restaurant-menus', {
            categoryId,
            itemId,
            restaurantId: fx.restaurantId,
            serveAt: 'COUNTER',
            storeId,
            ...menu,
          }),
        );
      };
      fx.menuId = await menuItem('Int Dosa', {
        gstPercent: 18,
        isGstInclusive: false,
        price: 49.5,
      });
      fx.inclusiveMenuId = await menuItem('Int Tea', {
        gstPercent: 5,
        isGstInclusive: true,
        price: 30,
      });

      const [elsewhere] = await h.rawQuery<{ id: string }>(
        `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
        `RE${run}`.toUpperCase(),
        `Int Orders Elsewhere ${run}`,
      );
      fx.elsewhereId = elsewhere!.id;
      as.cashier = await userWith('POS Cashier', fx.hospitalId, 'C');
      as.elsewhere = await userWith('POS Cashier', fx.elsewhereId, 'E');
      as.stock = await userWith('Inventory Manager', fx.hospitalId, 'S');

      fx.orderKey = (await h.ok('POST', `/restaurants/${fx.restaurantId}/order-key`))
        .apiKey as string;
    }, 60_000);

    afterAll(async () => {
      vi.restoreAllMocks();
      await h?.app.close();
    });

    it('order key and board link: issued to restaurant managers only, board link stays put', async () => {
      expect(fx.orderKey).toMatch(/^rsk_/);
      const created = await h.api('POST', `/restaurants/${fx.restaurantId}/board-link`, {
        regenerate: false,
      });
      expect(created.status).toBe(201);
      expect(shape(created.body)).toEqual({
        data: { boardToken: 'string' },
        message: 'string',
        success: 'boolean',
      });
      fx.boardToken = created.data.boardToken as string;
      // Asked again (regenerate false, or left out), it is the same link.
      expect(
        (await h.ok('POST', `/restaurants/${fx.restaurantId}/board-link`, { regenerate: false }))
          .boardToken,
      ).toBe(fx.boardToken);
      expect(
        (await h.ok('POST', `/restaurants/${fx.restaurantId}/board-link`, {})).boardToken,
      ).toBe(fx.boardToken);
      const [audit] = await h.rawQuery<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_logs WHERE entity_id = $1::uuid AND action = 'RESTAURANT_BOARD_LINK_CREATE'`,
        fx.restaurantId,
      );
      expect(audit?.count).toBe(1);

      const missing = await h.api('POST', `/restaurants/${randomUUID()}/board-link`, {
        regenerate: false,
      });
      expect([missing.status, missing.body.message]).toEqual([404, 'Restaurant not found']);
      expect((await h.api('POST', '/restaurants/not-a-uuid/board-link', {})).status).toBe(400);
      expect(
        (await h.api('POST', `/restaurants/${fx.restaurantId}/board-link`, {}, '')).status,
      ).toBe(401);
      // A cashier has no RESTAURANT_UPDATE.
      expect(
        (await h.api('POST', `/restaurants/${fx.restaurantId}/board-link`, {}, as.cashier)).status,
      ).toBe(403);
      expect(
        (await h.api('POST', `/restaurants/${fx.restaurantId}/order-key`, undefined, as.cashier))
          .status,
      ).toBe(403);
      const noRestaurant = await h.api('POST', `/restaurants/${randomUUID()}/order-key`);
      expect([noRestaurant.status, noRestaurant.body.message]).toEqual([
        404,
        'Restaurant not found',
      ]);
      const noDevice = await h.api('POST', `/pos-devices/${randomUUID()}/api-key`);
      expect([noDevice.status, noDevice.body.message]).toEqual([404, 'POS device not found']);
    });

    it('push: the order key decides the restaurant; refusals for bad keys and bodies', async () => {
      fx.counterCode = `RC${run}`.toUpperCase();
      fx.counterId = idOf(
        await h.ok('POST', '/counters', {
          counterCode: fx.counterCode,
          counterName: `Int Pickup ${run}`,
          hospitalId: fx.hospitalId,
          restaurantId: fx.restaurantId,
        }),
      );
      const order = {
        counterCode: fx.counterCode.toLowerCase(),
        items: [
          { name: ' Masala Dosa ', quantity: 2 },
          { name: 'Tea', note: ' less sugar ', quantity: 1 },
        ],
        orderId: `INT-${run}-1`,
        orderNumber: ' K-1 ',
        prepMinutes: 15,
        serviceType: 'TAKE_AWAY',
        source: 'KIOSK',
      };
      const placed = await push(order);
      expect(placed.status).toBe(201);
      expect(placed.data).toMatchObject({
        items: [
          { name: 'Masala Dosa', quantity: 2 },
          { name: 'Tea', note: 'less sugar', quantity: 1 },
        ],
        orderNumber: 'K-1',
        readyAt: null,
        source: 'KIOSK',
        status: 'PLACED',
      });
      expect(shape(placed.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "bedNumber": null,
          "billNumber": null,
          "channel": null,
          "id": "string",
          "instructions": null,
          "items": [
            {
              "name": "string",
              "quantity": "number",
            },
          ],
          "orderNumber": "string",
          "placedAt": "string",
          "readyAt": null,
          "roomNumber": null,
          "source": "string",
          "status": "string",
        },
        "message": "string",
        "success": "boolean",
      }
    `);

      // A resend updates the same order, it never makes a second one.
      const again = await push({ ...order, orderNumber: 'K-1b' });
      expect(idOf(again.data)).toBe(idOf(placed.data));
      expect(again.data.orderNumber).toBe('K-1b');

      // Left out, the source is OTHER.
      expect((await push({ orderId: `INT-${run}-other`, orderNumber: 'K-2' })).data.source).toBe(
        'OTHER',
      );

      const noKey = await push(order, '');
      expect([noKey.status, noKey.body.message]).toEqual([
        401,
        'Send the order key in the x-order-key header.',
      ]);
      const badKey = await push(order, 'rsk_not-a-key');
      expect([badKey.status, badKey.body.message]).toEqual([
        401,
        'This order key is not valid, or its POS is disabled.',
      ]);
      const otherRestaurant = await push({ ...order, restaurantCode: 'NOPE1' });
      expect([otherRestaurant.status, otherRestaurant.body.message]).toEqual([
        403,
        `This key is for restaurant ${fx.restaurantCode} only.`,
      ]);
      const noCounter = await push({ ...order, counterCode: 'ZZ9' });
      expect([noCounter.status, noCounter.body.message]).toEqual([
        400,
        'This restaurant has no counter ZZ9.',
      ]);

      const invalid = await push({
        items: [{ name: '', quantity: 0 }],
        orderId: `INT-${run}-bad`,
        prepMinutes: 241,
        source: 'FAX',
        status: 'READY',
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toMatchInlineSnapshot(
        `"source must be one of the following values: POS, KIOSK, QR, OTHER, orderNumber must be shorter than or equal to 20 characters, orderNumber should not be empty, orderNumber must be a string, items.0.name should not be empty, items.0.quantity must not be less than 1, prepMinutes must not be greater than 240, status must be one of the following values: CANCELLED"`,
      );
      expect((await push({ ...order, extra: 1 })).status).toBe(400);
    });

    it('kitchen screen: open orders oldest first, status steps, illegal moves refused', async () => {
      const placed = await push({ orderId: `INT-${run}-life`, orderNumber: 'L-1', source: 'QR' });
      const id = idOf(placed.data);
      const setStatus = (status: unknown, token?: string, orderId = id) =>
        h.api('PATCH', `/restaurant-orders/${orderId}/status`, { status }, token);

      const listed = await listOrders();
      expect(listed.map((o) => o.orderNumber)).toEqual(
        expect.arrayContaining(['K-1b', 'K-2', 'L-1']),
      );
      expect(shape(listed.find((o) => o.id === id))).toMatchInlineSnapshot(`
        {
          "bedNumber": null,
          "billNumber": null,
          "channel": null,
          "id": "string",
          "instructions": null,
          "items": [],
          "orderNumber": "string",
          "placedAt": "string",
          "readyAt": null,
          "roomNumber": null,
          "source": "string",
          "status": "string",
          "stewardId": null,
          "stewardName": null,
        }
      `);
      const placedAts = listed.map((o) => Date.parse(String(o.placedAt)));
      expect(placedAts).toEqual([...placedAts].sort((a, b) => a - b));

      // PLACED cannot skip to READY or COLLECTED.
      const skip = await setStatus('READY');
      expect([skip.status, skip.body.message]).toEqual([
        409,
        'An order that is PLACED cannot be marked READY.',
      ]);
      expect((await setStatus('COLLECTED')).status).toBe(409);

      const preparing = await setStatus('PREPARING');
      expect(preparing.status).toBe(200);
      expect(preparing.data).toMatchObject({ readyAt: null, status: 'PREPARING' });
      expect(shape(preparing.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "bedNumber": null,
          "billNumber": null,
          "channel": null,
          "id": "string",
          "instructions": null,
          "items": [],
          "orderNumber": "string",
          "placedAt": "string",
          "readyAt": null,
          "roomNumber": null,
          "source": "string",
          "status": "string",
        },
        "message": "string",
        "success": "boolean",
      }
    `);

      // A resend never moves the kitchen's progress back.
      expect(
        (await push({ orderId: `INT-${run}-life`, orderNumber: 'L-1', source: 'QR' })).data.status,
      ).toBe('PREPARING');

      const ready = await setStatus('READY');
      expect(ready.data.status).toBe('READY');
      expect(ready.data.readyAt).not.toBeNull();
      // READY -> PREPARING undoes a mistaken tap.
      expect((await setStatus('PREPARING')).data.status).toBe('PREPARING');
      expect((await setStatus('READY')).data.status).toBe('READY');
      expect((await setStatus('CANCELLED')).status).toBe(409);
      expect((await setStatus('COLLECTED')).data.status).toBe('COLLECTED');
      const after = await setStatus('CANCELLED');
      expect([after.status, after.body.message]).toEqual([
        409,
        'An order that is COLLECTED cannot be marked CANCELLED.',
      ]);
      expect((await setStatus('PLACED')).status).toBe(409);
      // Collected orders leave the kitchen screen.
      expect((await listOrders()).map((o) => o.id)).not.toContain(id);

      // A channel's cancel follows the kitchen screen's rules: a collected order stays collected.
      const late = await push({
        orderId: `INT-${run}-life`,
        orderNumber: 'L-1',
        status: 'CANCELLED',
      });
      expect([late.status, late.body.message]).toEqual([
        409,
        'An order that is COLLECTED cannot be marked CANCELLED.',
      ]);
      // A channel's order is never a counter bill: those are made in AAHAR's own till.
      const counter = await push({
        orderId: `INT-${run}-counter`,
        orderNumber: 'C-1',
        source: 'COUNTER',
      });
      expect(counter.status).toBe(400);

      // A channel cancels its own open order; it leaves the screen.
      const dropped = await push({
        orderId: `INT-${run}-other`,
        orderNumber: 'K-2',
        status: 'CANCELLED',
      });
      expect(dropped.data.status).toBe('CANCELLED');
      expect((await listOrders()).map((o) => o.orderNumber)).not.toContain('K-2');

      expect((await setStatus('DONE')).status).toBe(400);
      expect((await setStatus(undefined)).status).toBe(400);
      expect(
        (await h.api('PATCH', '/restaurant-orders/nope/status', { status: 'READY' })).status,
      ).toBe(400);
      const missing = await setStatus('PREPARING', undefined, randomUUID());
      expect([missing.status, missing.body.message]).toEqual([404, 'Order not found']);
    });

    it('kitchen screen: needs restaurantId, ORDER_VIEW / ORDER_UPDATE, and stays in the location', async () => {
      const list = await h.api('GET', '/restaurant-orders');
      expect(list.status).toBe(400);
      expect(list.body.message).toMatchInlineSnapshot(`"restaurantId must be a UUID"`);
      expect((await h.api('GET', '/restaurant-orders?restaurantId=x')).status).toBe(400);
      expect(await listOrders(randomUUID())).toEqual([]);

      const open = await push({ orderId: `INT-${run}-scope`, orderNumber: 'S-1' });
      const id = idOf(open.data);
      expect(
        (await h.api('GET', `/restaurant-orders?restaurantId=${fx.restaurantId}`, undefined, ''))
          .status,
      ).toBe(401);
      expect(
        (
          await h.api(
            'GET',
            `/restaurant-orders?restaurantId=${fx.restaurantId}`,
            undefined,
            as.stock,
          )
        ).status,
      ).toBe(403);
      expect(
        (await h.api('PATCH', `/restaurant-orders/${id}/status`, { status: 'PREPARING' }, as.stock))
          .status,
      ).toBe(403);

      // A cashier at this location sees and moves it.
      expect((await listOrders(fx.restaurantId, as.cashier)).map((o) => o.id)).toContain(id);
      // One at another location sees nothing and cannot touch it.
      expect(await listOrders(fx.restaurantId, as.elsewhere)).toEqual([]);
      const foreign = await h.api(
        'PATCH',
        `/restaurant-orders/${id}/status`,
        { status: 'PREPARING' },
        as.elsewhere,
      );
      expect([foreign.status, foreign.body.message]).toEqual([404, 'Order not found']);
      expect(
        (
          await h.api(
            'PATCH',
            `/restaurant-orders/${id}/status`,
            { status: 'PREPARING' },
            as.cashier,
          )
        ).data.status,
      ).toBe('PREPARING');
    });

    it('board: open orders by number only, through the board secret', async () => {
      const ready = await push({
        counterCode: fx.counterCode,
        items: [{ name: 'Idli', quantity: 3 }],
        orderId: `INT-${run}-board`,
        orderNumber: 'B-1',
        serviceType: 'DINE_IN',
      });
      await h.ok('PATCH', `/restaurant-orders/${idOf(ready.data)}/status`, { status: 'PREPARING' });
      await h.ok('PATCH', `/restaurant-orders/${idOf(ready.data)}/status`, { status: 'READY' });

      const shown = await board();
      expect(shown.status).toBe(200);
      expect(shown.data).toMatchObject({
        helpCounterName: `Int Pickup ${Run}`,
        isOpen: true,
        restaurantName: `Int Orders ${Run}`,
      });
      expect(typeof shown.data.locationName).toBe('string');
      expect(typeof shown.data.serverTime).toBe('string');
      const orders = shown.data.orders as Body[];
      // No guest details, ids or items: number, counter, count and timing.
      expect(orders.find((o) => o.orderNumber === 'B-1')).toEqual({
        counterName: `Int Pickup ${Run}`,
        itemCount: 3,
        orderNumber: 'B-1',
        readyAt: expect.any(String) as string,
        serviceType: 'DINE_IN',
        status: 'READY',
      });
      const preparing = orders.find((o) => o.orderNumber === 'K-1b');
      expect(preparing).toEqual({
        counterName: `Int Pickup ${Run}`,
        estimatedReadyAt: expect.any(String) as string,
        itemCount: 3,
        orderNumber: 'K-1b',
        serviceType: 'TAKE_AWAY',
        status: 'PREPARING',
      });
      // Collected and cancelled orders are off the board.
      expect(orders.map((o) => o.orderNumber)).not.toContain('L-1');
      expect(orders.map((o) => o.orderNumber)).not.toContain('K-2');

      // The secret also works as a header.
      const viaHeader = await fetch(`${h.baseUrl}/order-board/${fx.restaurantId}`, {
        headers: { 'x-board-token': fx.boardToken },
      });
      expect(viaHeader.status).toBe(200);

      for (const refused of [
        await board(''),
        await board('?token=wrong'),
        // The right secret for a different restaurant id.
        await board(`?token=${fx.boardToken}`, randomUUID()),
      ]) {
        expect([refused.status, refused.body.message]).toEqual([
          404,
          'This board link is no longer valid.',
        ]);
      }
      expect((await board(`?token=${fx.boardToken}`, 'nope')).status).toBe(400);
    });

    it('kiosk: menu and order on the board secret, totals priced by the server, paid at a counter', async () => {
      const kiosk = (path: string, token = fx.boardToken) =>
        `/kiosk/${fx.restaurantId}/${path}?token=${token}`;
      const menu = await h.api('GET', kiosk('menu'), undefined, '');
      expect(menu.status).toBe(200);
      expect(menu.data).toMatchObject({
        canPay: true,
        restaurantName: `Int Orders ${Run}`,
        staffDiscount: false,
      });
      const items = menu.data.items as Body[];
      expect(items.map((i) => i.itemName)).toEqual([`Int Dosa ${Run}`, `Int Tea ${Run}`]);
      expect(firstOf(items)).toMatchObject({ gstPercent: 18, isGstInclusive: false, price: 49.5 });
      expect(shape(menu.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "canPay": "boolean",
          "items": [
            {
              "category": {
                "categoryName": "string",
                "id": "string",
                "sortOrder": "number",
              },
              "foodType": "string",
              "gstPercent": "number",
              "id": "string",
              "isDiscountable": "boolean",
              "isFeatured": "boolean",
              "isGstInclusive": "boolean",
              "itemName": "string",
              "preparationTimeMinutes": null,
              "price": "number",
            },
          ],
          "locationName": "string",
          "restaurantName": "string",
          "staffDiscount": "boolean",
        },
        "message": "string",
        "success": "boolean",
      }
    `);

      const order = {
        clientOrderId: `kiosk-${run}-1`,
        lines: [
          { menuId: fx.menuId, quantity: 2 },
          { menuId: fx.inclusiveMenuId, quantity: 1 },
        ],
        // Ignored: this restaurant gives no staff discount.
        mobile: '9876543210',
      };
      const placed = await h.api('POST', kiosk('orders'), order, '');
      expect(placed.status).toBe(201);
      // 2 x 49.50 + 18% = 116.82; 30 inclusive of 5% = 28.58 + 1.42; 146.82 rounds to 147.
      expect(placed.data).toMatchObject({
        discountPercent: 0,
        discountTotal: 0,
        grandTotal: 147,
        gstTotal: 19.24,
        lines: [
          { itemName: `Int Dosa ${Run}`, lineTotal: 116.82, quantity: 2, unitPrice: 49.5 },
          { itemName: `Int Tea ${Run}`, lineTotal: 30, quantity: 1, unitPrice: 30 },
        ],
        roundOff: 0.18,
        subtotal: 127.58,
      });
      expect(shape(placed.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "discountPercent": "number",
          "discountTotal": "number",
          "grandTotal": "number",
          "gstTotal": "number",
          "id": "string",
          "lines": [
            {
              "itemName": "string",
              "lineTotal": "number",
              "menuId": "string",
              "quantity": "number",
              "unitPrice": "number",
            },
          ],
          "number": "number",
          "roundOff": "number",
          "subtotal": "number",
        },
        "message": "string",
        "success": "boolean",
      }
    `);
      const number = placed.data.number as number;

      // A double tap returns the same order; the next order takes the next number.
      const twice = await h.ok('POST', kiosk('orders'), order, '');
      expect([twice.id, twice.number]).toEqual([placed.data.id, number]);
      const next = await h.ok(
        'POST',
        kiosk('orders'),
        { clientOrderId: `kiosk-${run}-2`, lines: [{ menuId: fx.menuId, quantity: 1 }] },
        '',
      );
      expect(next).toMatchObject({ grandTotal: 58, number: number + 1 });

      // Refusals.
      const wrongLink = await h.api('POST', kiosk('orders', 'wrong'), order, '');
      expect([wrongLink.status, wrongLink.body.message]).toEqual([
        404,
        'This kiosk link is no longer valid.',
      ]);
      expect((await h.api('GET', `/kiosk/${fx.restaurantId}/menu`, undefined, '')).status).toBe(
        404,
      );
      const offMenu = await h.api(
        'POST',
        kiosk('orders'),
        { clientOrderId: `kiosk-${run}-x`, lines: [{ menuId: randomUUID(), quantity: 1 }] },
        '',
      );
      expect([offMenu.status, offMenu.body.message]).toEqual([
        400,
        'An item in this order is not on the menu.',
      ]);
      const invalid = await h.api(
        'POST',
        kiosk('orders'),
        {
          clientOrderId: `kiosk-${run}-v`,
          lines: [{ menuId: fx.menuId, quantity: 21 }],
          mobile: '12345',
        },
        '',
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toMatchInlineSnapshot(
        `"lines.0.quantity must not be greater than 20, mobile must be a 10-digit Indian mobile number"`,
      );
      expect(
        (await h.api('POST', kiosk('orders'), { clientOrderId: `kiosk-${run}-e`, lines: [] }, ''))
          .status,
      ).toBe(400);

      // The cashier finds it on Waiting to pay, loads it by number and bills it.
      const waitingPath = `/pos/kiosk-orders?counterId=${fx.counterId}`;
      const waiting = (await h.ok('GET', waitingPath, undefined, as.cashier)) as unknown as Body[];
      const mine = waiting.find((o) => o.number === number);
      expect(mine).toMatchObject({
        isStaff: false,
        items: [
          { name: `Int Dosa ${Run}`, quantity: 2 },
          { name: `Int Tea ${Run}`, quantity: 1 },
        ],
      });
      const loaded = await h.ok(
        'GET',
        `/pos/kiosk-orders/${number}?counterId=${fx.counterId}`,
        undefined,
        as.cashier,
      );
      expect(loaded).toMatchObject({ employeeCode: null, id: placed.data.id, number });

      const shift = await h.ok('POST', '/pos/shifts', { counterId: fx.counterId, openingCash: 0 });
      const bill = await h.ok('POST', '/pos/orders', {
        channel: 'COUNTER',
        clientOrderId: `kiosk-bill-${run}`,
        counterId: fx.counterId,
        kioskOrderId: placed.data.id,
        lines: loaded.lines,
        paymentMode: 'CARD',
        paymentReference: 'KIOSK-CARD',
      });
      expect(bill).toMatchObject({ grandTotal: 147, status: 'PLACED' });
      const billed = await h.api(
        'GET',
        `/pos/kiosk-orders/${number}?counterId=${fx.counterId}`,
        undefined,
        as.cashier,
      );
      expect([billed.status, billed.body.message]).toEqual([
        409,
        `Kiosk order ${number} is already billed (${String(bill.billNumber)}).`,
      ]);
      expect(
        ((await h.ok('GET', waitingPath)) as unknown as Body[]).map((o) => o.number),
      ).not.toContain(number);

      // The bill is on the kitchen screen as a counter order; it is cancelled from its bill only.
      const onScreen = (await listOrders()).find((o) => o.id === bill.id);
      expect(onScreen).toMatchObject({ source: 'COUNTER', status: 'PLACED' });
      const cancel = await h.api('PATCH', `/restaurant-orders/${idOf(bill)}/status`, {
        status: 'CANCELLED',
      });
      expect([cancel.status, cancel.body.message]).toEqual([
        409,
        'Cancel a counter bill from Bill History: it records why and restocks the counter.',
      ]);
      await h.ok('PATCH', `/pos/shifts/${idOf(shift)}/end`, { countedCash: 0, handover: false });

      const unknown = await h.api('GET', `/pos/kiosk-orders/9999?counterId=${fx.counterId}`);
      expect([unknown.status, unknown.body.message]).toEqual([
        404,
        `No kiosk order 9999 today at Int Orders ${Run}.`,
      ]);
      expect((await h.api('GET', `/pos/kiosk-orders/abc?counterId=${fx.counterId}`)).status).toBe(
        400,
      );
      expect((await h.api('GET', '/pos/kiosk-orders')).status).toBe(400);
      expect((await h.api('GET', waitingPath, undefined, '')).status).toBe(401);
      expect((await h.api('GET', waitingPath, undefined, as.stock)).status).toBe(403);
      // Another location's cashier cannot see this counter.
      const foreign = await h.api('GET', waitingPath, undefined, as.elsewhere);
      expect([foreign.status, foreign.body.message]).toEqual([
        404,
        'Counter not found, or it is switched off.',
      ]);
    });

    it('kiosk: a restaurant with no active counter shows the menu but takes no orders', async () => {
      const quiet = await h.ok('POST', '/restaurants', {
        hospitalId: fx.hospitalId,
        restaurantName: `Int Orders Quiet ${run}`,
      });
      const token = (
        await h.ok('POST', `/restaurants/${idOf(quiet)}/board-link`, { regenerate: false })
      ).boardToken as string;
      const menu = await h.ok('GET', `/kiosk/${idOf(quiet)}/menu?token=${token}`, undefined, '');
      expect(menu).toMatchObject({ canPay: false, items: [] });
      const refused = await h.api(
        'POST',
        `/kiosk/${idOf(quiet)}/orders?token=${token}`,
        { clientOrderId: `quiet-${run}`, lines: [{ menuId: fx.menuId, quantity: 1 }] },
        '',
      );
      expect([refused.status, refused.body.message]).toEqual([
        400,
        'This kiosk is not taking orders yet. Please ask a member of staff.',
      ]);
      // Its board opens on its own secret, and this restaurant's secret does not open it.
      expect((await board(`?token=${token}`, idOf(quiet))).status).toBe(200);
      expect((await board(`?token=${fx.boardToken}`, idOf(quiet))).status).toBe(404);
    });

    describe('online UPI payments (Razorpay answered by a fake gateway)', () => {
      const draft = () => ({
        channel: 'COUNTER',
        counterId: fx.counterId,
        lines: [{ menuId: fx.menuId, quantity: 1 }],
        provider: 'RAZORPAY',
      });
      const created = (id: string) => ({
        body: { id, short_url: `https://rzp.io/i/${id}`, status: 'created' },
        status: 200,
      });

      const setOption = (option: string) =>
        h.rawQuery(
          `UPDATE hospitals SET online_payment_option = $1::"OnlinePaymentOption" WHERE id = $2::uuid`,
          option,
          fx.hospitalId,
        );
      // The counter’s location picks Razorpay (on the server’s shared test keys).
      beforeAll(() => setOption('RAZORPAY'));

      it('lists the gateway the counter’s location picked, if set up', async () => {
        const providers = `/pos/online-payments/providers/${fx.counterId}`;
        expect(await h.ok('GET', providers)).toEqual(['RAZORPAY']);
        expect((await h.api('GET', providers, undefined, '')).status).toBe(401);
        expect((await h.api('GET', providers, undefined, as.stock)).status).toBe(403);

        await setOption('NONE');
        expect(await h.ok('GET', providers)).toEqual([]);
        await setOption('RAZORPAY');
      });

      it('start: the server prices the bill, asks the gateway for a link, and keeps it PENDING', async () => {
        gatewayCalls.length = 0;
        gatewayReply = () => created(`plink_${run}_a`);
        const started = await h.api('POST', '/pos/online-payments', draft(), as.cashier);
        expect(started.status).toBe(201);
        expect(started.data).toMatchObject({
          amount: 58,
          paidReference: null,
          paymentUrl: `https://rzp.io/i/plink_${run}_a`,
          provider: 'RAZORPAY',
          status: 'PENDING',
        });
        expect(shape(started.body)).toMatchInlineSnapshot(`
        {
          "data": {
            "amount": "number",
            "id": "string",
            "paidReference": null,
            "paymentUrl": "string",
            "provider": "string",
            "status": "string",
          },
          "message": "string",
          "success": "boolean",
        }
      `);
        // One call: amount in paise, our payment id as the reference, Basic auth with the keys.
        expect(gatewayCalls).toEqual([
          {
            authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
            body: {
              amount: 5800,
              currency: 'INR',
              description: `Int Orders ${Run} · Int Pickup ${Run}`,
              reference_id: started.data.id,
            },
            method: 'POST',
            url: RAZORPAY,
          },
        ]);
        const [row] = await h.rawQuery<Body>(
          `SELECT provider_ref AS "providerRef", amount::float AS amount, hospital_id::text AS "hospitalId"
         FROM online_payments WHERE id = $1::uuid`,
          started.data.id,
        );
        expect(row).toEqual({
          amount: 58,
          hospitalId: fx.hospitalId,
          providerRef: `plink_${run}_a`,
        });

        // While the gateway says unpaid, it stays PENDING.
        gatewayCalls.length = 0;
        gatewayReply = () => ({ body: { status: 'created' }, status: 200 });
        const id = idOf(started.data);
        expect((await h.ok('GET', `/pos/online-payments/${id}`)).status).toBe('PENDING');
        expect(gatewayCalls.map((c) => [c.method, c.url])).toEqual([
          ['GET', `${RAZORPAY}/plink_${run}_a`],
        ]);

        // Paid: settled with the gateway's payment id, and never asked again.
        gatewayReply = () => ({
          body: { payments: [{ payment_id: `pay_${run}` }], status: 'paid' },
          status: 200,
        });
        expect(await h.ok('GET', `/pos/online-payments/${id}`)).toMatchObject({
          paidReference: `pay_${run}`,
          status: 'PAID',
        });
        gatewayCalls.length = 0;
        gatewayReply = () => ({ body: { status: 'expired' }, status: 200 });
        expect((await h.ok('GET', `/pos/online-payments/${id}`)).status).toBe('PAID');
        // Cancelling a paid one hands it back PAID.
        expect((await h.ok('POST', `/pos/online-payments/${id}/cancel`)).status).toBe('PAID');
        expect(gatewayCalls).toEqual([]);
      });

      it('cancel lets an unpaid one go; a link the gateway closed is EXPIRED', async () => {
        gatewayReply = () => created(`plink_${run}_c`);
        const toCancel = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        gatewayCalls.length = 0;
        gatewayReply = (call) =>
          call.method === 'POST'
            ? { body: { status: 'cancelled' }, status: 200 }
            : { body: { status: 'created' }, status: 200 };
        expect((await h.ok('POST', `/pos/online-payments/${toCancel}/cancel`)).status).toBe(
          'CANCELLED',
        );
        expect(gatewayCalls.map((c) => [c.method, c.url])).toEqual([
          ['GET', `${RAZORPAY}/plink_${run}_c`],
          ['POST', `${RAZORPAY}/plink_${run}_c/cancel`],
        ]);

        // The gateway refuses the cancel because the guest just paid: it comes back PAID.
        gatewayReply = () => created(`plink_${run}_r`);
        const raced = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        let reads = 0;
        gatewayReply = (call) => {
          if (call.method === 'POST')
            return { body: { error: { description: 'paid' } }, status: 400 };
          reads += 1;
          return reads === 1
            ? { body: { status: 'created' }, status: 200 }
            : { body: { payments: [{ payment_id: `pay_${run}_r` }], status: 'paid' }, status: 200 };
        };
        expect(await h.ok('POST', `/pos/online-payments/${raced}/cancel`)).toMatchObject({
          paidReference: `pay_${run}_r`,
          status: 'PAID',
        });

        gatewayReply = () => created(`plink_${run}_x`);
        const expired = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        gatewayReply = () => ({ body: { status: 'expired' }, status: 200 });
        expect((await h.ok('GET', `/pos/online-payments/${expired}`)).status).toBe('EXPIRED');
      });

      it('gateway refusals and bad replies save nothing', async () => {
        const count = async () =>
          Number(
            (
              await h.rawQuery<{ n: number }>(
                'SELECT count(*)::int AS n FROM online_payments WHERE counter_id = $1::uuid',
                fx.counterId,
              )
            )[0]?.n,
          );
        const before = await count();

        gatewayReply = () => ({
          body: { error: { description: 'Authentication failed' } },
          status: 401,
        });
        const refused = await h.api('POST', '/pos/online-payments', draft());
        expect([refused.status, refused.body.message]).toEqual([
          502,
          'Razorpay refused it: Authentication failed',
        ]);

        // A reply without a link is refused rather than saved as "undefined".
        gatewayReply = () => ({ body: { id: `plink_${run}_n` }, status: 200 });
        const noLink = await h.api('POST', '/pos/online-payments', draft());
        expect([noLink.status, noLink.body.message]).toEqual([
          502,
          'Razorpay did not send a payment link. Try again, or take the payment another way.',
        ]);
        expect(await count()).toBe(before);

        // A gateway that errors on a check leaves the payment PENDING for the next check.
        gatewayReply = () => created(`plink_${run}_d`);
        const id = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        gatewayReply = () => ({ body: { error: { description: 'Server down' } }, status: 500 });
        const down = await h.api('GET', `/pos/online-payments/${id}`);
        expect([down.status, down.body.message]).toEqual([502, 'Razorpay refused it: Server down']);
        const [row] = await h.rawQuery<{ status: string }>(
          'SELECT status::text FROM online_payments WHERE id = $1::uuid',
          id,
        );
        expect(row?.status).toBe('PENDING');
      });

      it('validation, provider not set up, permissions and location', async () => {
        const payu = await h.api('POST', '/pos/online-payments', { ...draft(), provider: 'PAYU' });
        expect([payu.status, payu.body.message]).toEqual([
          400,
          "PayU is not set up for this location. Pick it as the location's Online Payment Option, with its keys.",
        ]);
        const invalid = await h.api('POST', '/pos/online-payments', {
          ...draft(),
          lines: [],
          provider: 'PAYTM',
        });
        expect(invalid.status).toBe(400);
        expect(invalid.body.message).toMatchInlineSnapshot(
          `"provider must be one of the following values: RAZORPAY, PAYU, PINELABS, lines must contain at least 1 elements"`,
        );
        // Fields a bill has but a payment does not are refused.
        expect(
          (await h.api('POST', '/pos/online-payments', { ...draft(), paymentMode: 'UPI' })).status,
        ).toBe(400);
        const offMenu = await h.api('POST', '/pos/online-payments', {
          ...draft(),
          lines: [{ menuId: randomUUID(), quantity: 1 }],
        });
        expect([offMenu.status, offMenu.body.message]).toEqual([
          400,
          'An item on this bill is not on this counter’s menu.',
        ]);
        const missing = await h.api('GET', `/pos/online-payments/${randomUUID()}`);
        expect([missing.status, missing.body.message]).toEqual([404, 'Payment not found.']);
        expect((await h.api('GET', '/pos/online-payments/nope')).status).toBe(400);
        expect((await h.api('POST', '/pos/online-payments', draft(), '')).status).toBe(401);
        expect((await h.api('POST', '/pos/online-payments', draft(), as.stock)).status).toBe(403);

        // Another location's cashier can neither start one at this counter nor read one made here.
        gatewayCalls.length = 0;
        const foreignStart = await h.api('POST', '/pos/online-payments', draft(), as.elsewhere);
        expect([foreignStart.status, foreignStart.body.message]).toEqual([
          404,
          'Counter not found, or it is switched off.',
        ]);
        expect(gatewayCalls).toEqual([]);
        gatewayReply = () => created(`plink_${run}_l`);
        const id = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        for (const path of [`/pos/online-payments/${id}`, `/pos/online-payments/${id}/cancel`]) {
          const foreign = await h.api(
            path.endsWith('cancel') ? 'POST' : 'GET',
            path,
            undefined,
            as.elsewhere,
          );
          expect([foreign.status, foreign.body.message]).toEqual([404, 'Payment not found.']);
        }
      });

      it('billing: UPI here comes with the paid payment, unless the restaurant has its own QR', async () => {
        const shift = await h.ok('POST', '/pos/shifts', {
          counterId: fx.counterId,
          openingCash: 0,
        });
        const billWith = (name: string, extra: Body) =>
          h.api('POST', '/pos/orders', {
            channel: 'COUNTER',
            clientOrderId: `${name}-${run}`,
            counterId: fx.counterId,
            lines: draft().lines,
            ...extra,
          });

        // A typed UPI reference proves nothing where Razorpay takes UPI.
        const typed = await billWith('upi-typed', { paymentMode: 'UPI', paymentReference: 'X1' });
        expect([typed.status, typed.body.message]).toEqual([
          400,
          'Take UPI on the till’s QR: this counter collects UPI online, so a typed reference is not accepted.',
        ]);

        // Paid through Razorpay, the bill takes the payment and its reference.
        gatewayReply = () => created(`plink_${run}_b`);
        const id = idOf(await h.ok('POST', '/pos/online-payments', draft()));
        gatewayReply = () => ({
          body: { payments: [{ payment_id: `pay_${run}_b` }], status: 'paid' },
          status: 200,
        });
        expect((await h.ok('GET', `/pos/online-payments/${id}`)).status).toBe('PAID');
        const paid = await billWith('upi-paid', { onlinePaymentId: id, paymentMode: 'UPI' });
        expect(paid.status).toBe(201);
        expect(paid.data).toMatchObject({
          grandTotal: 58,
          paymentMode: 'UPI',
          paymentReference: `pay_${run}_b`,
        });

        // The restaurant's own UPI QR pays its own account: no gateway to ask, typed in.
        await h.rawQuery(
          `UPDATE restaurants SET upi_id = 'int@upi' WHERE id = $1::uuid`,
          fx.restaurantId,
        );
        try {
          const ownQr = await billWith('upi-own', { paymentMode: 'UPI', paymentReference: 'X2' });
          expect([ownQr.status, ownQr.data.paymentReference]).toEqual([201, 'X2']);
        } finally {
          await h.rawQuery(
            'UPDATE restaurants SET upi_id = NULL WHERE id = $1::uuid',
            fx.restaurantId,
          );
        }
        // No card machine at this counter: a card is typed in.
        expect((await billWith('card-typed', { paymentMode: 'CARD' })).status).toBe(201);
        await h.ok('PATCH', `/pos/shifts/${idOf(shift)}/end`, { countedCash: 0, handover: false });
      });
    });
  },
);
