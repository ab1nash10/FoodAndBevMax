import { strict as assert } from 'node:assert';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GrnStatus, ItemType } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateGrnDto } from './dto/create-grn.dto';
import type { GrnsRepository } from './grns.repository';
import { GrnsService } from './grns.service';

type StoredBatch = {
  acceptedQty: number;
  batchNumber: string;
  expiryDate: Date;
  itemId: string;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
};
type StoredLine = {
  acceptedQty: number;
  batches: StoredBatch[];
  id: string;
  itemId: string;
  receivedQty: number;
  rejectedQty: number;
};
type StoredGrn = {
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  lines: StoredLine[];
  receivedDate: Date;
  remarks: string | null;
  status: GrnStatus;
  storeId: string;
};

const FUTURE = '2099-12-31';
const PAST = '2020-01-01';

// Location h1 owns store s1, h2 owns s2, h3 is switched off. Rice is an MRP item mapped to s1;
// Thali is a kitchen (READYMADE) item, which the real mapping query never returns for a store.
function setup(grns: StoredGrn[] = []) {
  const hospitals: Record<string, { isActive: boolean }> = {
    h1: { isActive: true },
    h2: { isActive: true },
    h3: { isActive: false },
  };
  const stores: Record<string, { hospitalId: string; isActive: boolean }> = {
    s1: { hospitalId: 'h1', isActive: true },
    s2: { hospitalId: 'h2', isActive: true },
  };
  const items: Record<string, { itemType: ItemType }> = {
    rice: { itemType: ItemType.MRP },
    thali: { itemType: ItemType.READYMADE },
  };
  const balances = new Map<string, number>();
  const ledger: Array<Record<string, unknown>> = [];
  const lines = new Map<string, StoredLine>();
  const find = (id: string) => grns.find((grn) => grn.id === id && !grn.deletedAt) ?? null;
  const tx = {
    $queryRaw: () => Promise.resolve([]),
    grnLine: {
      create: ({ data }: { data: Omit<StoredLine, 'batches' | 'id'> & { grnId: string } }) => {
        const line = { ...data, batches: [], id: `line-${lines.size + 1}` };
        lines.set(line.id, line);
        find(data.grnId)!.lines.push(line);
        return Promise.resolve(line);
      },
    },
  };
  const repository = {
    create: (data: Omit<StoredGrn, 'deletedAt' | 'id' | 'lines'>) => {
      const grn = { ...data, deletedAt: null, id: `grn-${grns.length + 1}`, lines: [] };
      grns.push(grn);
      return Promise.resolve(grn);
    },
    createBatch: (data: StoredBatch & { grnLineId: string }) => {
      lines.get(data.grnLineId)!.batches.push(data);
      return Promise.resolve();
    },
    createStockLedger: (data: Record<string, unknown>) => {
      ledger.push(data);
      return Promise.resolve();
    },
    findActiveById: (id: string) => Promise.resolve(find(id)),
    findActiveHospital: (id: string) => Promise.resolve(hospitals[id] ?? null),
    findActiveStore: (id: string) => Promise.resolve(stores[id] ?? null),
    // Like the real query: active mappings to this store, of MRP items only.
    findActiveStoreMappings: (storeId: string, itemIds: string[]) =>
      Promise.resolve(
        itemIds
          .filter((itemId) => storeId === 's1' && items[itemId]?.itemType === ItemType.MRP)
          .map((itemId) => ({ item: { id: itemId, ...items[itemId] }, itemId, storeId })),
      ),
    softDeleteLinesAndBatches: (id: string) => {
      find(id)!.lines = [];
      return Promise.resolve();
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (id: string, data: Partial<StoredGrn>) => {
      const grn = grns.find((stored) => stored.id === id)!;
      if (data.status) grn.status = data.status;
      if (data.deletedAt) grn.deletedAt = data.deletedAt;
      return Promise.resolve(grn);
    },
    upsertStockBalance: (input: {
      batchNumber: string;
      itemId: string;
      locationId: string;
      quantity: number;
    }) => {
      const key = `${input.locationId}|${input.itemId}|${input.batchNumber}`;
      balances.set(key, (balances.get(key) ?? 0) + input.quantity);
      return Promise.resolve({ availableQty: balances.get(key)! });
    },
  };
  const service = new GrnsService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as GrnsRepository,
  );

  return { balances, grns, ledger, service };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const batch = (over: Partial<Record<string, unknown>> = {}) => ({
  acceptedQty: 10,
  batchNumber: 'B1',
  expiryDate: FUTURE,
  receivedQty: 10,
  rejectedQty: 0,
  ...over,
});
const line = (over: Partial<Record<string, unknown>> = {}, batches = [batch()]) => ({
  acceptedQty: 10,
  batches,
  itemId: 'rice',
  receivedQty: 10,
  rejectedQty: 0,
  ...over,
});
const grnDto = (items: unknown[] = [line()], over: Partial<Record<string, unknown>> = {}) =>
  ({
    hospitalId: 'h1',
    items,
    receivedBy: ' Ravi ',
    receivedDate: '2026-10-20T10:00:00+05:30',
    storeId: 's1',
    vendorName: 'Agro Foods',
    ...over,
  }) as unknown as CreateGrnDto;
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);
const draft = (batches: Array<Partial<StoredBatch>>, status: GrnStatus = GrnStatus.DRAFT) =>
  ({
    deletedAt: null,
    hospitalId: 'h1',
    id: 'grn-1',
    lines: [
      {
        acceptedQty: 0,
        batches: batches.map((stored) => ({
          acceptedQty: 10,
          batchNumber: 'B1',
          expiryDate: new Date(FUTURE),
          itemId: 'rice',
          receivedQty: 10,
          rejectedQty: 0,
          ...stored,
        })),
        id: 'line-1',
        itemId: 'rice',
        receivedQty: 0,
        rejectedQty: 0,
      },
    ],
    receivedDate: new Date('2026-10-20T04:30:00Z'),
    remarks: null,
    status,
    storeId: 's1',
  }) satisfies StoredGrn;

