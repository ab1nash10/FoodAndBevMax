import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, test, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { CreatePosOrderDto } from './dto/pos.dto';
import { PosService } from './pos.service';

// Thursday 22 Oct 2026, 13:00 in India: the business day is the 22nd.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T07:30:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

const decimal = (value: number) => new Prisma.Decimal(value);
const day = (date: string) => new Date(`${date}T00:00:00Z`);

const counter = {
  counterCode: 'C1',
  counterName: 'Till 1',
  hospital: {
    billPrefix: 'SKT',
    gstApplicable: true,
    hospitalCode: 'MSSH',
    hospitalName: 'Max Saket',
    id: 'hospital-1',
  },
  hospitalId: 'hospital-1',
  id: 'counter-1',
  restaurant: { id: 'restaurant-1', restaurantName: 'Cafe', staffDiscountApplicable: true },
  restaurantId: 'restaurant-1',
};

const menu = (id: string, overrides: Record<string, unknown> = {}) => ({
  availableFrom: null,
  availableTo: null,
  daysOfWeek: [],
  gstPercent: decimal(5),
  id,
  isAvailable: true,
  isDiscountable: true,
  isGstInclusive: true,
  item: { hsnCode: null as string | null, itemName: id[0]!.toUpperCase() + id.slice(1) },
  itemId: `item-${id}`,
  menuItemCode: id.toUpperCase(),
  price: decimal(60) as Prisma.Decimal | null,
  roomPrice: null as Prisma.Decimal | null,
  serveAt: 'BOTH',
  ...overrides,
});

const menus = [
  menu('samosa'),
  menu('chai', {
    isDiscountable: false,
    item: { hsnCode: ' 0902 ', itemName: 'Chai' },
    price: decimal(20),
    serveAt: 'COUNTER',
  }),
  menu('soup', { price: decimal(100), roomPrice: decimal(150), serveAt: 'ROOM' }),
];

interface Balance {
  availableQty: Prisma.Decimal;
  batchNumber: string;
  expiryDate: Date | null;
  hospitalId: string;
  id: string;
  itemId: string;
  itemType: string;
  locationId: string;
  locationType: string;
}

const balance = (id: string, qty: number, expiry: string | null): Balance => ({
  availableQty: decimal(qty),
  batchNumber: id,
  expiryDate: expiry ? day(expiry) : null,
  hospitalId: 'hospital-1',
  id,
  itemId: 'item-samosa',
  itemType: 'FINISHED',
  locationId: 'counter-1',
  locationType: 'COUNTER',
});

type Stored = Record<string, unknown> & { id: string };

