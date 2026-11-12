import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CounterShiftStatus, OrderStatus, PaymentMode, Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { PosService } from './pos.service';
import { fixedShiftAt, roundMoney, tally } from './shifts';
import { ShiftsService } from './shifts.service';

const decimal = (value: number) => new Prisma.Decimal(value);

const timings = [
  { endTime: '14:00', name: 'Morning', startTime: '06:00' },
  { endTime: '22:00', name: 'Evening', startTime: '14:00' },
  { endTime: '06:00', name: 'Night', startTime: '22:00' },
];

test('a fixed shift is the one the site clock falls in, a night one running past midnight', () => {
  // 13:00, 18:00 and 02:00 in India.
  assert.equal(fixedShiftAt(timings, new Date('2026-10-22T07:30:00Z')), 'Morning');
  assert.equal(fixedShiftAt(timings, new Date('2026-10-22T12:30:00Z')), 'Evening');
  assert.equal(fixedShiftAt(timings, new Date('2026-10-22T20:30:00Z')), 'Night');
  // Outside every timing there is no name.
  assert.equal(fixedShiftAt(timings.slice(0, 1), new Date('2026-10-22T12:30:00Z')), null);
});

test('money summed from bills is kept to paise', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(1234.567), 1234.57);
});

test('takings are split by payment mode, with complimentary and cancelled bills kept apart', () => {
  const bill = (
    grandTotal: number | null,
    paymentMode: PaymentMode | null,
    extra: { isComplimentary?: boolean; status?: OrderStatus } = {},
  ) => ({
    grandTotal: grandTotal === null ? null : decimal(grandTotal),
    isComplimentary: extra.isComplimentary ?? false,
    paymentMode,
    status: extra.status ?? OrderStatus.PLACED,
  });

  const summary = tally([
    bill(100, PaymentMode.CASH),
    bill(20.5, PaymentMode.CASH),
    bill(50, PaymentMode.UPI),
    // No mode recorded: counted as other.
    bill(10, null),
    bill(80, null, { isComplimentary: true }),
    bill(30, PaymentMode.CASH, { status: OrderStatus.CANCELLED }),
    // A cancelled complimentary bill counts as cancelled, not complimentary.
    bill(40, null, { isComplimentary: true, status: OrderStatus.CANCELLED }),
    // A bill with no total counts but adds nothing.
    bill(null, PaymentMode.CARD),
  ]);

  assert.equal(summary.bills, 5);
  assert.equal(summary.sales, 180.5);
  assert.deepEqual(summary.byPaymentMode, [
    { amount: 120.5, count: 2, mode: 'CASH' },
    { amount: 50, count: 1, mode: 'UPI' },
    { amount: 10, count: 1, mode: 'OTHER' },
    { amount: 0, count: 1, mode: 'CARD' },
  ]);
  assert.deepEqual(summary.complimentary, { amount: 80, count: 1 });
  assert.deepEqual(summary.cancelled, { amount: 70, count: 2 });
});

const counter = { hospitalId: 'hospital-1', id: 'counter-1', restaurantId: 'restaurant-1' };

interface Shift {
  closedAt: Date | null;
  closedBy: string | null;
  counterId: string;
  countedCash: Prisma.Decimal | null;
  expectedCash: Prisma.Decimal | null;
  handoverStock: unknown;
  hospitalId: string;
  id: string;
  name: string | null;
  note: string | null;
  openedAt: Date;
  openedBy: string;
  openingCash: Prisma.Decimal;
  status: CounterShiftStatus;
  summary: unknown;
  takenOverFromId: string | null;
}

const shift = (overrides: Partial<Shift>): Shift => ({
  closedAt: null,
  closedBy: null,
  counterId: counter.id,
  countedCash: null,
  expectedCash: null,
  handoverStock: null,
  hospitalId: counter.hospitalId,
  id: 'shift-1',
  name: null,
  note: null,
  openedAt: new Date('2026-10-22T03:30:00Z'),
  openedBy: 'cashier-1',
  openingCash: decimal(500),
  status: CounterShiftStatus.OPEN,
  summary: null,
  takenOverFromId: null,
  ...overrides,
});

