import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { ItemType, KitchenProductionStatus } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { CreateKitchenProductionDto } from './dto/create-kitchen-production.dto';
import type { KitchenProductionsRepository } from './kitchen-productions.repository';
import { KitchenProductionsService } from './kitchen-productions.service';

type StoredLine = {
  acceptedQty: number;
  itemId: string;
  producedQty: number;
  remarks?: string;
  wastageQty: number;
};
type StoredProduction = {
  businessDate: Date;
  chefUserId?: string;
  deletedAt: Date | null;
  hospitalId: string;
  id: string;
  kitchenId: string;
  lines: StoredLine[];
  remarks: string | null;
  status: KitchenProductionStatus;
};

// Location h1 has kitchens k1 and k2, h2 has k9. Thali and Dal are READYMADE and mapped to k1;
// only Thali is mapped to k2. Chef u1 is active.
function setup(productions: StoredProduction[] = []) {
  const balances = new Map<string, number>();
  const ledger: Array<Record<string, unknown>> = [];
  const kitchens: Record<string, { hospitalId: string; isActive: boolean }> = {
    k1: { hospitalId: 'h1', isActive: true },
    k2: { hospitalId: 'h1', isActive: true },
    k9: { hospitalId: 'h2', isActive: true },
  };
  const menus: Record<string, string[]> = { k1: ['thali', 'dal'], k2: ['thali'] };
  const find = (id: string) => productions.find((stored) => stored.id === id && !stored.deletedAt);
  const repository = {
    create: (data: Omit<StoredProduction, 'deletedAt' | 'id' | 'lines'>) => {
      const production = { ...data, deletedAt: null, id: 'kp-1', lines: [] };
      productions.push(production);
      return Promise.resolve(production);
    },
    createLine: (data: StoredLine & { productionId: string }) => {
      find(data.productionId)!.lines.push(data);
      return Promise.resolve();
    },
    createStockLedger: (data: Record<string, unknown>) => {
      ledger.push(data);
      return Promise.resolve();
    },
    findActiveById: (id: string) => Promise.resolve(find(id) ?? null),
    findActiveChef: (id: string) => Promise.resolve(id === 'u1' ? { id } : null),
    findActiveHospital: (id: string) => Promise.resolve({ id, isActive: true }),
    findActiveKitchen: (id: string) => Promise.resolve(kitchens[id] ?? null),
    findActiveKitchenMappings: (kitchenId: string, itemIds: string[]) =>
      Promise.resolve(
        itemIds
          .filter((itemId) => menus[kitchenId]?.includes(itemId))
          .map((itemId) => ({
            item: { id: itemId, itemType: ItemType.READYMADE },
            itemId,
            kitchenId,
          })),
      ),
    softDeleteLines: (id: string) => {
      find(id)!.lines = [];
      return Promise.resolve();
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) =>
      handler({ $queryRaw: () => Promise.resolve([]) }),
    update: (id: string, data: Partial<StoredProduction>) => {
      const production = productions.find((stored) => stored.id === id)!;
      Object.assign(production, data);
      return Promise.resolve(production);
    },
    upsertStockBalance: (input: {
      businessDate: Date;
      itemId: string;
      locationId: string;
      quantity: number;
    }) => {
      const key = `${input.locationId}|${input.itemId}|${input.businessDate.toISOString().slice(0, 10)}`;
      balances.set(key, (balances.get(key) ?? 0) + input.quantity);
      return Promise.resolve({ availableQty: balances.get(key)! });
    },
  };
  const service = new KitchenProductionsService(
    { record: () => Promise.resolve() } as unknown as AuditLogService,
    repository as unknown as KitchenProductionsRepository,
  );

  return { balances, ledger, productions, service };
}

const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const production = (items: unknown[], over: Record<string, unknown> = {}) =>
  ({
    businessDate: '2026-10-20',
    hospitalId: 'h1',
    items,
    kitchenId: 'k1',
    productionDate: '2026-10-20T06:00:00Z',
    ...over,
  }) as unknown as CreateKitchenProductionDto;