test('a new GRN is a draft that moves no stock, its batches trimmed and dated by day', async () => {
  const { balances, service } = setup();

  const created = await service.create(
    grnDto([line({}, [batch({ batchNumber: '  B1 ', expiryDate: '2099-12-31T23:00:00+05:30' })])]),
    actor,
  );

  assert.equal(created?.status, GrnStatus.DRAFT);
  assert.equal(created?.lines[0]?.batches[0]?.batchNumber, 'B1');
  // The batch keeps the calendar day it was written with, whatever the clock part says.
  assert.equal(created?.lines[0]?.batches[0]?.expiryDate.toISOString(), '2099-12-31T00:00:00.000Z');
  assert.equal(balances.size, 0);
});

test('received must equal accepted plus rejected, on every batch and on the line', async () => {
  const { service } = setup();

  await assert.rejects(
    service.create(grnDto([line({ receivedQty: 11 })]), actor),
    refusedWith(/^Line 1: received quantity must equal accepted plus rejected quantity$/),
  );
  await assert.rejects(
    service.create(grnDto([line({}, [batch({ receivedQty: 12 })])]), actor),
    refusedWith(/^Line 1, batch 1: received quantity must equal accepted plus rejected/),
  );
  // Quantities match to three decimals, so 0.1 + 0.2 makes 0.3.
  await assert.doesNotReject(
    service.create(
      grnDto([
        line({ acceptedQty: 0.1, receivedQty: 0.3, rejectedQty: 0.2, rejectionReason: 'Torn' }, [
          batch({ acceptedQty: 0.1, receivedQty: 0.3, rejectedQty: 0.2 }),
        ]),
      ]),
      actor,
    ),
  );
});

test('the line quantities must add up to its batches', async () => {
  const { service } = setup();
  const twoBatches = [batch({ acceptedQty: 4, receivedQty: 4 }), batch({ batchNumber: 'B2' })];

  await assert.rejects(
    service.create(grnDto([line({}, twoBatches)]), actor),
    refusedWith(/^Line 1: line received quantity must equal batch total$/),
  );
  await assert.rejects(
    service.create(
      grnDto([
        line({ acceptedQty: 13, receivedQty: 14, rejectedQty: 1, rejectionReason: 'Torn' }, [
          batch({ acceptedQty: 4, receivedQty: 4 }),
          batch({ acceptedQty: 10, batchNumber: 'B2', receivedQty: 10 }),
        ]),
      ]),
      actor,
    ),
    refusedWith(/^Line 1: line accepted quantity must equal batch total$/),
  );
  await assert.doesNotReject(
    service.create(grnDto([line({ acceptedQty: 14, receivedQty: 14 }, twoBatches)]), actor),
  );
});

