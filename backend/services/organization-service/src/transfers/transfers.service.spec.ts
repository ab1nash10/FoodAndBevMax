import { strict as assert } from 'node:assert';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryLocationType, ItemType, TransferStatus } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateTransferDto } from './dto/create-transfer.dto';
import { stockKey } from './transfers.helpers';
import type { TransfersRepository } from './transfers.repository';
import { TransfersService } from './transfers.service';

type Balance = {
  availableQty: number;
  batchNumber: string | null;
  businessDate: Date | null;
  expiryDate: Date | null;
  id: string;
  itemId: string;
  locationId: string;
};
type Line = {
  batchNumber: string | null;
  expiryDate: Date | null;
  item: { itemName: string; itemType: ItemType };
  itemId: string;
  sentQty: number;
};
type Transfer = {
  acknowledgements: [];
  businessDate: Date;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospitalId: string;
  id: string;
  lines: Line[];
  remarks: string | null;
  sourceId: string;
  sourceType: InventoryLocationType;
  status: TransferStatus;
};

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const items: Record<string, { itemName: string; itemType: ItemType }> = {
  coke: { itemName: 'Coke', itemType: ItemType.MRP },
  thali: { itemName: 'Veg Thali', itemType: ItemType.READYMADE },
};
const located = (hospitalId: string, isActive = true) => ({ hospitalId, isActive });

// Location h1 has store s1, kitchen k1, restaurants r1/r2 and counter c1; r9 belongs to h2.
// `balances` is the stock on hand; a dispatch decrements it as the real guarded update does.
function setup(balances: Balance[], transfers: Transfer[] = []) {
  const ledger: Array<Record<string, unknown>> = [];
  let transactions = 0;
  const hospitals: Record<string, { isActive: boolean }> = { h1: { isActive: true } };
  const places: Record<string, { hospitalId: string; isActive: boolean }> = {
    c1: located('h1'),
    k1: located('h1'),
    r1: located('h1'),
    r2: located('h1'),
    r9: located('h2'),
    s1: located('h1'),
    shut: located('h1', false),
  };
  const place = (id: string) => Promise.resolve(places[id] ?? null);
  const find = (id: string) => transfers.find((transfer) => transfer.id === id) ?? null;
  const repository = {
    create: (data: Omit<Transfer, 'acknowledgements' | 'id' | 'lines'>) => {
      const transfer = { ...data, acknowledgements: [], id: 't1', lines: [] } as Transfer;
      transfers.push(transfer);
      return Promise.resolve(transfer);
    },
    createLine: (data: Omit<Line, 'item'> & { transferId: string }) => {
      find(data.transferId)!.lines.push({ ...data, item: items[data.itemId]! });
      return Promise.resolve();
    },
    createStockLedger: (data: Record<string, unknown>) => {
      ledger.push(data);
      return Promise.resolve();
    },
    decrementStockBalance: (id: string, quantity: number) => {
      const balance = balances.find((stored) => stored.id === id)!;
      if (balance.availableQty < quantity) return Promise.resolve(null);
      balance.availableQty -= quantity;
      return Promise.resolve({ ...balance });
    },
    findActiveById: (id: string) => Promise.resolve(find(id)),
    findActiveCounter: place,
    findActiveHospital: (id: string) => Promise.resolve(hospitals[id] ?? null),
    findActiveKitchen: place,
    findActiveRestaurant: place,
    // Like the real query: the source's balances matching one of the keys exactly.
    findActiveSourceStockBalances: (
      _hospitalId: string,
      sourceId: string,
      _sourceType: InventoryLocationType,
      _itemType: ItemType,
      keys: Array<Parameters<typeof stockKey>[0]>,
    ) =>
      Promise.resolve(
        balances.filter(
          (balance) =>
            balance.locationId === sourceId &&
            keys.some((key) => stockKey(key) === stockKey(balance)),
        ),
      ),
    findActiveStore: place,
    findItemsByIds: (ids: string[]) =>
      Promise.resolve(ids.filter((id) => items[id]).map((id) => ({ id, ...items[id] }))),
    findUserNames: () => Promise.resolve([]),
    transaction: <T>(handler: (client: unknown) => Promise<T>) => {
      transactions += 1;
      return handler({ $queryRaw: () => Promise.resolve([]) });
    },
    update: (id: string, data: { status: TransferStatus }) => {
      const transfer = find(id)!;
      transfer.status = data.status;
      return Promise.resolve(transfer);
    },
  };
  const service = new TransfersService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as TransfersRepository,
  );

  return { balances, ledger, service, transactions: () => transactions, transfers };
}