// Stands in for Prisma: shifts, day closes and the shift's bills in memory, enough for the
// queries ShiftsService makes. Every transaction runs straight through.
function serviceWith(
  state: {
    closes?: Array<{ businessDate: Date; counterId: string }>;
    orders?: Array<{
      grandTotal: Prisma.Decimal;
      isComplimentary: boolean;
      paymentMode: PaymentMode | null;
      shiftId: string;
      status: OrderStatus;
    }>;
    shiftMode?: 'CASHIER' | 'FIXED';
    shifts?: Shift[];
    stock?: Array<{ itemId: string; itemName: string; qty: number }>;
  } = {},
) {
  const shifts = state.shifts ?? [];
  const closes = state.closes ?? [];
  const audits: Array<{ action: string }> = [];
  const summaries: unknown[] = [];
  const tx = {
    $queryRaw: () => Promise.resolve([]),
    counterDayClose: {
      create: ({
        data,
      }: {
        data: { businessDate: Date; closedBy: string | null; counterId: string; summary: unknown };
      }) => {
        closes.push(data);
        summaries.push(data.summary);
        return { ...data, closedAt: new Date(), id: 'close-1' };
      },
      findFirst: ({ where }: { where: { businessDate: Date; counterId: string } }) =>
        closes.find(
          (close) =>
            close.counterId === where.counterId &&
            close.businessDate.getTime() === where.businessDate.getTime(),
        ) ?? null,
    },
    counterShift: {
      create: ({ data }: { data: Partial<Shift> }) => {
        const created = shift({ ...data, id: `shift-${shifts.length + 1}` });
        shifts.push(created);
        return created;
      },
      findFirst: ({
        where,
      }: {
        where: { counterId?: string; id?: string; openedBy?: string; status?: string };
      }) => {
        const found = shifts.find(
          (stored) =>
            (!where.id || stored.id === where.id) &&
            (!where.counterId || stored.counterId === where.counterId) &&
            (!where.openedBy || stored.openedBy === where.openedBy) &&
            (!where.status || stored.status === where.status),
        );
        // The counter's name is its id here.
        return found ? { ...found, counter: { counterName: found.counterId } } : null;
      },
      update: ({ data, where }: { data: Partial<Shift>; where: { id: string } }) => {
        const stored = shifts.find((entry) => entry.id === where.id)!;
        Object.assign(stored, data, {
          expectedCash: decimal(data.expectedCash as unknown as number),
        });
        return stored;
      },
    },
    item: {
      findMany: () =>
        (state.stock ?? []).map((row) => ({ id: row.itemId, itemName: row.itemName })),
    },
    restaurant: {
      findFirstOrThrow: () => ({ shiftMode: state.shiftMode ?? 'CASHIER', shiftTimings: timings }),
    },
    restaurantOrder: {
      findMany: ({ where }: { where: { shiftId: string } }) =>
        (state.orders ?? []).filter((order) => order.shiftId === where.shiftId),
    },
    stockBalance: {
      groupBy: () =>
        (state.stock ?? []).map((row) => ({
          _sum: { availableQty: decimal(row.qty) },
          itemId: row.itemId,
        })),
    },
    user: {
      findMany: () => [
        { id: 'cashier-1', name: 'Asha' },
        { id: 'admin-1', name: 'Ravi' },
      ],
    },
  };
  const transactions = { count: 0 };
  const prisma = {
    ...tx,
    $transaction: (handler: (client: unknown) => unknown) => {
      transactions.count += 1;
      return handler(tx);
    },
  };
  const pos = {
    findCounter: () => Promise.resolve(counter),
    summary: () =>
      Promise.resolve({
        bills: 3,
        byPaymentMode: [{ amount: 300, count: 3, mode: 'CASH' }],
        cancelled: { amount: 0, count: 0 },
        complimentary: { amount: 0, count: 0 },
        counter,
        date: 'ignored',
        dayClose: null,
        sales: 300,
        shifts: [],
      }),
  };
  const service = new ShiftsService(
    {
      record: (entry: { action: string }) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    pos as unknown as PosService,
    prisma as unknown as PrismaService,
  );

  return { audits, service, shifts, summaries, transactions };
}

const cashier = { actorId: 'cashier-1', ipAddress: '127.0.0.1' };

test('a shift opens with its till cash; a second one at the same counter is refused', async () => {
  const { audits, service, shifts } = serviceWith();

  const opened = await service.open({ counterId: counter.id, openingCash: 750 }, cashier);
  assert.equal(opened!.status, CounterShiftStatus.OPEN);
  assert.equal(opened!.openingCash, 750);
  assert.equal(opened!.openedByName, 'Asha');
  // A cashier-run restaurant does not name its shifts.
  assert.equal(opened!.name, null);
  assert.equal(audits[0]!.action, 'SHIFT_OPEN');

  await assert.rejects(
    service.open({ counterId: counter.id, openingCash: 0 }, { actorId: 'cashier-2' }),
    ConflictException,
  );
  assert.equal(shifts.length, 1);
});

test('cashiers who find the counter already open are turned away before any lock or transaction', async () => {
  // Thirty cashiers opening one counter at once used to queue on its row lock, each holding a
  // database connection while it waited, until the pool ran dry for everyone else.
  const { service, transactions } = serviceWith({
    shifts: [shift({ counterId: counter.id, id: 'open-one', openedBy: 'cashier-2' })],
  });

  await assert.rejects(
    service.open({ counterId: counter.id, openingCash: 0 }, cashier),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message === 'A shift is already open at this counter. End it first.',
  );
  assert.equal(transactions.count, 0);
});

test('a cashier has one open shift at a time: another counter waits until it ends', async () => {
  const { service, shifts } = serviceWith({
    shifts: [shift({ counterId: 'counter-2', id: 'elsewhere', openedBy: 'cashier-1' })],
  });

  await assert.rejects(
    service.open({ counterId: counter.id, openingCash: 0 }, cashier),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message ===
        'You already have a shift open at counter-2. End it before opening another.',
  );
  assert.equal(shifts.length, 1);

  // Someone else's open shift elsewhere is no bar.
  await service.open({ counterId: counter.id, openingCash: 0 }, { actorId: 'cashier-2' });
  assert.equal(shifts.length, 2);
});

test('a shift cannot be opened by a caller with no user', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    service.open({ counterId: counter.id, openingCash: 0 }, { ipAddress: '127.0.0.1' }),
    ForbiddenException,
  );
});

