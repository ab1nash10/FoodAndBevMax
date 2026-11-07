import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, test, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { KioskService } from './kiosk.service';
import type { PosService } from './pos.service';

// Thursday 22 Oct 2026, 13:00 in India: menus' days and hours are read against this.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T07:30:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

const decimal = (value: number) => new Prisma.Decimal(value);

interface Menu {
  availableFrom: string | null;
  availableTo: string | null;
  category: { categoryName: string; id: string; sortOrder: number };
  daysOfWeek: string[];
  gstPercent: Prisma.Decimal;
  id: string;
  isActive: boolean;
  isAvailable: boolean;
  isDiscountable: boolean;
  isFeatured: boolean;
  isGstInclusive: boolean;
  item: { itemName: string; type: string };
  preparationTimeMinutes: number | null;
  price: Prisma.Decimal | null;
  restaurantId: string;
  serveAt: string;
}

const menu = (id: string, itemName: string, overrides: Partial<Menu> = {}): Menu => ({
  availableFrom: null,
  availableTo: null,
  category: { categoryName: 'Snacks', id: 'cat-1', sortOrder: 1 },
  daysOfWeek: [],
  gstPercent: decimal(5),
  id,
  isActive: true,
  isAvailable: true,
  isDiscountable: true,
  isFeatured: false,
  isGstInclusive: true,
  item: { itemName, type: 'VEG' },
  preparationTimeMinutes: 5,
  price: decimal(60),
  restaurantId: 'restaurant-1',
  serveAt: 'BOTH',
  ...overrides,
});

const menus = [
  menu('samosa', 'Samosa', { isFeatured: true }),
  menu('chai', 'Chai', { isDiscountable: false, price: decimal(20) }),
  menu('soup', 'Room Soup', { serveAt: 'ROOM' }),
  menu('unpriced', 'Unpriced', { price: null }),
  menu('switched-off', 'Switched Off', { isAvailable: false }),
  menu('monday', 'Monday Special', { daysOfWeek: ['MONDAY'] }),
  menu('dinner', 'Dinner Thali', { availableFrom: '19:00', availableTo: '23:00' }),
  menu('lunch', 'Lunch Thali', {
    availableFrom: '12:00',
    availableTo: '15:00',
    price: decimal(120),
  }),
];

interface KioskOrder {
  billedOrderId: string | null;
  businessDate: Date;
  clientOrderId: string;
  createdAt: Date;
  employeeCode: string | null;
  id: string;
  lines: Array<{ menuId: string; quantity: number }>;
  number: number;
  restaurantId: string;
}

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', { clientVersion: 'test', code: 'P2002' });

