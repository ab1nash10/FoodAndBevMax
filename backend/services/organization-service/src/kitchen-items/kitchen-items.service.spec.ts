import { strict as assert } from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { KitchenItemsRepository } from './kitchen-items.repository';
import { KitchenItemsService } from './kitchen-items.service';

type Mapping = {
  categoryId: string;
  deletedAt: Date | null;
  id: string;
  isActive: boolean;
  itemId: string;
  kitchenId: string;
  updatedBy?: string;
};
type Item = { id: string; isActive: boolean; itemName: string; itemType: ItemType | null };
type Audit = {
  action: string;
  actorId: string;
  entityId: string;
  entityName: string;
  ipAddress?: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
};
type Connect = { connect: { id: string } };

// Kitchens k1 and k3 (active) and k2 (switched off); categories mains and snacks (active) and
// old (switched off). The transaction client answers the item-classification reads from the same
// mappings; `produced` lists items with production lines.
function setup(items: Item[], produced: string[] = []) {
  const mappings: Mapping[] = [];
  const audits: Audit[] = [];
  const listed: unknown[] = [];
  const updates: string[] = [];
  const failNextCreate: { error?: Error } = {};
  const live = () => mappings.filter((mapping) => !mapping.deletedAt);
  const kitchens: Record<string, { isActive: boolean }> = {
    k1: { isActive: true },
    k2: { isActive: false },
    k3: { isActive: true },
  };
  const categories: Record<string, { isActive: boolean }> = {
    mains: { isActive: true },
    old: { isActive: false },
    snacks: { isActive: true },
  };
  const tx = {
    item: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(items.find((item) => item.id === where.id) ?? null),
      update: ({ data, where }: { data: { itemType: ItemType }; where: { id: string } }) => {
        items.find((item) => item.id === where.id)!.itemType = data.itemType;
        return Promise.resolve();
      },
      updateMany: ({ where }: { where: { id: string; itemType: ItemType } }) => {
        const item = items.find((stored) => stored.id === where.id)!;
        if (item.itemType === where.itemType) item.itemType = null;
        return Promise.resolve();
      },
    },
    itemCategory: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(categories[where.id] ?? null),
    },
    kitchenItem: {
      count: ({ where }: { where: { itemId: string } }) =>
        Promise.resolve(live().filter((mapping) => mapping.itemId === where.itemId).length),
    },
    kitchenProductionLine: {
      count: ({ where }: { where: { itemId: string } }) =>
        Promise.resolve(produced.filter((itemId) => itemId === where.itemId).length),
    },
    stockLedger: { count: () => Promise.resolve(0) },
  };
  const repository = {
    count: (args: unknown) => {
      listed.push(args);
      return Promise.resolve(42);
    },
    create: (data: Omit<Mapping, 'deletedAt' | 'id'>) => {
      if (failNextCreate.error) {
        const { error } = failNextCreate;
        delete failNextCreate.error;
        return Promise.reject(error);
      }
      const mapping = { ...data, deletedAt: null, id: `map-${mappings.length + 1}` };
      mappings.push(mapping);
      return Promise.resolve({ ...mapping });
    },
    findActiveById: (id: string) => {
      const mapping = live().find((stored) => stored.id === id);
      return Promise.resolve(mapping ? { ...mapping } : null);
    },
    findActiveKitchen: (id: string) => Promise.resolve(kitchens[id] ?? null),
    findActiveMapping: (
      kitchenId: string,
      itemId: string,
      categoryId: string,
      excludeId?: string,
    ) =>
      Promise.resolve(
        live().find(
          (mapping) =>
            mapping.kitchenId === kitchenId &&
            mapping.itemId === itemId &&
            mapping.categoryId === categoryId &&
            mapping.id !== excludeId,
        ) ?? null,
      ),
    findMany: (args: unknown) => {
      listed.push(args);
      return Promise.resolve(live().map((mapping) => ({ ...mapping, secret: 'not exposed' })));
    },
    transaction: <T>(handler: (client: unknown) => Promise<T>) => handler(tx),
    update: (
      id: string,
      data: Partial<Mapping> & { category?: Connect; item?: Connect; kitchen?: Connect },
    ) => {
      updates.push(id);
      const mapping = mappings.find((stored) => stored.id === id)!;
      const { category, item, kitchen, ...fields } = data;
      Object.assign(mapping, fields);
      mapping.categoryId = category?.connect.id ?? mapping.categoryId;
      mapping.itemId = item?.connect.id ?? mapping.itemId;
      mapping.kitchenId = kitchen?.connect.id ?? mapping.kitchenId;
      return Promise.resolve({ ...mapping });
    },
  };
  const service = new KitchenItemsService(
    {
      record: (entry: Audit) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    repository as unknown as KitchenItemsRepository,
  );

  return { audits, failNextCreate, items, listed, mappings, service, updates };
}