test('a batch needs a number, and an expired batch may be rejected but never accepted', async () => {
  const { service } = setup();

  await assert.rejects(
    service.create(grnDto([line({}, [batch({ batchNumber: '   ' })])]), actor),
    refusedWith(/batch 1: batch number is required/),
  );
  await assert.rejects(
    service.create(grnDto([line({}, [batch({ expiryDate: PAST })])]), actor),
    refusedWith(/batch 1: expired batch cannot be accepted/),
  );
  await assert.doesNotReject(
    service.create(
      grnDto([
        line({ acceptedQty: 0, rejectedQty: 10, rejectionReason: 'Expired' }, [
          batch({ acceptedQty: 0, expiryDate: PAST, rejectedQty: 10 }),
        ]),
      ]),
      actor,
    ),
  );
});

test("a rejected batch needs a reason: its own, or else the line's", async () => {
  const { service } = setup();
  const rejectedBatch = batch({ acceptedQty: 8, rejectedQty: 2 });
  const rejectedLine = { acceptedQty: 8, rejectedQty: 2 };

  await assert.rejects(
    service.create(grnDto([line(rejectedLine, [rejectedBatch])]), actor),
    refusedWith(/batch 1: rejection reason is required/),
  );
  await assert.rejects(
    service.create(
      grnDto([line({ ...rejectedLine, rejectionReason: '  ' }, [rejectedBatch])]),
      actor,
    ),
    refusedWith(/rejection reason is required/),
  );
  await assert.doesNotReject(
    service.create(
      grnDto([line({ ...rejectedLine, rejectionReason: 'Damaged' }, [rejectedBatch])]),
      actor,
    ),
  );
  await assert.doesNotReject(
    service.create(
      grnDto([
        line(rejectedLine, [batch({ acceptedQty: 8, rejectedQty: 2, rejectionReason: 'Dented' })]),
      ]),
      actor,
    ),
  );
});

test('only items mapped to the store as MRP can be received', async () => {
  const { service } = setup();

  // A kitchen item is never mapped to a store (mapping one makes it MRP).
  await assert.rejects(
    service.create(grnDto([line(), line({ itemId: 'thali' })]), actor),
    refusedWith(/^Line 2: This item is not mapped to this store, or its mapping is inactive\.$/),
  );
  await assert.rejects(
    service.create(grnDto([line({ itemId: 'unknown' })]), actor),
    refusedWith(/mapping is inactive/),
  );
});

test("a GRN is received into an active store of the GRN's own location", async () => {
  const { grns, service } = setup();

  await assert.rejects(
    service.create(grnDto(undefined, { storeId: 's2' }), actor),
    refusedWith(/^Store does not belong to selected hospital$/),
  );
  await assert.rejects(
    service.create(grnDto(undefined, { storeId: 'gone' }), actor),
    refusedWith(/^Store not found or inactive$/),
  );
  await assert.rejects(
    service.create(grnDto(undefined, { hospitalId: 'h3' }), actor),
    refusedWith(/^Hospital not found or inactive$/),
  );
  assert.equal(grns.length, 0);
});