// Stands in for Prisma with the tables billing and cancelling touch, all in memory. Every
// transaction runs straight through on the same fake.
function serviceWith(
  options: {
    balances?: Balance[];
    /** Online payments set up here (Razorpay keys, Pine Labs' Plutus url); none by default. */
    config?: ConfigService;
    dayClosed?: boolean;
    employees?: Array<{
      eligibleForDiscount: boolean;
      employeeCode: string;
      employmentType: string;
    }>;
    /** Pine Labs machines on the counter's POS device. */
    machines?: Array<Record<string, unknown>>;
    noShift?: boolean;
    payments?: Array<Record<string, unknown>>;
    shiftEnded?: boolean;
    shiftEndedWhileBilling?: boolean;
    staffDiscountApplicable?: boolean;
    upiId?: string;
  } = {},
) {
  const orders: Stored[] = [];
  const ledger: Array<Record<string, unknown>> = [];
  const balances = options.balances ?? [];
  const payments = options.payments ?? [];
  const audits: Array<{ action: string }> = [];
  const lookups: string[] = [];
  // Row locks taken and the day-close reads, in order.
  const events: string[] = [];
  let billSequence = 41;
  const closes = options.dayClosed ? [{ businessDate: day('2026-10-22'), id: 'close-1' }] : [];
  const employees = options.employees ?? [
    { eligibleForDiscount: true, employeeCode: 'E100', employmentType: 'ON_ROLL' },
  ];

  const prisma = {
    $queryRaw: (_sql: TemplateStringsArray, table: { sql: string }) => {
      events.push(`lock ${table.sql.replaceAll('"', '')}`);
      return Promise.resolve([]);
    },
    $transaction: (handler: (tx: unknown) => unknown) => handler(prisma),
    counter: {
      findFirst: () => ({
        ...counter,
        posDeviceId: 'device-1',
        restaurant: { ...counter.restaurant, upiId: options.upiId ?? null },
      }),
    },
    counterDayClose: {
      findFirst: ({ where }: { where: { businessDate: Date } }) => {
        events.push('day close read');
        return (
          closes.find((close) => close.businessDate.getTime() === where.businessDate.getTime()) ??
          null
        );
      },
    },
    counterShift: {
      findFirst: () => (options.noShift ? null : { id: 'shift-1' }),
      findUnique: () => ({ status: options.shiftEnded ? 'HANDED_OVER' : 'OPEN' }),
      findUniqueOrThrow: () => ({
        id: 'shift-1',
        status: options.shiftEndedWhileBilling ? 'CLOSED' : 'OPEN',
      }),
    },
    employee: {
      findFirst: ({ where }: { where: { employeeCode: { equals: string } } }) => {
        lookups.push(where.employeeCode.equals);
        const found = employees.find(
          (employee) =>
            employee.employeeCode.toLowerCase() === where.employeeCode.equals.toLowerCase(),
        );
        return found ? { ...found, employeeName: 'Neha' } : null;
      },
    },
    employeeDiscount: {
      findMany: () => [
        {
          daysOfWeek: [],
          discountPercent: decimal(10),
          employmentType: null,
          endTime: null,
          id: 'rule-1',
          name: 'Staff 10%',
          startTime: null,
        },
      ],
    },
    hospital: {
      // The counter's location picked Razorpay, on the shared keys (`config`).
      findFirst: () => ({
        onlinePaymentOption: 'RAZORPAY',
        payuClientId: null,
        payuClientSecret: null,
        payuMerchantId: null,
        razorpayKeyId: null,
        razorpayKeySecret: null,
      }),
      update: () => {
        billSequence += 1;
        return { billSequence };
      },
    },
    paymentMachine: {
      findMany: () => options.machines ?? [],
    },
    onlinePayment: {
      findFirst: ({ where }: { where: { id: string } }) =>
        payments.find((payment) => payment.id === where.id) ?? null,
      updateMany: ({ data, where }: { data: { orderId: string }; where: { id: string } }) => {
        const payment = payments.find((entry) => entry.id === where.id && !entry.orderId);
        if (payment) payment.orderId = data.orderId;
        return { count: payment ? 1 : 0 };
      },
    },
    restaurant: {
      findUniqueOrThrow: () => ({
        staffDiscountApplicable: options.staffDiscountApplicable ?? true,
      }),
    },
    restaurantMenu: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        menus.filter((entry) => where.id.in.includes(entry.id)),
    },
    restaurantOrder: {
      count: ({ where }: { where: { businessDate: Date } }) =>
        orders.filter(
          (order) => (order.businessDate as Date).getTime() === where.businessDate.getTime(),
        ).length,
      create: ({ data }: { data: Record<string, unknown> & { lines: { create: Stored[] } } }) => {
        const order = {
          ...data,
          counter: { counterCode: 'C1', counterName: 'Till 1', id: 'counter-1' },
          id: `order-${orders.length + 1}`,
          lines: data.lines.create.map((line, index) => ({
            ...line,
            id: `line-${index}`,
            restaurantMenu: { isDiscountable: true },
          })),
        };
        orders.push(order);
        return order;
      },
      findFirst: ({ where }: { where: { id: string } }) =>
        orders.find((order) => order.id === where.id) ?? null,
      findUnique: ({
        where,
      }: {
        where: { senderId_externalOrderId: { externalOrderId: string } };
      }) =>
        orders.find(
          (order) => order.externalOrderId === where.senderId_externalOrderId.externalOrderId,
        ) ?? null,
      findUniqueOrThrow: ({ where }: { where: { id: string } }) =>
        orders.find((order) => order.id === where.id)!,
      update: ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) =>
        Object.assign(
          orders.find((order) => order.id === where.id)!,
          data,
        ),
    },
    stockBalance: {
      create: ({ data }: { data: Balance }) => {
        const created = { ...data, availableQty: decimal(Number(data.availableQty)), id: 'new' };
        balances.push(created);
        return created;
      },
      findFirst: ({ where }: { where: { batchNumber: string; expiryDate: Date | null } }) =>
        balances.find(
          (entry) =>
            entry.batchNumber === where.batchNumber &&
            entry.expiryDate?.getTime() === where.expiryDate?.getTime(),
        ) ?? null,
      // The fixtures are listed earliest expiry first, as the real query orders them.
      // Copies, as Prisma returns: updates do not change rows already read.
      findMany: ({ where }: { where: { itemId: string } }) =>
        balances.filter((entry) => entry.itemId === where.itemId).map((entry) => ({ ...entry })),
      update: ({
        data,
        where,
      }: {
        data: { availableQty: { increment: number } };
        where: { id: string };
      }) => {
        const entry = balances.find((stored) => stored.id === where.id)!;
        entry.availableQty = entry.availableQty.plus(data.availableQty.increment);
        return entry;
      },
      updateMany: ({
        data,
        where,
      }: {
        data: { availableQty: { decrement: number } };
        where: { id: string };
      }) => {
        const entry = balances.find((stored) => stored.id === where.id)!;
        entry.availableQty = entry.availableQty.minus(data.availableQty.decrement);
        return { count: 1 };
      },
    },
    stockLedger: {
      create: ({ data }: { data: Record<string, unknown> }) => ledger.push(data),
      findMany: ({ where }: { where: { referenceId: string; transactionType: string } }) =>
        ledger.filter(
          (entry) =>
            entry.referenceId === where.referenceId &&
            entry.transactionType === where.transactionType,
        ),
    },
    user: { findUnique: () => ({ employeeCode: 'C001', name: 'Asha' }) },
  };
  const service = new PosService(
    {
      record: (entry: { action: string }) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
    options.config,
  );

  return { audits, balances, events, ledger, lookups, orders, payments, service };
}