const actor = { actorId: 'user-1', ipAddress: '10.0.0.1' };
const item = (id: string, itemType: ItemType | null = null): Item => ({
  id,
  isActive: true,
  itemName: id,
  itemType,
});
const map = (itemId: string, kitchenId = 'k1', categoryId = 'mains') => ({
  categoryId,
  itemId,
  kitchenId,
});
const refusedWith = (pattern: RegExp) => (error: unknown) =>
  error instanceof BadRequestException && pattern.test(error.message);
const isDuplicate = (error: unknown) =>
  error instanceof ConflictException &&
  error.message === 'Kitchen item mapping already exists for this category';
const isMissing = (error: unknown) =>
  error instanceof NotFoundException && error.message === 'Kitchen item mapping not found';

test('mapping an item to a kitchen makes it READYMADE; an exact repeat is a conflict', async () => {
  const { items, service } = setup([item('thali')]);

  await service.create(map('thali'), actor);

  assert.equal(items[0]?.itemType, ItemType.READYMADE);
  await assert.rejects(service.create(map('thali'), actor), isDuplicate);
});

test('a store item, an inactive item or an inactive kitchen cannot be mapped', async () => {
  const { service } = setup([
    item('thali'),
    item('coke', ItemType.MRP),
    { ...item('old'), isActive: false },
  ]);

  await assert.rejects(
    service.create(map('coke'), actor),
    refusedWith(
      /^coke is an MRP item \(mapped to stores\), so it cannot be mapped to a kitchen\.$/,
    ),
  );
  await assert.rejects(
    service.create(map('old'), actor),
    refusedWith(/^This item is inactive and cannot be used\.$/),
  );
  await assert.rejects(
    service.create(map('thali', 'k2'), actor),
    refusedWith(/^Kitchen not found or inactive$/),
  );
});

test('removing a mapping releases the type only of an item never produced', async () => {
  const { items, service } = setup([item('thali'), item('dal')], ['dal']);
  await service.create(map('thali'), actor);
  await service.create(map('dal'), actor);

  await service.remove('map-1', actor);
  await service.remove('map-2', actor);

  assert.deepEqual(
    items.map((stored) => [stored.id, stored.itemType]),
    [
      ['thali', null],
      ['dal', ItemType.READYMADE],
    ],
  );
});

test('a missing kitchen, item or category is refused, and nothing is stored', async () => {
  const { mappings, service } = setup([item('thali')]);

  await assert.rejects(
    service.create(map('thali', 'nowhere'), actor),
    refusedWith(/^Kitchen not found or inactive$/),
  );
  await assert.rejects(service.create(map('ghost'), actor), refusedWith(/^Item not found$/));
  await assert.rejects(
    service.create(map('thali', 'k1', 'nothing'), actor),
    refusedWith(/^Item category not found$/),
  );
  await assert.rejects(
    service.create(map('thali', 'k1', 'old'), actor),
    refusedWith(/^This category is inactive and cannot be used\.$/),
  );
  assert.equal(mappings.length, 0);
});

test('the same item may sit under another category or in another kitchen', async () => {
  const { service } = setup([item('thali')]);

  await service.create(map('thali'), actor);

  await assert.doesNotReject(service.create(map('thali', 'k1', 'snacks'), actor));
  await assert.doesNotReject(service.create(map('thali', 'k3'), actor));
});

test('a deleted mapping no longer blocks mapping the item again', async () => {
  const { service } = setup([item('thali')]);
  await service.create(map('thali'), actor);
  await service.remove('map-1', actor);

  const again = await service.create(map('thali'), actor);

  assert.equal(again.id, 'map-2');
});

