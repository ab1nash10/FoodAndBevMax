import { strict as assert } from 'node:assert';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  InventoryLocationType,
  ItemType,
  Prisma,
  TransferAcknowledgementStatus,
  TransferStatus,
} from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateTransferAcknowledgementDto } from './dto/create-transfer-acknowledgement.dto';
import type { TransferAcknowledgementsRepository } from './transfer-acknowledgements.repository';
import { TransferAcknowledgementsService } from './transfer-acknowledgements.service';

type TransferLine = {
  batchNumber: string | null;
  expiryDate: Date | null;
  id: string;
  item: { itemName: string; itemType: ItemType };
  itemId: string;
  sentQty: number;
};
type Transfer = {
  businessDate: Date;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospitalId: string;
  id: string;
  lines: TransferLine[];
  sourceId: string;
  sourceType: InventoryLocationType;
  status: TransferStatus;
};
type Credit = {
  businessDate: Date | null;
  itemId: string;
  locationId: string;
  locationType: InventoryLocationType;
  quantity: number;
};

const coke = (sentQty: number, id = 'l1'): TransferLine => ({
  batchNumber: 'B1',
  expiryDate: new Date('2099-12-31T00:00:00Z'),
  id,
  item: { itemName: 'Coke', itemType: ItemType.MRP },
  itemId: 'coke',
  sentQty,
});
const thali = (sentQty: number, id = 'l1'): TransferLine => ({
  batchNumber: null,
  expiryDate: null,
  id,
  item: { itemName: 'Veg Thali', itemType: ItemType.READYMADE },
  itemId: 'thali',
  sentQty,
});
// A dispatched store-to-restaurant transfer, waiting for the restaurant to receive it.
const pending = (lines: TransferLine[], over: Partial<Transfer> = {}): Transfer => ({
  businessDate: new Date('2026-10-20T00:00:00Z'),
  destinationId: 'r1',
  destinationType: InventoryLocationType.RESTAURANT,
  hospitalId: 'h1',
  id: 't1',
  lines,
  sourceId: 's1',
  sourceType: InventoryLocationType.STORE,
  status: TransferStatus.PENDING_ACKNOWLEDGEMENT,
  ...over,
});

// Stands in for the repository: one transfer, and what each step credited or wrote. `raced`
// makes the save hit the unique transfer, as when someone else received it a moment earlier.
function setup(transfer: Transfer | null, alreadyAcknowledged = false, raced = false) {
  const credits: Credit[] = [];
  const ledger: Array<Record<string, unknown>> = [];
  const lineUpdates: Array<[string, Record<string, unknown>]> = [];
  const savedLines: unknown[] = [];
  let header: { hospitalId: string; id: string; status: TransferAcknowledgementStatus } | null =
    null;
  const repository = {
    create: (data: { hospitalId: string; status: TransferAcknowledgementStatus }) => {
      if (raced) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          clientVersion: 'test',
          code: 'P2002',
        });
      }
      header = { hospitalId: data.hospitalId, id: 'ack-1', status: data.status };
      return Promise.resolve(header);
    },
    createLine: (data: unknown) => {
      savedLines.push(data);
      return Promise.resolve();
    },
    createStockLedger: (data: Record<string, unknown>) => {
      ledger.push(data);
      return Promise.resolve();
    },
    findActiveById: () => Promise.resolve(header && { ...header, lines: [], transfer: transfer! }),
    findActiveTransfer: () => Promise.resolve(transfer),
    findExistingForTransfer: () => Promise.resolve(alreadyAcknowledged ? transfer : null),
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler({}),
    updateTransfer: (_id: string, data: { status: TransferStatus }) => {
      transfer!.status = data.status;
      return Promise.resolve();
    },
    updateTransferLine: (id: string, data: Record<string, unknown>) => {
      lineUpdates.push([id, data]);
      return Promise.resolve();
    },
    upsertStockBalance: (input: Credit) => {
      credits.push({
        businessDate: input.businessDate,
        itemId: input.itemId,
        locationId: input.locationId,
        locationType: input.locationType,
        quantity: input.quantity,
      });
      return Promise.resolve({ availableQty: input.quantity });
    },
  };
  const service = new TransferAcknowledgementsService(
    repository as unknown as TransferAcknowledgementsRepository,
    { record: () => Promise.resolve() } as unknown as AuditLogService,
  );

  return { credits, ledger, lineUpdates, savedLines, service };
}

const receiver = { actorId: 'user-1', permissions: ['TRANSFER_ACKNOWLEDGE'] };
const receipt = (...items: Array<Record<string, unknown>>) =>
  ({ items, transferId: 't1' }) as unknown as CreateTransferAcknowledgementDto;