const cashier = { actorId: 'cashier-1', permissions: ['POS_ORDER_CREATE'] };
const bill = (overrides: Partial<CreatePosOrderDto> = {}): CreatePosOrderDto => ({
  channel: 'COUNTER',
  clientOrderId: 'till-1',
  counterId: 'counter-1',
  lines: [{ menuId: 'samosa', quantity: 2 }],
  paymentMode: 'CASH',
  ...overrides,
});

test('room orders and complimentary meals need their own permissions', async () => {
  const { orders, service } = serviceWith();

  await assert.rejects(
    service.createOrder(
      bill({ channel: 'ROOM', lines: [{ menuId: 'soup', quantity: 1 }] }),
      cashier,
    ),
    ForbiddenException,
  );
  await assert.rejects(
    service.createOrder(bill({ isComplimentary: true }), cashier),
    ForbiddenException,
  );
  assert.equal(orders.length, 0);
});

test('a room order is billed at the room price, and counter-only items are refused', async () => {
  const { service } = serviceWith();
  const roomCashier = { ...cashier, permissions: ['POS_ROOM_ORDER'] };

  const room = await service.createOrder(
    bill({
      channel: 'ROOM',
      lines: [
        { menuId: 'soup', quantity: 1 },
        { menuId: 'samosa', quantity: 1 },
      ],
    }),
    roomCashier,
  );
  // Soup's room price, Samosa's ordinary price where no room price is set.
  assert.deepEqual(
    room.lines.map((line) => line.unitPrice),
    [150, 60],
  );

  await assert.rejects(
    service.createOrder(
      bill({ channel: 'ROOM', clientOrderId: 'till-2', lines: [{ menuId: 'chai', quantity: 1 }] }),
      roomCashier,
    ),
    (error: unknown) =>
      error instanceof BadRequestException && error.message === 'Chai is not sold for rooms.',
  );
  await assert.rejects(
    service.createOrder(
      bill({ clientOrderId: 'till-3', lines: [{ menuId: 'soup', quantity: 1 }] }),
      cashier,
    ),
    (error: unknown) =>
      error instanceof BadRequestException && error.message === 'Soup is not sold for the counter.',
  );
  await assert.rejects(
    service.createOrder(
      bill({ clientOrderId: 'till-4', lines: [{ menuId: 'gone', quantity: 1 }] }),
      cashier,
    ),
    BadRequestException,
  );
});

test('a counter bills only while a shift is open there', async () => {
  await assert.rejects(
    serviceWith({ noShift: true }).service.createOrder(bill(), cashier),
    (error: unknown) => error instanceof BadRequestException && /Open a shift/.test(error.message),
  );
  await assert.rejects(
    serviceWith({ shiftEndedWhileBilling: true }).service.createOrder(bill(), cashier),
    (error: unknown) => error instanceof ConflictException && /just ended/.test(error.message),
  );
});

test('a bill takes the location’s next invoice number and the counter’s next order number', async () => {
  const { audits, orders, service } = serviceWith();

  const first = await service.createOrder(
    bill({
      lines: [
        { menuId: 'samosa', quantity: 2 },
        { menuId: 'chai', quantity: 1 },
      ],
    }),
    cashier,
  );
  const second = await service.createOrder(bill({ clientOrderId: 'till-2' }), cashier);

  assert.equal(first.billNumber, 'SKT/00000042');
  assert.equal(second.billNumber, 'SKT/00000043');
  assert.equal(first.orderNumber, '0001');
  assert.equal(second.orderNumber, '0002');
  assert.equal(first.kotNumber, 'C1/261022/0001');
  assert.equal(first.grandTotal, 140);
  assert.equal(first.paymentMode, 'CASH');
  assert.equal(first.cashierName, 'Asha');
  // An item with no HSN of its own prints the restaurant-service SAC.
  assert.deepEqual(
    first.lines.map((line) => line.hsnCode),
    ['996331', '0902'],
  );
  assert.equal(orders[0]!.shiftId, 'shift-1');
  assert.deepEqual(orders[0]!.items, [
    { name: 'Samosa', quantity: 2 },
    { name: 'Chai', quantity: 1 },
  ]);
  assert.equal(audits.length, 2);
});