test('a restaurant on fixed shifts names the shift after the timing it opens in', async () => {
  const { service } = serviceWith({ shiftMode: 'FIXED' });

  const opened = await service.open({ counterId: counter.id, openingCash: 0 }, cashier);
  // The three timings cover the whole day, so whatever the clock says one of them is named.
  assert.equal(opened!.name, fixedShiftAt(timings, new Date()));
  assert.ok(['Morning', 'Evening', 'Night'].includes(opened!.name!));
});

test('the next shift takes over a handover still waiting for a cashier', async () => {
  const { service } = serviceWith({
    shifts: [shift({ id: 'handed', status: CounterShiftStatus.HANDED_OVER })],
  });

  const opened = await service.open({ counterId: counter.id, openingCash: 200 }, cashier);
  assert.equal(opened!.takenOverFromId, 'handed');
});

test('expected cash is opening cash plus the shift’s cash bills only', async () => {
  const order = (amount: number, paymentMode: PaymentMode | null, extra = {}) => ({
    grandTotal: decimal(amount),
    isComplimentary: false,
    paymentMode,
    shiftId: 'shift-1',
    status: OrderStatus.PLACED,
    ...extra,
  });
  const { audits, service, shifts } = serviceWith({
    orders: [
      order(120.25, PaymentMode.CASH),
      order(79.5, PaymentMode.CASH),
      order(300, PaymentMode.UPI),
      order(60, PaymentMode.CASH, { status: OrderStatus.CANCELLED }),
      order(90, null, { isComplimentary: true }),
      // Another shift's bill.
      order(1000, PaymentMode.CASH, { shiftId: 'other' }),
    ],
    shifts: [shift({ openingCash: decimal(500.1) })],
  });

  const ended = await service.end(
    'shift-1',
    { countedCash: 690, handover: false, note: '  short ' },
    cashier,
  );
  // 500.10 + 120.25 + 79.50.
  assert.equal(ended!.expectedCash, 699.85);
  assert.equal(ended!.countedCash, 690);
  assert.equal(ended!.status, CounterShiftStatus.CLOSED);
  assert.equal(ended!.note, 'short');
  assert.equal(ended!.closedByName, 'Asha');
  assert.equal(shifts[0]!.handoverStock, Prisma.DbNull);
  assert.equal(audits[0]!.action, 'SHIFT_CLOSE');

  await assert.rejects(
    service.end('shift-1', { countedCash: 690, handover: false }, cashier),
    (error: unknown) => error instanceof ConflictException && /already ended/.test(error.message),
  );
});

