import { strict as assert } from 'node:assert';
import { logger } from '@aahar/logging';
import { Prisma } from '@prisma/client';
import { afterEach, test, vi } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { Mailer } from '../common/mailer';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { StoreArrivals } from '../common/store-arrivals';
import type { GrnsRepository } from '../grns/grns.repository';
import { ErpGrnsService } from './erp-grns.service';

afterEach(() => {
  vi.restoreAllMocks();
});

const decimal = (value: number) => new Prisma.Decimal(value);
const expiry = new Date('2099-01-31T00:00:00Z');

// A return to the vendor (flag 1) of 3 of batch B1, nothing taken yet, waiting with its
// automatic rerun on.
const reverse = (grnNumber: string) => ({
  acceptedQty: null as Prisma.Decimal | number | null,
  batchNumber: 'B1',
  expiryDate: expiry,
  flag: 1,
  grnNumber,
  hospitalId: 'hospital-1',
  id: `${grnNumber}-row`,
  itemId: 'item-1',
  rejectedQty: null as Prisma.Decimal | number | null,
  rerunActive: true,
  sentQty: decimal(3),
  status: 'PENDING',
  storeId: 'store-1',
});

// Stands in for Prisma with what a rerun touches, all in memory. Every transaction runs straight
// through on the same fake.
function serviceWith(options: {
  /** GRNs whose rows cannot be read: their rerun fails. */
  broken?: string[];
  grns: string[];
  /** What the Main Store holds of batch B1. */
  storeQty: number;
  /** Taken from the store by a sale between the rerun reading the batch and taking it. */
  takenMeanwhile?: number;
}) {
  const rows = options.grns.map(reverse);
  const store = { availableQty: decimal(options.storeQty), expiryDate: expiry, id: 'balance-1' };
  const events: string[] = [];
  const ledger: Array<Record<string, unknown>> = [];
  const waitingReads: unknown[] = [];

  const prisma = {
    $queryRaw: (_sql: TemplateStringsArray, key: string) => {
      events.push(`lock ${key}`);
      return Promise.resolve([]);
    },
    $transaction: (handler: (tx: unknown) => unknown) => handler(prisma),
    grnEntry: {
      findMany: ({ where }: { where: { grnNumber: string } }) =>
        options.broken?.includes(where.grnNumber)
          ? Promise.reject(new Error('connection lost'))
          : Promise.resolve(
              rows.filter((row) => row.grnNumber === where.grnNumber).map((row) => ({ ...row })),
            ),
      groupBy: ({ where }: { where: unknown }) => {
        waitingReads.push(where);
        return Promise.resolve(rows.map((row) => ({ grnNumber: row.grnNumber })));
      },
      update: ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
        Object.assign(
          rows.find((row) => row.id === where.id)!,
          data,
        );
        return Promise.resolve();
      },
      updateMany: ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: { grnNumber: string };
      }) => {
        for (const row of rows.filter((entry) => entry.grnNumber === where.grnNumber)) {
          Object.assign(row, data);
        }
        return Promise.resolve();
      },
    },
    stockBalance: {
      // A copy, as Prisma returns: a later change does not reach rows already read.
      findMany: () => {
        const read = [{ ...store }];
        store.availableQty = store.availableQty.minus(options.takenMeanwhile ?? 0);
        return Promise.resolve(read);
      },
      findUniqueOrThrow: () => Promise.resolve({ availableQty: store.availableQty }),
      updateMany: ({
        data,
        where,
      }: {
        data: { availableQty: { decrement: number } };
        where: { availableQty: { gte: number } };
      }) => {
        if (store.availableQty.lessThan(where.availableQty.gte)) {
          return Promise.resolve({ count: 0 });
        }
        store.availableQty = store.availableQty.minus(data.availableQty.decrement);
        return Promise.resolve({ count: 1 });
      },
    },
    stockLedger: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return Promise.resolve();
      },
    },
  };
  const service = new ErpGrnsService(
    { listen: () => undefined } as unknown as StoreArrivals,
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    {} as GrnsRepository,
    prisma as unknown as PrismaService,
    {} as Mailer,
  );

  return { events, ledger, rows, service, store, waitingReads };
}

test('the catch-up runs every waiting return under its lock; one that fails is logged, the rest still run', async () => {
  const errors = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  const { events, rows, service, store, waitingReads } = serviceWith({
    broken: ['G1'],
    grns: ['G1', 'G2'],
    storeQty: 5,
  });

  await service.catchUp();

  // Every waiting return, whatever its batch: the arrival that would have run it may be lost.
  assert.deepEqual(waitingReads, [{ flag: 1, rerunActive: true, status: 'PENDING' }]);
  assert.deepEqual(events, ['lock erp-grn:G1', 'lock erp-grn:G2']);
  assert.deepEqual(errors.mock.calls, [
    [{ err: new Error('connection lost'), grnNumber: 'G1' }, 'erp_grn_rerun_failed'],
  ]);
  assert.deepEqual(
    rows.map((row) => [row.grnNumber, Number(row.acceptedQty ?? 0), row.status]),
    [
      ['G1', 0, 'PENDING'],
      ['G2', 3, 'VERIFIED'],
    ],
  );
  assert.equal(Number(store.availableQty), 2);
});

test('a catch-up still running makes the next tick skip, never run alongside it', async () => {
  const { service, waitingReads } = serviceWith({ grns: ['G1'], storeQty: 0 });

  await Promise.all([service.catchUp(), service.catchUp()]);
  assert.equal(waitingReads.length, 1);

  await service.catchUp();
  assert.equal(waitingReads.length, 2);
});

test('a return’s ledger line shows what the store holds after it, even when a sale took some meanwhile', async () => {
  const { ledger, service, store } = serviceWith({ grns: ['G1'], storeQty: 5, takenMeanwhile: 1 });

  await service.runWaitingFor([{ batchNumber: 'B1', itemId: 'item-1', storeId: 'store-1' }]);

  assert.equal(Number(store.availableQty), 1);
  assert.deepEqual(
    ledger.map(({ balanceAfter, qtyOut }) => ({ balanceAfter, qtyOut })),
    [{ balanceAfter: 1, qtyOut: 3 }],
  );
});
