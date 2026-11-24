import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { test, vi } from 'vitest';
import type { RedisService, SmsService } from '@aahar/auth';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { OnlinePaymentsService } from './online-payments.service';
import type { PosService } from './pos.service';
import { siteBusinessDate } from './pos-pricing';
import { QrOrdersService } from './qr-orders.service';

// The location has Razorpay set up: UPI on the phone works.
vi.mock('./online-payment-providers', () => ({
  providersAt: () => Promise.resolve(new Map([['RAZORPAY', { publicKey: 'rzp_test_pub' }]])),
}));

/**
 * The restaurant's QR is for everyone: patients and attendants have it delivered to their room,
 * staff and visitors pick it up at the restaurant's QR counter.
 */
function setUp(
  restaurant: Record<string, unknown> = {},
  menuItems: unknown[] = [],
  /** An order already placed (and billed) by this phone: createOrder returns it as it stands. */
  billedOrder: unknown = null,
  /** The order's payment as saved: a Razorpay payment link unless given. */
  onlinePayment: Record<string, unknown> = {
    paymentUrl: 'https://pay.example/1',
    provider: 'RAZORPAY',
    providerRef: 'plink_1',
  },
) {
  const created: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const texts: Array<{ mobile: string; otp: string }> = [];
  const store = memoryStore();
  const menuChannels: string[] = [];
  const menuCounters: string[] = [];
  const prisma = {
    counter: { findFirst: () => Promise.resolve({ id: 'counter-1', counterName: 'Counter1' }) },
    // One employee, whose registered mobile is 9876543210.
    employee: {
      findFirst: ({ where }: { where: { mobile?: { endsWith?: string } } }) =>
        Promise.resolve(where.mobile?.endsWith === '9876543210' ? { employeeCode: 'E100' } : null),
    },
    qrOrder: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve(data);
      },
      findUnique: () => Promise.resolve(billedOrder ? { id: 'order-1' } : null),
      findUniqueOrThrow: () =>
        Promise.resolve({
          ...created.at(-1),
          billedOrder,
          grandTotal: 100,
          onlinePayment,
          restaurant: { restaurantName: 'Cafe' },
          status: 'AWAITING_PAYMENT',
        }),
    },
    room: {
      // A bed is found only by its id, and only at the restaurant's location. table-1 is
      // restaurant-1's dine-in table T5: never a bed, and never another restaurant's table.
      findFirst: ({
        where,
      }: {
        where: { hospitalId?: string; id: string; restaurantId?: unknown };
      }) =>
        where.id === 'table-1'
          ? Promise.resolve(
              where.restaurantId === null ||
                (typeof where.restaurantId === 'string' && where.restaurantId !== 'restaurant-1')
                ? null
                : {
                    restaurant: {
                      atTableDining: restaurant.atTableDining ?? true,
                      boardToken: 't-1',
                      id: 'restaurant-1',
                      restaurantName: 'Cafe',
                    },
                    roomName: 'T5',
                  },
            )
          : Promise.resolve(
              where.id !== 'room-1' ||
                // A bed has no restaurant: asked for as a table, it is not one.
                (where.restaurantId !== undefined && where.restaurantId !== null) ||
                (where.hospitalId && where.hospitalId !== 'hospital-1')
                ? null
                : {
                    hospital: {
                      address: 'MAX-PATPARGANJ',
                      city: 'New Delhi',
                      hospitalName: 'Patparganj',
                      state: 'Delhi',
                    },
                    hospitalId: 'hospital-1',
                    roomName: 'PG-ECO-06 (EWS)',
                  },
            ),
    },
    restaurantMenu: {
      // The quickest and slowest dish each restaurant sends to rooms.
      groupBy: () =>
        Promise.resolve([
          {
            _max: { preparationTimeMinutes: 40 },
            _min: { preparationTimeMinutes: 25 },
            restaurantId: 'room-service',
          },
        ]),
    },
    restaurant: {
      // A room QR asks for the restaurants there; this stands in for the database's filter.
      findMany: ({ where }: { where: { inRoomDiningEnabled?: boolean } }) =>
        Promise.resolve(
          [
            {
              boardToken: 't-1',
              // Its QR counter has a shift open: taking orders.
              counters: [{ shifts: [{ id: 'shift-1' }] }],
              id: 'room-service',
              inRoomDiningEnabled: true,
              openingTime: '07:00',
              restaurantName: 'Room Service',
            },
            {
              boardToken: 't-3',
              counters: [{ shifts: [] }],
              id: 'juice-bar',
              inRoomDiningEnabled: true,
              openingTime: '08:30',
              restaurantName: 'Juice Bar',
            },
            {
              boardToken: 't-2',
              counters: [{ shifts: [{ id: 'shift-2' }] }],
              id: 'cafe',
              inRoomDiningEnabled: false,
              openingTime: null,
              restaurantName: 'Cafe',
            },
          ].filter(
            (row) =>
              where.inRoomDiningEnabled === undefined ||
              row.inRoomDiningEnabled === where.inRoomDiningEnabled,
          ),
        ),
      findFirst: () =>
        Promise.resolve({
          counters: [{ id: 'counter-1' }],
          address: null,
          atTableDining: true,
          hospital: { address: null, city: 'New Delhi', hospitalName: 'Saket', state: 'Delhi' },
          inRoomDiningEnabled: true,
          hospitalId: 'hospital-1',
          id: 'restaurant-1',
          kioskCounterId: null,
          location: null,
          restaurantName: 'Cafe',
          staffDiscountApplicable: false,
          ...restaurant,
        }),
    },
  };
  const pos = {
    employeeDiscount: () => Promise.resolve({ discountPercent: 20 }),
    findCounter: () => Promise.resolve({ hospitalId: 'hospital-1', id: 'counter-1' }),
    menu: ({ channel, counterId }: { channel: string; counterId: string }) => {
      menuChannels.push(channel);
      menuCounters.push(counterId);
      return Promise.resolve({ items: menuItems });
    },
    quoteBill: () => Promise.resolve({}),
  };
  const onlinePayments = {
    start: (
      dto: Record<string, unknown>,
      _context: unknown,
      _returnUrl?: string,
      embedded?: boolean,
    ) => {
      payments.push({ ...dto, embedded });
      return Promise.resolve({ amount: 100, id: 'payment-1' });
    },
  };
  const sms = {
    isConfigured: () => true,
    sendOtp: (mobile: string, otp: string) => {
      texts.push({ mobile, otp });
      return Promise.resolve();
    },
  };
  const service = new QrOrdersService(
    { get: () => undefined, getOrThrow: () => 'secret' } as unknown as ConfigService,
    onlinePayments as unknown as OnlinePaymentsService,
    pos as unknown as PosService,
    prisma as unknown as PrismaService,
    sms as unknown as SmsService,
    store as unknown as RedisService,
  );

  return { created, menuChannels, menuCounters, payments, service, store, texts };
}