// Stands in for Prisma: one restaurant, its menu, employees and kiosk orders, filtered as the
// real queries filter. `clashes` makes that many creates fail as two kiosks taking one number.
function serviceWith(
  options: {
    clashes?: number;
    counters?: number;
    gstApplicable?: boolean;
    orders?: KioskOrder[];
    raceWith?: KioskOrder;
    staffDiscountApplicable?: boolean;
  } = {},
) {
  const orders = options.orders ?? [];
  let clashes = options.clashes ?? 0;
  const restaurant = {
    counters: Array.from({ length: options.counters ?? 1 }, (_, index) => ({ id: `c${index}` })),
    hospital: { gstApplicable: options.gstApplicable ?? true, hospitalName: 'Max Saket' },
    id: 'restaurant-1',
    location: null,
    restaurantName: 'Cafe',
    staffDiscountApplicable: options.staffDiscountApplicable ?? true,
  };
  const employees = [
    { employeeCode: 'E100', mobile: '+919876543210' },
    { employeeCode: 'E200', mobile: '9811111111' },
    { employeeCode: 'E201', mobile: '919811111111' },
  ];
  const employeeLookups: string[] = [];
  const prisma = {
    employee: {
      findMany: ({ where }: { where: { mobile: { endsWith: string } } }) =>
        employees.filter((employee) => employee.mobile.endsWith(where.mobile.endsWith)).slice(0, 2),
    },
    kioskOrder: {
      create: ({ data }: { data: Omit<KioskOrder, 'billedOrderId' | 'createdAt' | 'id'> }) => {
        if (clashes > 0) {
          clashes -= 1;
          if (options.raceWith) orders.push(options.raceWith);
          throw p2002();
        }
        const order = {
          ...data,
          billedOrderId: null,
          createdAt: new Date(),
          id: `order-${orders.length + 1}`,
        };
        orders.push(order);
        return order;
      },
      findFirst: ({ where }: { where: { businessDate: Date } }) =>
        orders
          .filter((order) => order.businessDate.getTime() === where.businessDate.getTime())
          .sort((a, b) => b.number - a.number)[0] ?? null,
      findMany: () => orders.filter((order) => !order.billedOrderId),
      findUnique: ({
        where,
      }: {
        where: {
          restaurantId_businessDate_number?: { number: number };
          restaurantId_clientOrderId?: { clientOrderId: string };
        };
      }) =>
        orders.find((order) =>
          where.restaurantId_clientOrderId
            ? order.clientOrderId === where.restaurantId_clientOrderId.clientOrderId
            : order.number === where.restaurantId_businessDate_number!.number,
        ) ?? null,
    },
    restaurant: {
      findFirst: ({ where }: { where: { boardToken: string; id: string } }) =>
        where.boardToken === 'board-secret' && where.id === restaurant.id ? restaurant : null,
    },
    restaurantMenu: {
      findMany: ({
        where,
      }: {
        where: { id?: { in: string[] }; price?: unknown; serveAt?: { in: string[] } };
      }) =>
        menus.filter(
          (entry) =>
            entry.isActive &&
            (!where.id || where.id.in.includes(entry.id)) &&
            (!where.serveAt || where.serveAt.in.includes(entry.serveAt)) &&
            (!where.price || entry.price !== null),
        ),
    },
    restaurantOrder: {
      findUnique: () => ({ billNumber: 'SKT/00000042' }),
    },
  };
  const pos = {
    employeeDiscount: (_counter: unknown, employeeCode: string) => {
      employeeLookups.push(employeeCode);
      return Promise.resolve({ discountPercent: 10, employeeCode });
    },
    findCounter: () =>
      Promise.resolve({ restaurant: { restaurantName: 'Cafe' }, restaurantId: 'restaurant-1' }),
  };

  return {
    employeeLookups,
    orders,
    service: new KioskService(pos as unknown as PosService, prisma as unknown as PrismaService),
  };
}

const token = 'board-secret';

test('a kiosk opens only with the restaurant’s board link', async () => {
  const { service } = serviceWith();

  for (const wrong of [undefined, '', 'guessed']) {
    await assert.rejects(service.menu('restaurant-1', wrong), NotFoundException);
  }
  await assert.rejects(service.menu('other-restaurant', token), NotFoundException);
  await assert.rejects(
    service.createOrder('restaurant-1', 'guessed', { clientOrderId: 'k1', lines: [] }),
    NotFoundException,
  );
});

test('the kiosk menu lists what the counter sells now, featured items marked', async () => {
  const { service } = serviceWith();

  const shown = await service.menu('restaurant-1', token);

  assert.equal(shown.canPay, true);
  assert.equal(shown.locationName, 'Max Saket');
  assert.equal(shown.restaurantName, 'Cafe');
  assert.equal(shown.staffDiscount, true);
  // Room-only, unpriced, switched off, another day's and evening items are left out.
  assert.deepEqual(
    shown.items.map((item) => item.id),
    ['samosa', 'chai', 'lunch'],
  );
  assert.deepEqual(shown.items[0], {
    category: { categoryName: 'Snacks', id: 'cat-1', sortOrder: 1 },
    foodType: 'VEG',
    gstPercent: 5,
    id: 'samosa',
    isDiscountable: true,
    isFeatured: true,
    isGstInclusive: true,
    itemName: 'Samosa',
    preparationTimeMinutes: 5,
    price: 60,
  });
  assert.equal(shown.items[1]!.isFeatured, false);
});

test('a location without GST shows no GST, and one without a counter cannot take payment', async () => {
  const { service } = serviceWith({ counters: 0, gstApplicable: false });

  const shown = await service.menu('restaurant-1', token);

  assert.equal(shown.canPay, false);
  assert.ok(shown.items.every((item) => item.gstPercent === 0));
  await assert.rejects(
    service.createOrder('restaurant-1', token, {
      clientOrderId: 'k1',
      lines: [{ menuId: 'samosa', quantity: 1 }],
    }),
    (error: unknown) =>
      error instanceof BadRequestException && /not taking orders/.test(error.message),
  );
});