const take = (acceptedQty: number, rejectedQty = 0, over: Record<string, unknown> = {}) => ({
  acceptedQty,
  rejectedQty,
  transferLineId: 'l1',
  ...(rejectedQty > 0 ? { rejectionReason: 'Damaged' } : {}),
  ...over,
});
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);

test('taking everything sent is ACCEPTED_FULL: the restaurant is credited, nothing goes back', async () => {
  const transfer = pending([coke(10)]);
  const { credits, ledger, lineUpdates, service } = setup(transfer);

  const acknowledgement = await service.create(receipt(take(10)), receiver);

  assert.equal(acknowledgement.status, TransferAcknowledgementStatus.ACCEPTED_FULL);
  assert.equal(transfer.status, TransferStatus.ACKNOWLEDGED);
  assert.deepEqual(credits, [
    {
      businessDate: null,
      itemId: 'coke',
      locationId: 'r1',
      locationType: 'RESTAURANT',
      quantity: 10,
    },
  ]);
  assert.deepEqual(
    ledger.map((row) => [row.locationId, row.qtyIn, row.qtyOut, row.transactionType]),
    [['r1', 10, 0, 'RESTAURANT_TRANSFER_IN']],
  );
  assert.deepEqual(lineUpdates, [
    ['l1', { acceptedQty: 10, rejectedQty: 0, rejectionReason: undefined, updatedBy: 'user-1' }],
  ]);
});

test('a part rejected is ACCEPTED_PARTIAL, and the rejected part returns to the source store', async () => {
  const { credits, ledger, service } = setup(pending([coke(10)]));

  const acknowledgement = await service.create(
    receipt(take(7, 3, { rejectionReason: ' Dented cans ' })),
    receiver,
  );

  assert.equal(acknowledgement.status, TransferAcknowledgementStatus.ACCEPTED_PARTIAL);
  assert.deepEqual(
    credits.map((credit) => [credit.locationId, credit.quantity]),
    [
      ['r1', 7],
      ['s1', 3],
    ],
  );
  assert.deepEqual(ledger[1], {
    ...ledger[1],
    locationType: 'STORE',
    qtyIn: 3,
    referenceId: 'ack-1',
    referenceType: 'TRANSFER_ACKNOWLEDGEMENT',
    remarks: 'Dented cans',
    transactionType: 'TRANSFER_REJECTED_RETURN_IN',
  });
});

test('rejecting everything is REJECTED_FULL and credits the restaurant nothing', async () => {
  const { credits, service } = setup(pending([coke(10), thali(4, 'l2')]));

  const acknowledgement = await service.create(
    receipt(take(0, 10), take(0, 4, { transferLineId: 'l2' })),
    receiver,
  );

  assert.equal(acknowledgement.status, TransferAcknowledgementStatus.REJECTED_FULL);
  assert.deepEqual(
    credits.map((credit) => [credit.locationId, credit.itemId, credit.quantity]),
    [
      ['s1', 'coke', 10],
      ['s1', 'thali', 4],
    ],
  );
});

test('one line taken in full and another refused in full is a partial acceptance', async () => {
  const { service } = setup(pending([coke(10), thali(4, 'l2')]));

  const acknowledgement = await service.create(
    receipt(take(10), take(0, 4, { transferLineId: 'l2' })),
    receiver,
  );

  assert.equal(acknowledgement.status, TransferAcknowledgementStatus.ACCEPTED_PARTIAL);
});

test('a counter receives as COUNTER_RECEIVE_IN; ready-made stock keeps the business date', async () => {
  const { credits, ledger, service } = setup(
    pending([thali(5)], {
      destinationId: 'c1',
      destinationType: InventoryLocationType.COUNTER,
      sourceId: 'k1',
      sourceType: InventoryLocationType.KITCHEN,
    }),
  );

  await service.create(receipt(take(5)), receiver);

  assert.equal(credits[0]?.locationType, 'COUNTER');
  assert.equal(credits[0]?.businessDate?.toISOString(), '2026-10-20T00:00:00.000Z');
  assert.equal(ledger[0]?.transactionType, 'COUNTER_RECEIVE_IN');
  assert.equal(ledger[0]?.itemType, 'READYMADE');
});