const storeCoke = (availableQty: number, batchNumber = 'B1'): Balance => ({
  availableQty,
  batchNumber,
  businessDate: null,
  expiryDate: day('2099-12-31'),
  id: `bal-${batchNumber}`,
  itemId: 'coke',
  locationId: 's1',
});
const kitchenThali = (availableQty: number, businessDate: string): Balance => ({
  availableQty,
  batchNumber: null,
  businessDate: day(businessDate),
  expiryDate: null,
  id: `bal-thali-${businessDate}`,
  itemId: 'thali',
  locationId: 'k1',
});
const sender = { actorId: 'user-1', permissions: ['TRANSFER_CREATE', 'TRANSFER_DISPATCH'] };
const cokeLine = (sentQty: number, over: Record<string, unknown> = {}) => ({
  batchNumber: 'B1',
  expiryDate: '2099-12-31',
  itemId: 'coke',
  sentQty,
  ...over,
});
const fromStore = (lines: unknown[], over: Record<string, unknown> = {}) =>
  ({
    destinationId: 'r1',
    destinationType: InventoryLocationType.RESTAURANT,
    hospitalId: 'h1',
    items: lines,
    sourceId: 's1',
    sourceType: InventoryLocationType.STORE,
    transferDate: '2026-10-20T18:45:00Z',
    ...over,
  }) as unknown as CreateTransferDto;
const fromKitchen = (lines: unknown[], over: Record<string, unknown> = {}) =>
  fromStore(lines, { sourceId: 'k1', sourceType: InventoryLocationType.KITCHEN, ...over });
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);

test('a new transfer is a draft and moves no stock until it is dispatched', async () => {
  const { balances, ledger, service } = setup([storeCoke(10)]);

  const created = await service.create(fromStore([cokeLine(4)]), sender);

  assert.equal(created.status, TransferStatus.DRAFT);
  // With no business date given, it is the transfer's own UTC day.
  assert.equal(created.businessDate.toISOString(), '2026-10-20T00:00:00.000Z');
  assert.equal(balances[0]?.availableQty, 10);
  assert.equal(ledger.length, 0);
});

test('a kitchen-only grant is refused before anything is read', async () => {
  const { service, transactions } = setup([storeCoke(10)]);

  await assert.rejects(
    service.create(fromStore([cokeLine(4)]), { permissions: ['KITCHEN_TRANSFER_CREATE'] }),
    (error: unknown) => error instanceof ForbiddenException,
  );
  assert.equal(transactions(), 0);
});

test('where stock may go: never to itself, only to a restaurant or counter, in the same location', async () => {
  const { service } = setup([storeCoke(10)]);
  const send = (over: Record<string, unknown>) =>
    service.create(fromStore([cokeLine(1)], over), sender);

  await assert.rejects(
    send({ destinationId: 's1' }),
    refusedWith(/^Source and destination cannot be same$/),
  );
  await assert.rejects(
    send({ destinationType: InventoryLocationType.STORE }),
    refusedWith(/^Destination must be a restaurant or a counter$/),
  );
  await assert.rejects(
    send({ sourceType: InventoryLocationType.COUNTER }),
    refusedWith(/^Source must be a store, kitchen or restaurant$/),
  );
  await assert.rejects(
    send({ destinationId: 'r9' }),
    refusedWith(/^Restaurant does not belong to selected location$/),
  );
  await assert.rejects(
    send({ destinationId: 'shut' }),
    refusedWith(/^Restaurant not found or inactive$/),
  );
  await assert.rejects(
    send({ destinationId: 'gone', destinationType: InventoryLocationType.COUNTER }),
    refusedWith(/^Counter not found or inactive$/),
  );
  await assert.rejects(send({ hospitalId: 'h2' }), refusedWith(/^Location not found or inactive$/));
  await assert.doesNotReject(
    send({ destinationId: 'c1', destinationType: InventoryLocationType.COUNTER }),
  );
});

test('a restaurant passes its leftovers to another restaurant, never to a counter', async () => {
  const { service } = setup([]);

  await assert.rejects(
    service.create(
      fromStore([{ itemId: 'thali', sentQty: 1 }], {
        destinationId: 'c1',
        destinationType: InventoryLocationType.COUNTER,
        sourceId: 'r2',
        sourceType: InventoryLocationType.RESTAURANT,
      }),
      { permissions: ['RESTAURANT_TRANSFER_SEND'] },
    ),
    refusedWith(/^A restaurant sends its leftovers to another restaurant only$/),
  );
});

test('a store line names its batch and expiry; a kitchen line names neither', async () => {
  const { service } = setup([storeCoke(10), kitchenThali(10, '2026-10-20')]);

  await assert.rejects(
    service.create(fromStore([cokeLine(1, { batchNumber: '  ' })]), sender),
    refusedWith(/^Line 1: batch number is required$/),
  );
  await assert.rejects(
    service.create(fromStore([cokeLine(1, { expiryDate: undefined })]), sender),
    refusedWith(/^Line 1: expiry date is required$/),
  );
  await assert.rejects(
    service.create(fromKitchen([{ batchNumber: 'B1', itemId: 'thali', sentQty: 1 }]), sender),
    refusedWith(/^Line 1: READYMADE transfers must not include batch or expiry$/),
  );
  await assert.rejects(
    service.create(fromStore([{ itemId: 'thali', sentQty: 1 }]), sender),
    refusedWith(/^Line 1: store transfers support only MRP items$/),
  );
  await assert.rejects(
    service.create(
      fromKitchen([cokeLine(1, { batchNumber: undefined, expiryDate: undefined })]),
      sender,
    ),
    refusedWith(/^Line 1: kitchen transfers support only READYMADE items$/),
  );
  await assert.rejects(
    service.create(fromStore([cokeLine(1, { itemId: 'retired' })]), sender),
    refusedWith(/^Line 1: This item is inactive and cannot be used\.$/),
  );
});