test('a new mapping starts active unless sent inactive, and is audited with its actor', async () => {
  const { audits, mappings, service } = setup([item('thali'), item('dal')]);

  const created = await service.create(map('thali'), actor);
  await service.create({ ...map('dal'), isActive: false }, actor);

  assert.equal(created.isActive, true);
  assert.equal(created.kitchenId, 'k1');
  assert.equal(created.categoryId, 'mains');
  assert.equal(mappings[1]?.isActive, false);
  assert.deepEqual(
    audits.map(({ action, actorId, entityId, entityName, ipAddress }) => ({
      action,
      actorId,
      entityId,
      entityName,
      ipAddress,
    })),
    [
      {
        action: 'KITCHEN_ITEM_CREATE',
        actorId: 'user-1',
        entityId: 'map-1',
        entityName: 'kitchen_items',
        ipAddress: '10.0.0.1',
      },
      {
        action: 'KITCHEN_ITEM_CREATE',
        actorId: 'user-1',
        entityId: 'map-2',
        entityName: 'kitchen_items',
        ipAddress: '10.0.0.1',
      },
    ],
  );
  assert.equal(audits[0]?.newValue?.itemId, 'thali');
});

test('a unique-index clash on save is reported as a conflict; other failures pass through', async () => {
  const { failNextCreate, service } = setup([item('thali')]);

  // Two saves racing past the duplicate check: the database index catches the second.
  failNextCreate.error = new Prisma.PrismaClientKnownRequestError('unique', {
    clientVersion: 'test',
    code: 'P2002',
  });
  await assert.rejects(
    service.create(map('thali'), actor),
    (error: unknown) =>
      error instanceof ConflictException && error.message === 'Kitchen item mapping already exists',
  );

  failNextCreate.error = new Error('connection lost');
  await assert.rejects(service.create(map('thali'), actor), /^Error: connection lost$/);
});

test('a missing or deleted mapping cannot be read, changed or removed', async () => {
  const { service } = setup([item('thali')]);
  await service.create(map('thali'), actor);
  await service.remove('map-1', actor);

  await assert.rejects(service.getById('map-1'), isMissing);
  await assert.rejects(service.getById('nope'), isMissing);
  await assert.rejects(service.update('map-1', { isActive: true }, actor), isMissing);
  await assert.rejects(service.remove('map-1', actor), isMissing);
});