/** The expiring store (Redis in the cluster), in memory: what it holds is what the server keeps. */
function memoryStore() {
  const keys = new Map<string, string>();
  const count = (key: string, by: number) => {
    const next = Number(keys.get(key) ?? 0) + by;
    keys.set(key, String(next));
    return next;
  };

  return {
    decrement: (key: string) => Promise.resolve(void count(key, -1)),
    delete: (key: string) => Promise.resolve(keys.delete(key)),
    get: (key: string) => Promise.resolve(keys.get(key) ?? null),
    increment: (key: string) => Promise.resolve(count(key, 1)),
    keys,
    setIfAbsent: (key: string, value: string) =>
      Promise.resolve(keys.has(key) ? false : Boolean(keys.set(key, value))),
    setWithExpiry: (key: string, value: string) => Promise.resolve(void keys.set(key, value)),
  };
}

/** A guest sign-in as the server signs it (the service's secret here is "secret"). */
function signedGuest(guest: { e: number; m: string; n: string }) {
  const body = Buffer.from(JSON.stringify(guest)).toString('base64url');

  return `${body}.${createHmac('sha256', 'secret').update(`qr-guest:${body}`).digest('base64url')}`;
}

const order = {
  clientOrderId: 'phone-1',
  guestToken: signedGuest({ e: Date.now() + 3_600_000, m: '9876543210', n: 'Asha Rao' }),
  lines: [{ menuId: 'menu-1', quantity: 1 }],
};

