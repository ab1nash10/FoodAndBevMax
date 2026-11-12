import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { test, vi } from 'vitest';
import type { SmsService } from '@aahar/auth';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { OnlinePaymentsService } from './online-payments.service';
import type { PosService } from './pos.service';
import { QrOrdersService } from './qr-orders.service';

// The location has Razorpay set up: UPI on the phone works.
vi.mock('./online-payment-providers', () => ({
  providersAt: () => Promise.resolve(new Map([['RAZORPAY', {}]])),
}));

/**
 * The restaurant's QR is for everyone: patients and attendants have it delivered to their room,
 * staff and visitors pick it up at the restaurant's QR counter.
 */
function setUp(restaurant: Record<string, unknown> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const menuChannels: string[] = [];
  const menuCounters: string[] = [];
  const prisma = {
    counter: { findFirst: () => Promise.resolve({ id: 'counter-1', counterName: 'Counter1' }) },
    qrOrder: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve(data);
      },
      findUnique: () => Promise.resolve(null),
      findUniqueOrThrow: () =>
        Promise.resolve({
          ...created.at(-1),
          billedOrder: null,
          grandTotal: 100,
          onlinePayment: { paymentUrl: 'https://pay.example/1', provider: 'RAZORPAY' },
          restaurant: { restaurantName: 'Cafe' },
          status: 'AWAITING_PAYMENT',
        }),
    },
    restaurant: {
      findFirst: () =>
        Promise.resolve({
          counters: [{ id: 'counter-1' }],
          hospital: { hospitalName: 'Saket' },
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
    findCounter: () => Promise.resolve({ hospitalId: 'hospital-1', id: 'counter-1' }),
    menu: ({ channel, counterId }: { channel: string; counterId: string }) => {
      menuChannels.push(channel);
      menuCounters.push(counterId);
      return Promise.resolve({ items: [] });
    },
    quoteBill: () => Promise.resolve({}),
  };
  const onlinePayments = { start: () => Promise.resolve({ amount: 100, id: 'payment-1' }) };
  const service = new QrOrdersService(
    { getOrThrow: () => 'secret' } as unknown as ConfigService,
    onlinePayments as unknown as OnlinePaymentsService,
    pos as unknown as PosService,
    prisma as unknown as PrismaService,
    {} as SmsService,
  );

  return { created, menuChannels, menuCounters, service };
}

const order = { clientOrderId: 'phone-1', lines: [{ menuId: 'menu-1', quantity: 1 }] };

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

test('a room order still needs the room number', async () => {
  const { created, service } = setUp();

  await assert.rejects(
    service.createOrder('restaurant-1', 'token', { ...order, roomNumber: ' ' }),
    (error) => error instanceof BadRequestException && /room number/i.test(error.message),
  );
  assert.equal(created.length, 0);

  await service.createOrder('restaurant-1', 'token', { ...order, roomNumber: '412' });
  assert.equal(created[0]?.channel, 'ROOM');
  assert.equal(created[0]?.roomNumber, '412');
});

test("QR orders go to the restaurant's first counter: there is nothing to pick", async () => {
  // A counter picked on the old setting is no longer used.
  const { menuCounters, service } = setUp({ qrCounterId: 'counter-9' });

  const menu = await service.menu('restaurant-1', 'token');

  assert.deepEqual(menuCounters, ['counter-1']);
  assert.equal(menu.open, true);
});