test('the same clientOrderId returns the bill already made', async () => {
  const { orders, service } = serviceWith();

  const first = await service.createOrder(bill(), cashier);
  const again = await service.createOrder(bill({ clientOrderId: '  till-1 ' }), cashier);

  assert.equal(again.id, first.id);
  assert.equal(orders.length, 1);
});

test('once the counter’s day is closed, a bill goes on the next business day', async () => {
  const { service } = serviceWith({ dayClosed: true });

  const made = await service.createOrder(bill(), cashier);

  assert.deepEqual(made.businessDate, day('2026-10-23'));
});

test('an employee’s discount comes off discountable items only', async () => {
  const { lookups, orders, service } = serviceWith();

  const made = await service.createOrder(
    bill({
      employeeCode: ' e100 ',
      lines: [
        { menuId: 'samosa', quantity: 2 },
        { menuId: 'chai', quantity: 1 },
      ],
    }),
    cashier,
  );

  assert.deepEqual(lookups, ['e100']);
  assert.equal(made.discountPercent, 10);
  assert.equal(made.discountTotal, 11.43);
  assert.deepEqual(
    made.lines.map((line) => line.discountAmount),
    [11.43, 0],
  );
  assert.equal(orders[0]!.employeeCode, 'e100');

  await assert.rejects(
    service.createOrder(bill({ clientOrderId: 'till-2', employeeCode: 'E999' }), cashier),
    (error: unknown) =>
      error instanceof BadRequestException && /No active employee/.test(error.message),
  );
});

test('no discount for an ineligible employee or at a restaurant that gives none', async () => {
  for (const options of [
    {
      employees: [{ eligibleForDiscount: false, employeeCode: 'E100', employmentType: 'ON_ROLL' }],
    },
    { staffDiscountApplicable: false },
  ]) {
    const made = await serviceWith(options).service.createOrder(
      bill({ employeeCode: 'E100' }),
      cashier,
    );

    assert.equal(made.discountTotal, 0);
    // No discount, so no rate is printed.
    assert.equal(made.discountPercent, null);
  }
});

test('a complimentary meal checks the employee but takes no discount and no payment', async () => {
  const { lookups, service } = serviceWith();
  const approver = { ...cashier, permissions: ['POS_COMPLIMENTARY_APPROVE'] };

  const made = await service.createOrder(
    bill({
      complimentaryReason: ' Doctor on duty ',
      employeeCode: 'E100',
      isComplimentary: true,
      paymentMode: 'CARD',
      paymentReference: 'ref-1',
    }),
    approver,
  );

  assert.deepEqual(lookups, ['E100']);
  assert.equal(made.isComplimentary, true);
  assert.equal(made.complimentaryReason, 'Doctor on duty');
  assert.equal(made.paymentMode, null);
  assert.equal(made.paymentReference, null);
  assert.equal(made.discountTotal, 0);
});

test('counter stock is taken earliest expiry first, skipping expired batches', async () => {
  const balances = [
    balance('expired', 10, '2026-10-21'),
    balance('today', 1, '2026-10-22'),
    balance('later', 5, '2026-10-25'),
  ];
  const { ledger, service } = serviceWith({ balances });

  await assert.rejects(
    service.createOrder(bill({ lines: [{ menuId: 'samosa', quantity: 7 }] }), cashier),
    (error: unknown) =>
      error instanceof BadRequestException && error.message.startsWith('Only 6 of Samosa left'),
  );

  // Chai keeps no stock at this counter, so it sells freely. (The fake does not roll back the
  // refused bill, so this one gets its own id.)
  await service.createOrder(
    bill({
      clientOrderId: 'till-2',
      lines: [
        { menuId: 'samosa', quantity: 2 },
        { menuId: 'chai', quantity: 1 },
        { menuId: 'samosa', quantity: 1 },
      ],
    }),
    cashier,
  );

  assert.deepEqual(
    balances.map((entry) => Number(entry.availableQty)),
    [10, 0, 3],
  );
  assert.deepEqual(
    ledger.map(({ batchNumber, balanceAfter, qtyOut, transactionType }) => ({
      balanceAfter,
      batchNumber,
      qtyOut,
      transactionType,
    })),
    [
      { balanceAfter: 0, batchNumber: 'today', qtyOut: 1, transactionType: 'SALE_OUT' },
      { balanceAfter: 3, batchNumber: 'later', qtyOut: 2, transactionType: 'SALE_OUT' },
    ],
  );
});