const stored = (
  lines: StoredLine[],
  status: KitchenProductionStatus = KitchenProductionStatus.DRAFT,
): StoredProduction => ({
  businessDate: new Date('2026-10-20T00:00:00Z'),
  deletedAt: null,
  hospitalId: 'h1',
  id: 'kp-1',
  kitchenId: 'k1',
  lines,
  remarks: 'Lunch batch',
  status,
});
const made = (itemId: string, producedQty: number, acceptedQty: number, remarks?: string) => ({
  acceptedQty,
  itemId,
  producedQty,
  remarks,
  wastageQty: producedQty - acceptedQty,
});
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);

test('accepted is produced minus wastage unless given, to three decimals', async () => {
  const { balances, service } = setup();

  const created = await service.create(
    production([
      { itemId: 'thali', producedQty: 1.1, wastageQty: 0.2 },
      { itemId: 'dal', producedQty: 10 },
      { acceptedQty: 6, itemId: 'thali', producedQty: 10, wastageQty: 1 },
    ]),
    actor,
  );

  assert.equal(created?.status, KitchenProductionStatus.DRAFT);
  assert.deepEqual(
    created?.lines.map((line) => [line.producedQty, line.wastageQty, line.acceptedQty]),
    [
      [1.1, 0.2, 0.9],
      [10, 0, 10],
      [10, 1, 6],
    ],
  );
  // A draft makes no stock.
  assert.equal(balances.size, 0);
});

test('the quantities of a line must make sense', async () => {
  const { service } = setup();
  const refused = (line: Record<string, unknown>, message: RegExp) =>
    assert.rejects(
      service.create(production([{ itemId: 'thali', ...line }]), actor),
      refusedWith(message),
    );

  await refused({ producedQty: 0 }, /^Line 1: produced quantity must be greater than zero$/);
  await refused(
    { acceptedQty: 11, producedQty: 10 },
    /^Line 1: accepted quantity cannot exceed produced quantity$/,
  );
  // Wastage beyond what was made leaves a negative acceptance when none is given.
  await refused(
    { producedQty: 10, wastageQty: 11 },
    /^Line 1: accepted quantity cannot be negative$/,
  );
  await refused(
    { acceptedQty: 0, producedQty: 10, wastageQty: 11 },
    /^Line 1: wastage quantity cannot exceed produced quantity$/,
  );
  await refused(
    { acceptedQty: 8, producedQty: 10, wastageQty: 3 },
    /^Line 1: accepted plus wastage quantity cannot exceed produced quantity$/,
  );
});

test("only items mapped to the production's kitchen can be produced there", async () => {
  const { service } = setup();

  await assert.rejects(
    service.create(production([{ itemId: 'dal', producedQty: 5 }], { kitchenId: 'k2' }), actor),
    refusedWith(/^Line 1: This item is not mapped to this kitchen, or its mapping is inactive\.$/),
  );
});

test("the kitchen belongs to the production's location, and a named chef must be active", async () => {
  const { productions, service } = setup();
  const line = [{ itemId: 'thali', producedQty: 5 }];

  await assert.rejects(
    service.create(production(line, { kitchenId: 'k9' }), actor),
    refusedWith(/^Kitchen does not belong to selected hospital$/),
  );
  await assert.rejects(
    service.create(production(line, { kitchenId: 'gone' }), actor),
    refusedWith(/^Kitchen not found or inactive$/),
  );
  await assert.rejects(
    service.create(production(line, { chefUserId: 'u2' }), actor),
    refusedWith(/^Chef user not found or inactive$/),
  );
  assert.equal(productions.length, 0);
  await assert.doesNotReject(service.create(production(line, { chefUserId: 'u1' }), actor));
});