test('the menu is the room menu by default, the counter menu for pickup', async () => {
  const { menuChannels, service } = setUp();

  await service.menu('restaurant-1', 'token');
  const pickup = await service.menu('restaurant-1', 'token', 'COUNTER');

  assert.deepEqual(menuChannels, ['ROOM', 'COUNTER']);
  assert.equal(pickup.pickupCounter, 'Counter1');
});

test('a pickup order needs no room, and is billed for the counter', async () => {
  const { created, service } = setUp();

  const placed = await service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'COUNTER',
  });

  assert.equal(created[0]?.channel, 'COUNTER');
  assert.equal(created[0]?.roomNumber, null);
  assert.equal(placed.channel, 'COUNTER');
});

test("a room order comes from a bed's QR: the restaurant's own QR is pickup only", async () => {
  const { created, service } = setUp();

  // No bed: the restaurant's QR, or a bed at another location.
  await assert.rejects(
    service.createOrder('restaurant-1', 'token', { ...order }),
    (error) => error instanceof BadRequestException && /QR code on your bed/.test(error.message),
  );
  await assert.rejects(
    setUp({ hospitalId: 'hospital-2' }).service.createOrder('restaurant-1', 'token', {
      ...order,
      roomId: 'room-1',
    }),
    (error) => error instanceof BadRequestException && /QR code on your bed/.test(error.message),
  );
  assert.equal(created.length, 0);

  // The bed's own name goes on the order.
  await service.createOrder('restaurant-1', 'token', { ...order, roomId: 'room-1' });
  assert.equal(created[0]?.channel, 'ROOM');
  assert.equal(created[0]?.roomNumber, 'PG-ECO-06 (EWS)');
  assert.equal(created[0]?.bedNumber, null);
});

test("a table order comes from that table's QR, priced for the counter, with the table's name", async () => {
  const { created, payments, service } = setUp();

  // No table, or another restaurant's: refused before any payment.
  for (const tableId of [undefined, 'room-1']) {
    await assert.rejects(
      service.createOrder('restaurant-1', 'token', { ...order, channel: 'TABLE', tableId }),
      (error) =>
        error instanceof BadRequestException &&
        error.message === 'To order at your table, scan the QR code on it.',
    );
  }
  await assert.rejects(
    setUp({ id: 'restaurant-2' }).service.createOrder('restaurant-2', 'token', {
      ...order,
      channel: 'TABLE',
      tableId: 'table-1',
    }),
    (error) => error instanceof BadRequestException && /QR code on it/.test(error.message),
  );
  assert.equal(created.length, 0);

  await service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'TABLE',
    tableId: 'table-1',
  });
  assert.equal(created[0]?.channel, 'TABLE');
  assert.equal(created[0]?.tableName, 'T5');
  assert.equal(created[0]?.roomNumber, null);
  assert.equal(payments[0]?.channel, 'TABLE');
});

test('a restaurant without At Table Dining takes no table orders', async () => {
  const { created, service } = setUp({ atTableDining: false });

  await assert.rejects(
    service.createOrder('restaurant-1', 'token', {
      ...order,
      channel: 'TABLE',
      tableId: 'table-1',
    }),
    (error) =>
      error instanceof BadRequestException &&
      error.message === 'Cafe does not take orders at the table. Please order at the counter.',
  );
  assert.equal(created.length, 0);
});

test("a table's QR opens its restaurant's ordering; a bed's QR never opens a table", async () => {
  assert.deepEqual(await setUp().service.table('table-1'), {
    restaurantId: 'restaurant-1',
    restaurantName: 'Cafe',
    tableName: 'T5',
    token: 't-1',
  });
  await assert.rejects(
    setUp({ atTableDining: false }).service.table('table-1'),
    (error) =>
      error instanceof BadRequestException &&
      error.message === 'Cafe does not take orders at the table. Please order at the counter.',
  );
  await assert.rejects(
    setUp().service.table('room-1'),
    (error) => error instanceof NotFoundException,
  );
  await assert.rejects(
    setUp().service.room('table-1'),
    (error) => error instanceof NotFoundException,
  );
});

test("QR orders go to the restaurant's first counter: there is nothing to pick", async () => {
  // A counter picked on the old setting is no longer used.
  const { menuCounters, service } = setUp({ qrCounterId: 'counter-9' });

  const menu = await service.menu('restaurant-1', 'token');

  assert.deepEqual(menuCounters, ['counter-1']);
  assert.equal(menu.open, true);
});