test('an order is priced by the server, whatever the kiosk sent, and numbered for the day', async () => {
  const { orders, service } = serviceWith();

  const first = await service.createOrder('restaurant-1', token, {
    clientOrderId: '  k1  ',
    // A tampered kiosk adds its own price; only menuId and quantity are kept.
    lines: [
      { menuId: 'samosa', quantity: 2, unitPrice: 1 } as { menuId: string; quantity: number },
      { menuId: 'chai', quantity: 1 },
    ],
  });

  assert.equal(first.number, 1);
  assert.equal(first.grandTotal, 140);
  assert.equal(first.discountTotal, 0);
  assert.deepEqual(
    first.lines.map(({ lineTotal, menuId, quantity, unitPrice }) => ({
      lineTotal,
      menuId,
      quantity,
      unitPrice,
    })),
    [
      { lineTotal: 120, menuId: 'samosa', quantity: 2, unitPrice: 60 },
      { lineTotal: 20, menuId: 'chai', quantity: 1, unitPrice: 20 },
    ],
  );
  assert.deepEqual(orders[0]!.lines, [
    { menuId: 'samosa', quantity: 2 },
    { menuId: 'chai', quantity: 1 },
  ]);
  assert.equal(orders[0]!.clientOrderId, 'k1');

  const second = await service.createOrder('restaurant-1', token, {
    clientOrderId: 'k2',
    lines: [{ menuId: 'lunch', quantity: 1 }],
  });
  assert.equal(second.number, 2);
  assert.equal(second.grandTotal, 120);
});

test('sending the same order again returns the order already placed', async () => {
  const { orders, service } = serviceWith();
  const dto = { clientOrderId: 'k1', lines: [{ menuId: 'samosa', quantity: 1 }] };

  const first = await service.createOrder('restaurant-1', token, dto);
  const again = await service.createOrder('restaurant-1', token, { ...dto, clientOrderId: ' k1' });

  assert.deepEqual(again, first);
  assert.equal(orders.length, 1);
});

test('a resend still gets its number after an item in the order goes off sale', async () => {
  const taken: KioskOrder = {
    billedOrderId: null,
    businessDate: new Date(),
    clientOrderId: 'k1',
    createdAt: new Date(),
    employeeCode: null,
    id: 'order-1',
    lines: [{ menuId: 'switched-off', quantity: 2 }],
    number: 7,
    restaurantId: 'restaurant-1',
  };
  const { service } = serviceWith({ orders: [taken] });

  const again = await service.createOrder('restaurant-1', token, {
    clientOrderId: 'k1',
    lines: [{ menuId: 'switched-off', quantity: 2 }],
  });

  assert.equal(again.number, 7);
  assert.equal(again.grandTotal, 120);
});

test('items not sold at the counter, unpriced or off sale now are refused', async () => {
  const { orders, service } = serviceWith();
  const order = (menuId: string) =>
    service.createOrder('restaurant-1', token, {
      clientOrderId: `k-${menuId}`,
      lines: [
        { menuId: 'samosa', quantity: 1 },
        { menuId, quantity: 1 },
      ],
    });

  for (const menuId of ['soup', 'unpriced', 'no-such-item']) {
    await assert.rejects(
      order(menuId),
      (error: unknown) =>
        error instanceof BadRequestException && /not on the menu/.test(error.message),
    );
  }
  for (const [menuId, name] of [
    ['switched-off', 'Switched Off'],
    ['monday', 'Monday Special'],
    ['dinner', 'Dinner Thali'],
  ] as const) {
    await assert.rejects(
      order(menuId),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === `${name} is not available right now.`,
    );
  }
  assert.equal(orders.length, 0);
});

test('a staff mobile takes the discount off discountable items only', async () => {
  const { employeeLookups, orders, service } = serviceWith();

  const placed = await service.createOrder('restaurant-1', token, {
    clientOrderId: 'k1',
    lines: [
      { menuId: 'samosa', quantity: 2 },
      { menuId: 'chai', quantity: 1 },
    ],
    mobile: '9876543210',
  });

  assert.deepEqual(employeeLookups, ['E100']);
  assert.equal(placed.discountPercent, 10);
  // 10% off Samosa's taxable 114.28; Chai stays at ₹20.
  assert.equal(placed.discountTotal, 11.43);
  assert.equal(placed.lines[1]!.lineTotal, 20);
  assert.equal(orders[0]!.employeeCode, 'E100');
});