test('posting puts accepted quantities into kitchen stock for the business day', async () => {
  const { balances, ledger, productions, service } = setup([
    stored([made('thali', 10, 8, 'Two burnt'), made('dal', 4, 0), made('thali', 3, 3)]),
  ]);

  const posted = await service.post('kp-1', actor);

  assert.equal(posted.status, KitchenProductionStatus.POSTED);
  assert.equal(productions[0]?.status, KitchenProductionStatus.POSTED);
  // Both thali lines land on the same day's balance; nothing accepted, nothing posted.
  assert.deepEqual(Object.fromEntries(balances), { 'k1|thali|2026-10-20': 11 });
  assert.deepEqual(
    ledger.map((row) => [row.qtyIn, row.balanceAfter, row.remarks, row.transactionType]),
    [
      [8, 8, 'Two burnt', 'KITCHEN_PRODUCTION_IN'],
      [3, 11, 'Lunch batch', 'KITCHEN_PRODUCTION_IN'],
    ],
  );
  assert.deepEqual(
    [ledger[0]?.itemType, ledger[0]?.locationType, ledger[0]?.referenceType],
    ['READYMADE', 'KITCHEN', 'KITCHEN_PRODUCTION'],
  );
});

test('a production is posted once and never after it is cancelled', async () => {
  await assert.rejects(
    setup([stored([], KitchenProductionStatus.POSTED)]).service.post('kp-1', actor),
    refusedWith(/^Kitchen production is already posted$/),
  );
  await assert.rejects(
    setup([stored([], KitchenProductionStatus.CANCELLED)]).service.post('kp-1', actor),
    refusedWith(/^Cancelled kitchen production cannot be posted$/),
  );
});

test('cancelling: a draft only, and twice is refused', async () => {
  const { service } = setup([stored([made('thali', 5, 5)])]);

  assert.equal((await service.cancel('kp-1', actor)).status, KitchenProductionStatus.CANCELLED);
  await assert.rejects(
    service.cancel('kp-1', actor),
    refusedWith(/^Kitchen production is already cancelled$/),
  );
  await assert.rejects(
    setup([stored([], KitchenProductionStatus.POSTED)]).service.cancel('kp-1', actor),
    refusedWith(/^Posted kitchen production cannot be cancelled$/),
  );
});

test('only a draft may be edited or deleted', async () => {
  for (const [status, label] of [
    [KitchenProductionStatus.POSTED, 'Posted'],
    [KitchenProductionStatus.CANCELLED, 'Cancelled'],
  ] as const) {
    const { service } = setup([stored([], status)]);

    await assert.rejects(
      service.update('kp-1', { remarks: 'late' }, actor),
      refusedWith(new RegExp(`^${label} kitchen production cannot be edited$`)),
    );
    await assert.rejects(service.remove('kp-1', actor), refusedWith(/cannot be edited/));
  }

  const { productions, service } = setup([stored([made('thali', 5, 5)])]);
  assert.deepEqual(await service.remove('kp-1', actor), { id: 'kp-1' });
  assert.ok(productions[0]?.deletedAt);
  assert.deepEqual(productions[0]?.lines, []);
});

test('moving a draft to another kitchen needs its items mapped there', async () => {
  const { productions, service } = setup([stored([made('thali', 5, 5), made('dal', 2, 2)])]);

  await assert.rejects(
    service.update('kp-1', { kitchenId: 'k2' }, actor),
    refusedWith(/^All items must be active READYMADE items mapped to the selected kitchen$/),
  );
  assert.equal(productions[0]?.kitchenId, 'k1');

  // With new lines given, they are checked against the new kitchen instead.
  const updated = await service.update(
    'kp-1',
    { items: [{ itemId: 'thali', producedQty: 4 }], kitchenId: 'k2' },
    actor,
  );
  assert.equal(updated?.kitchenId, 'k2');
  assert.deepEqual(
    updated?.lines.map((line) => [line.itemId, line.acceptedQty]),
    [['thali', 4]],
  );
});
