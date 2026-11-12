import { strict as assert } from 'node:assert';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, test, vi } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { KioskService } from './kiosk.service';
import type { QrOrdersService } from './qr-orders.service';

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

// Stands in for Prisma: one restaurant and its menu, filtered as the real query filters.
function serviceWith(
  options: { gstApplicable?: boolean; payment?: { open: boolean; payWith: string[] } } = {},
) {
  const restaurant = {
    hospital: { gstApplicable: options.gstApplicable ?? true, hospitalName: 'Max Saket' },
    hospitalId: 'hospital-1',
    id: 'restaurant-1',
    kioskCounterId: 'counter-1',
    location: null,
    restaurantName: 'Cafe',
    staffDiscountApplicable: true,
  };
  const prisma = {
    restaurant: {
      findFirst: ({ where }: { where: { boardToken: string; id: string } }) =>
        where.boardToken === 'board-secret' && where.id === restaurant.id ? restaurant : null,
    },
    restaurantMenu: {
      findMany: ({ where }: { where: { price?: unknown; serveAt?: { in: string[] } } }) =>
        menus.filter(
          (entry) =>
            entry.isActive &&
            (!where.serveAt || where.serveAt.in.includes(entry.serveAt)) &&
            (!where.price || entry.price !== null),
        ),
    },
  };
  const payment = options.payment ?? { open: true, payWith: ['UPI'] };

  return new KioskService(
    prisma as unknown as PrismaService,
    // Whether the kiosk counter is open, and how it is paid, is the guest-orders service's.
    { kioskPayment: () => Promise.resolve(payment) } as unknown as QrOrdersService,
  );
}

const token = 'board-secret';

test('a kiosk opens only with the restaurant’s board link', async () => {
  const service = serviceWith();

  for (const wrong of [undefined, '', 'guessed']) {
    await assert.rejects(service.menu('restaurant-1', wrong), NotFoundException);
  }
  await assert.rejects(service.menu('other-restaurant', token), NotFoundException);
});

test('the kiosk menu lists what the counter sells now, featured items marked', async () => {
  const shown = await serviceWith().menu('restaurant-1', token);

  assert.equal(shown.open, true);
  assert.deepEqual(shown.payWith, ['UPI']);
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

test('a location without GST shows no GST; a closed kiosk counter takes no orders', async () => {
  const shown = await serviceWith({
    gstApplicable: false,
    payment: { open: false, payWith: [] },
  }).menu('restaurant-1', token);

  assert.equal(shown.open, false);
  assert.deepEqual(shown.payWith, []);
  assert.ok(shown.items.every((item) => item.gstPercent === 0));
});