test('a restaurant that does not deliver to rooms serves pickup only, and refuses room orders', async () => {
  const { created, menuChannels, service } = setUp({ inRoomDiningEnabled: false });

  const menu = await service.menu('restaurant-1', 'token');

  assert.equal(menu.roomDelivery, false);
  assert.deepEqual(menuChannels, ['COUNTER']);
  await assert.rejects(
    service.createOrder('restaurant-1', 'token', { ...order, roomId: 'room-1' }),
    (error) =>
      error instanceof BadRequestException && /does not deliver to rooms/.test(error.message),
  );
  assert.equal(created.length, 0);
});

test('a room QR lists only the restaurants that deliver to rooms, with the location address', async () => {
  const { service } = setUp();

  const room = await service.room('room-1');

  assert.deepEqual(
    room.restaurants.map(({ id, open, opensAt, readyMinutes }) => ({
      id,
      open,
      opensAt,
      readyMinutes,
    })),
    [
      { id: 'room-service', open: true, opensAt: '07:00', readyMinutes: { max: 40, min: 25 } },
      { id: 'juice-bar', open: false, opensAt: '08:30', readyMinutes: null },
    ],
  );
  assert.equal(room.locationAddress, 'MAX-PATPARGANJ, New Delhi, Delhi');
  assert.equal(room.roomName, 'PG-ECO-06 (EWS)');
});

test('dishes off for now or sold out are on the menu as not available', async () => {
  const dish = {
    category: null,
    foodType: 'VEG',
    gstPercent: 5,
    isDiscountable: true,
    isGstInclusive: true,
    preparationTimeMinutes: 40,
    price: 175,
  };
  const { service } = setUp({}, [
    { ...dish, id: 'on', isOnSale: true, itemName: 'Poha', stock: null },
    { ...dish, id: 'off', isOnSale: false, itemName: 'Thandai', stock: null },
    { ...dish, id: 'sold-out', isOnSale: true, itemName: 'Patty', stock: 0 },
    { ...dish, id: 'no-room-price', isOnSale: true, itemName: 'Tea', price: null, stock: null },
  ]);

  const menu = await service.menu('restaurant-1', 'token');

  assert.deepEqual(
    menu.items.map((item) => [item.id, item.available]),
    [
      ['on', true],
      ['off', false],
      ['sold-out', false],
    ],
  );
});

test('a paid order shows its dishes, when it was paid and when it should be ready', async () => {
  const { service } = setUp({}, [], {
    billNumber: 'MAX/0017',
    deliveredAt: null,
    lines: [
      {
        itemName: 'Poha',
        lineTotal: 230,
        quantity: 2,
        restaurantMenu: { preparationTimeMinutes: 25 },
      },
      {
        itemName: 'Sandwich',
        lineTotal: 175,
        quantity: 1,
        restaurantMenu: { preparationTimeMinutes: 40 },
      },
    ],
    orderNumber: '17',
    placedAt: new Date('2026-11-19T05:12:00Z'),
    readyAt: null,
    status: 'PREPARING',
  });

  const view = await service.createOrder('restaurant-1', 'token', { ...order, channel: 'COUNTER' });

  assert.deepEqual(view.lines, [
    { amount: 230, itemName: 'Poha', quantity: 2 },
    { amount: 175, itemName: 'Sandwich', quantity: 1 },
  ]);
  assert.equal(view.paidAt, '2026-11-19T05:12:00.000Z');
  // The slowest dish sets it: 40 minutes after it was paid.
  assert.equal(view.readyBy, '2026-11-19T05:52:00.000Z');
  assert.equal(view.readyAt, null);
});

test("a room order's page shows the guest the code the steward scans, until it is delivered", async () => {
  const billed = {
    billNumber: 'MAX/0018',
    deliveredAt: null,
    deliveryCode: '482913',
    lines: [],
    orderNumber: '18',
    placedAt: new Date('2026-11-19T05:12:00Z'),
    readyAt: null,
    status: 'READY',
  };
  const ready = await setUp({}, [], billed).service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'COUNTER',
  });
  assert.equal(ready.deliveryCode, '482913');

  const delivered = await setUp({}, [], { ...billed, status: 'COLLECTED' }).service.createOrder(
    'restaurant-1',
    'token',
    { ...order, channel: 'COUNTER' },
  );
  assert.equal(delivered.deliveryCode, null);
});