test('two lines from the same batch are checked together against what it holds', async () => {
  const { service } = setup([storeCoke(10)]);

  await assert.rejects(
    service.create(fromStore([cokeLine(6), cokeLine(5)]), sender),
    refusedWith(/^Selected batch B1 has available stock 10\. Requested quantity 11\.$/),
  );
  await assert.doesNotReject(service.create(fromStore([cokeLine(6), cokeLine(4)]), sender));
});

test("ready-made stock is sent from the transfer's business day only", async () => {
  const { service } = setup([kitchenThali(3, '2026-10-19'), kitchenThali(8, '2026-10-20')]);
  const thaliLine = [{ itemId: 'thali', sentQty: 5 }];

  await assert.doesNotReject(service.create(fromKitchen(thaliLine), sender));
  await assert.rejects(
    service.create(fromKitchen(thaliLine, { businessDate: '2026-10-19' }), sender),
    refusedWith(
      /^Selected item Veg Thali for business date 2026-10-19 has available stock 3\. Requested quantity 5\.$/,
    ),
  );
  await assert.rejects(
    service.create(fromKitchen(thaliLine, { businessDate: '2026-10-18' }), sender),
    refusedWith(/has available stock 0\. Requested quantity 5\.$/),
  );
});

test('dispatch takes each line out of the source and leaves the transfer pending receipt', async () => {
  const { balances, ledger, service } = setup([storeCoke(10), storeCoke(5, 'B2')]);
  await service.create(fromStore([cokeLine(4), cokeLine(5, { batchNumber: 'B2' })]), sender);

  const dispatched = await service.dispatch('t1', sender);

  assert.equal(dispatched.status, TransferStatus.PENDING_ACKNOWLEDGEMENT);
  assert.deepEqual(
    balances.map((balance) => balance.availableQty),
    [6, 0],
  );
  assert.deepEqual(
    ledger.map((row) => [
      row.batchNumber,
      row.qtyIn,
      row.qtyOut,
      row.balanceAfter,
      row.transactionType,
    ]),
    [
      ['B1', 0, 4, 6, 'STORE_TO_RESTAURANT_OUT'],
      ['B2', 0, 5, 0, 'STORE_TO_RESTAURANT_OUT'],
    ],
  );
  await assert.rejects(
    service.dispatch('t1', sender),
    refusedWith(/^Only draft transfers can be dispatched$/),
  );
});

test('a kitchen dispatch is logged as KITCHEN_TRANSFER_OUT', async () => {
  const { ledger, service } = setup([kitchenThali(8, '2026-10-20')]);
  await service.create(fromKitchen([{ itemId: 'thali', sentQty: 3 }]), sender);

  await service.dispatch('t1', sender);

  assert.deepEqual(
    [ledger[0]?.itemType, ledger[0]?.locationType, ledger[0]?.transactionType],
    ['READYMADE', 'KITCHEN', 'KITCHEN_TRANSFER_OUT'],
  );
});

test('stock given out after the draft was raised stops the dispatch', async () => {
  const { balances, ledger, service, transfers } = setup([storeCoke(10)]);
  await service.create(fromStore([cokeLine(8)]), sender);
  balances[0]!.availableQty = 5;

  await assert.rejects(
    service.dispatch('t1', sender),
    refusedWith(/^Selected batch B1 has available stock 5\. Requested quantity 8\.$/),
  );
  assert.equal(ledger.length, 0);
  assert.equal(transfers[0]?.status, TransferStatus.DRAFT);
});

test('dispatch needs the dispatch grant for that source', async () => {
  const { service } = setup([storeCoke(10)]);
  await service.create(fromStore([cokeLine(1)]), sender);

  await assert.rejects(
    service.dispatch('t1', { permissions: ['TRANSFER_CREATE', 'KITCHEN_TRANSFER_DISPATCH'] }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test('only a draft may be cancelled, and a cancelled one is never dispatched', async () => {
  const { service } = setup([storeCoke(10)]);
  await service.create(fromStore([cokeLine(1)]), sender);

  assert.equal((await service.cancel('t1', sender)).status, TransferStatus.CANCELLED);
  await assert.rejects(
    service.cancel('t1', sender),
    refusedWith(/^Only draft transfers can be cancelled$/),
  );
  await assert.rejects(service.dispatch('t1', sender), refusedWith(/^Only draft transfers/));
});