test('a bill paid online takes a paid, unused payment for exactly its total', async () => {
  const payment = (id: string, extra: Record<string, unknown> = {}) => ({
    amount: decimal(120),
    counterId: 'counter-1',
    id,
    orderId: null,
    paidReference: `pay_${id}`,
    status: 'PAID',
    ...extra,
  });
  const { payments, service } = serviceWith({
    payments: [
      payment('pending', { status: 'PENDING' }),
      payment('short', { amount: decimal(100) }),
      payment('used', { orderId: 'order-0' }),
      payment('good'),
    ],
  });
  const paidWith = (onlinePaymentId: string) =>
    service.createOrder(bill({ clientOrderId: onlinePaymentId, onlinePaymentId }), cashier);

  await assert.rejects(paidWith('missing'), NotFoundException);
  await assert.rejects(paidWith('pending'), BadRequestException);
  await assert.rejects(
    paidWith('short'),
    (error: unknown) =>
      error instanceof ConflictException &&
      /₹100.00 was paid, but the bill now comes to ₹120.00/.test(error.message),
  );
  await assert.rejects(paidWith('used'), ConflictException);

  const made = await paidWith('good');
  assert.equal(made.paymentMode, 'UPI');
  assert.equal(made.paymentReference, 'pay_good');
  assert.equal(payments[3]!.orderId, made.id);
});

test('a bill paid on the Pine Labs card machine is a card bill, with the card’s reference', async () => {
  const { service } = serviceWith({
    payments: [
      {
        amount: decimal(120),
        counterId: 'counter-1',
        id: 'card',
        orderId: null,
        paidReference: '530112345678',
        provider: 'PINELABS',
        status: 'PAID',
      },
    ],
  });

  const made = await service.createOrder(
    bill({ clientOrderId: 'card', onlinePaymentId: 'card', paymentMode: 'UPI' }),
    cashier,
  );

  assert.equal(made.paymentMode, 'CARD');
  assert.equal(made.paymentReference, '530112345678');
});

test('where the till takes UPI or cards through a provider, a typed reference is not proof', async () => {
  const razorpay = new ConfigService({
    RAZORPAY_KEY_ID: 'rzp_test_fake',
    RAZORPAY_KEY_SECRET: 'x',
  });
  const plutus = new ConfigService({ PINELABS_BASE_URL: 'https://plutus.example.test/V1' });
  const machine = {
    createdAt: new Date('2026-10-01'),
    id: 'machine-1',
    isDefault: true,
    name: 'Till 1 card machine',
    pinelabImei: 'IMEI-1',
    pinelabMerchantId: '29610',
    pinelabMerchantStorePosCode: '1221258437',
    pinelabSecurityToken: 'token-1',
  };
  const typed = (mode: 'CARD' | 'OTHER' | 'UPI') =>
    bill({ clientOrderId: `typed-${mode}`, paymentMode: mode, paymentReference: 'REF-1' });

  // UPI with Razorpay set up and no own UPI ID: the till only offers Razorpay's QR.
  await assert.rejects(
    serviceWith({ config: razorpay }).service.createOrder(typed('UPI'), cashier),
    (error: unknown) =>
      error instanceof BadRequestException && /Take UPI on the till’s QR/.test(error.message),
  );
  // The restaurant's own UPI QR has no provider to ask: typed in, as before.
  const ownQr = await serviceWith({ config: razorpay, upiId: 'cafe@upi' }).service.createOrder(
    typed('UPI'),
    cashier,
  );
  assert.deepEqual([ownQr.paymentMode, ownQr.paymentReference], ['UPI', 'REF-1']);
  // A counter with a Pine Labs machine takes cards on it.
  await assert.rejects(
    serviceWith({ config: plutus, machines: [machine] }).service.createOrder(
      typed('CARD'),
      cashier,
    ),
    (error: unknown) => error instanceof BadRequestException && /card machine/.test(error.message),
  );
  // A machine missing its Pine Labs details is not offered, so cards stay typed in.
  for (const machines of [[], [{ ...machine, pinelabSecurityToken: ' ' }]]) {
    const card = await serviceWith({ config: plutus, machines }).service.createOrder(
      typed('CARD'),
      cashier,
    );
    assert.equal(card.paymentReference, 'REF-1');
  }
  // Nothing set up for that mode, or a mode no provider takes: typed in.
  for (const [config, mode] of [
    [undefined, 'UPI'],
    [razorpay, 'CARD'],
    [razorpay, 'OTHER'],
  ] as const) {
    const made = await serviceWith({ config }).service.createOrder(typed(mode), cashier);
    assert.equal(made.paymentMode, mode);
  }
  // Cash is cash; a complimentary meal takes no payment.
  await assert.doesNotReject(
    serviceWith({ config: razorpay }).service.createOrder(bill(), cashier),
  );
});