test('a guest signs in once with an OTP to their mobile; orders go under that name and number', async () => {
  const { payments, service, store, texts } = setUp();

  const sent = await service.sendGuestOtp('restaurant-1', 'token', {
    mobile: '9811122233',
    name: '  Meera Shah ',
  });

  assert.equal(sent.sentTo, '******2233');
  assert.equal(texts[0]?.mobile, '9811122233');
  const otp = texts[0].otp;
  assert.match(otp, /^\d{6}$/);

  await assert.rejects(
    service.verifyGuestOtp('restaurant-1', 'token', {
      mobile: '9811122233',
      otp: otp === '000000' ? '111111' : '000000',
    }),
    /not right/,
  );
  const guest = await service.verifyGuestOtp('restaurant-1', 'token', {
    mobile: '9811122233',
    otp,
  });

  assert.equal(guest.name, 'Meera Shah');
  assert.equal(guest.mobile, '9811122233');
  // Nothing about the guest stays on the server: only the wait and the day's count, which expire.
  assert.deepEqual([...store.keys.keys()].sort(), [
    `qr-guest:sent:9811122233:${siteBusinessDate(new Date())}`,
    'qr-guest:wait:9811122233',
  ]);
  assert.ok(![...store.keys.values()].some((value) => value.includes('Meera')));
  // Signed in on this phone for 30 days.
  assert.ok(Date.parse(guest.expiresAt) > Date.now() + 29 * 86_400_000);
  // A code works once.
  await assert.rejects(
    service.verifyGuestOtp('restaurant-1', 'token', { mobile: '9811122233', otp }),
    /expired/,
  );

  await service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'COUNTER',
    guestToken: guest.guestToken,
  });
  // The payment page gets the confirmed name and number: nothing to type there.
  assert.equal(payments[0]?.customerName, 'Meera Shah');
  assert.equal(payments[0]?.customerMobile, '9811122233');
});

test('no QR order without a confirmed sign-in', async () => {
  const { created, service } = setUp();
  const someoneElse = Buffer.from(
    JSON.stringify({ e: Date.now() + 3_600_000, m: '9000000000', n: 'Someone' }),
  ).toString('base64url');
  const forged = order.guestToken.replace(/^[^.]+/, someoneElse);
  const expired = signedGuest({ e: Date.now() - 1000, m: '9876543210', n: 'Asha Rao' });

  for (const guestToken of ['', 'nonsense', forged, expired]) {
    await assert.rejects(
      service.createOrder('restaurant-1', 'token', { ...order, channel: 'COUNTER', guestToken }),
      (error) => error instanceof ForbiddenException,
    );
  }
  assert.equal(created.length, 0);
});

test('a guest waits a minute before asking for another OTP', async () => {
  const { service, texts } = setUp();

  await service.sendGuestOtp('restaurant-1', 'token', { mobile: '9811122233', name: 'Meera' });
  await assert.rejects(
    service.sendGuestOtp('restaurant-1', 'token', { mobile: '9811122233', name: 'Meera' }),
    (error) => error instanceof HttpException && error.getStatus() === 429,
  );
  assert.equal(texts.length, 1);
});

test('an employee signed in with their registered mobile gets their discount without asking', async () => {
  const { payments, service } = setUp({ staffDiscountApplicable: true });

  const discount = await service.guestDiscount('restaurant-1', 'token', order.guestToken);
  await service.createOrder('restaurant-1', 'token', { ...order, channel: 'COUNTER' });

  assert.deepEqual(discount, { discountPercent: 20 });
  assert.equal(payments[0]?.employeeCode, 'E100');

  // Anyone else pays the menu price.
  const visitor = signedGuest({ e: Date.now() + 3_600_000, m: '9811122233', n: 'Meera' });
  assert.deepEqual(await service.guestDiscount('restaurant-1', 'token', visitor), {
    discountPercent: 0,
  });
});