test('a restaurant without staff discount ignores the mobile', async () => {
  const { employeeLookups, orders, service } = serviceWith({ staffDiscountApplicable: false });

  const placed = await service.createOrder('restaurant-1', token, {
    clientOrderId: 'k1',
    lines: [{ menuId: 'samosa', quantity: 1 }],
    mobile: '9000000000',
  });

  assert.equal(placed.discountPercent, 0);
  assert.deepEqual(employeeLookups, []);
  assert.equal(orders[0]!.employeeCode, null);
});

test('a mobile matching no one, or two people, gets no discount', async () => {
  const { service } = serviceWith();

  for (const mobile of ['9000000000', '9811111111']) {
    await assert.rejects(service.staffDiscount('restaurant-1', token, mobile), NotFoundException);
  }
  assert.deepEqual(await service.staffDiscount('restaurant-1', token, '9876543210'), {
    discountPercent: 10,
  });
});

test('a restaurant without staff discount says no one is staff, as for an unknown number', async () => {
  const { employeeLookups, service } = serviceWith({ staffDiscountApplicable: false });

  await assert.rejects(
    service.staffDiscount('restaurant-1', token, '9876543210'),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message === 'No staff member is registered with this mobile number.',
  );
  assert.deepEqual(employeeLookups, []);
});

test('two kiosks taking the same number retry with the next, up to five tries', async () => {
  const dto = { clientOrderId: 'k1', lines: [{ menuId: 'samosa', quantity: 1 }] };

  const retried = await serviceWith({ clashes: 4 }).service.createOrder('restaurant-1', token, dto);
  assert.equal(retried.number, 1);

  await assert.rejects(
    serviceWith({ clashes: 5 }).service.createOrder('restaurant-1', token, dto),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError,
  );
});

test('a double tap that raced past the check returns the first tap’s order', async () => {
  const first: KioskOrder = {
    billedOrderId: null,
    businessDate: new Date('2026-10-22T00:00:00Z'),
    clientOrderId: 'k1',
    createdAt: new Date(),
    employeeCode: null,
    id: 'first',
    lines: [{ menuId: 'chai', quantity: 3 }],
    number: 7,
    restaurantId: 'restaurant-1',
  };
  const { orders, service } = serviceWith({ clashes: 1, raceWith: first });

  const placed = await service.createOrder('restaurant-1', token, {
    clientOrderId: 'k1',
    lines: [{ menuId: 'samosa', quantity: 1 }],
  });

  assert.equal(placed.id, 'first');
  assert.equal(placed.number, 7);
  assert.equal(placed.grandTotal, 60);
  assert.equal(orders.length, 1);
});

test('the cashier loads a kiosk order by number, unless it is already billed', async () => {
  const order = (number: number, extra: Partial<KioskOrder> = {}): KioskOrder => ({
    billedOrderId: null,
    businessDate: new Date('2026-10-22T00:00:00Z'),
    clientOrderId: `k${number}`,
    createdAt: new Date(),
    employeeCode: null,
    id: `order-${number}`,
    lines: [{ menuId: 'samosa', quantity: 2 }],
    number,
    restaurantId: 'restaurant-1',
    ...extra,
  });
  const { service } = serviceWith({
    orders: [
      order(1),
      order(2, { billedOrderId: 'bill-1' }),
      order(3, { employeeCode: 'E100', lines: [{ menuId: 'gone', quantity: 1 }] }),
    ],
  });

  assert.deepEqual(await service.forCounter('counter-1', 1), {
    employeeCode: null,
    id: 'order-1',
    lines: [{ menuId: 'samosa', quantity: 2 }],
    number: 1,
  });
  await assert.rejects(
    service.forCounter('counter-1', 2),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'Kiosk order 2 is already billed (SKT/00000042).',
  );
  await assert.rejects(
    service.forCounter('counter-1', 9),
    (error: unknown) =>
      error instanceof NotFoundException && /No kiosk order 9 today at Cafe/.test(error.message),
  );

  const waiting = await service.waiting('counter-1');
  assert.deepEqual(
    waiting.map(({ isStaff, items, number }) => ({ isStaff, items, number })),
    [
      { isStaff: false, items: [{ name: 'Samosa', quantity: 2 }], number: 1 },
      { isStaff: true, items: [{ name: 'Item no longer on the menu', quantity: 1 }], number: 3 },
    ],
  );
});