test('the till’s employee lookup says only what the cashier sees', async () => {
  const { service } = serviceWith();

  assert.deepEqual(await service.lookupEmployee({ code: ' e100 ', counterId: 'counter-1' }), {
    discountName: 'Staff 10%',
    discountPercent: 10,
    employeeCode: 'E100',
    employeeName: 'Neha',
    employmentType: 'ON_ROLL',
  });
});

test('cancelling a bill puts its stock back, once', async () => {
  const balances = [balance('today', 1, '2026-10-22'), balance('later', 5, '2026-10-25')];
  const { audits, ledger, service } = serviceWith({ balances });
  const made = await service.createOrder(
    bill({ lines: [{ menuId: 'samosa', quantity: 3 }] }),
    cashier,
  );

  const cancelled = await service.cancel(made.id, { reason: '  wrong item ' }, cashier);

  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancelReason, 'wrong item');
  assert.deepEqual(
    balances.map((entry) => Number(entry.availableQty)),
    [1, 5],
  );
  assert.deepEqual(
    ledger
      .slice(2)
      .map(({ batchNumber, qtyIn, transactionType }) => ({ batchNumber, qtyIn, transactionType })),
    [
      { batchNumber: 'today', qtyIn: 1, transactionType: 'SALE_CANCEL_IN' },
      { batchNumber: 'later', qtyIn: 2, transactionType: 'SALE_CANCEL_IN' },
    ],
  );
  assert.equal(audits.at(-1)!.action, 'CANCEL');

  await assert.rejects(
    service.cancel(made.id, { reason: 'again' }, cashier),
    (error: unknown) =>
      error instanceof ConflictException && /already cancelled/.test(error.message),
  );
  await assert.rejects(service.cancel('missing', { reason: 'x' }, cashier), NotFoundException);
});

test('a bill on a closed day can no longer be cancelled', async () => {
  const { service } = serviceWith({ dayClosed: true });
  // Billed after the close, it sits on the next day, which is still open.
  const made = await service.createOrder(bill(), cashier);
  await assert.doesNotReject(service.cancel(made.id, { reason: 'x' }, cashier));

  const closedDay = serviceWith({ dayClosed: true });
  closedDay.orders.push({ businessDate: day('2026-10-22'), counterId: 'counter-1', id: 'old' });
  await assert.rejects(
    closedDay.service.cancel('old', { reason: 'x' }, cashier),
    (error: unknown) => error instanceof ConflictException && /day is closed/.test(error.message),
  );
});

test('a cancel holds the counter, shift and bill before reading the day close', async () => {
  // Closing the day takes the counter's lock: a cancel racing it lands before or sees it closed.
  const { events, service } = serviceWith();
  const made = await service.createOrder(bill(), cashier);
  events.length = 0;

  await service.cancel(made.id, { reason: 'x' }, cashier);

  assert.deepEqual(events.slice(0, 4), [
    'lock counters',
    'lock counter_shifts',
    'lock restaurant_orders',
    'day close read',
  ]);
});

test('once its shift has ended, only someone who closes days may cancel a bill', async () => {
  const cancelling = async (permissions: string[]) => {
    const { orders, service } = serviceWith({ shiftEnded: true });
    const made = await service.createOrder(bill(), cashier);
    await service.cancel(made.id, { reason: ' wrong item ' }, { actorId: 'someone', permissions });
    return orders[0]!;
  };

  await assert.rejects(
    cancelling(['POS_ORDER_CANCEL']),
    (error: unknown) =>
      error instanceof ForbiddenException && /shift has ended/.test(error.message),
  );
  // A manager cancels it, and the bill says who.
  const cancelled = await cancelling(['POS_ORDER_CANCEL', 'POS_DAY_CLOSE']);
  assert.deepEqual([cancelled.status, cancelled.updatedBy], ['CANCELLED', 'someone']);

  // A bill with no shift (from before shifts) is treated as counted.
  const { orders, service } = serviceWith();
  orders.push({ businessDate: day('2026-10-22'), counterId: 'counter-1', id: 'old' });
  await assert.rejects(service.cancel('old', { reason: 'x' }, cashier), ForbiddenException);
});