test("a phone order on Razorpay is paid in Razorpay's checkout on the page, the guest's name and mobile filled in", async () => {
  const { payments, service } = setUp({}, [], null, {
    customerMobile: '9876543210',
    customerName: 'Asha Rao',
    paymentUrl: '',
    provider: 'RAZORPAY',
    providerRef: 'order_9',
  });

  const placed = await service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'COUNTER',
  });

  assert.equal(payments[0]?.embedded, true);
  assert.equal(placed.paymentUrl, null);
  assert.deepEqual(placed.checkout, {
    amount: 10000,
    currency: 'INR',
    keyId: 'rzp_test_pub',
    name: 'Cafe',
    orderId: 'order_9',
    prefill: { contact: '+919876543210', name: 'Asha Rao' },
  });

  // A payment link (the kiosk's, or PayU's) has no checkout on the page: its page opens.
  const linked = await setUp().service.createOrder('restaurant-1', 'token', {
    ...order,
    channel: 'COUNTER',
  });
  assert.equal(linked.checkout, null);
  assert.equal(linked.paymentUrl, 'https://pay.example/1');
});

test("a kiosk order needs the guest signed in for it; an employee's mobile gets their discount", async () => {
  const { payments, service } = setUp({
    kioskCounterId: 'counter-1',
    staffDiscountApplicable: true,
  });
  const kioskOrder = {
    clientOrderId: 'kiosk-1',
    lines: [{ menuId: 'menu-1', quantity: 1 }],
    method: 'UPI' as const,
  };

  await assert.rejects(
    service.createKioskOrder('restaurant-1', 'token', { ...kioskOrder, guestToken: '' }),
    (error) => error instanceof ForbiddenException,
  );

  await service.createKioskOrder('restaurant-1', 'token', {
    ...kioskOrder,
    guestToken: order.guestToken,
  });
  // On the bill: who confirmed their number, and their staff discount by itself.
  assert.equal(payments[0]?.customerName, 'Asha Rao');
  assert.equal(payments[0]?.customerMobile, '9876543210');
  assert.equal(payments[0]?.employeeCode, 'E100');
});

test('guessing the guest code in parallel gets no more than five tries', async () => {
  const { service, texts } = setUp();

  await service.sendGuestOtp('restaurant-1', 'token', { mobile: '9811122233', name: 'Meera' });
  const otp = texts[0]!.otp;
  const wrong = Array.from({ length: 8 }, (_, index) =>
    String((Number(otp) + index + 1) % 1_000_000).padStart(6, '0'),
  );

  const results = await Promise.allSettled(
    [...wrong, otp].map((guess) =>
      service.verifyGuestOtp('restaurant-1', 'token', { mobile: '9811122233', otp: guess }),
    ),
  );

  // Each try is counted before it is compared: the right code, sent ninth, is refused too.
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 0);
  assert.match(String((results.at(-1) as PromiseRejectedResult).reason), /Too many wrong tries/);
});

/** A waiting QR order as saved, placed `minutesAgo` minutes ago and paid with payment-<id>. */
const waiting = (id: string, minutesAgo: number) => ({
  bedNumber: null as string | null,
  channel: 'COUNTER',
  counterId: 'counter-1',
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
  employeeCode: null,
  hospitalId: 'hospital-1',
  id,
  instructions: null,
  lines: [{ menuId: 'menu-1', quantity: 1 }],
  onlinePaymentId: `payment-${id}`,
  roomNumber: null as string | null,
  status: 'AWAITING_PAYMENT',
  tableName: null,
});

/**
 * QR orders settled without the guest's page: what the gateway says of each payment (by order
 * id; none, and it does not answer), what billing does, and every write and audit row after.
 */
