import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import type { AuditLogService } from './common/audit/audit-log.service';
import { toStatusCounts } from './common/pagination';
import type { GrnsRepository } from './grns/grns.repository';
import { GrnsService } from './grns/grns.service';
import type { PrismaService } from './common/prisma/prisma.service';
import type { KitchenProductionsRepository } from './kitchen-productions/kitchen-productions.repository';
import { KitchenProductionsService } from './kitchen-productions/kitchen-productions.service';
import type { TransfersRepository } from './transfers/transfers.repository';
import { PosService } from './pos/pos.service';
import type { StockRepository } from './stock/stock.repository';
import { StockService } from './stock/stock.service';
import { TransfersService } from './transfers/transfers.service';

// A list screen's status tabs used to cost one count request per tab (5 for Transfers). With
// statusCounts the list answers every tab from one grouped query, under the same other filters.

const audit = { record: () => Promise.resolve() } as unknown as AuditLogService;

function fakeRepository() {
  const grouped: Array<Record<string, unknown>> = [];
  return {
    grouped,
    repository: {
      count: () => Promise.resolve(7),
      countByStatus: (where: Record<string, unknown>) => {
        grouped.push(where);
        return Promise.resolve([
          { _count: { _all: 2 }, status: 'DRAFT' },
          { _count: { _all: 5 }, status: 'POSTED' },
        ]);
      },
      findMany: () => Promise.resolve([]),
      findUserNames: () => Promise.resolve([]),
    },
  };
}

const services = {
  grns: (repository: unknown) => new GrnsService(audit, repository as GrnsRepository),
  productions: (repository: unknown) =>
    new KitchenProductionsService(audit, repository as KitchenProductionsRepository),
  transfers: (repository: unknown) =>
    new TransfersService(audit, repository as TransfersRepository),
};

test('grouped rows become a count per status', () => {
  assert.deepEqual(
    toStatusCounts([
      { _count: { _all: 3 }, status: 'DRAFT' },
      { _count: { _all: 1 }, status: 'CANCELLED' },
    ]),
    { CANCELLED: 1, DRAFT: 3 },
  );
});

for (const [name, build] of Object.entries(services)) {
  test(`${name}: statusCounts counts every status under the other filters, in one query`, async () => {
    const { grouped, repository } = fakeRepository();
    const page = await build(repository).list({
      hospitalId: 'h1',
      limit: 0,
      page: 1,
      status: 'DRAFT',
      statusCounts: true,
    } as never);

    assert.deepEqual(page.meta.statusCounts, { DRAFT: 2, POSTED: 5 });
    assert.equal(page.meta.total, 7);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.hospitalId, 'h1', 'the other filters still apply');
    assert.equal(grouped[0]!.status, undefined, 'the tab being viewed does not narrow the counts');
  });

  test(`${name}: without statusCounts no grouped query runs`, async () => {
    const { grouped, repository } = fakeRepository();
    const page = await build(repository).list({ hospitalId: 'h1', limit: 0, page: 1 });

    assert.equal(grouped.length, 0);
    assert.equal('statusCounts' in page.meta, false);
  });
}

// ---- Stock and bills: the same idea for the remaining list screens.

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);
const storeBalance = (id: string, itemId: string, availableQty: number, expiryDate: Date) => ({
  availableQty,
  batchNumber: id,
  expiryDate,
  hospitalId: 'h1',
  id,
  item: { itemCode: itemId, itemName: itemId, itemType: 'MRP' },
  itemId,
  lastUpdatedOn: new Date(),
  locationId: 's1',
  locationType: 'STORE',
  reservedQty: 0,
});

function stockService(overrides: Record<string, unknown>) {
  return new StockService({
    findStoreIdsBySearch: () => Promise.resolve([]),
    findStoreItemCategories: () => Promise.resolve(new Map()),
    findStoresByIds: () => Promise.resolve([]),
    findRestaurantsByIds: () => Promise.resolve([]),
    findKitchensByIds: () => Promise.resolve([]),
    findCountersByIds: () => Promise.resolve([]),
    findReferenceDocuments: () => Promise.resolve(new Map()),
    ...overrides,
  } as unknown as StockRepository);
}

