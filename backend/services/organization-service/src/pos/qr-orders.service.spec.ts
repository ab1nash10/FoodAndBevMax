import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { test, vi } from 'vitest';
import type { RedisService, SmsService } from '@aahar/auth';
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