// The till lookup is asked by every POS screen: its counters come from one read, not a count first.
function tillService() {
  const stored = [
    { id: 'c1', posDeviceId: null as string | null, restaurantId: 'cafe' },
    { id: 'c2', posDeviceId: null as string | null, restaurantId: 'canteen' },
    { id: 'c3', posDeviceId: null as string | null, restaurantId: 'elsewhere' },
  ];
  const device = {
    hostName: 'MAX-SKT-POS-01',
    id: 'device-1',
    name: 'Saket Cafe Till',
    restaurants: [
      { restaurant: { hospitalId: 'saket', restaurantName: 'Cafe' }, restaurantId: 'cafe' },
      { restaurant: { hospitalId: 'saket', restaurantName: 'Canteen' }, restaurantId: 'canteen' },
    ],
    tillKeyHash: null as string | null,
  };
  type Where = { OR?: Array<{ posDeviceId?: string; restaurantId?: { in: string[] } }> };
  const keyLookups = { count: 0 };
  const matches = (where: Where, counter: (typeof stored)[number]) =>
    !where.OR ||
    where.OR.some((condition) =>
      condition.posDeviceId
        ? counter.posDeviceId === condition.posDeviceId
        : condition.restaurantId!.in.includes(counter.restaurantId),
    );
  const prisma = {
    $transaction: (run: (tx: unknown) => Promise<unknown>) => run(prisma),
    counter: {
      findFirst: ({ where }: { where: { id: string } }) =>
        stored.find((counter) => counter.id === where.id) ?? null,
      findMany: ({ where }: { where: Where }) =>
        stored.filter((counter) => matches(where, counter)),
    },
    counterDayClose: { findMany: () => [] },
    counterShift: {
      findFirst: ({ where }: { where: { id: string } }) => byId[where.id] ?? null,
      findMany: () => [],
    },
    posDevice: {
      findFirst: ({ where }: { where: { id?: string; tillKeyHash?: string } }) => {
        if (where.tillKeyHash !== undefined) keyLookups.count += 1;
        return (where.id !== undefined && where.id === device.id) ||
          (where.tillKeyHash !== undefined && where.tillKeyHash === device.tillKeyHash)
          ? device
          : null;
      },
      update: ({ data }: { data: { tillKeyHash: string } }) => {
        device.tillKeyHash = data.tillKeyHash;
        return device;
      },
    },
    onlinePayment: { findFirst: ({ where }: { where: { id: string } }) => byId[where.id] ?? null },
    restaurantMenu: { findFirst: ({ where }: { where: { id: string } }) => byId[where.id] ?? null },
    restaurantOrder: {
      findFirst: ({ where }: { where: { id: string } }) => byId[where.id] ?? null,
    },
    user: { findMany: () => [] },
  };
  // A bill, a shift and a payment at c1 (the till's) and at c3 (elsewhere), and two menu items.
  const byId: Record<string, { counterId?: string; restaurantId?: string }> = {
    'bill-here': { counterId: 'c1' },
    'bill-there': { counterId: 'c3' },
    'menu-here': { restaurantId: 'canteen' },
    'menu-there': { restaurantId: 'elsewhere' },
    'payment-there': { counterId: 'c3' },
    'shift-here': { counterId: 'c2' },
  };
  const service = new PosService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    prisma as unknown as PrismaService,
  );

  return { device, keyLookups, service, stored };
}

const admin = { actorId: 'admin-1' };