test('posting credits the store with each accepted batch and skips fully rejected ones', async () => {
  const { balances, grns, ledger, service } = setup([
    draft([
      { acceptedQty: 6, batchNumber: 'B1', receivedQty: 8, rejectedQty: 2 },
      { acceptedQty: 0, batchNumber: 'B2', rejectedQty: 10 },
      { acceptedQty: 4, batchNumber: 'B3' },
    ]),
  ]);

  const posted = await service.postToStock('grn-1', actor);

  assert.equal(posted.status, GrnStatus.POSTED_TO_STOCK);
  assert.equal(grns[0]?.status, GrnStatus.POSTED_TO_STOCK);
  assert.deepEqual(Object.fromEntries(balances), { 's1|rice|B1': 6, 's1|rice|B3': 4 });
  assert.deepEqual(
    ledger.map((row) => [row.batchNumber, row.qtyIn, row.qtyOut, row.transactionType]),
    [
      ['B1', 6, 0, 'GRN_IN'],
      ['B3', 4, 0, 'GRN_IN'],
    ],
  );
  // Each ledger row is an MRP store entry for the GRN, dated by the day it was received.
  assert.deepEqual(
    [
      ledger[0]?.itemType,
      ledger[0]?.locationType,
      ledger[0]?.referenceType,
      ledger[0]?.referenceId,
    ],
    ['MRP', 'STORE', 'GRN', 'grn-1'],
  );
  assert.equal((ledger[0]?.businessDate as Date).toISOString(), '2026-10-20T00:00:00.000Z');
});

test('a GRN is posted once, never when cancelled, and never with a batch expired since', async () => {
  const posted = setup([draft([{}], GrnStatus.POSTED_TO_STOCK)]);
  await assert.rejects(
    posted.service.postToStock('grn-1', actor),
    refusedWith(/^GRN is already posted to stock$/),
  );

  const cancelled = setup([draft([{}], GrnStatus.CANCELLED)]);
  await assert.rejects(
    cancelled.service.postToStock('grn-1', actor),
    refusedWith(/^Cancelled GRN cannot be posted to stock$/),
  );

  const stale = setup([draft([{ batchNumber: 'OLD', expiryDate: new Date(PAST) }])]);
  await assert.rejects(
    stale.service.postToStock('grn-1', actor),
    refusedWith(/^Expired batch OLD cannot be accepted$/),
  );
  assert.equal(stale.grns[0]?.status, GrnStatus.DRAFT);

  await assert.rejects(
    setup().service.postToStock('missing', actor),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('cancelling: a draft is cancelled, a cancelled one stays as it is, a posted one refuses', async () => {
  const { grns, service } = setup([draft([{}])]);

  assert.equal((await service.cancel('grn-1', actor)).status, GrnStatus.CANCELLED);
  assert.equal((await service.cancel('grn-1', actor)).status, GrnStatus.CANCELLED);
  assert.equal(grns[0]?.status, GrnStatus.CANCELLED);

  await assert.rejects(
    setup([draft([{}], GrnStatus.POSTED_TO_STOCK)]).service.cancel('grn-1', actor),
    refusedWith(/^Posted GRN cannot be cancelled$/),
  );
});

test('only a draft may be edited or deleted', async () => {
  for (const [status, label] of [
    [GrnStatus.POSTED_TO_STOCK, 'Posted'],
    [GrnStatus.CANCELLED, 'Cancelled'],
  ] as const) {
    const { service } = setup([draft([{}], status)]);

    await assert.rejects(
      service.update('grn-1', { remarks: 'late' }, actor),
      refusedWith(new RegExp(`^${label} GRN cannot be edited$`)),
    );
    await assert.rejects(service.remove('grn-1', actor), refusedWith(/cannot be edited/));
  }

  const { grns, service } = setup([draft([{}])]);
  assert.deepEqual(await service.remove('grn-1', actor), { id: 'grn-1' });
  assert.ok(grns[0]?.deletedAt);
  assert.deepEqual(grns[0]?.lines, []);
});

test('editing the lines of a draft replaces them, checked against the store again', async () => {
  const { grns, service } = setup([draft([{ batchNumber: 'OLD' }])]);

  const updated = await service.update(
    'grn-1',
    { items: [line({}, [batch({ batchNumber: 'NEW' })])] },
    actor,
  );

  assert.deepEqual(
    updated?.lines.flatMap((stored) => stored.batches.map((saved) => saved.batchNumber)),
    ['NEW'],
  );
  await assert.rejects(
    service.update('grn-1', { items: [line({ itemId: 'thali' })] }, actor),
    refusedWith(/mapping is inactive/),
  );
  // Moving the draft to another location's store is refused.
  await assert.rejects(
    service.update('grn-1', { storeId: 's2' }, actor),
    refusedWith(/^Store does not belong to selected hospital$/),
  );
  assert.equal(grns[0]?.storeId, 's1');
});