test('a handover passes on the counter’s stock to the next cashier', async () => {
  const { audits, service } = serviceWith({
    shifts: [shift({})],
    stock: [
      { itemId: 'tea', itemName: 'Tea', qty: 12 },
      { itemId: 'coffee', itemName: 'Coffee', qty: 4.5 },
    ],
  });

  const ended = await service.end('shift-1', { countedCash: 500, handover: true }, cashier);
  assert.equal(ended!.status, CounterShiftStatus.HANDED_OVER);
  assert.equal(ended!.note, null);
  // Sorted by name.
  assert.deepEqual(ended!.handoverStock, [
    { itemId: 'coffee', itemName: 'Coffee', quantity: 4.5 },
    { itemId: 'tea', itemName: 'Tea', quantity: 12 },
  ]);
  assert.equal(audits[0]!.action, 'SHIFT_HANDOVER');
});

test('only the cashier who opened a shift, or a day-close admin, can end it', async () => {
  const { service } = serviceWith({ shifts: [shift({})] });

  await assert.rejects(
    service.end('missing', { countedCash: 0, handover: false }, cashier),
    NotFoundException,
  );
  await assert.rejects(
    service.end('shift-1', { countedCash: 0, handover: false }, { actorId: 'cashier-2' }),
    ForbiddenException,
  );
  const ended = await service.end(
    'shift-1',
    { countedCash: 0, handover: false },
    { actorId: 'admin-1', permissions: ['POS_DAY_CLOSE'] },
  );
  assert.equal(ended!.closedByName, 'Ravi');
});

test('a day closes only once, with no shift open, and never ahead of time', async () => {
  const { service, summaries } = serviceWith({ shifts: [shift({})] });
  const admin = { actorId: 'admin-1' };

  await assert.rejects(
    service.closeDay({ counterId: counter.id, date: '2999-01-01' }, admin),
    BadRequestException,
  );
  await assert.rejects(
    service.closeDay({ counterId: counter.id, date: '2026-10-22' }, admin),
    (error: unknown) => error instanceof ConflictException && /open shift/.test(error.message),
  );

  await service.end('shift-1', { countedCash: 500, handover: false }, cashier);
  const closed = await service.closeDay(
    { counterId: counter.id, date: '2026-10-22T10:00:00Z' },
    admin,
  );
  assert.equal(closed.businessDate, '2026-10-22');
  assert.equal(closed.closedByName, 'Ravi');
  // The day's takings are kept as the counter's summary had them.
  assert.deepEqual(summaries[0], {
    bills: 3,
    byPaymentMode: [{ amount: 300, count: 3, mode: 'CASH' }],
    cancelled: { amount: 0, count: 0 },
    complimentary: { amount: 0, count: 0 },
    sales: 300,
  });
  await assert.rejects(
    service.closeDay({ counterId: counter.id, date: '2026-10-22' }, admin),
    (error: unknown) => error instanceof ConflictException && /already closed/.test(error.message),
  );
});