test('an admin makes a computer a till: its browser gets a key shown once, stored only hashed', async () => {
  const { device, service } = tillService();

  const { tillKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);
  assert.match(tillKey, /^till_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(device.tillKeyHash, null);
  assert.notEqual(device.tillKeyHash, tillKey, 'never the key itself');
  assert.equal((await service.tillAccess(tillKey)).till, 'Saket Cafe Till');

  // Set up again (a new computer for that till): the old browser is a till no more.
  const { tillKey: newKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);
  assert.equal((await service.tillAccess(tillKey)).till, null);
  assert.equal((await service.tillAccess(newKey)).till, 'Saket Cafe Till');

  await assert.rejects(
    service.enrollTill('no-such-device', 'MAX-SKT-POS-01', admin),
    NotFoundException,
  );
});

test('a till’s key is looked up once every few seconds, and a revoked till is refused at once', async () => {
  // Every POS request checks its till: three to five queries each, for a till that rarely
  // changes, were a third of what a till's screens cost the database.
  const { keyLookups, service } = tillService();
  const { tillKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);

  for (let i = 0; i < 5; i++) await service.requireTill(tillKey, { counterId: 'c1' });
  assert.equal(keyLookups.count, 1);

  await service.revokeTill('device-1', admin);
  await assert.rejects(service.requireTill(tillKey, { counterId: 'c1' }), ForbiddenException);
});

test('a till is set up only on the computer its device names: the admin types this computer’s name', async () => {
  const { device, service } = tillService();

  // Any case, with or without the domain: Windows shows either.
  for (const name of ['max-skt-pos-01', ' MAX-SKT-POS-01.Maxhealthcare.com ']) {
    assert.match((await service.enrollTill('device-1', name, admin)).tillKey, /^till_/);
  }
  await assert.rejects(
    service.enrollTill('device-1', 'HO-LAP-1651', admin),
    (error: unknown) =>
      error instanceof BadRequestException &&
      /doesn’t match/.test(error.message) &&
      // Never tells the typist which name would have worked.
      !/MAX-SKT-POS-01/i.test(error.message),
  );
  device.hostName = '';
  await assert.rejects(
    service.enrollTill('device-1', 'MAX-SKT-POS-01', admin),
    (error: unknown) =>
      error instanceof BadRequestException && /no Host Name yet/.test(error.message),
  );
});

test('every POS request comes from a till, and only for its own counters', async () => {
  const { service } = tillService();
  const { tillKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);
  const refused = (reason: RegExp) => (error: unknown) =>
    error instanceof ForbiddenException && reason.test(error.message);

  // No till, or a key that is no till's: refused whatever it asks for.
  for (const key of [undefined, '', 'till_not-a-real-key']) {
    await assert.rejects(
      service.requireTill(key, { counterId: 'c1' }),
      refused(/not set up as a till/),
    );
  }
  // Its own counters (here its restaurants'), directly or through what belongs to them.
  for (const target of [
    { counterId: 'c1' },
    { counterId: 'c2' },
    { billId: 'bill-here' },
    { shiftId: 'shift-here' },
    { menuId: 'menu-here' },
    {},
  ]) {
    assert.deepEqual((await service.requireTill(tillKey, target)).counterIds, ['c1', 'c2']);
  }
  for (const target of [
    { counterId: 'c3' },
    { billId: 'bill-there' },
    { paymentId: 'payment-there' },
    { menuId: 'menu-there' },
  ]) {
    await assert.rejects(service.requireTill(tillKey, target), refused(/not this till’s/));
  }
  // A route that acts on a counter but names none is refused, not let through.
  await assert.rejects(service.requireTill(tillKey, { counterId: '' }), refused(/not this till’s/));
  // What does not exist at all is let through, for the route to answer its own 404.
  for (const target of [
    { billId: 'no-such-bill' },
    { counterId: 'no-such-counter' },
    { menuId: 'no-such-menu' },
    { paymentId: 'no-such-payment' },
    { shiftId: 'no-such-shift' },
  ]) {
    assert.deepEqual((await service.requireTill(tillKey, target)).counterIds, ['c1', 'c2']);
  }
});

test('a till bills at its device’s named counters, else its restaurants’; anywhere else is no till', async () => {
  const { service, stored } = tillService();
  const { tillKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);
  const ids = async (key?: string) => (await service.counters(key)).map((counter) => counter.id);

  assert.deepEqual(await ids(tillKey), ['c1', 'c2']);
  stored[2]!.posDeviceId = 'device-1';
  assert.deepEqual(await ids(tillKey), ['c3'], 'named counters win over its restaurants');
  // Not asked for the till (the dashboard): every counter the user may bill at.
  assert.deepEqual(await ids(), ['c1', 'c2', 'c3']);
  for (const key of ['', 'till_not-a-real-key']) {
    await assert.rejects(
      service.counters(key),
      (error: unknown) =>
        error instanceof NotFoundException && /not set up as a till/.test(error.message),
    );
  }
});

test('the POS opens only for a user assigned to the location of one of its till’s restaurants', async () => {
  const { service } = tillService();
  const { tillKey } = await service.enrollTill('device-1', 'MAX-SKT-POS-01', admin);
  const as = <T>(allowed: string[] | null, run: () => Promise<T>) =>
    hospitalScopeStorage.run({ allowedHospitalIds: allowed }, run);
  // Its locations: the POS opens only while one of them is the location picked in the portal.
  const saketTill = {
    hospitalIds: ['saket'],
    restaurants: ['Cafe', 'Canteen'],
    till: 'Saket Cafe Till',
  };

  assert.deepEqual(await as(['saket'], () => service.tillAccess(tillKey)), {
    ...saketTill,
    allowed: true,
  });
  // A Super Admin reaches every location.
  assert.deepEqual(await as(null, () => service.tillAccess(tillKey)), {
    ...saketTill,
    allowed: true,
  });
  assert.deepEqual(await as(['patparganj'], () => service.tillAccess(tillKey)), {
    ...saketTill,
    allowed: false,
  });
  assert.deepEqual(await as(['saket'], () => service.tillAccess(undefined)), {
    allowed: false,
    hospitalIds: [],
    restaurants: [],
    till: null,
  });
  await assert.rejects(
    as(['patparganj'], () => service.counters(tillKey)),
    (error: unknown) =>
      error instanceof ForbiddenException && /not assigned to the location/.test(error.message),
  );
});