test('every line is acknowledged exactly once, and only lines of this transfer', async () => {
  const transfer = pending([coke(10), thali(4, 'l2')]);

  for (const [items, message] of [
    [[take(10), take(10)], /^Duplicate acknowledgement lines are not allowed$/],
    [[take(10)], /^All transfer lines must be acknowledged$/],
    [[take(10), take(4, 0, { transferLineId: 'other' })], /^Line 2: transfer line does not belong/],
  ] as const) {
    const { credits, service } = setup(transfer);

    await assert.rejects(service.create(receipt(...items), receiver), refusedWith(message));
    assert.equal(credits.length, 0);
  }
  assert.equal(transfer.status, TransferStatus.PENDING_ACKNOWLEDGEMENT);
});

test('what the receiver names must match the line that was sent', async () => {
  for (const [over, message] of [
    [{ itemId: 'pepsi' }, /^Line 1: item does not match transfer line$/],
    [{ batchNumber: 'B2' }, /^Line 1: batch does not match transfer line$/],
    [{ expiryDate: '2099-12-30' }, /^Line 1: expiry date does not match transfer line$/],
    [{ sentQty: 9 }, /^Line 1: sent quantity does not match transfer line$/],
  ] as const) {
    const { service } = setup(pending([coke(10)]));

    await assert.rejects(
      service.create(receipt(take(10, 0, over)), receiver),
      refusedWith(message),
    );
  }

  // The same values, written loosely, are accepted.
  const { service } = setup(pending([coke(10)]));
  await assert.doesNotReject(
    service.create(
      receipt(
        take(10, 0, {
          batchNumber: ' B1 ',
          expiryDate: '2099-12-31T20:00:00+05:30',
          itemId: 'coke',
          sentQty: 10.0001,
        }),
      ),
      receiver,
    ),
  );
});

test('a ready-made line has no expiry, so naming one is refused', async () => {
  const { service } = setup(pending([thali(4)]));

  await assert.rejects(
    service.create(receipt(take(4, 0, { expiryDate: '2026-10-20' })), receiver),
    refusedWith(/expiry date does not match/),
  );
});

test('accepted plus rejected must be what was sent, and a rejection needs a reason', async () => {
  const { service } = setup(pending([coke(10)]));

  await assert.rejects(
    service.create(receipt(take(6, 3)), receiver),
    refusedWith(/^Line 1: accepted plus rejected quantity must equal sent quantity$/),
  );
  await assert.rejects(
    service.create(receipt(take(7, 3, { rejectionReason: '   ' })), receiver),
    refusedWith(/^Line 1: rejection reason is required$/),
  );
});

test('only a pending transfer, not yet acknowledged, can be received', async () => {
  for (const status of [
    TransferStatus.DRAFT,
    TransferStatus.ACKNOWLEDGED,
    TransferStatus.CANCELLED,
  ]) {
    await assert.rejects(
      setup(pending([coke(10)], { status })).service.create(receipt(take(10)), receiver),
      refusedWith(/^Only pending transfers can be acknowledged$/),
    );
  }
  await assert.rejects(
    setup(pending([coke(10)]), true).service.create(receipt(take(10)), receiver),
    refusedWith(/^Transfer has already been acknowledged$/),
  );
  // Two people receiving at once: the second gets the same answer, not a server error.
  await assert.rejects(
    setup(pending([coke(10)]), false, true).service.create(receipt(take(10)), receiver),
    refusedWith(/^Transfer has already been acknowledged$/),
  );
  await assert.rejects(
    setup(null).service.create(receipt(take(10)), receiver),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('who may receive: a cashier at a counter, restaurant staff for leftovers, else the full grant', async () => {
  const forbidden = (error: unknown) => error instanceof ForbiddenException;
  const toCounter = { destinationId: 'c1', destinationType: InventoryLocationType.COUNTER };
  const leftovers = { sourceId: 'r2', sourceType: InventoryLocationType.RESTAURANT };
  const as = (permissions: string[]) => ({ actorId: 'user-2', permissions });
  const receive = (over: Partial<Transfer>, permissions: string[]) =>
    setup(pending([thali(4)], over)).service.create(receipt(take(4)), as(permissions));

  await assert.rejects(receive({}, []), forbidden);
  await assert.rejects(receive({}, ['COUNTER_STOCK_RECEIVE']), forbidden);
  await assert.rejects(receive({}, ['RESTAURANT_TRANSFER_RECEIVE']), forbidden);
  await assert.doesNotReject(receive(toCounter, ['COUNTER_STOCK_RECEIVE']));
  await assert.doesNotReject(receive(leftovers, ['RESTAURANT_TRANSFER_RECEIVE']));
  await assert.rejects(receive(leftovers, ['COUNTER_STOCK_RECEIVE']), forbidden);
});