function settling(
  orders: Array<ReturnType<typeof waiting>>,
  paymentStatus: Record<string, string>,
  options: {
    billError?: Error;
    /** The bill another check already made with the payment. */
    billedWith?: string;
    /** Held until resolved: the first query of a sweep waits on it. */
    hold?: Promise<void>;
    /** Rows each conditional QR order write matches (0: another call got there first). */
    matches?: number;
    /** Payments cancelled lately that the gateway now says are paid. */
    paidLate?: string[];
  } = {},
) {
  const asked: string[] = [];
  const audits: string[] = [];
  const bills: string[] = [];
  const queries: Array<{ cancelled?: unknown; waiting?: unknown }> = [];
  const writes: Array<{ data: Record<string, unknown>; where: Record<string, unknown> }> = [];
  const codes: Array<{ data: Record<string, unknown>; where: Record<string, unknown> }> = [];
  const prisma = {
    restaurantOrder: {
      updateMany: (args: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
        codes.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
    onlinePayment: {
      findMany: (args: unknown) => {
        queries.push({ cancelled: args });
        return Promise.resolve((options.paidLate ?? []).map((id) => ({ id })));
      },
      findUnique: () => Promise.resolve({ orderId: options.billedWith ?? null }),
    },
    qrOrder: {
      findMany: async (args: { where: { status: string } }) => {
        queries.push({ waiting: args });
        await options.hold;
        return orders.filter((order) => order.status === args.where.status);
      },
      findUnique: ({ where }: { where: { id?: string; onlinePaymentId?: string } }) =>
        Promise.resolve(
          orders.find(
            (order) => order.id === where.id || order.onlinePaymentId === where.onlinePaymentId,
          ) ?? null,
        ),
      findUniqueOrThrow: () =>
        Promise.resolve({
          ...orders[0],
          billedOrder: null,
          grandTotal: 100,
          onlinePayment: { paymentUrl: '', provider: 'RAZORPAY', providerRef: 'plink_1' },
          restaurant: { restaurantName: 'Cafe' },
        }),
      updateMany: (args: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
        writes.push(args);
        return Promise.resolve({ count: options.matches ?? 1 });
      },
    },
  };
  const ask = (how: string) => (paymentId: string) => {
    asked.push(`${how} ${paymentId}`);
    const status = paymentStatus[paymentId.replace('payment-', '')];
    return status
      ? Promise.resolve({ status })
      : Promise.reject(new Error('Razorpay did not answer.'));
  };
  const onlinePayments = {
    cancel: ask('cancel'),
    check: ask('check'),
    paidAfterCancel: (id: string) => Promise.resolve(options.paidLate?.includes(id) ?? false),
  };
  const pos = {
    createOrder: (dto: { clientOrderId: string }) => {
      bills.push(dto.clientOrderId);
      return options.billError
        ? Promise.reject(options.billError)
        : Promise.resolve({ id: 'bill-1' });
    },
  };
  const auditLog = {
    record: (entry: { summary: string }) => {
      audits.push(entry.summary);
      return Promise.resolve();
    },
  };
  const service = new QrOrdersService(
    { get: () => undefined, getOrThrow: () => 'secret' } as unknown as ConfigService,
    onlinePayments as unknown as OnlinePaymentsService,
    pos as unknown as PosService,
    prisma as unknown as PrismaService,
    {} as SmsService,
    memoryStore() as unknown as RedisService,
    auditLog as unknown as AuditLogService,
  );

  return { asked, audits, bills, codes, queries, service, writes };
}

const keyOf = (id: string) =>
  createHmac('sha256', 'secret').update(`qr-order:${id}`).digest('base64url');

test("the sweeper settles what the guest's page left: oldest first, a batch at a time, each on its own", async () => {
  const { asked, bills, queries, service, writes } = settling(
    [waiting('paid', 5), waiting('down', 4), waiting('lapsed', 3), waiting('stale', 31)],
    { lapsed: 'EXPIRED', paid: 'PAID', stale: 'CANCELLED' },
  );

  const before = Date.now();
  await service.sweep();
  const after = Date.now();

  const query = queries[0]?.waiting as {
    orderBy: unknown;
    take: number;
    where: { createdAt: { gte: Date; lt: Date }; status: string };
  };
  const between = (at: Date, ago: number) =>
    at.valueOf() >= before - ago && at.valueOf() <= after - ago;
  assert.deepEqual(query.orderBy, { createdAt: 'asc' });
  assert.equal(query.take, 20);
  assert.equal(query.where.status, 'AWAITING_PAYMENT');
  // Left to the guest's own page for 90 seconds; not looked at again after a day.
  assert.ok(between(query.where.createdAt.lt, 90_000));
  assert.ok(between(query.where.createdAt.gte, 24 * 60 * 60_000));

  // Asked as status() asks; still unpaid after 30 minutes, let go as the kiosk's Cancel does.
  assert.deepEqual(asked, [
    'check payment-paid',
    'check payment-down',
    'check payment-lapsed',
    'cancel payment-stale',
  ]);
  // Paid: billed at its counter. One whose gateway did not answer waits for the next sweep.
  assert.deepEqual(bills, ['qr-paid']);
  assert.deepEqual(
    writes.map(({ data, where }) => [where.id, data.status]),
    [
      ['paid', 'BILLED'],
      ['lapsed', 'CLOSED'],
      ['stale', 'CLOSED'],
    ],
  );
});

test('a sweep never starts while the last one is still running', async () => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  const { queries, service } = settling([], {}, { hold });

  const first = service.sweep();
  await service.sweep();
  release();
  await first;

  assert.equal(queries.filter((query) => query.waiting).length, 1);
});

test('a paid room order gets a code for the steward to scan at the bed; a pickup order needs none', async () => {
  const room = settling(
    [{ ...waiting('paid', 1), bedNumber: 'B', channel: 'ROOM', roomNumber: '304' }],
    { paid: 'PAID' },
  );
  await room.service.status('paid', keyOf('paid'));

  assert.equal(room.codes.length, 1);
  assert.match(String(room.codes[0]?.data.deliveryCode), /^\d{6}$/);
  // Only on this bill, and never over a code it already has.
  assert.deepEqual(room.codes[0]?.where, { deliveryCode: null, id: 'bill-1' });

  const pickup = settling([waiting('paid', 1)], { paid: 'PAID' });
  await pickup.service.status('paid', keyOf('paid'));
  assert.equal(pickup.codes.length, 0);
});

test('two checks at once: the one whose bill loses the payment marks the order billed, never "refund it"', async () => {
  const taken = new ConflictException('This payment is already on another bill.');
  const raced = settling(
    [waiting('paid', 1)],
    { paid: 'PAID' },
    { billError: taken, billedWith: 'bill-1' },
  );

  await raced.service.status('paid', keyOf('paid'));

  // The other check's bill is this order's: billed with it, also over a "not billed" it beat.
  assert.deepEqual(raced.writes, [
    {
      data: { billedOrderId: 'bill-1', failureReason: null, status: 'BILLED' },
      where: { id: 'paid', status: { in: ['AWAITING_PAYMENT', 'PAID_NOT_BILLED'] } },
    },
  ]);
  assert.deepEqual(raced.audits, []);

  // Not billed for a real reason: flagged for a refund, and said once.
  const soldOut = new BadRequestException('Poha is sold out.');
  const flagged = settling([waiting('paid', 1)], { paid: 'PAID' }, { billError: soldOut });
  await flagged.service.status('paid', keyOf('paid'));
  assert.deepEqual(
    flagged.writes.map(({ data }) => data.status),
    ['PAID_NOT_BILLED'],
  );
  assert.deepEqual(flagged.audits, ['QR order paid but not billed: refund it']);

  const again = settling(
    [waiting('paid', 1)],
    { paid: 'PAID' },
    { billError: soldOut, matches: 0 },
  );
  await again.service.status('paid', keyOf('paid'));
  assert.deepEqual(again.audits, []);
});

test('a Razorpay order paid after it was let go is flagged for a refund; nothing bills it', async () => {
  const closed = { ...waiting('gone', 40), status: 'CLOSED' };
  const { audits, bills, queries, service, writes } = settling(
    [closed],
    {},
    { paidLate: ['payment-gone'] },
  );

  const before = Date.now();
  await service.sweep();
  const after = Date.now();

  // Payments whose provider cannot cancel (Razorpay orders, PayU links) cancelled in the last 30
  // minutes are asked again.
  const { where } = queries.find((query) => query.cancelled)?.cancelled as {
    where: { OR: unknown[]; status: string; updatedAt: { gte: Date } };
  };
  assert.equal(where.status, 'CANCELLED');
  assert.deepEqual(where.OR, [
    { provider: 'RAZORPAY', providerRef: { startsWith: 'order_' } },
    { provider: 'PAYU' },
  ]);
  const since = where.updatedAt.gte.valueOf() + 30 * 60_000;
  assert.ok(since >= before && since <= after);
  assert.deepEqual(bills, []);
  assert.deepEqual(writes, [
    {
      data: { failureReason: 'Paid after the order was cancelled.', status: 'PAID_NOT_BILLED' },
      where: { id: 'gone', status: 'CLOSED' },
    },
  ]);
  assert.deepEqual(audits, ['QR order paid but not billed: refund it']);
});
