// Characterisation of the point of sale over HTTP: counter shifts (opening cash, one open shift,
// the cash count), billing in every payment mode with GST, round-off and staff discount, counter
// stock taken earliest expiry first, complimentary and cancelled bills, the day's takings, bill
// lists, kiosk orders billed at a counter, and who may do what where. Online payments (gateway)
// are another suite's.
//
// Runs only with DATABASE_URL_TEST. Every record is this run's own (restaurant, counters, items,
// employees, users), so it never touches existing data and needs no cleanup.
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  shape,
  startHarness,
  type Body,
  type Harness,
} from '../testing/int-harness.js';

// The images set no TZ, so production runs in UTC and so does this suite.
process.env.TZ = 'UTC';

const today = day(0);
const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;
const mobile = () => `6${String(randomInt(100_000_000, 999_999_999))}`;

describe.skipIf(!databaseUrl)('point of sale (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    categoryId: '',
    counterCode: '',
    counterId: '', // C1: the main till, keeps stock of the sandwich
    counter2Id: '', // C2: same restaurant, no stock kept
    counter3Id: '', // another restaurant, same location
    hospitalId: '',
    otherCounterId: '', // another location
    otherHospitalId: '',
    restaurantId: '',
    storeId: '',
  };
  /** Sandwich: 99.90 + 5% GST on top, discountable, counter and room (120). Stocked at C1. */
  const sandwich = { itemId: '', menuId: '', name: '' };
  /** Tea: 25 with 5% GST inside it, not discountable, counter only. Never stocked. */
  const tea = { itemId: '', menuId: '', name: '' };
  /** Soup: rooms only, 180 + 5% GST. */
  const soup = { itemId: '', menuId: '', name: '' };
  const staff = { ineligible: '', onRoll: '', onRollMobile: mobile(), outsourced: '' };
  const users = { cashier: '', cashierId: '', kitchen: '' };
  let shiftId = '';
  let boardToken = '';

  const as = (token: string) => ({
    api: (method: string, path: string, body?: unknown) => h.api(method, path, body, token),
  });

  /** Bills at C1 (by default) as the Super Admin. */
  const bill = (name: string, body: Body = {}, token?: string) =>
    h.api(
      'POST',
      '/pos/orders',
      {
        channel: 'COUNTER',
        clientOrderId: `${name}-${run}`,
        counterId: fx.counterId,
        lines: [{ menuId: tea.menuId, quantity: 1 }],
        paymentMode: 'CASH',
        ...body,
      },
      token,
    );

  const counterBatches = async (counterId: string, itemId: string) =>
    Object.fromEntries(
      items(await h.ok('GET', `/counter-stock?itemId=${itemId}&locationId=${counterId}`)).map(
        (balance) => [String(balance.batchNumber).replace(`-${run}`, ''), balance.availableQty],
      ),
    );

  /** [batch, transactionType, qtyIn, qtyOut, balanceAfter] of an order's ledger rows. */
  const ledgerOf = async (itemId: string, referenceId: string) =>
    items(await h.ok('GET', `/stock-ledgers?itemId=${itemId}&limit=100`))
      .filter((entry) => entry.referenceId === referenceId)
      .map((entry) => [
        String(entry.batchNumber).replace(`-${run}`, ''),
        entry.transactionType,
        entry.qtyIn,
        entry.qtyOut,
        entry.balanceAfter,
      ])
      .sort();

  async function newUser(role: string, prefix: string): Promise<{ id: string; token: string }> {
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `${prefix}${run}`.toUpperCase(),
      `Int ${role} ${run}`,
      mobile(),
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
    return { id: user!.id, token: h.signFor(user!) };
  }

  beforeAll(async () => {
    // No UPI gateway, so UPI here is typed in as at a site without one (online payments are
    // another suite's). Blanks that are not empty: dotenv-expand refills an empty one from .env.
    Object.assign(process.env, { PAYU_CLIENT_ID: ' ', RAZORPAY_KEY_ID: ' ' });
    h = await startHarness();
    const kitchen = firstOf(
      items(await h.ok('GET', '/kitchens?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc')),
    );
    fx.hospitalId = kitchen.hospitalId as string;
    fx.storeId = idOf(
      firstOf(
        items(
          await h.ok(
            'GET',
            `/stores?limit=1&isActive=true&sortBy=createdAt&sortOrder=asc&hospitalId=${fx.hospitalId}`,
          ),
        ),
      ),
    );
    const restaurant = (name: string, hospitalId = fx.hospitalId) =>
      h.ok('POST', '/restaurants', { hospitalId, restaurantName: `${name} ${run}` });
    fx.restaurantId = idOf(await restaurant('Int Pos'));
    fx.categoryId = idOf(
      await h.ok('POST', '/item-categories', { categoryName: `Int Pos ${run}` }),
    );

    const menuItem = async (target: typeof tea, name: string, menu: Body) => {
      target.itemId = idOf(
        await h.ok('POST', '/items', { itemName: `${name} ${run}`, type: 'VEG' }),
      );
      await h.ok('POST', '/store-items', {
        categoryId: fx.categoryId,
        itemId: target.itemId,
        storeId: fx.storeId,
      });
      target.menuId = idOf(
        await h.ok('POST', '/restaurant-menus', {
          categoryId: fx.categoryId,
          gstPercent: 5,
          itemId: target.itemId,
          restaurantId: fx.restaurantId,
          storeId: fx.storeId,
          ...menu,
        }),
      );
    };
    await menuItem(sandwich, 'Int Sandwich', {
      isDiscountable: true,
      isGstInclusive: false,
      price: 99.9,
      roomPrice: 120,
      serveAt: 'BOTH',
    });
    await menuItem(tea, 'Int Tea', {
      isDiscountable: false,
      isGstInclusive: true,
      price: 25,
      serveAt: 'COUNTER',
    });
    await menuItem(soup, 'Int Soup', {
      isDiscountable: true,
      isGstInclusive: false,
      price: 150,
      roomPrice: 180,
      serveAt: 'ROOM',
    });

    const counter = (code: string, restaurantId: string, hospitalId = fx.hospitalId) =>
      h.ok('POST', '/counters', {
        counterCode: `${code}${run}`,
        counterName: `Int ${code} ${run}`,
        hospitalId,
        restaurantId,
      });
    const c1 = await counter('PA', fx.restaurantId);
    fx.counterId = idOf(c1);
    fx.counterCode = c1.counterCode as string;
    fx.counter2Id = idOf(await counter('PB', fx.restaurantId));
    const restaurantTwoId = idOf(await restaurant('Int Pos Two'));
    fx.counter3Id = idOf(await counter('PC', restaurantTwoId));
    // This run's browser is the till of a POS device for both its restaurants, set up by name.
    const till = await h.ok('POST', '/pos-devices', {
      code: `IT${run}`,
      hospitalId: fx.hospitalId,
      hostName: `INT-TILL-${run}`,
      name: `Int Till ${run}`,
      restaurantIds: [fx.restaurantId, restaurantTwoId],
    });
    h.tillKey = (
      (await h.ok('POST', '/pos/till', {
        computerName: `INT-TILL-${run}`,
        posDeviceId: idOf(till),
      })) as { tillKey: string }
    ).tillKey;

    // Another location, with a restaurant and counter of its own.
    const [other] = await h.rawQuery<{ id: string }>(
      `INSERT INTO hospitals (id, hospital_code, hospital_name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
      `IP${run}`.toUpperCase(),
      `Int Pos Elsewhere ${run}`,
    );
    fx.otherHospitalId = other!.id;
    fx.otherCounterId = idOf(
      await counter('PX', idOf(await restaurant('Int Pos Far', other!.id)), other!.id),
    );

    // Names as the API keeps them (it may tidy their case).
    const menu = items(
      await h.ok('GET', `/pos/menu?counterId=${fx.counterId}&channel=COUNTER`),
    ).concat(items(await h.ok('GET', `/pos/menu?counterId=${fx.counterId}&channel=ROOM`)));
    for (const target of [sandwich, tea, soup]) {
      target.name = menu.find((entry) => entry.id === target.menuId)?.itemName as string;
    }

    // Staff discount: 10% for on-roll staff, by the restaurant's Employee Discount rule.
    await h.ok('PUT', `/pos/staff-discounts/${fx.restaurantId}`, {
      rates: [],
      staffDiscountApplicable: true,
    });
    await h.ok('POST', '/employee-discounts', {
      discountPercent: 10,
      employmentType: 'ON_ROLL',
      name: `Int Staff ${run}`,
      restaurantId: fx.restaurantId,
    });
    const employee = async (code: string, body: Body) =>
      (
        await h.ok('POST', '/employees', {
          employeeCode: `${code}${run}`,
          employeeName: `Int ${code} ${run}`,
          hospitalId: fx.hospitalId,
          ...body,
        })
      ).employeeCode as string;
    staff.onRoll = await employee('IE', { employmentType: 'ON_ROLL', mobile: staff.onRollMobile });
    staff.outsourced = await employee('IO', { employmentType: 'OUTSOURCED' });
    staff.ineligible = await employee('IN', {
      eligibleForDiscount: false,
      employmentType: 'ON_ROLL',
    });

    const cashier = await newUser('POS Cashier', 'IC');
    users.cashier = cashier.token;
    users.cashierId = cashier.id;
    users.kitchen = (await newUser('Kitchen Operator', 'IK')).token;
  }, 120_000);

  afterAll(() => h?.app.close());

  it('refuses a call with no token, and one without the POS permissions', async () => {
    const calls: Array<[string, string, Body?]> = [
      ['GET', '/pos/counters'],
      ['GET', `/pos/menu?counterId=${fx.counterId}&channel=COUNTER`],
      ['GET', '/pos/orders'],
      ['POST', '/pos/orders', {}],
      ['POST', '/pos/shifts', { counterId: fx.counterId, openingCash: 0 }],
      ['POST', '/pos/day-closes', { counterId: fx.counterId }],
      ['GET', `/pos/summary?counterId=${fx.counterId}`],
    ];
    for (const [method, path, body] of calls) {
      expect([path, (await h.api(method, path, body, '')).status]).toEqual([path, 401]);
      const refused = await h.api(method, path, body, users.kitchen);
      expect([path, refused.status, refused.body.message]).toEqual([
        path,
        403,
        'Forbidden resource',
      ]);
    }
    expect(shape((await h.api('GET', '/pos/orders', undefined, '')).body)).toMatchInlineSnapshot(`
      {
        "errors": [],
        "message": "string",
        "requestId": "string",
        "success": "boolean",
        "timestamp": "string",
      }
    `);
  });

  it('shifts: a bill needs an open shift, which opens with the till cash, one per counter', async () => {
    const noShift = await bill('no-shift');
    expect([noShift.status, noShift.body.message]).toEqual([
      400,
      'Open a shift at this counter before billing.',
    ]);

    for (const body of [
      { counterId: fx.counterId, openingCash: -5 },
      { counterId: fx.counterId, openingCash: 1.234 },
      { counterId: 'till-1', openingCash: 0 },
      { counterId: fx.counterId },
    ]) {
      const invalid = await h.api('POST', '/pos/shifts', body);
      expect(invalid.status).toBe(400);
    }
    expect(
      (await h.api('POST', '/pos/shifts', { counterId: 'till-1', openingCash: -5 })).body.message,
    ).toMatchInlineSnapshot(`"counterId must be a UUID, openingCash must not be less than 0"`);
    const unknown = await h.api('POST', '/pos/shifts', { counterId: randomUUID(), openingCash: 0 });
    expect([unknown.status, unknown.body.message]).toEqual([
      404,
      'Counter not found, or it is switched off.',
    ]);

    const opened = await h.api('POST', '/pos/shifts', {
      counterId: fx.counterId,
      openingCash: 1000.5,
    });
    expect(opened.status).toBe(201);
    expect(opened.data).toMatchObject({
      closedAt: null,
      closedByName: null,
      counterId: fx.counterId,
      countedCash: null,
      expectedCash: null,
      handoverStock: null,
      openedBy: h.superAdmin.id,
      openingCash: 1000.5,
      status: 'OPEN',
      summary: null,
      takenOverFromId: null,
    });
    expect(shape(opened.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "closedAt": null,
          "closedByName": null,
          "countedCash": null,
          "counterId": "string",
          "expectedCash": null,
          "handoverStock": null,
          "id": "string",
          "name": null,
          "note": null,
          "openedAt": "string",
          "openedBy": "string",
          "openedByName": "string",
          "openingCash": "number",
          "status": "string",
          "summary": null,
          "takenOverFromId": null,
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    shiftId = idOf(opened.data);

    const second = await h.api('POST', '/pos/shifts', { counterId: fx.counterId, openingCash: 0 });
    expect([second.status, second.body.message]).toEqual([
      409,
      'A shift is already open at this counter. End it first.',
    ]);

    const counters = (await h.ok('GET', '/pos/counters')) as unknown as Body[];
    const c1 = counters.find((counter) => counter.id === fx.counterId);
    expect(c1?.shift).toMatchObject({ dayClosed: false, handover: null, open: { id: shiftId } });
    expect(shape(c1)).toMatchInlineSnapshot(`
      {
        "counterCode": "string",
        "counterName": "string",
        "hospital": {
          "billPrefix": "string",
          "gstApplicable": "boolean",
          "hospitalCode": "string",
          "hospitalName": "string",
          "id": "string",
        },
        "hospitalId": "string",
        "id": "string",
        "restaurant": {
          "id": "string",
          "legalName": null,
          "restaurantCode": "string",
          "restaurantName": "string",
          "staffDiscountApplicable": "boolean",
          "upiId": null,
        },
        "restaurantId": "string",
        "shift": {
          "dayClosed": "boolean",
          "elsewhere": null,
          "handover": null,
          "open": {
            "closedAt": null,
            "closedByName": null,
            "countedCash": null,
            "counterId": "string",
            "expectedCash": null,
            "handoverStock": null,
            "id": "string",
            "name": null,
            "note": null,
            "openedAt": "string",
            "openedBy": "string",
            "openedByName": "string",
            "openingCash": "number",
            "status": "string",
            "summary": null,
            "takenOverFromId": null,
          },
        },
      }
    `);
    // A request without a till key is no till: the till's counters are not for it.
    const tillKey = h.tillKey;
    h.tillKey = undefined;
    const unknownTill = await h.api('GET', `/pos/counters?till=true`);
    h.tillKey = tillKey;
    expect([unknownTill.status, String(unknownTill.body.message)]).toEqual([
      404,
      'This computer is not set up as a till. An admin opens the POS on it once and sets it up as its POS device.',
    ]);
  });

  it('menu: the counter channel and the room channel, with prices, GST and stock', async () => {
    const counterMenu = await h.api('GET', `/pos/menu?counterId=${fx.counterId}&channel=COUNTER`);
    expect(counterMenu.status).toBe(200);
    expect(shape(counterMenu.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "counter": {
            "counterCode": "string",
            "counterName": "string",
            "hospital": {
              "billPrefix": "string",
              "gstApplicable": "boolean",
              "hospitalCode": "string",
              "hospitalName": "string",
              "id": "string",
            },
            "hospitalId": "string",
            "id": "string",
            "restaurant": {
              "id": "string",
              "legalName": null,
              "restaurantCode": "string",
              "restaurantName": "string",
              "staffDiscountApplicable": "boolean",
              "upiId": null,
            },
            "restaurantId": "string",
          },
          "items": [
            {
              "availableFrom": null,
              "availableTo": null,
              "category": {
                "categoryName": "string",
                "id": "string",
                "sortOrder": "number",
              },
              "daysOfWeek": [],
              "foodType": "string",
              "gstPercent": "number",
              "id": "string",
              "isAvailable": "boolean",
              "isDiscountable": "boolean",
              "isGstInclusive": "boolean",
              "isOnSale": "boolean",
              "itemCode": "string",
              "itemId": "string",
              "itemName": "string",
              "menuItemCode": "string",
              "preparationTimeMinutes": null,
              "price": "number",
              "stock": null,
            },
          ],
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const byId = (list: Body[]) => new Map(list.map((entry) => [entry.id, entry]));
    const counterItems = byId(items(counterMenu.data));
    // Soup is served in rooms only; the sandwich keeps no stock here yet, so it is untracked.
    expect([...counterItems.keys()].sort()).toEqual([sandwich.menuId, tea.menuId].sort());
    expect(counterItems.get(sandwich.menuId)).toMatchObject({
      gstPercent: 5,
      isDiscountable: true,
      isGstInclusive: false,
      isOnSale: true,
      price: 99.9,
      stock: null,
    });
    const roomItems = byId(
      items(await h.ok('GET', `/pos/menu?counterId=${fx.counterId}&channel=ROOM`)),
    );
    expect([...roomItems.keys()].sort()).toEqual([sandwich.menuId, soup.menuId].sort());
    expect(roomItems.get(sandwich.menuId)).toMatchObject({ price: 120 });
    expect(roomItems.get(soup.menuId)).toMatchObject({ price: 180 });

    const badChannel = await h.api('GET', `/pos/menu?counterId=${fx.counterId}&channel=TAKEAWAY`);
    expect(badChannel.status).toBe(400);
    expect(badChannel.body.message).toMatchInlineSnapshot(
      `"channel must be one of the following values: COUNTER, ROOM"`,
    );
  });

  it('billing: totals, GST and round-off from the menu, in each payment mode', async () => {
    // Tea is 25 with 5% GST inside: GST is worked back out of the price, the total stays 25 each.
    const cash = await bill('cash');
    expect(cash.status).toBe(201);
    expect(cash.data).toMatchObject({
      channel: 'COUNTER',
      discountPercent: null,
      discountTotal: 0,
      grandTotal: 25,
      gstTotal: 1.2,
      isComplimentary: false,
      orderNumber: '0001',
      paymentMode: 'CASH',
      paymentReference: null,
      roundOff: 0,
      status: 'PLACED',
      subtotal: 23.8,
    });
    expect(firstOf(cash.data.lines as Body[])).toMatchObject({
      discountAmount: 0,
      gstAmount: 1.2,
      gstPercent: 5,
      hsnCode: '996331',
      isGstInclusive: true,
      lineTotal: 25,
      quantity: 1,
      taxableAmount: 23.8,
      unitPrice: 25,
    });
    expect(cash.data.billNumber).toMatch(/^[^/]+\/\d{8}$/);
    expect(cash.data.kotNumber).toMatch(new RegExp(`^${fx.counterCode}/\\d{6}/0001$`));
    expect(shape(cash.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "bedNumber": null,
          "billNumber": "string",
          "businessDate": "string",
          "cancelReason": null,
          "cancelledAt": null,
          "cashierCode": "string",
          "cashierName": "string",
          "channel": "string",
          "complimentaryReason": null,
          "counter": {
            "counterCode": "string",
            "counterName": "string",
            "id": "string",
          },
          "customerMobile": null,
          "discountPercent": null,
          "discountTotal": "number",
          "employeeCode": null,
          "grandTotal": "number",
          "gstTotal": "number",
          "hospital": {
            "address": "string",
            "city": "string",
            "hospitalName": "string",
            "id": "string",
            "state": "string",
          },
          "id": "string",
          "instructions": null,
          "isComplimentary": "boolean",
          "kotNumber": "string",
          "lines": [
            {
              "discountAmount": "number",
              "gstAmount": "number",
              "gstPercent": "number",
              "hsnCode": "string",
              "id": "string",
              "isDiscountable": "boolean",
              "isGstInclusive": "boolean",
              "itemId": "string",
              "itemName": "string",
              "lineTotal": "number",
              "menuId": "string",
              "menuItemCode": "string",
              "note": null,
              "quantity": "number",
              "taxableAmount": "number",
              "unitPrice": "number",
            },
          ],
          "orderNumber": "string",
          "paymentMode": "string",
          "paymentReference": null,
          "placedAt": "string",
          "restaurant": {
            "address": null,
            "fssaiNumber": null,
            "gstAddress": null,
            "gstNumber": null,
            "id": "string",
            "legalEntity": null,
            "legalName": null,
            "restaurantName": "string",
            "upiId": null,
          },
          "roomNumber": null,
          "roundOff": "number",
          "status": "string",
          "subtotal": "number",
        },
        "message": "string",
        "success": "boolean",
      }
    `);

    const modes = [
      ['card', 'CARD', 2, 'SLIP-77', { grandTotal: 50, gstTotal: 2.38, subtotal: 47.62 }],
      ['upi', 'UPI', 3, 'UPI-REF-1', { grandTotal: 75, gstTotal: 3.58, subtotal: 71.42 }],
      ['other', 'OTHER', 4, 'Voucher', { grandTotal: 100, gstTotal: 4.76, subtotal: 95.24 }],
    ] as const;
    for (const [name, paymentMode, quantity, paymentReference, totals] of modes) {
      const made = await bill(name, {
        lines: [{ menuId: tea.menuId, quantity }],
        paymentMode,
        paymentReference,
      });
      expect(made.status).toBe(201);
      expect(made.data).toMatchObject({ ...totals, paymentMode, paymentReference, roundOff: 0 });
    }

    // 99.90 + 5% = 104.90, and the tea 25: 129.90 rounds to 130.
    const mixed = await bill('mixed', {
      customerMobile: '9876500000',
      instructions: 'Less sugar',
      lines: [
        { menuId: sandwich.menuId, note: 'No onion', quantity: 1 },
        { menuId: tea.menuId, quantity: 1 },
      ],
    });
    expect(mixed.data).toMatchObject({
      customerMobile: '9876500000',
      grandTotal: 130,
      gstTotal: 6.2,
      instructions: 'Less sugar',
      orderNumber: '0005',
      roundOff: 0.1,
      subtotal: 123.7,
    });
    expect(
      (mixed.data.lines as Body[]).find((line) => line.menuId === sandwich.menuId),
    ).toMatchObject({ gstAmount: 5, lineTotal: 104.9, note: 'No onion', taxableAmount: 99.9 });

    // A room order: the room price, and a room number.
    const room = await bill('room', {
      bedNumber: 'B',
      channel: 'ROOM',
      lines: [{ menuId: soup.menuId, quantity: 1 }],
      roomNumber: `R${run}`,
    });
    expect(room.data).toMatchObject({
      bedNumber: 'B',
      channel: 'ROOM',
      grandTotal: 189,
      gstTotal: 9,
      orderNumber: '0006',
      roomNumber: `R${run}`,
      subtotal: 180,
    });

    // Resending a bill (double tap, retry) returns the same one.
    const resent = await bill('cash');
    expect([resent.status, idOf(resent.data)]).toEqual([201, idOf(cash.data)]);
  });

  it('billing: refuses what the counter does not sell and a bill that does not validate', async () => {
    const refusals: Array<[string, Body, number, unknown]> = [
      ['room-tea', { channel: 'ROOM', roomNumber: '1' }, 400, `${tea.name} is not sold for rooms.`],
      [
        'counter-soup',
        { lines: [{ menuId: soup.menuId, quantity: 1 }] },
        400,
        `${soup.name} is not sold for the counter.`,
      ],
      [
        'not-on-menu',
        { lines: [{ menuId: randomUUID(), quantity: 1 }] },
        400,
        'An item on this bill is not on this counter’s menu.',
      ],
      [
        'unknown-counter',
        { counterId: randomUUID() },
        404,
        'Counter not found, or it is switched off.',
      ],
      ['no-room', { channel: 'ROOM' }, 400, undefined],
      ['no-mode', { paymentMode: undefined }, 400, undefined],
      ['credit', { paymentMode: 'CREDIT' }, 400, undefined],
      ['bad-mobile', { customerMobile: '12345' }, 400, undefined],
      ['zero', { lines: [{ menuId: tea.menuId, quantity: 0 }] }, 400, undefined],
      ['empty', { lines: [] }, 400, undefined],
    ];
    const messages: Record<string, unknown> = {};
    for (const [name, body, status, message] of refusals) {
      const refused = await bill(name, body);
      expect([name, refused.status]).toEqual([name, status]);
      if (message) expect(refused.body.message).toBe(message);
      else messages[name] = refused.body.message;
    }
    expect(messages).toMatchInlineSnapshot(`
      {
        "bad-mobile": "customerMobile must be a 10-digit Indian mobile number",
        "credit": "paymentMode must be one of the following values: CARD, UPI, CASH, OTHER",
        "empty": "lines must contain at least 1 elements",
        "no-mode": "paymentMode must be one of the following values: CARD, UPI, CASH, OTHER",
        "no-room": "roomNumber must be shorter than or equal to 20 characters, roomNumber must be a string",
        "zero": "lines.0.quantity must not be less than 1",
      }
    `);

    // Sold out at the till: the menu says so and the bill is refused, until it is back on.
    const off = await h.api('PATCH', `/pos/menu/${tea.menuId}/availability`, {
      isAvailable: false,
    });
    expect([off.status, off.data]).toEqual([200, { id: tea.menuId, isAvailable: false }]);
    const menu = items(await h.ok('GET', `/pos/menu?counterId=${fx.counterId}&channel=COUNTER`));
    expect(menu.find((entry) => entry.id === tea.menuId)).toMatchObject({
      isAvailable: false,
      isOnSale: false,
    });
    const soldOut = await bill('sold-out');
    expect([soldOut.status, soldOut.body.message]).toEqual([
      400,
      `${tea.name} is not available right now.`,
    ]);
    await h.ok('PATCH', `/pos/menu/${tea.menuId}/availability`, { isAvailable: true });
    const missingMenu = await h.api('PATCH', `/pos/menu/${randomUUID()}/availability`, {
      isAvailable: true,
    });
    expect([missingMenu.status, missingMenu.body.message]).toEqual([404, 'Menu item not found.']);

    // Refused bills used no order number: the next is the seventh.
    const next = await bill('after-refusals');
    expect(next.data.orderNumber).toBe('0007');
    // Cancelled straight away, so the day's figures below stay simple.
    await h.ok('PATCH', `/pos/orders/${idOf(next.data)}/cancel`, { reason: 'Test' });
  });

  it('counter stock: received by transfer, sold earliest expiry first, expired skipped, put back on cancel', async () => {
    // Three batches into the store (GRN), sent to the counter and acknowledged there.
    const batches = [
      ['EXP', 4, day(5)],
      ['SOON', 3, day(10)],
      ['LATE', 5, day(30)],
    ] as const;
    const grn = await h.ok('POST', '/grns', {
      hospitalId: fx.hospitalId,
      items: [
        {
          acceptedQty: 12,
          batches: batches.map(([label, qty, expiryDate]) => ({
            acceptedQty: qty,
            batchNumber: `${label}-${run}`,
            expiryDate,
            receivedQty: qty,
            rejectedQty: 0,
          })),
          itemId: sandwich.itemId,
          receivedQty: 12,
          rejectedQty: 0,
        },
      ],
      receivedBy: 'Int Pos',
      receivedDate: today,
      storeId: fx.storeId,
      vendorName: `Vendor ${run}`,
    });
    await h.ok('PATCH', `/grns/${idOf(grn)}/post-to-stock`);
    const transfer = await h.ok('POST', '/transfers', {
      businessDate: today,
      destinationId: fx.counterId,
      destinationType: 'COUNTER',
      hospitalId: fx.hospitalId,
      items: batches.map(([label, qty, expiryDate]) => ({
        batchNumber: `${label}-${run}`,
        expiryDate,
        itemId: sandwich.itemId,
        sentQty: qty,
      })),
      sourceId: fx.storeId,
      sourceType: 'STORE',
      transferDate: new Date().toISOString(),
    });
    const sent = await h.ok('PATCH', `/transfers/${idOf(transfer)}/dispatch`);
    await h.ok('POST', '/transfer-acknowledgements', {
      items: (sent.lines as Body[]).map((line) => ({
        acceptedQty: Number(line.sentQty),
        rejectedQty: 0,
        transferLineId: idOf(line),
      })),
      transferId: idOf(sent),
    });
    expect(await counterBatches(fx.counterId, sandwich.itemId)).toEqual({
      EXP: 4,
      LATE: 5,
      SOON: 3,
    });
    // One batch runs out of date at the counter (a GRN will not take an expired batch).
    await h.rawQuery(
      `UPDATE stock_balances SET expiry_date = $1::date
       WHERE location_id = $2::uuid AND batch_number = $3 AND location_type = 'COUNTER'`,
      day(-1),
      fx.counterId,
      `EXP-${run}`,
    );

    const menu = items(await h.ok('GET', `/pos/menu?counterId=${fx.counterId}&channel=COUNTER`));
    expect(menu.find((entry) => entry.id === sandwich.menuId)?.stock).toBe(8);

    const tooMany = await bill('sandwich-9', {
      lines: [{ menuId: sandwich.menuId, quantity: 9 }],
    });
    expect([tooMany.status, tooMany.body.message]).toEqual([
      400,
      `Only 8 of ${sandwich.name} left at this counter; receive more stock or take it off the bill.`,
    ]);

    // 4 x 99.90 = 399.60 + 19.98 GST = 419.58, rounds to 420. Taken from SOON (3), then LATE (1).
    const sold = await bill('sandwich-4', {
      lines: [{ menuId: sandwich.menuId, quantity: 4 }],
      paymentMode: 'UPI',
    });
    expect(sold.status).toBe(201);
    expect(sold.data).toMatchObject({ grandTotal: 420, gstTotal: 19.98, roundOff: 0.42 });
    expect(await ledgerOf(sandwich.itemId, idOf(sold.data))).toEqual([
      ['LATE', 'SALE_OUT', 0, 1, 4],
      ['SOON', 'SALE_OUT', 0, 3, 0],
    ]);
    expect(await counterBatches(fx.counterId, sandwich.itemId)).toEqual({
      EXP: 4,
      LATE: 4,
      SOON: 0,
    });

    // Cancelling puts each batch back where it came from.
    const cancelled = await h.api('PATCH', `/pos/orders/${idOf(sold.data)}/cancel`, {
      reason: ' Guest changed mind ',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data).toMatchObject({
      cancelReason: 'Guest changed mind',
      status: 'CANCELLED',
    });
    expect(typeof cancelled.data.cancelledAt).toBe('string');
    expect(await counterBatches(fx.counterId, sandwich.itemId)).toEqual({
      EXP: 4,
      LATE: 5,
      SOON: 3,
    });
    expect(await ledgerOf(sandwich.itemId, idOf(sold.data))).toEqual([
      ['LATE', 'SALE_CANCEL_IN', 1, 0, 5],
      ['LATE', 'SALE_OUT', 0, 1, 4],
      ['SOON', 'SALE_CANCEL_IN', 3, 0, 3],
      ['SOON', 'SALE_OUT', 0, 3, 0],
    ]);
  });

  it('staff discount: the rule for the employee type, off discountable items before GST', async () => {
    const rates = await h.api('GET', `/pos/staff-discounts/${fx.restaurantId}`);
    expect(rates.data).toEqual({
      rates: [
        { discountPercent: 0, employmentType: 'ON_ROLL' },
        { discountPercent: 0, employmentType: 'OUTSOURCED' },
      ],
      restaurantId: fx.restaurantId,
      restaurantName: expect.any(String) as unknown,
      staffDiscountApplicable: true,
    });
    const missing = await h.api('GET', `/pos/staff-discounts/${randomUUID()}`);
    expect([missing.status, missing.body.message]).toEqual([404, 'Restaurant not found.']);

    const lookup = (code: string) =>
      h.api('GET', `/pos/employee?counterId=${fx.counterId}&code=${encodeURIComponent(code)}`);
    const onRoll = await lookup(` ${staff.onRoll.toLowerCase()} `);
    expect(onRoll.status).toBe(200);
    expect(onRoll.data).toMatchObject({
      discountPercent: 10,
      employeeCode: staff.onRoll,
      employmentType: 'ON_ROLL',
    });
    // Only what the till shows.
    expect(shape(onRoll.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "discountName": "string",
          "discountPercent": "number",
          "employeeCode": "string",
          "employeeName": "string",
          "employmentType": "string",
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    // No rule for outsourced staff here; an ineligible employee gets none either.
    expect((await lookup(staff.outsourced)).data).toMatchObject({
      discountName: null,
      discountPercent: 0,
    });
    expect((await lookup(staff.ineligible)).data).toMatchObject({ discountPercent: 0 });
    const nobody = await lookup('NOBODY');
    expect([nobody.status, nobody.body.message]).toEqual([
      400,
      'No active employee with ID NOBODY.',
    ]);
    expect((await lookup('  ')).status).toBe(400);

    // Sandwich 99.90 - 10% = 89.91, GST 2 x 2.25 = 4.50; tea is not discountable: 25.
    // 123.70 - 9.99 + 5.70 = 119.41, rounds to 119. One sandwich comes from SOON.
    const staffBill = await bill('staff', {
      employeeCode: staff.onRoll,
      lines: [
        { menuId: sandwich.menuId, quantity: 1 },
        { menuId: tea.menuId, quantity: 1 },
      ],
    });
    expect(staffBill.status).toBe(201);
    expect(staffBill.data).toMatchObject({
      discountPercent: 10,
      discountTotal: 9.99,
      employeeCode: staff.onRoll,
      grandTotal: 119,
      gstTotal: 5.7,
      roundOff: -0.41,
      subtotal: 123.7,
    });
    const lineOf = (menuId: string) =>
      (staffBill.data.lines as Body[]).find((line) => line.menuId === menuId);
    expect(lineOf(sandwich.menuId)).toMatchObject({
      discountAmount: 9.99,
      gstAmount: 4.5,
      lineTotal: 94.41,
      taxableAmount: 89.91,
    });
    expect(lineOf(tea.menuId)).toMatchObject({ discountAmount: 0, lineTotal: 25 });

    // No discount for an outsourced employee: the code is kept, the price is the menu's.
    const outsourced = await bill('outsourced', {
      employeeCode: staff.outsourced,
      paymentMode: 'CARD',
    });
    expect(outsourced.data).toMatchObject({
      discountPercent: null,
      discountTotal: 0,
      employeeCode: staff.outsourced,
      grandTotal: 25,
    });
    const unknown = await bill('unknown-staff', { employeeCode: 'NOBODY' });
    expect([unknown.status, unknown.body.message]).toEqual([
      400,
      'No active employee with ID NOBODY.',
    ]);
  });

  it('complimentary: needs a reason, is free of payment mode and discount', async () => {
    const noReason = await bill('comp-no-reason', {
      isComplimentary: true,
      paymentMode: undefined,
    });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toMatchInlineSnapshot(
      `"complimentaryReason must be shorter than or equal to 200 characters, complimentaryReason must be a string"`,
    );

    // An employee code is checked as on a paid bill, but brings no discount.
    const nobody = await bill('comp-nobody', {
      complimentaryReason: 'Duty doctor',
      employeeCode: 'NOBODY',
      isComplimentary: true,
    });
    expect([nobody.status, nobody.body.message]).toEqual([
      400,
      'No active employee with ID NOBODY.',
    ]);

    // A payment mode sent with it is dropped.
    const comp = await bill('comp', {
      complimentaryReason: 'Duty doctor',
      employeeCode: staff.onRoll,
      isComplimentary: true,
      paymentMode: 'CARD',
      paymentReference: 'SLIP-9',
    });
    expect(comp.status).toBe(201);
    expect(comp.data).toMatchObject({
      complimentaryReason: 'Duty doctor',
      discountTotal: 0,
      employeeCode: staff.onRoll,
      grandTotal: 25,
      isComplimentary: true,
      paymentMode: null,
      paymentReference: null,
      status: 'PLACED',
    });
  });

  it('cancel: needs a reason, refuses an unknown bill and a second cancel', async () => {
    const card = firstOf(
      items(await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&paymentMode=CARD`)).filter(
        (order) => order.grandTotal === 50,
      ),
    );
    const blank = await h.api('PATCH', `/pos/orders/${idOf(card)}/cancel`, { reason: '   ' });
    expect([blank.status, blank.body.message]).toEqual([400, 'reason is required']);
    const unknown = await h.api('PATCH', `/pos/orders/${randomUUID()}/cancel`, { reason: 'x' });
    expect([unknown.status, unknown.body.message]).toEqual([404, 'Bill not found.']);
    expect((await h.api('PATCH', '/pos/orders/not-a-uuid/cancel', { reason: 'x' })).status).toBe(
      400,
    );

    const cancelled = await h.api('PATCH', `/pos/orders/${idOf(card)}/cancel`, {
      reason: 'Refund',
    });
    expect(cancelled.data).toMatchObject({ cancelReason: 'Refund', status: 'CANCELLED' });
    const twice = await h.api('PATCH', `/pos/orders/${idOf(card)}/cancel`, { reason: 'Refund' });
    expect([twice.status, twice.body.message]).toEqual([409, 'This bill is already cancelled.']);
  });

  it('lookups: one bill with its lines, and the list with its filters', async () => {
    const list = await h.api('GET', `/pos/orders?counterId=${fx.counterId}&limit=100`);
    expect(list.status).toBe(200);
    expect(shape(list.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "items": [
            {
              "billNumber": "string",
              "businessDate": "string",
              "cancelReason": null,
              "channel": "string",
              "complimentaryReason": "string",
              "counter": {
                "counterCode": "string",
                "counterName": "string",
                "id": "string",
              },
              "customerMobile": null,
              "discountPercent": null,
              "discountTotal": "number",
              "employeeCode": "string",
              "grandTotal": "number",
              "gstTotal": "number",
              "id": "string",
              "instructions": null,
              "isComplimentary": "boolean",
              "itemCount": "number",
              "items": [
                {
                  "name": "string",
                  "quantity": "number",
                },
              ],
              "lineCount": "number",
              "orderNumber": "string",
              "paymentMode": null,
              "paymentReference": null,
              "placedAt": "string",
              "restaurant": {
                "id": "string",
                "restaurantName": "string",
              },
              "roomNumber": null,
              "status": "string",
              "subtotal": "number",
            },
          ],
          "meta": {
            "limit": "number",
            "page": "number",
            "total": "number",
            "totalPages": "number",
          },
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const all = items(list.data);
    // cash, card, upi, other, mixed, room, after-refusals, sandwich-4, staff, outsourced, comp.
    expect(all).toHaveLength(11);
    expect((list.data.meta as Body).total).toBe(11);
    const room = firstOf(all.filter((order) => order.channel === 'ROOM'));
    expect(room).toMatchObject({ itemCount: 1, lineCount: 1, roomNumber: `R${run}` });

    const detail = await h.api('GET', `/pos/orders/${idOf(room)}`);
    expect(detail.status).toBe(200);
    expect(detail.data).toMatchObject({
      billNumber: room.billNumber,
      counter: { id: fx.counterId },
      restaurant: { id: fx.restaurantId },
    });
    expect(typeof detail.data.cashierName).toBe('string');
    expect(shape(detail.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "bedNumber": "string",
          "billNumber": "string",
          "businessDate": "string",
          "cancelReason": null,
          "cancelledAt": null,
          "cashierCode": "string",
          "cashierName": "string",
          "channel": "string",
          "complimentaryReason": null,
          "counter": {
            "counterCode": "string",
            "counterName": "string",
            "id": "string",
          },
          "customerMobile": null,
          "discountPercent": null,
          "discountTotal": "number",
          "employeeCode": null,
          "grandTotal": "number",
          "gstTotal": "number",
          "hospital": {
            "address": "string",
            "city": "string",
            "hospitalName": "string",
            "id": "string",
            "state": "string",
          },
          "id": "string",
          "instructions": null,
          "isComplimentary": "boolean",
          "kotNumber": "string",
          "lines": [
            {
              "discountAmount": "number",
              "gstAmount": "number",
              "gstPercent": "number",
              "hsnCode": "string",
              "id": "string",
              "isDiscountable": "boolean",
              "isGstInclusive": "boolean",
              "itemId": "string",
              "itemName": "string",
              "lineTotal": "number",
              "menuId": "string",
              "menuItemCode": "string",
              "note": null,
              "quantity": "number",
              "taxableAmount": "number",
              "unitPrice": "number",
            },
          ],
          "orderNumber": "string",
          "paymentMode": "string",
          "paymentReference": null,
          "placedAt": "string",
          "restaurant": {
            "address": null,
            "fssaiNumber": null,
            "gstAddress": null,
            "gstNumber": null,
            "id": "string",
            "legalEntity": null,
            "legalName": null,
            "restaurantName": "string",
            "upiId": null,
          },
          "roomNumber": "string",
          "roundOff": "number",
          "status": "string",
          "subtotal": "number",
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const missing = await h.api('GET', `/pos/orders/${randomUUID()}`);
    expect([missing.status, missing.body.message]).toEqual([404, 'Bill not found.']);
    expect((await h.api('GET', '/pos/orders/not-a-uuid')).status).toBe(400);

    const count = async (query: string) =>
      ((await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&limit=100&${query}`)).meta as Body)
        .total;
    const businessDate = String(room.businessDate).slice(0, 10);
    expect({
      cancelled: await count('status=CANCELLED'),
      card: await count('paymentMode=CARD'),
      cash: await count('paymentMode=CASH'),
      comp: await count('isComplimentary=true'),
      dayAfter: await count(`from=${day(2)}`),
      notComp: await count('isComplimentary=false'),
      onTheDay: await count(`from=${businessDate}&to=${businessDate}`),
      room: await count('channel=ROOM'),
      searchBill: await count(`search=${encodeURIComponent(String(room.billNumber))}`),
      searchRoom: await count(`search=R${run}`),
      staff: await count(`search=${staff.onRoll.toLowerCase()}`),
    }).toEqual({
      cancelled: 3,
      card: 2,
      cash: 5,
      comp: 1,
      dayAfter: 0,
      notComp: 10,
      onTheDay: 11,
      room: 1,
      searchBill: 1,
      searchRoom: 1,
      // The staff-discount bill and the complimentary one.
      staff: 2,
    });

    const byTotal = items(
      await h.ok(
        'GET',
        `/pos/orders?counterId=${fx.counterId}&limit=100&sortBy=grandTotal&sortOrder=asc`,
      ),
    ).map((order) => order.grandTotal as number);
    expect(byTotal).toEqual([...byTotal].sort((a, b) => a - b));
    const page = await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&limit=4&page=3`);
    expect([items(page).length, page.meta]).toMatchInlineSnapshot(`
      [
        3,
        {
          "limit": 4,
          "page": 3,
          "total": 11,
          "totalPages": 3,
        },
      ]
    `);

    for (const query of [
      'sortBy=cashier',
      'isComplimentary=maybe',
      'status=LOST',
      'from=yesterday',
    ]) {
      expect([query, (await h.api('GET', `/pos/orders?${query}`)).status]).toEqual([query, 400]);
    }
  });

  it("the day's takings, the shift's cash count, and closing the day", async () => {
    // Takings: cancelled and complimentary bills kept apart from sales.
    // CASH: tea 25, mixed 130, room 189, staff 119 = 463 (4); UPI 75; OTHER 100; CARD (outsourced) 25.
    // Cancelled: card 50, after-refusals 25, sandwich-4 420. Complimentary: 25.
    const summary = await h.api('GET', `/pos/summary?counterId=${fx.counterId}`);
    expect(summary.status).toBe(200);
    const byMode = (list: unknown) =>
      [...(list as Body[])].sort((a, b) => String(a.mode).localeCompare(String(b.mode)));
    const takings = {
      bills: 7,
      byPaymentMode: [
        { amount: 25, count: 1, mode: 'CARD' },
        { amount: 463, count: 4, mode: 'CASH' },
        { amount: 100, count: 1, mode: 'OTHER' },
        { amount: 75, count: 1, mode: 'UPI' },
      ],
      cancelled: { amount: 495, count: 3 },
      complimentary: { amount: 25, count: 1 },
      sales: 663,
    };
    expect({
      ...summary.data,
      byPaymentMode: byMode(summary.data.byPaymentMode),
    }).toMatchObject({ ...takings, dayClose: null });
    expect((summary.data.shifts as Body[]).map((shift) => [shift.id, shift.status])).toEqual([
      [shiftId, 'OPEN'],
    ]);
    expect(shape(summary.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "bills": "number",
          "byPaymentMode": [
            {
              "amount": "number",
              "count": "number",
              "mode": "string",
            },
          ],
          "cancelled": {
            "amount": "number",
            "count": "number",
          },
          "complimentary": {
            "amount": "number",
            "count": "number",
          },
          "counter": {
            "counterCode": "string",
            "counterName": "string",
            "hospital": {
              "billPrefix": "string",
              "gstApplicable": "boolean",
              "hospitalCode": "string",
              "hospitalName": "string",
              "id": "string",
            },
            "hospitalId": "string",
            "id": "string",
            "restaurant": {
              "id": "string",
              "legalName": null,
              "restaurantCode": "string",
              "restaurantName": "string",
              "staffDiscountApplicable": "boolean",
              "upiId": null,
            },
            "restaurantId": "string",
          },
          "date": "string",
          "dayClose": null,
          "sales": "number",
          "shifts": [
            {
              "closedAt": null,
              "closedByName": null,
              "countedCash": null,
              "counterId": "string",
              "expectedCash": null,
              "handoverStock": null,
              "id": "string",
              "name": null,
              "note": null,
              "openedAt": "string",
              "openedBy": "string",
              "openedByName": "string",
              "openingCash": "number",
              "status": "string",
              "summary": null,
              "takenOverFromId": null,
            },
          ],
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const date = String(summary.data.date);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Stock for the day: sandwich received 12 (when the transfer's day is the site's day), sold 4,
    // 4 back, then 1: 7 sellable (the expired 4 are not). Tea and soup keep no stock here.
    const stock = await h.api('GET', `/pos/stock-summary?counterId=${fx.counterId}&date=${date}`);
    expect(stock.status).toBe(200);
    expect(shape(stock.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "counter": {
            "counterCode": "string",
            "counterName": "string",
            "hospital": {
              "billPrefix": "string",
              "gstApplicable": "boolean",
              "hospitalCode": "string",
              "hospitalName": "string",
              "id": "string",
            },
            "hospitalId": "string",
            "id": "string",
            "restaurant": {
              "id": "string",
              "legalName": null,
              "restaurantCode": "string",
              "restaurantName": "string",
              "staffDiscountApplicable": "boolean",
              "upiId": null,
            },
            "restaurantId": "string",
          },
          "date": "string",
          "items": [
            {
              "available": "number",
              "consumed": "number",
              "isTracked": "boolean",
              "itemCode": "string",
              "itemId": "string",
              "itemName": "string",
              "received": "number",
            },
          ],
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const stockOf = (itemId: string) =>
      (stock.data.items as Body[]).find((entry) => entry.itemId === itemId);
    expect(stockOf(sandwich.itemId)).toMatchObject({
      available: 7,
      consumed: 1,
      isTracked: true,
      received: date === today ? 12 : 0,
    });
    expect(stockOf(tea.itemId)).toMatchObject({ available: 0, consumed: 0, isTracked: false });
    expect(stockOf(soup.itemId)).toMatchObject({ isTracked: false });

    // Ending the shift: only its cashier or an admin, with the cash counted. Expected cash is the
    // opening cash plus the shift's cash sales; the till is 13.50 short.
    const notYours = await h.api(
      'PATCH',
      `/pos/shifts/${shiftId}/end`,
      { countedCash: 0, handover: false },
      users.cashier,
    );
    expect([notYours.status, notYours.body.message]).toEqual([
      403,
      'Only the cashier who opened this shift, or an admin, can end it.',
    ]);
    for (const body of [{ countedCash: -1, handover: false }, { countedCash: 10 }]) {
      expect((await h.api('PATCH', `/pos/shifts/${shiftId}/end`, body)).status).toBe(400);
    }
    const unknown = await h.api('PATCH', `/pos/shifts/${randomUUID()}/end`, {
      countedCash: 0,
      handover: false,
    });
    expect([unknown.status, unknown.body.message]).toEqual([404, 'Shift not found.']);

    const ended = await h.api('PATCH', `/pos/shifts/${shiftId}/end`, {
      countedCash: 1450,
      handover: false,
      note: ' Short by 13.50 ',
    });
    expect(ended.status).toBe(200);
    expect(ended.data).toMatchObject({
      countedCash: 1450,
      expectedCash: 1463.5,
      handoverStock: null,
      note: 'Short by 13.50',
      openingCash: 1000.5,
      status: 'CLOSED',
    });
    expect((ended.data.countedCash as number) - (ended.data.expectedCash as number)).toBe(-13.5);
    expect({
      ...(ended.data.summary as Body),
      byPaymentMode: byMode((ended.data.summary as Body).byPaymentMode),
    }).toEqual(takings);
    expect(shape(ended.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "closedAt": "string",
          "closedByName": "string",
          "countedCash": "number",
          "counterId": "string",
          "expectedCash": "number",
          "handoverStock": null,
          "id": "string",
          "name": null,
          "note": "string",
          "openedAt": "string",
          "openedBy": "string",
          "openedByName": "string",
          "openingCash": "number",
          "status": "string",
          "summary": {
            "bills": "number",
            "byPaymentMode": [
              {
                "amount": "number",
                "count": "number",
                "mode": "string",
              },
            ],
            "cancelled": {
              "amount": "number",
              "count": "number",
            },
            "complimentary": {
              "amount": "number",
              "count": "number",
            },
            "sales": "number",
          },
          "takenOverFromId": null,
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const again = await h.api('PATCH', `/pos/shifts/${shiftId}/end`, {
      countedCash: 0,
      handover: false,
    });
    expect([again.status, again.body.message]).toEqual([409, 'This shift has already ended.']);
    const afterEnd = await bill('after-end');
    expect([afterEnd.status, afterEnd.body.message]).toEqual([
      400,
      'Open a shift at this counter before billing.',
    ]);

    // Closing the day: not ahead of time, not by a cashier, once only. Its bills are then final.
    const ahead = await h.api('POST', '/pos/day-closes', { counterId: fx.counterId, date: day(3) });
    expect([ahead.status, ahead.body.message]).toEqual([
      400,
      'A day can only be closed once it has started.',
    ]);
    expect(
      (await h.api('POST', '/pos/day-closes', { counterId: fx.counterId }, users.cashier)).status,
    ).toBe(403);
    const closed = await h.api('POST', '/pos/day-closes', { counterId: fx.counterId });
    expect(closed.status).toBe(201);
    expect(closed.data).toMatchObject({
      businessDate: date,
      closedByName: expect.any(String) as unknown,
    });
    expect(shape(closed.body)).toMatchInlineSnapshot(`
      {
        "data": {
          "businessDate": "string",
          "closedAt": "string",
          "closedByName": "string",
        },
        "message": "string",
        "success": "boolean",
      }
    `);
    const twice = await h.api('POST', '/pos/day-closes', { counterId: fx.counterId });
    expect([twice.status, twice.body.message]).toEqual([
      409,
      'This day is already closed at this counter.',
    ]);
    expect((await h.ok('GET', `/pos/summary?counterId=${fx.counterId}`)).dayClose).toMatchObject({
      closedByName: closed.data.closedByName,
    });
    const room = firstOf(
      items(await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&channel=ROOM`)),
    );
    const late = await h.api('PATCH', `/pos/orders/${idOf(room)}/cancel`, { reason: 'Late' });
    expect([late.status, late.body.message]).toEqual([
      409,
      'This bill’s day is closed at its counter, so it can no longer be cancelled.',
    ]);
  });

  it('kiosk: the menu opens only with the restaurant’s board link', async () => {
    const link = await h.ok('POST', `/restaurants/${fx.restaurantId}/board-link`, {
      regenerate: false,
    });
    boardToken = link.boardToken as string;
    const kiosk = `/kiosk/${fx.restaurantId}`;

    const noToken = await h.api('GET', `${kiosk}/menu`, undefined, '');
    expect([noToken.status, noToken.body.message]).toEqual([
      404,
      'This kiosk link is no longer valid.',
    ]);
    const menu = await h.api('GET', `${kiosk}/menu?token=${boardToken}`, undefined, '');
    expect(menu.status).toBe(200);
    expect(menu.data).toMatchObject({ open: false, payWith: [], staffDiscount: true });
    expect(
      items(menu.data)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual([sandwich.menuId, tea.menuId].sort());
    expect(shape(menu.body)).toMatchInlineSnapshot(`
      {
        "data": {
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
          "open": "boolean",
          "payWith": [],
          "restaurantName": "string",
          "staffDiscount": "boolean",
        },
        "message": "string",
        "success": "boolean",
      }
    `);
  });

  it('a cashier: bills at any counter of their location, not elsewhere; admin actions refused', async () => {
    const cashier = as(users.cashier);

    // Every counter of the location is theirs, whichever restaurant; none of another location.
    const counters = (await cashier.api('GET', '/pos/counters')).data as unknown as Body[];
    const ids = counters.map((counter) => counter.id);
    expect(ids).toEqual(expect.arrayContaining([fx.counterId, fx.counter2Id, fx.counter3Id]));
    expect(ids).not.toContain(fx.otherCounterId);
    for (const [method, path, body] of [
      ['GET', `/pos/menu?counterId=${fx.otherCounterId}&channel=COUNTER`],
      ['POST', '/pos/shifts', { counterId: fx.otherCounterId, openingCash: 0 }],
      ['GET', `/pos/summary?counterId=${fx.otherCounterId}`],
      ['GET', `/pos/stock-summary?counterId=${fx.otherCounterId}`],
      [
        'POST',
        '/pos/orders',
        {
          channel: 'COUNTER',
          clientOrderId: `far-${run}`,
          counterId: fx.otherCounterId,
          lines: [{ menuId: tea.menuId, quantity: 1 }],
          paymentMode: 'CASH',
        },
      ],
    ] as Array<[string, string, Body?]>) {
      const refused = await cashier.api(method, path, body);
      // Another location's counter is not this till's either.
      expect([path, refused.status, refused.body.message]).toEqual([
        path,
        403,
        'That is not this till’s counter. A till works only at the counters of its POS device’s restaurants.',
      ]);
    }
    const elsewhere = await cashier.api('GET', `/pos/orders?hospitalId=${fx.otherHospitalId}`);
    expect([elsewhere.status, elsewhere.body.message]).toEqual([
      403,
      'This location is outside your assigned access',
    ]);
    // ...while the Super Admin reaches the other location's counter (from the dashboard: no till).
    const tillKey = h.tillKey;
    h.tillKey = undefined;
    expect((await h.api('GET', `/pos/summary?counterId=${fx.otherCounterId}`)).status).toBe(200);
    h.tillKey = tillKey;

    // By design any cashier of the location works any of its counters; each counter serves one
    // restaurant, so its menu and stock stay that restaurant's.
    const shift = await cashier.api('POST', '/pos/shifts', {
      counterId: fx.counter2Id,
      openingCash: 200,
    });
    expect(shift.status).toBe(201);
    expect(shift.data).toMatchObject({ openedBy: users.cashierId, takenOverFromId: null });
    const sale = await bill('cashier', { counterId: fx.counter2Id }, users.cashier);
    expect(sale.status).toBe(201);
    expect(sale.data).toMatchObject({ cashierName: `Int POS Cashier ${run}`, grandTotal: 25 });
    // Room orders are theirs to bill; complimentary meals, cancelling and day close are not.
    const room = await bill(
      'cashier-room',
      {
        channel: 'ROOM',
        counterId: fx.counter2Id,
        lines: [{ menuId: soup.menuId, quantity: 1 }],
        roomNumber: '310',
      },
      users.cashier,
    );
    expect(room.status).toBe(201);
    const comp = await bill(
      'cashier-comp',
      { complimentaryReason: 'Duty doctor', counterId: fx.counter2Id, isComplimentary: true },
      users.cashier,
    );
    expect([comp.status, comp.body.message]).toEqual([
      403,
      'You cannot approve a complimentary meal.',
    ]);
    for (const [method, path, body] of [
      ['PATCH', `/pos/orders/${idOf(sale.data)}/cancel`, { reason: 'x' }],
      ['POST', '/pos/day-closes', { counterId: fx.counter2Id }],
      [
        'PUT',
        `/pos/staff-discounts/${fx.restaurantId}`,
        { rates: [], staffDiscountApplicable: false },
      ],
    ] as Array<[string, string, Body]>) {
      expect([path, (await cashier.api(method, path, body)).status]).toEqual([path, 403]);
    }
    // They read the other counter's bills at their location.
    const c1Bills = await cashier.api('GET', `/pos/orders?counterId=${fx.counterId}&limit=1`);
    expect([c1Bills.status, (c1Bills.data.meta as Body).total]).toEqual([200, 11]);

    // Ending their own shift, handing it over: the stock goes with it (none kept here).
    const ended = await cashier.api('PATCH', `/pos/shifts/${idOf(shift.data)}/end`, {
      countedCash: 225,
      handover: true,
    });
    expect(ended.status).toBe(200);
    expect(ended.data).toMatchObject({
      countedCash: 225,
      expectedCash: 414,
      handoverStock: [],
      status: 'HANDED_OVER',
    });
  });

  it('orders & reports: each bill with its steps and flags; an admin amends the payment mode within 48 hours', async () => {
    // A cash bill the kitchen takes through every step: each step's time is kept.
    const [cash] = items(
      await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&paymentMode=CASH&status=PLACED`),
    ).filter((order) => !order.isComplimentary);
    const cashId = idOf(cash!);
    for (const status of ['PREPARING', 'READY', 'COLLECTED']) {
      await as(users.kitchen).api('PATCH', `/restaurant-orders/${cashId}/status`, { status });
    }

    const report = await h.ok(
      'GET',
      `/order-reports?hospitalId=${fx.hospitalId}&restaurantId=${fx.restaurantId}&search=${cash!.billNumber as string}`,
    );
    const row = firstOf(items(report));
    expect(row).toMatchObject({
      accepted: true,
      billNumber: cash!.billNumber,
      cancelled: false,
      delivered: true,
      erpSent: false,
      finalStatus: 'Paid',
      ihc: false,
      online: false,
      paid: true,
      paymentMode: 'CASH',
      posOrder: true,
      ready: true,
      refunded: false,
    });
    expect(row.acceptedAt).toEqual(expect.any(String));
    expect(row.deliveredAt).toEqual(expect.any(String));
    expect(typeof (row.posDevice as Body).code).toBe('string');

    // Filters: complimentary only, and discounted / not discounted.
    const comp = items(
      await h.ok('GET', `/order-reports?restaurantId=${fx.restaurantId}&isComplimentary=true`),
    );
    expect(comp.length).toBeGreaterThan(0);
    expect(comp.every((order) => order.ihc === true)).toBe(true);
    const discounted = items(
      await h.ok('GET', `/order-reports?restaurantId=${fx.restaurantId}&discounted=true&limit=100`),
    );
    expect(discounted.length).toBeGreaterThan(0);
    expect(discounted.every((order) => order.discounted === true)).toBe(true);
    const operators = (await h.ok('GET', `/order-reports/operators?hospitalId=${fx.hospitalId}`))
      .items as Body[];
    expect(operators.map((operator) => operator.id)).toContain(users.cashierId);

    // The invoice, from the portal: no till needed.
    expect(await h.ok('GET', `/order-reports/${cashId}/bill`)).toMatchObject({
      billNumber: cash!.billNumber,
      id: cashId,
    });

    // Find by bill number or order number (within the last 48 hours), then amend: cash to UPI.
    const found = items(
      await h.ok(
        'GET',
        `/order-reports/amendable?q=${encodeURIComponent(cash!.billNumber as string)}`,
      ),
    );
    expect(found.map((bill) => [bill.id, bill.refusal])).toEqual([[cashId, null]]);
    const byOrderNumber = items(
      await h.ok('GET', `/order-reports/amendable?q=${cash!.orderNumber as string}`),
    );
    expect(byOrderNumber.map((bill) => bill.id)).toContain(cashId);

    const amend = (id: string, body: Body, token?: string) =>
      h.api('POST', `/order-reports/${id}/amendments`, body, token);
    const noRef = await amend(cashId, { paymentMode: 'UPI', remarks: 'cash to upi' });
    expect([noRef.status, noRef.body.message]).toEqual([
      409,
      'Enter the transaction ID for a UPI or card payment.',
    ]);
    const noRemarks = await amend(cashId, {
      paymentMode: 'UPI',
      paymentReference: 'T1',
      remarks: ' ',
    });
    expect(noRemarks.status).toBe(400);
    const amended = await amend(cashId, {
      paymentMode: 'UPI',
      paymentReference: `UPI-${run}`,
      remarks: 'cash to upi',
    });
    expect(amended.status).toBe(201);
    expect(await h.ok('GET', `/order-reports/${cashId}/bill`)).toMatchObject({
      paymentMode: 'UPI',
      paymentReference: `UPI-${run}`,
    });
    const list = items(
      await h.ok(
        'GET',
        `/order-reports/amendments?search=${encodeURIComponent(cash!.billNumber as string)}`,
      ),
    );
    const listedAmendment = firstOf(list);
    expect(listedAmendment).toMatchObject({
      billNumber: cash!.billNumber,
      fromPaymentMode: 'CASH',
      orderNumber: cash!.orderNumber,
      remarks: 'cash to upi',
      toPaymentMode: 'UPI',
      type: 'PAYMENT_MODE',
    });
    expect(typeof listedAmendment.amendedByName).toBe('string');

    // Back to cash: its transaction ID goes with it.
    await amend(cashId, { paymentMode: 'CASH', paymentReference: 'ignored', remarks: 'back' });
    expect(await h.ok('GET', `/order-reports/${cashId}/bill`)).toMatchObject({
      paymentMode: 'CASH',
      paymentReference: null,
    });

    // A cashier neither sees the report nor amends.
    expect((await as(users.cashier).api('GET', '/order-reports')).status).toBe(403);
    expect(
      (
        await amend(
          cashId,
          { paymentMode: 'UPI', paymentReference: 'x', remarks: 'y' },
          users.cashier,
        )
      ).status,
    ).toBe(403);

    // Stewards (Delivery Operators of the location) are assigned by the till or the kitchen,
    // until the order is handed over.
    const steward = await newUser('Delivery Operator', 'ID');
    const stewards = (
      await as(users.kitchen).api(
        'GET',
        `/restaurant-orders/stewards?restaurantId=${fx.restaurantId}`,
      )
    ).data as unknown as Body[];
    expect(stewards.map((entry) => entry.id)).toContain(steward.id);
    expect(stewards.map((entry) => entry.id)).not.toContain(users.cashierId);
    const [open] = items(
      await h.ok('GET', `/pos/orders?counterId=${fx.counterId}&status=PLACED&limit=1`),
    );
    const openId = idOf(open!);
    const assign = (id: string, stewardId: string | null, token: string) =>
      as(token).api('PATCH', `/restaurant-orders/${id}/steward`, { stewardId });
    const assigned = await assign(openId, steward.id, users.kitchen);
    expect([assigned.status, assigned.data.stewardName]).toEqual([
      200,
      `Int Delivery Operator ${run}`,
    ]);
    expect((await assign(openId, steward.id, users.cashier)).status).toBe(200);
    const notSteward = await assign(openId, users.cashierId, users.cashier);
    expect([notSteward.status, notSteward.body.message]).toEqual([
      409,
      'Choose a steward: a Delivery Operator at this order’s location.',
    ]);
    expect((await assign(openId, steward.id, steward.token)).status).toBe(403);
    const board = (
      await as(users.kitchen).api('GET', `/restaurant-orders?restaurantId=${fx.restaurantId}`)
    ).data as unknown as Body[];
    expect(board.find((order) => order.id === openId)).toMatchObject({
      stewardId: steward.id,
      stewardName: `Int Delivery Operator ${run}`,
    });
    expect(
      firstOf(items(await h.ok('GET', `/order-reports?search=${open!.billNumber as string}`))),
    ).toMatchObject({ stewardAssigned: true, stewardName: `Int Delivery Operator ${run}` });
    const delivered = await assign(cashId, steward.id, users.kitchen);
    expect([delivered.status, delivered.body.message]).toEqual([
      409,
      'This order is already handed over, so its steward cannot change.',
    ]);
    expect((await assign(openId, null, users.kitchen)).data.stewardId).toBe(null);

    // Two days later it can no longer be amended, and is not found to amend.
    await h.rawQuery(
      `UPDATE restaurant_orders SET placed_at = now() - interval '49 hours' WHERE id = $1::uuid`,
      cashId,
    );
    const late = await amend(cashId, { paymentMode: 'UPI', paymentReference: 'x', remarks: 'y' });
    expect([late.status, late.body.message]).toEqual([
      409,
      'A bill can be amended only within 48 hours of billing.',
    ]);
    expect(
      items(
        await h.ok(
          'GET',
          `/order-reports/amendable?q=${encodeURIComponent(cash!.billNumber as string)}`,
        ),
      ),
    ).toEqual([]);
  });
});