test('store stock: one load counts every item a tab would list', async () => {
  const balances = [
    storeBalance('a-near', 'A', 5, daysFromNow(10)),
    storeBalance('a-fine', 'A', 3, daysFromNow(100)),
    storeBalance('b-old', 'B', 2, daysFromNow(-5)),
    storeBalance('c-none', 'C', 0, daysFromNow(100)),
  ];
  let loads = 0;
  const service = stockService({
    findBalances: () => {
      loads += 1;
      return Promise.resolve(balances);
    },
  });
  const page = await service.listStoreSummaries({
    hospitalId: 'h1',
    limit: 0,
    page: 1,
    statusCounts: true,
  });

  // An item is under a tab when one of its batches is (as the tab's own list shows it).
  assert.deepEqual(page.meta.statusCounts, {
    AVAILABLE: 1,
    EXPIRED: 1,
    NEAR_EXPIRY: 1,
    OUT_OF_STOCK: 1,
  });
  assert.equal(page.meta.total, 3);
  assert.equal(loads, 1);
});

test('kitchen stock: every state counted in the same request, under the other filters', async () => {
  const counted: Array<Record<string, unknown>> = [];
  const service = stockService({
    countBalances: ({ where }: { where: Record<string, unknown> }) => {
      counted.push(where);
      return Promise.resolve(counted.length);
    },
    findBalances: () => Promise.resolve([]),
  });
  const page = await service.listKitchenBalances({
    hospitalId: 'h1',
    limit: 0,
    page: 1,
    status: 'OUT_OF_STOCK',
    statusCounts: true,
  } as never);

  assert.deepEqual(Object.keys(page.meta.statusCounts ?? {}).sort(), [
    'AVAILABLE',
    'EXPIRED',
    'LOW_STOCK',
    'NEAR_EXPIRY',
    'OUT_OF_STOCK',
  ]);
  for (const where of counted.slice(1)) {
    assert.equal(where.hospitalId, 'h1');
    assert.equal(where.locationType, 'KITCHEN');
  }
});

test('stock ledgers: every reference type counted in one grouped query', async () => {
  const grouped: Array<Record<string, unknown>> = [];
  const service = stockService({
    countLedgers: () => Promise.resolve(9),
    countLedgersByReferenceType: (where: Record<string, unknown>) => {
      grouped.push(where);
      return Promise.resolve([
        { _count: { _all: 4 }, referenceType: 'GRN' },
        { _count: { _all: 5 }, referenceType: 'TRANSFER' },
      ]);
    },
    findLedgers: () => Promise.resolve([]),
  });
  const page = await service.listLedgers({
    hospitalId: 'h1',
    limit: 0,
    page: 1,
    referenceType: 'GRN',
    referenceTypeCounts: true,
  } as never);

  assert.deepEqual(page.meta.referenceTypeCounts, { GRN: 4, TRANSFER: 5 });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]!.referenceType, undefined, 'the open tab does not narrow the counts');
  assert.equal(grouped[0]!.hospitalId, 'h1');
});

test('bill history: every status and the complimentary bills counted in the same request', async () => {
  const wheres: Array<Record<string, unknown>> = [];
  const prisma = {
    restaurantOrder: {
      count: ({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where);
        return Promise.resolve(where.isComplimentary ? 2 : 12);
      },
      findMany: () => Promise.resolve([]),
      groupBy: ({ where }: { where: Record<string, unknown> }) => {
        wheres.push(where);
        return Promise.resolve([
          { _count: { _all: 10 }, status: 'PLACED' },
          { _count: { _all: 2 }, status: 'CANCELLED' },
        ]);
      },
    },
  };
  const service = new PosService(audit, prisma as unknown as PrismaService);
  const page = await service.list({
    hospitalId: 'h1',
    limit: 0,
    page: 1,
    status: 'CANCELLED',
    statusCounts: true,
  } as never);

  assert.deepEqual(page.meta.statusCounts, { CANCELLED: 2, PLACED: 10 });
  assert.equal(page.meta.complimentaryCount, 2);
  const counting = wheres.filter((where) => where.status === undefined);
  assert.equal(counting.length, 2, 'both counts ignore the open tab');
});