test('a mapping is read back with only its public fields', async () => {
  const { service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  const read = await service.getById('map-1');

  assert.equal(read.id, 'map-1');
  assert.equal(read.itemId, 'thali');
  assert.ok(!('updatedBy' in read));
});

test('the list shows live mappings, newest first, 20 to a page by default', async () => {
  const { listed, service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  const page = await service.list({});

  assert.deepEqual(listed[0], {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 0,
    take: 20,
    where: { deletedAt: null },
  });
  assert.deepEqual(listed[1], { where: { deletedAt: null } });
  assert.deepEqual(page.meta, { limit: 20, page: 1, total: 42, totalPages: 3 });
  assert.equal(page.items.length, 1);
  assert.ok(!('secret' in page.items[0]!));
});

test('the list filters by location, kitchen, item, status and search text', async () => {
  const { listed, service } = setup([]);

  await service.list({
    hospitalId: 'saket',
    isActive: false,
    itemId: 'thali',
    kitchenId: 'k1',
    limit: 10,
    page: 3,
    search: 'veg',
    sortBy: 'updatedAt',
    sortOrder: 'asc',
  });

  const contains = { contains: 'veg', mode: 'insensitive' };
  assert.deepEqual(listed[0], {
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    skip: 20,
    take: 10,
    where: {
      deletedAt: null,
      // A kitchen item belongs to a location through its kitchen.
      kitchen: { hospitalId: 'saket' },
      isActive: false,
      itemId: 'thali',
      kitchenId: 'k1',
      OR: [
        { category: { categoryName: contains } },
        { item: { itemCode: contains } },
        { item: { itemName: contains } },
        { kitchen: { kitchenCode: contains } },
        { kitchen: { kitchenName: contains } },
      ],
    },
  });
});

test('a mapping may move to another active kitchen, but not an inactive one', async () => {
  const { mappings, service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  await assert.rejects(
    service.update('map-1', { kitchenId: 'k2' }, actor),
    refusedWith(/^Kitchen not found or inactive$/),
  );
  const moved = await service.update('map-1', { kitchenId: 'k3' }, actor);

  assert.equal(moved.kitchenId, 'k3');
  assert.equal(mappings[0]?.updatedBy, 'user-1');
});

test('an edit may not turn a mapping into a copy of another', async () => {
  const { service } = setup([item('thali')]);
  await service.create(map('thali'), actor);
  await service.create(map('thali', 'k3'), actor);
  await service.create(map('thali', 'k1', 'snacks'), actor);

  await assert.rejects(service.update('map-2', { kitchenId: 'k1' }, actor), isDuplicate);
  await assert.rejects(service.update('map-3', { categoryId: 'mains' }, actor), isDuplicate);
  // Re-sending its own kitchen and category is not a clash with itself.
  await assert.doesNotReject(
    service.update('map-1', { categoryId: 'mains', kitchenId: 'k1' }, actor),
  );
});

test("a mapping's category may change only to an active one", async () => {
  const { service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  await assert.rejects(
    service.update('map-1', { categoryId: 'old' }, actor),
    refusedWith(/^This category is inactive and cannot be used\.$/),
  );
  const changed = await service.update('map-1', { categoryId: 'snacks' }, actor);

  assert.equal(changed.categoryId, 'snacks');
});

test('swapping the item classifies the new one and releases the old one if unused', async () => {
  const { items, service } = setup([item('thali'), item('dal'), item('rice')]);
  await service.create(map('thali'), actor);
  await service.create(map('rice'), actor);
  await service.create(map('rice', 'k3'), actor);

  await service.update('map-1', { itemId: 'dal' }, actor);
  // rice keeps its type: its other mapping still uses it.
  await service.update('map-2', { itemId: 'dal', categoryId: 'snacks' }, actor);

  assert.deepEqual(
    items.map((stored) => [stored.id, stored.itemType]),
    [
      ['thali', null],
      ['dal', ItemType.READYMADE],
      ['rice', ItemType.READYMADE],
    ],
  );
});

test('a mapping cannot be swapped to a store item, and stays as it was', async () => {
  const { items, mappings, service } = setup([item('thali'), item('coke', ItemType.MRP)]);
  await service.create(map('thali'), actor);

  await assert.rejects(service.update('map-1', { itemId: 'coke' }, actor), refusedWith(/MRP/));

  assert.equal(mappings[0]?.itemId, 'thali');
  assert.equal(items[0]?.itemType, ItemType.READYMADE);
});

test('switching a mapping on or off is a status change; anything else is an update', async () => {
  const { audits, service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  await service.update('map-1', { categoryId: 'snacks' }, actor);
  await service.update('map-1', { isActive: false }, actor);
  // Sending the status it already has is not a change.
  await service.update('map-1', { isActive: false }, actor);
  await service.update('map-1', { isActive: true }, actor);

  assert.deepEqual(
    audits.slice(1).map((audit) => audit.action),
    [
      'KITCHEN_ITEM_UPDATE',
      'KITCHEN_ITEM_STATUS_CHANGE',
      'KITCHEN_ITEM_UPDATE',
      'KITCHEN_ITEM_STATUS_CHANGE',
    ],
  );
  assert.equal(audits[2]?.oldValue?.isActive, true);
  assert.equal(audits[2]?.newValue?.isActive, false);
});

test('an empty edit writes nothing but is still audited', async () => {
  const { audits, service, updates } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  const same = await service.update('map-1', {}, actor);

  assert.equal(same.id, 'map-1');
  assert.deepEqual(updates, []);
  assert.equal(audits.at(-1)?.action, 'KITCHEN_ITEM_UPDATE');
  assert.deepEqual(audits.at(-1)?.newValue, audits.at(-1)?.oldValue);
});

test('removing a mapping soft-deletes it, switches it off and audits the old value', async () => {
  const { audits, mappings, service } = setup([item('thali')]);
  await service.create(map('thali'), actor);

  assert.deepEqual(await service.remove('map-1', actor), { id: 'map-1' });

  assert.ok(mappings[0]?.deletedAt instanceof Date);
  assert.equal(mappings[0]?.isActive, false);
  assert.equal(mappings[0]?.updatedBy, 'user-1');
  assert.equal(audits.at(-1)?.action, 'KITCHEN_ITEM_DELETE');
  assert.equal(audits.at(-1)?.entityId, 'map-1');
  assert.equal(audits.at(-1)?.oldValue?.isActive, true);
});

test('removing one of two mappings of an item keeps its type', async () => {
  const { items, service } = setup([item('thali')]);
  await service.create(map('thali'), actor);
  await service.create(map('thali', 'k3'), actor);

  await service.remove('map-1', actor);

  assert.equal(items[0]?.itemType, ItemType.READYMADE);
});
