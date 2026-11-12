// Characterisation of the Reports and Dashboard endpoints over HTTP. The suite makes its own
// location (with its default store and kitchen), a restaurant, a counter and two menu items, then
// bills known activity through the real POS endpoints (cash, card, UPI, online UPI, staff
// discount, room, complimentary, cancelled, and an unbilled kiosk order) and known stock activity
// (GRNs, transfers, productions). Every report and dashboard figure is asserted for that location
// only, so other suites writing to the same database at the same time cannot move them.
//
// Runs only with DATABASE_URL_TEST: a migrated and seeded database it may write to.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dateLabel } from './reports/report-builders.js';
import {
  databaseUrl,
  day,
  firstOf,
  run,
  shape,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

// The images set no TZ, so production runs in UTC and so does this suite.
process.env.TZ = 'UTC';

const today = day(0);
const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;
const rowsOf = (data: Body) => data.rows as Body[];
const aString: unknown = expect.any(String);
const matching = (pattern: RegExp): unknown => expect.stringMatching(pattern);
const pick = (row: Body, keys: string[]) => Object.fromEntries(keys.map((key) => [key, row[key]]));

describe.skipIf(!databaseUrl)('reports and dashboard (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  const fx = {
    counterCode: '',
    counterId: '',
    hospitalCode: '',
    hospitalId: '',
    hospitalName: '',
    itemA: '',
    itemAName: '',
    itemB: '',
    itemBName: '',
    itemC: '',
    kitchenId: '',
    kitchenIds: [] as string[],
    menuA: '',
    menuACode: '',
    menuB: '',
    otherHospitalId: '',
    otherKitchenIds: [] as string[],
    otherStoreId: '',
    restaurantId: '',
    restaurantName: '',
    storeId: '',
    superAdminCode: null as string | null,
    superAdminName: '',
    unit: '',
  };
  /** The bills made in beforeAll, by name, as POST /pos/orders returned them. */
  const bills: Record<string, Body> = {};
  const docs = { draftGrn: '', grnNumber: '', postedGrn: '', transferNumber: '', vendorName: '' };
  const tokens = { nobody: '', other: '', salesOnly: '' };
  /** The report range: the whole UTC day the bills were made in. */
  let range = '';
  const vendor = `Vendor RD ${run}`;

  const report = (code: string, query = range, as?: string) =>
    h.api('GET', `/reports/${code}?hospitalId=${fx.hospitalId}&${query}`, undefined, as);
  const reportOk = async (code: string, query = range) => {
    const result = await report(code, query);
    if (result.status !== 200) throw new Error(`${code} -> ${JSON.stringify(result.body)}`);
    return result.data;
  };

  /** A user with no role, only these permission overrides, assigned to one location. */
  async function userAt(hospitalId: string, label: string, permissions: string[]) {
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, now())
       RETURNING id, session_version AS "sessionVersion"`,
      `${label}${run}`.toUpperCase(),
      `Report ${label} ${run}`,
      `6${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9)}`,
      hospitalId,
    );
    await h.rawQuery(
      `INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now())`,
      user!.id,
      hospitalId,
    );
    if (permissions.length) {
      await h.rawQuery(
        `INSERT INTO user_permissions (id, user_id, permission_id, granted, updated_at)
         SELECT gen_random_uuid(), $1::uuid, id, true, now() FROM permissions
         WHERE code = ANY($2::text[])`,
        user!.id,
        permissions,
      );
    }
    return h.signFor(user!);
  }

  beforeAll(async () => {
    // No UPI gateway: UPI is typed in, as at a site without one (a site with one takes UPI only
    // through it). Blanks that are not empty: dotenv-expand refills an empty one from .env.
    Object.assign(process.env, { PAYU_CLIENT_ID: ' ', RAZORPAY_KEY_ID: ' ' });
    h = await startHarness();
    const ok = (...args: Parameters<Harness['ok']>) => h.ok(...args);
    const [admin] = await h.rawQuery<{ code: string | null; name: string }>(
      'SELECT name, employee_code AS code FROM users WHERE id = $1::uuid',
      h.superAdmin.id,
    );
    fx.superAdminName = admin!.name;
    fx.superAdminCode = admin!.code;

    // The location: creating one also makes its Main Store, Main Kitchen and Counter Kitchen.
    const hospital = await ok('POST', '/hospitals', {
      city: 'Gurugram',
      invoicePrefix: `MAXRD${run}`,
      locationCode: `RD${run}`,
      postalCode: '122001',
      state: 'Haryana',
      title: `Int Reports ${run}`,
    });
    fx.hospitalId = idOf(hospital);
    fx.hospitalCode = hospital.hospitalCode as string;
    fx.hospitalName = hospital.hospitalName as string;
    fx.unit = String(hospital.billPrefix).replace(/^MAX[-_\s]*/i, '');
    fx.storeId = idOf(firstOf(items(await ok('GET', `/stores?hospitalId=${fx.hospitalId}`))));
    const kitchens = items(await ok('GET', `/kitchens?hospitalId=${fx.hospitalId}`));
    fx.kitchenId = idOf(
      firstOf(kitchens.filter((kitchen) => kitchen.kitchenName === 'Main Kitchen')),
    );
    fx.kitchenIds = kitchens.map(idOf).sort();

    const other = await ok('POST', '/hospitals', {
      city: 'Noida',
      locationCode: `RO${run}`,
      state: 'Uttar Pradesh',
      title: `Int Reports Other ${run}`,
    });
    fx.otherHospitalId = idOf(other);
    fx.otherStoreId = idOf(
      firstOf(items(await ok('GET', `/stores?hospitalId=${fx.otherHospitalId}`))),
    );
    // Its Main Kitchen and Counter Kitchen.
    fx.otherKitchenIds = items(await ok('GET', `/kitchens?hospitalId=${fx.otherHospitalId}`))
      .map(idOf)
      .sort();

    const restaurant = await ok('POST', '/restaurants', {
      hospitalId: fx.hospitalId,
      restaurantName: `Int Cafe ${run}`,
      storeId: fx.storeId,
    });
    fx.restaurantId = idOf(restaurant);
    fx.restaurantName = restaurant.restaurantName as string;
    // This run's browser is the till of a POS device for the restaurant, set up by name.
    const till = await ok('POST', '/pos-devices', {
      code: `RT${run}`,
      hospitalId: fx.hospitalId,
      hostName: `REPORT-TILL-${run}`,
      name: `Report Till ${run}`,
      restaurantIds: [fx.restaurantId],
    });
    h.tillKey = (
      (await ok('POST', '/pos/till', {
        computerName: `REPORT-TILL-${run}`,
        posDeviceId: idOf(till),
      })) as { tillKey: string }
    ).tillKey;

    const categoryId = idOf(
      await ok('POST', '/item-categories', { categoryName: `Int Reports ${run}` }),
    );
    const item = async (name: string) =>
      ok('POST', '/items', { itemName: `Int ${name} ${run}`, type: 'VEG' });
    const a = await item('Alpha');
    const b = await item('Bravo');
    fx.itemA = idOf(a);
    fx.itemAName = a.itemName as string;
    fx.itemB = idOf(b);
    fx.itemBName = b.itemName as string;
    fx.itemC = idOf(await item('Charlie'));
    for (const itemId of [fx.itemA, fx.itemB]) {
      await ok('POST', '/store-items', { categoryId, itemId, storeId: fx.storeId });
    }
    await ok('POST', '/kitchen-items', { categoryId, itemId: fx.itemC, kitchenId: fx.kitchenId });

    // A: 100 + 5% GST, discountable, counter only. B: 20 with no GST, 30 in a room.
    const menuA = await ok('POST', '/restaurant-menus', {
      categoryId,
      gstPercent: 5,
      isDiscountable: true,
      isGstInclusive: false,
      itemId: fx.itemA,
      price: 100,
      restaurantId: fx.restaurantId,
      serveAt: 'COUNTER',
      storeId: fx.storeId,
    });
    fx.menuA = idOf(menuA);
    fx.menuACode = menuA.menuItemCode as string;
    fx.menuB = idOf(
      await ok('POST', '/restaurant-menus', {
        categoryId,
        gstPercent: 0,
        isDiscountable: false,
        isGstInclusive: false,
        itemId: fx.itemB,
        price: 20,
        restaurantId: fx.restaurantId,
        roomPrice: 30,
        serveAt: 'BOTH',
        storeId: fx.storeId,
      }),
    );

    const counter = await ok('POST', '/counters', {
      counterCode: `RC${run}`,
      counterName: `Int Till ${run}`,
      hospitalId: fx.hospitalId,
      restaurantId: fx.restaurantId,
    });
    fx.counterId = idOf(counter);
    fx.counterCode = counter.counterCode as string;

    // Staff get 10% off discountable items at this restaurant.
    await ok('PUT', `/pos/staff-discounts/${fx.restaurantId}`, {
      rates: [],
      staffDiscountApplicable: true,
    });
    await ok('POST', '/employee-discounts', {
      discountPercent: 10,
      employmentType: 'ON_ROLL',
      name: `Int Staff ${run}`,
      restaurantId: fx.restaurantId,
    });
    await ok('POST', '/employees', {
      employeeCode: `RE${run}`,
      employeeName: 'Report Staff',
      employmentType: 'ON_ROLL',
      hospitalId: fx.hospitalId,
    });

    // A paid online UPI payment, as the provider would report it.
    const [online] = await h.rawQuery<{ id: string }>(
      `INSERT INTO online_payments (id, hospital_id, counter_id, provider, status, amount, provider_ref,
         payment_url, paid_reference, paid_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'RAZORPAY', 'PAID', 20, $3, 'https://rzp.io/x',
         $4, now(), now()) RETURNING id`,
      fx.hospitalId,
      fx.counterId,
      `plink_rd_${run}`,
      `pay_rd_${run}`,
    );

    const shift = await ok('POST', '/pos/shifts', { counterId: fx.counterId, openingCash: 0 });
    const A = (quantity: number) => ({ menuId: fx.menuA, quantity });
    const B = (quantity: number) => ({ menuId: fx.menuB, quantity });
    const bill = async (name: string, lines: Body[], extra: Body) => {
      bills[name] = await ok('POST', '/pos/orders', {
        channel: 'COUNTER',
        clientOrderId: `rd-${name}-${run}`,
        counterId: fx.counterId,
        lines,
        ...extra,
      });
    };
    await bill('cash', [A(2)], { paymentMode: 'CASH' }); // 200 + 10 = 210
    await bill('card', [A(1), B(1)], { paymentMode: 'CARD' }); // 120 + 5 = 125
    await bill('upi', [B(3)], { paymentMode: 'UPI' }); // 60
    await bill('online', [B(1)], { onlinePaymentId: online!.id, paymentMode: 'UPI' }); // 20
    // 100 - 10% = 90, + 4.50 GST = 94.50, rounded to 95.
    await bill('staff', [A(1)], { employeeCode: `RE${run}`, paymentMode: 'CASH' });
    await bill('comp', [A(1)], { complimentaryReason: 'Duty doctor', isComplimentary: true });
    await bill('room', [B(1)], {
      bedNumber: 'B2',
      channel: 'ROOM',
      paymentMode: 'CASH',
      roomNumber: '101',
    }); // 30
    await bill('void', [B(1)], { paymentMode: 'CASH' }); // 20, then cancelled
    await ok('PATCH', `/pos/orders/${idOf(bills.void!)}/cancel`, { reason: 'Wrong item' });
    await ok('PATCH', `/pos/shifts/${idOf(shift)}/end`, { countedCash: 335, handover: false });

    // A kiosk order nobody billed at a counter: 2 x A.
    await h.rawQuery(
      `INSERT INTO kiosk_orders (id, restaurant_id, business_date, number, client_order_id, lines)
       VALUES (gen_random_uuid(), $1::uuid, $2::date, 1, $3, $4::jsonb)`,
      fx.restaurantId,
      today,
      `rd-kiosk-${run}`,
      JSON.stringify([{ menuId: fx.menuA, quantity: 2 }]),
    );

    // Stock: one posted GRN, one draft GRN, an acknowledged and a pending transfer, a posted and
    // a draft production.
    const grnBody = (batchNumber: string) => ({
      hospitalId: fx.hospitalId,
      items: [
        {
          acceptedQty: 10,
          batches: [
            {
              acceptedQty: 10,
              batchNumber,
              expiryDate: day(60),
              receivedQty: 10,
              rejectedQty: 0,
            },
          ],
          itemId: fx.itemA,
          receivedQty: 10,
          rejectedQty: 0,
        },
      ],
      receivedBy: 'Characterisation',
      receivedDate: today,
      storeId: fx.storeId,
      vendorName: vendor,
    });
    const posted = await ok('POST', '/grns', grnBody(`RDP-${run}`));
    docs.postedGrn = idOf(posted);
    docs.grnNumber = posted.grnNumber as string;
    docs.vendorName = posted.vendorName as string;
    await ok('PATCH', `/grns/${docs.postedGrn}/post-to-stock`);
    docs.draftGrn = idOf(await ok('POST', '/grns', grnBody(`RDD-${run}`)));
    const balance = firstOf(
      items(
        await ok('GET', `/stock-balances?itemId=${fx.itemA}&locationType=STORE&limit=100`),
      ).filter((row) => row.batchNumber === `RDP-${run}`),
    );
    const transfer = async () => {
      const draft = await ok('POST', '/transfers', {
        businessDate: today,
        destinationId: fx.restaurantId,
        destinationType: 'RESTAURANT',
        hospitalId: fx.hospitalId,
        items: [
          {
            batchNumber: `RDP-${run}`,
            expiryDate: String(balance.expiryDate).slice(0, 10),
            itemId: fx.itemA,
            sentQty: 2,
          },
        ],
        sourceId: fx.storeId,
        sourceType: 'STORE',
        transferDate: new Date().toISOString(),
      });
      return ok('PATCH', `/transfers/${idOf(draft)}/dispatch`);
    };
    const acknowledged = await transfer();
    docs.transferNumber = acknowledged.transferNumber as string;
    await ok('POST', '/transfer-acknowledgements', {
      items: [
        {
          acceptedQty: 2,
          rejectedQty: 0,
          transferLineId: idOf(firstOf(acknowledged.lines as Body[])),
        },
      ],
      transferId: idOf(acknowledged),
    });
    await transfer();
    const production = () =>
      ok('POST', '/kitchen-productions', {
        businessDate: today,
        hospitalId: fx.hospitalId,
        items: [{ itemId: fx.itemC, producedQty: 4 }],
        kitchenId: fx.kitchenId,
        productionDate: new Date().toISOString(),
      });
    await ok('PATCH', `/kitchen-productions/${idOf(await production())}/post`);
    await production();

    const dashboardViews = [
      'COUNTER_VIEW',
      'GRN_VIEW',
      'KITCHEN_PRODUCTION_VIEW',
      'KITCHEN_VIEW',
      'RESTAURANT_VIEW',
      'STORE_VIEW',
      'TRANSFER_VIEW',
    ];
    const reportCodes = [
      'REPORT_APC',
      'REPORT_CANCELLED',
      'REPORT_ERP',
      'REPORT_IHC',
      'REPORT_ITEM_SALES',
      'REPORT_ITEM_SUMMARY',
      'REPORT_SALES',
      'REPORT_SALES_ADMIN',
      'REPORT_TAX',
      'REPORT_UNPAID',
    ];
    tokens.other = await userAt(fx.otherHospitalId, 'RX', [...reportCodes, ...dashboardViews]);
    tokens.salesOnly = await userAt(fx.hospitalId, 'RS', ['REPORT_SALES']);
    tokens.nobody = await userAt(fx.hospitalId, 'RN', []);

    range = `from=${today}T00:00:00.000Z&to=${day(1)}T00:00:00.000Z`;
  }, 180_000);

  afterAll(() => h?.app.close());

  describe('reports', () => {
    it('lists every report for the Super Admin, in the Reports page order', async () => {
      const catalog = (await h.ok('GET', '/reports')) as unknown as Body[];
      expect(catalog.map((entry) => entry.code)).toEqual([
        'sales',
        'sales-admin',
        'apc',
        'item-sales',
        'day-item-summary',
        'tax',
        'cancelled',
        'unpaid',
        'in-house',
        'item-sales-ihc',
        'day-item-summary-ihc',
        'erp',
      ]);
      expect(shape(catalog)).toMatchInlineSnapshot(`
        [
          {
            "code": "string",
            "description": "string",
            "title": "string",
          },
        ]
      `);
    });

    it('sales: the paid bills (no complimentary, no cancelled), split by how they were paid', async () => {
      const data = await reportOk('sales');
      const { columns, rows, totals, ...head } = data;
      expect([shape(head), shape(columns), shape(rows), shape(totals)]).toMatchInlineSnapshot(`
        [
          {
            "code": "string",
            "from": "string",
            "generatedAt": "string",
            "location": "string",
            "plain": "boolean",
            "restaurants": [
              "string",
            ],
            "title": "string",
            "to": "string",
          },
          [
            {
              "key": "string",
              "kind": "string",
              "label": "string",
            },
          ],
          [
            {
              "amount": "number",
              "at": "string",
              "bill": "string",
              "card": "number",
              "cash": "number",
              "discount": "number",
              "gst": "number",
              "online": "number",
              "other": "number",
              "pos": "string",
              "restaurant": "string",
              "taxable": "number",
              "upi": "number",
            },
          ],
          {
            "amount": "number",
            "card": "number",
            "cash": "number",
            "discount": "number",
            "gst": "number",
            "online": "number",
            "other": "number",
            "restaurant": "string",
            "taxable": "number",
            "upi": "number",
          },
        ]
      `);
      expect(data).toMatchObject({
        code: 'sales',
        location: `${fx.hospitalCode} - ${fx.hospitalName}, Gurugram, Haryana-122001`,
        plain: false,
        restaurants: ['All restaurants'],
        title: 'Sales Report',
      });
      expect((data.columns as Body[]).map((column) => column.label)).toEqual([
        'Restaurant Name',
        'POS Code',
        'Bill No',
        'Bill Amount',
        'Date & Time',
        'Taxable Amount',
        'Discount',
        'GST/VAT',
        'CASH',
        'CREDIT CARD',
        'UPI',
        'ONLINE',
        'OTHER',
      ]);
      const money = ['amount', 'taxable', 'discount', 'gst', 'cash', 'card', 'upi', 'online'];
      expect(rowsOf(data).map((row) => pick(row, ['bill', ...money]))).toEqual(
        [
          ['cash', 210, 200, 0, 10, 210, 0, 0, 0],
          ['card', 125, 120, 0, 5, 0, 125, 0, 0],
          ['upi', 60, 60, 0, 0, 0, 0, 60, 0],
          ['online', 20, 20, 0, 0, 0, 0, 0, 20],
          ['staff', 95, 90, 10, 4.5, 95, 0, 0, 0],
          ['room', 30, 30, 0, 0, 30, 0, 0, 0],
        ].map(([name, ...values]) => ({
          bill: bills[name as string]!.billNumber,
          ...Object.fromEntries(money.map((key, index) => [key, values[index]])),
        })),
      );
      expect(firstOf(rowsOf(data))).toMatchObject({
        other: 0,
        pos: fx.counterCode,
        restaurant: fx.restaurantName,
      });
      expect(String(firstOf(rowsOf(data)).at)).toMatch(
        /^\d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2} [AP]M$/,
      );
      expect(data.totals).toEqual({
        amount: 540,
        card: 125,
        cash: 335,
        discount: 10,
        gst: 19.5,
        online: 20,
        other: 0,
        restaurant: 'Total',
        taxable: 520,
        upi: 60,
      });
    });

    it('sales-admin: adds who billed and whose staff discount it was', async () => {
      const data = await reportOk('sales-admin');
      expect((data.columns as Body[]).slice(-4).map((column) => column.label)).toEqual([
        'OTHER',
        'Operator Code',
        'Emp ID (Discount)',
        'Emp Name',
      ]);
      const rows = rowsOf(data);
      expect(rows.map((row) => [row.empId, row.empName])).toEqual([
        [null, null],
        [null, null],
        [null, null],
        [null, null],
        // The bill keeps the code as the cashier typed it; the name is found whatever its case.
        [`RE${run}`, 'Report Staff'],
        [null, null],
      ]);
      expect(rows.every((row) => row.operator === fx.superAdminCode)).toBe(true);
      expect(data.totals).toMatchObject({ amount: 540, discount: 10 });
    });

    it('apc: per restaurant bills, KOTs (complimentary as NC), sales and the average bill', async () => {
      const data = await reportOk('apc');
      expect(rowsOf(data)).toEqual([
        {
          apc: 90,
          bills: 6,
          discount: 10,
          gross: 530,
          kot: 7,
          ncKot: 1,
          net: 540,
          nonTaxable: 130,
          restaurant: fx.restaurantName,
          roundOff: 0.5,
          taxable: 390,
          taxes: 19.5,
        },
      ]);
      expect(data.totals).toMatchObject({ apc: 90, bills: 6, net: 540, restaurant: 'Total' });
    });

    it('item-sales: per item, split into POS, room and QR orders', async () => {
      const data = await reportOk('item-sales');
      const zero = { QR_discount: 0, QR_gst: 0, QR_price: 0, QR_qty: 0, QR_rate: 0, QR_total: 0 };
      expect(rowsOf(data)).toEqual([
        {
          POS_discount: 10,
          POS_gst: 19.5,
          POS_price: 400,
          POS_qty: 4,
          POS_rate: 100,
          POS_total: 409.5,
          ROOM_discount: 0,
          ROOM_gst: 0,
          ROOM_price: 0,
          ROOM_qty: 0,
          ROOM_rate: 0,
          ROOM_total: 0,
          ...zero,
          category: aString,
          code: fx.menuACode,
          name: fx.itemAName,
        },
        {
          POS_discount: 0,
          POS_gst: 0,
          POS_price: 100,
          POS_qty: 5,
          POS_rate: 20,
          POS_total: 100,
          ROOM_discount: 0,
          ROOM_gst: 0,
          ROOM_price: 30,
          ROOM_qty: 1,
          ROOM_rate: 30,
          ROOM_total: 30,
          ...zero,
          category: aString,
          code: aString,
          name: fx.itemBName,
        },
      ]);
      expect(data.totals).toMatchObject({
        POS_qty: 9,
        POS_rate: null,
        POS_total: 509.5,
        ROOM_qty: 1,
        ROOM_total: 30,
        code: 'Total',
      });
    });

    it('item-sales-ihc and day-item-summary-ihc: only the complimentary bill', async () => {
      const items = await reportOk('item-sales-ihc');
      expect(rowsOf(items).map((row) => pick(row, ['name', 'POS_qty', 'POS_total']))).toEqual([
        { POS_qty: 1, POS_total: 105, name: fx.itemAName },
      ]);
      const days = await reportOk('day-item-summary-ihc');
      expect(rowsOf(days).map((row) => pick(row, ['name', 'qty', 'total']))).toEqual([
        { name: fx.itemAName, qty: 1, total: 105 },
      ]);
    });

    it('day-item-summary: a column per site (IST) day in the range, then totals', async () => {
      const data = await reportOk('day-item-summary');
      const from = new Date(`${today}T00:00:00.000Z`);
      const days = [dateLabel(from), dateLabel(new Date(from.getTime() + 86_400_000 - 1))];
      expect((data.columns as Body[]).map((column) => column.label)).toEqual([
        'Menu Item Code',
        'Item Name',
        ...days,
        'Total Qty',
        'Rate',
        'Discount Value',
        'Total Amount',
      ]);
      const soldOn = `day_${dateLabel(new Date(String(bills.cash!.placedAt)))}`;
      expect(
        rowsOf(data).map((row) => pick(row, ['name', soldOn, 'qty', 'rate', 'total'])),
      ).toEqual([
        { [soldOn]: 4, name: fx.itemAName, qty: 4, rate: 100, total: 409.5 },
        // 5 at 20 and 1 at the room price of 30: the rate is the average, 130 / 6.
        { [soldOn]: 6, name: fx.itemBName, qty: 6, rate: 21.67, total: 130 },
      ]);
      expect(data.totals).toMatchObject({ code: 'Total', qty: 10, rate: null, total: 539.5 });
    });

    it('tax: every paid line with its CGST and SGST halves', async () => {
      const data = await reportOk('tax');
      expect(rowsOf(data)).toHaveLength(7);
      expect(firstOf(rowsOf(data))).toMatchObject({
        bill: bills.cash!.billNumber,
        cgst: 5,
        cgstPercent: 2.5,
        discount: 0,
        gross: 200,
        item: fx.itemAName,
        qty: 2,
        rate: 100,
        sgst: 5,
        sgstPercent: 2.5,
        taxable: 200,
      });
      expect(data.totals).toEqual({
        bill: 'Total',
        cgst: 9.75,
        cgstPercent: null,
        discount: 10,
        gross: 530,
        qty: 10,
        rate: null,
        sgst: 9.75,
        sgstPercent: null,
        taxable: 520,
      });
    });

    it('cancelled: the cancelled bill line by line, with why and who cancelled it', async () => {
      const data = await reportOk('cancelled');
      expect(
        rowsOf(data).map((row) => ({
          ...row,
          cancelTime: typeof row.cancelTime,
          time: typeof row.time,
        })),
      ).toEqual([
        {
          amount: 20,
          approvedBy: fx.superAdminName,
          bill: bills.void!.billNumber,
          cancelDate: matching(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/),
          cancelTime: 'string',
          date: dateLabel(new Date(String(bills.void!.placedAt))),
          discount: 0,
          final: 20,
          gst: 0,
          itemCode: aString,
          itemName: fx.itemBName,
          operator: fx.superAdminCode,
          pos: fx.counterCode,
          price: 20,
          qty: 1,
          rate: 20,
          remark: 'Wrong item',
          restaurant: fx.restaurantName,
          room: null,
          time: 'string',
        },
      ]);
      expect(data.totals).toMatchObject({ amount: 20, date: 'Total', final: 20, rate: null });
    });

    it('in-house: the complimentary bill line by line', async () => {
      const data = await reportOk('in-house');
      expect(
        rowsOf(data).map((row) => pick(row, ['amount', 'approvedBy', 'bill', 'final', 'remark'])),
      ).toEqual([
        {
          amount: 105,
          approvedBy: fx.superAdminName,
          bill: bills.comp!.billNumber,
          final: 105,
          remark: 'Duty doctor',
        },
      ]);
    });

    it('unpaid: the kiosk order no counter billed, at the menu price', async () => {
      const data = await reportOk('unpaid');
      expect((data.columns as Body[]).some((column) => column.key === 'pos')).toBe(false);
      expect(
        rowsOf(data).map((row) =>
          pick(row, ['amount', 'bill', 'final', 'operator', 'qty', 'remark']),
        ),
      ).toEqual([
        {
          amount: 210,
          bill: 'Kiosk 1',
          final: 210,
          operator: null,
          qty: 2,
          remark: 'Not paid at a counter',
        },
      ]);
    });

    it('erp: three balanced journals per paid bill, posted twice (reversed) for a cancelled one', async () => {
      const data = await reportOk('erp');
      expect(data).toMatchObject({ plain: true, title: 'ERP Journal (SUN)', totals: null });
      expect((data.columns as Body[]).slice(0, 4).map((column) => column.label)).toEqual([
        'SUN_BU',
        'JRNAL_TYPE',
        'LEDGER',
        'ACCOUNT_CODE',
      ]);
      const rows = rowsOf(data);
      // cash 8, card 8, upi 6, online 6, staff 10, room 6, cancelled 2 x 6; complimentary none.
      expect(rows).toHaveLength(56);
      const side = (dc: string) =>
        Math.round(
          rows.filter((row) => row.DC === dc).reduce((sum, row) => sum + Number(row.AMOUNT), 0) *
            100,
        );
      expect(side('D')).toBe(side('C'));
      expect(rows.every((row) => row.SUN_BU === fx.unit)).toBe(true);
      const of = (name: string) =>
        rows
          .filter((row) => row.AFS_5 === bills[name]!.billNumber)
          .map((row) => [row.JRNAL_TYPE, row.ACCOUNT_CODE, row.DC, row.AMOUNT, row.AFS_8]);
      expect(of('cash')).toEqual([
        ['ZHI01', '42020075', 'C', 200, 'FOOD'],
        ['ZHI01', '26110005', 'C', 5, 'CGST2'],
        ['ZHI01', '26110001', 'C', 5, 'SGST2'],
        ['ZHI01', 'DINTF001', 'D', 210, 'RevenueControlAccount'],
        ['ZHI02', '13102016', 'D', 210, 'CASH'],
        ['ZHI02', '26106021', 'C', 210, 'CASH'],
        ['ZHI03', '26106021', 'D', 210, 'F&BSETTLED'],
        ['ZHI03', 'DINTF001', 'C', 210, 'F&BSETTLED'],
      ]);
      expect(of('staff')).toEqual([
        ['ZHI01', '42020075', 'C', 100, 'FOOD'],
        ['ZHI01', '26110005', 'C', 2.25, 'CGST2'],
        ['ZHI01', '26110001', 'C', 2.25, 'SGST2'],
        ['ZHI01', '32106008', 'C', 0.5, 'FOOD'],
        ['ZHI01', 'DINTF001', 'D', 105, 'RevenueControlAccount'],
        ['ZHI02', '13102016', 'D', 95, 'CASH'],
        ['ZHI02', '26106021', 'C', 95, 'CASH'],
        ['ZHI03', '26106021', 'D', 95, 'F&BSETTLED'],
        ['ZHI03', '32501001', 'D', 10, 'F&BSETTLED'],
        ['ZHI03', 'DINTF001', 'C', 105, 'F&BSETTLED'],
      ]);
      // Online UPI posts to the UPI account, referenced by the provider's payment id.
      const onlineReceipts = rows.filter(
        (row) => row.AFS_5 === bills.online!.billNumber && row.JRNAL_TYPE === 'ZHI02',
      );
      expect(onlineReceipts.map((row) => [row.ACCOUNT_CODE, row.AFS_8, row.TREFERENCE])).toEqual([
        ['13101259', 'UPI', `pay_rd_${run}`],
        ['26106021', 'UPI', `pay_rd_${run}`],
      ]);
      const voided = of('void');
      expect(voided).toHaveLength(12);
      expect(voided.slice(6).map((row) => row[2])).toEqual(
        voided.slice(0, 6).map((row) => (row[2] === 'C' ? 'D' : 'C')),
      );
      expect(rows.some((row) => row.AFS_5 === bills.comp!.billNumber)).toBe(false);
    });

    it('filters by restaurant: its name heads the report; an unknown id is not found', async () => {
      const mine = await reportOk('sales', `${range}&restaurantIds=${fx.restaurantId}`);
      expect(mine.restaurants).toEqual([fx.restaurantName]);
      expect(rowsOf(mine)).toHaveLength(6);
      const unknown = await report(
        'sales',
        `${range}&restaurantIds=00000000-0000-4000-8000-000000000000`,
      );
      expect([unknown.status, unknown.body.message]).toEqual([404, 'Restaurant not found.']);
    });

    it('filters by date-time: a range with no bills has no rows and no totals line', async () => {
      const empty = `from=${day(-3)}T00:00:00.000Z&to=${day(-2)}T00:00:00.000Z`;
      for (const code of ['sales', 'apc', 'tax', 'unpaid', 'erp', 'day-item-summary']) {
        const data = await reportOk(code, empty);
        expect([code, data.rows, data.totals]).toEqual([code, [], null]);
      }
      // [from, to): a range that ends just before the first bill leaves it out.
      const before = await reportOk(
        'sales',
        `from=${today}T00:00:00.000Z&to=${encodeURIComponent(String(bills.cash!.placedAt))}`,
      );
      expect(rowsOf(before)).toEqual([]);
    });

    it('refuses a bad query, an unknown report and an unknown location', async () => {
      const cases: [string, string][] = [
        ['sales', `from=${today}&to=${day(1)}`],
        ['sales', `hospitalId=nope&from=${today}&to=${day(1)}`],
        ['sales', `hospitalId=${fx.hospitalId}&from=soon&to=${day(1)}`],
        ['sales', `hospitalId=${fx.hospitalId}&${range}&restaurantIds=abc`],
        ['sales', `hospitalId=${fx.hospitalId}&from=${day(1)}&to=${today}`],
        ['sales', `hospitalId=${fx.hospitalId}&from=${day(-100)}&to=${today}`],
        ['nope', `hospitalId=${fx.hospitalId}&${range}`],
        ['sales', `hospitalId=00000000-0000-4000-8000-000000000000&${range}`],
      ];
      const results = [];
      for (const [code, query] of cases) {
        const { body, status } = await h.api('GET', `/reports/${code}?${query}`);
        results.push([status, body.message]);
      }
      expect(results).toMatchInlineSnapshot(`
        [
          [
            400,
            "hospitalId must be a UUID",
          ],
          [
            400,
            "hospitalId must be a UUID",
          ],
          [
            400,
            "from must be a valid ISO 8601 date string",
          ],
          [
            400,
            "restaurantIds must be ids.",
          ],
          [
            400,
            "The report has to end after it starts.",
          ],
          [
            400,
            "Pick at most 93 days at a time.",
          ],
          [
            404,
            "Report not found.",
          ],
          [
            404,
            "Location not found.",
          ],
        ]
      `);
    });

    it('needs a token and a report permission; each report needs its own', async () => {
      expect((await h.api('GET', '/reports', undefined, '')).status).toBe(401);
      expect((await report('sales', range, '')).status).toBe(401);

      const nobody = await h.api('GET', '/reports', undefined, tokens.nobody);
      expect([nobody.status, nobody.body.message]).toMatchInlineSnapshot(`
        [
          403,
          "Forbidden resource",
        ]
      `);
      expect((await report('sales', range, tokens.nobody)).status).toBe(403);

      const catalog = await h.api('GET', '/reports', undefined, tokens.salesOnly);
      expect((catalog.data as unknown as Body[]).map((entry) => entry.code)).toEqual(['sales']);
      const tax = await report('tax', range, tokens.salesOnly);
      expect([tax.status, tax.body.message]).toEqual([
        403,
        'You do not have access to the Tax Collection Report.',
      ]);
      const sales = await report('sales', range, tokens.salesOnly);
      expect(sales.status).toBe(200);
      expect(sales.data.totals).toMatchObject({ amount: 540 });
    });

    it("a user at another location cannot run this location's reports", async () => {
      const mine = await report('sales', range, tokens.other);
      expect([mine.status, mine.body.message]).toEqual([
        403,
        'This location is outside your assigned access',
      ]);
      const theirs = await h.api(
        'GET',
        `/reports/sales?hospitalId=${fx.otherHospitalId}&${range}`,
        undefined,
        tokens.other,
      );
      expect([theirs.status, theirs.data.rows, theirs.data.totals]).toEqual([200, [], null]);
    });
  });

  describe('dashboard', () => {
    const records = (query: string, as?: string) =>
      h.api('GET', `/dashboard/records?${query}`, undefined, as);

    it("records: the period's transfers, posted productions and posted GRNs at a location", async () => {
      const data = await h.ok(
        'GET',
        `/dashboard/records?fromDate=${today}&hospitalId=${fx.hospitalId}`,
      );
      expect(shape(data)).toMatchInlineSnapshot(`
        {
          "grns": {
            "items": [
              {
                "lines": [
                  {
                    "acceptedQty": "number",
                    "rejectedQty": "number",
                  },
                ],
                "receivedDate": "string",
                "status": "string",
                "vendorName": "string",
              },
            ],
            "truncated": "boolean",
          },
          "productions": {
            "items": [
              {
                "hospital": {
                  "hospitalCode": "string",
                  "hospitalName": "string",
                  "id": "string",
                  "isActive": "boolean",
                },
                "hospitalId": "string",
                "id": "string",
                "kitchen": {
                  "kitchenName": "string",
                },
                "kitchenId": "string",
                "lines": [
                  {
                    "item": {
                      "itemName": "string",
                    },
                    "producedQty": "number",
                    "wastageQty": "number",
                  },
                ],
                "productionDate": "string",
                "status": "string",
              },
            ],
            "truncated": "boolean",
          },
          "transfers": {
            "items": [
              {
                "createdAt": "string",
                "hospital": {
                  "hospitalCode": "string",
                  "hospitalName": "string",
                  "id": "string",
                  "isActive": "boolean",
                },
                "hospitalId": "string",
                "id": "string",
                "lines": [
                  {
                    "acceptedQty": "number",
                    "item": {
                      "itemName": "string",
                    },
                    "itemId": "string",
                    "rejectedQty": "number",
                    "rejectionReason": null,
                  },
                ],
                "status": "string",
                "transferDate": "string",
                "updatedAt": "string",
              },
            ],
            "truncated": "boolean",
          },
        }
      `);
      const transfers = data.transfers as Body;
      expect(transfers.truncated).toBe(false);
      expect(
        items(transfers)
          .map((row) => row.status)
          .sort(),
      ).toEqual(['ACKNOWLEDGED', 'PENDING_ACKNOWLEDGEMENT']);
      expect(items(transfers).every((row) => row.hospitalId === fx.hospitalId)).toBe(true);
      expect(items(data.productions as Body).map((row) => row.status)).toEqual(['POSTED']);
      expect(firstOf(items(data.productions as Body)).lines).toEqual([
        { item: { itemName: aString }, producedQty: 4, wastageQty: 0 },
      ]);
      expect(items(data.grns as Body)).toEqual([
        {
          lines: [{ acceptedQty: 10, rejectedQty: 0 }],
          receivedDate: matching(new RegExp(`^${today}`)),
          status: 'POSTED_TO_STOCK',
          vendorName: docs.vendorName,
        },
      ]);
    });

    it('records: a period starting after the activity is empty', async () => {
      const data = await h.ok(
        'GET',
        `/dashboard/records?fromDate=${day(2)}&hospitalId=${fx.hospitalId}`,
      );
      expect(data).toEqual({
        grns: { items: [], truncated: false },
        productions: { items: [], truncated: false },
        transfers: { items: [], truncated: false },
      });
    });

    it('records: fromDate is required and must be a date', async () => {
      const missing = await records(`hospitalId=${fx.hospitalId}`);
      const bad = await records(`fromDate=soon&hospitalId=${fx.hospitalId}`);
      expect([missing.status, missing.body.message, bad.status]).toMatchInlineSnapshot(`
        [
          400,
          "fromDate must be a valid ISO 8601 date string",
          400,
        ]
      `);
    });

    it('nav-counts: transfers to acknowledge, draft GRNs and draft productions', async () => {
      expect(await h.ok('GET', `/dashboard/nav-counts?hospitalId=${fx.hospitalId}`)).toEqual({
        grns: 1,
        productions: 1,
        transfers: 1,
      });
      const bad = await h.api('GET', '/dashboard/nav-counts?hospitalId=nope');
      expect(bad.status).toBe(400);
    });

    it("setup: the location's master counts and its first GRN and transfer", async () => {
      const data = await h.ok('GET', `/dashboard/setup?hospitalId=${fx.hospitalId}`);
      const counts = data.counts as Body;
      expect(counts).toMatchObject({
        kitchenItems: 1,
        // The Main Kitchen and the Counter Kitchen every location starts with.
        kitchens: 2,
        menus: 2,
        restaurants: 1,
        storeItems: 2,
        stores: 1,
      });
      // Employees include the shared ones; locations and items count every location.
      expect(counts.employees).toBeGreaterThanOrEqual(1);
      expect(counts.hospitals).toBeGreaterThanOrEqual(2);
      expect(counts.items).toBeGreaterThanOrEqual(3);
      expect((data.firstGrn as Body).grnNumber).toBe(docs.grnNumber);
      expect((data.firstTransfer as Body).transferNumber).toBe(docs.transferNumber);
      expect(Object.keys(data).sort()).toEqual(['counts', 'firstGrn', 'firstTransfer']);
    });

    it("location-names: this location's store, kitchen, restaurant and counter", async () => {
      const data = await h.ok('GET', '/dashboard/location-names');
      expect(shape(data)).toMatchInlineSnapshot(`
        {
          "counters": [
            {
              "counterName": "string",
              "hospitalId": "string",
              "id": "string",
              "restaurant": {
                "restaurantName": "string",
              },
            },
          ],
          "kitchens": [
            {
              "hospitalId": "string",
              "id": "string",
              "kitchenCode": "string",
              "kitchenName": "string",
            },
          ],
          "restaurants": [
            {
              "hospitalId": "string",
              "id": "string",
              "restaurantCode": "string",
              "restaurantName": "string",
            },
          ],
          "stores": [
            {
              "hospitalId": "string",
              "id": "string",
              "storeCode": "string",
              "storeName": "string",
            },
          ],
        }
      `);
      const here = (list: unknown) =>
        (list as Body[]).filter((row) => row.hospitalId === fx.hospitalId);
      expect(here(data.stores).map((row) => row.id)).toEqual([fx.storeId]);
      expect(
        here(data.kitchens)
          .map((row) => row.id)
          .sort(),
      ).toEqual(fx.kitchenIds);
      expect(here(data.restaurants).map((row) => row.id)).toEqual([fx.restaurantId]);
      expect(here(data.counters)).toEqual([
        {
          counterName: aString,
          hospitalId: fx.hospitalId,
          id: fx.counterId,
          restaurant: { restaurantName: fx.restaurantName },
        },
      ]);
    });

    it('needs a token; without view permissions each part is left out', async () => {
      for (const path of [
        `/dashboard/records?fromDate=${today}`,
        '/dashboard/nav-counts',
        '/dashboard/location-names',
        '/dashboard/setup',
      ]) {
        expect([path, (await h.api('GET', path, undefined, '')).status]).toEqual([path, 401]);
      }
      const as = tokens.nobody;
      const here = `hospitalId=${fx.hospitalId}`;
      expect(
        (await h.api('GET', `/dashboard/records?fromDate=${today}&${here}`, undefined, as)).data,
      ).toEqual({});
      expect((await h.api('GET', `/dashboard/nav-counts?${here}`, undefined, as)).data).toEqual({});
      expect((await h.api('GET', '/dashboard/location-names', undefined, as)).data).toEqual({});
      expect((await h.api('GET', `/dashboard/setup?${here}`, undefined, as)).data).toEqual({
        counts: {},
      });
    });

    it("a user at another location sees none of this location's figures", async () => {
      const as = tokens.other;
      const mine = await h.api(
        'GET',
        `/dashboard/setup?hospitalId=${fx.hospitalId}`,
        undefined,
        as,
      );
      expect([mine.status, mine.body.message]).toEqual([
        403,
        'This location is outside your assigned access',
      ]);
      for (const path of [
        `/dashboard/records?fromDate=${today}&hospitalId=${fx.hospitalId}`,
        `/dashboard/nav-counts?hospitalId=${fx.hospitalId}`,
      ]) {
        expect([path, (await h.api('GET', path, undefined, as)).status]).toEqual([path, 403]);
      }
      // Unfiltered, everything is narrowed to the user's own (empty) location.
      expect(
        (await h.api('GET', `/dashboard/records?fromDate=${today}`, undefined, as)).data,
      ).toEqual({
        grns: { items: [], truncated: false },
        productions: { items: [], truncated: false },
        transfers: { items: [], truncated: false },
      });
      expect((await h.api('GET', '/dashboard/nav-counts', undefined, as)).data).toEqual({
        grns: 0,
        productions: 0,
        transfers: 0,
      });
      const names = (await h.api('GET', '/dashboard/location-names', undefined, as)).data;
      expect([
        (names.stores as Body[]).map((row) => row.id),
        (names.kitchens as Body[]).map((row) => row.id).sort(),
        names.restaurants,
        names.counters,
      ]).toEqual([[fx.otherStoreId], fx.otherKitchenIds, [], []]);
      const setup = (await h.api('GET', '/dashboard/setup', undefined, as)).data;
      expect(setup).toMatchInlineSnapshot(`
        {
          "counts": {
            "kitchens": 2,
            "restaurants": 0,
            "stores": 1,
          },
          "firstGrn": null,
          "firstTransfer": null,
        }
      `);
    });
  });
});
