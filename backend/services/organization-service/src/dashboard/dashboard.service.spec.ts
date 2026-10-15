import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { DASHBOARD_RECORDS_CAP, DashboardService } from './dashboard.service';

type Query = Record<string, unknown>;

// Every list method records the query it got (a DTO instance, as from the HTTP pipe) and
// answers one page; `total` above the page size marks it truncated.
function serviceWith(pages: Record<string, { items: unknown[]; total?: number }> = {}) {
  const calls: Record<string, Query> = {};
  const list = (name: string) => ({
    list: (query: Query) => {
      // A DTO instance also has its unset fields, as undefined; compare the ones that are set.
      calls[name] = Object.fromEntries(
        Object.entries(query).filter(([, value]) => value !== undefined),
      );
      const page = pages[name] ?? { items: [] };
      return Promise.resolve({ items: page.items, meta: { total: page.total ?? 7 } });
    },
  });
  const names = [
    'employees',
    'grns',
    'hospitals',
    'items',
    'kitchenItems',
    'kitchens',
    'menus',
    'productions',
    'restaurants',
    'storeItems',
    'stores',
    'transfers',
  ] as const;
  const [
    employees,
    grns,
    hospitals,
    items,
    kitchenItems,
    kitchens,
    menus,
    productions,
    restaurants,
    storeItems,
    stores,
    transfers,
  ] = names.map(list);
  const service = new DashboardService(
    ...([
      employees,
      grns,
      hospitals,
      items,
      kitchenItems,
      kitchens,
      menus,
      productions,
      restaurants,
      storeItems,
      stores,
      transfers,
    ] as unknown as ConstructorParameters<typeof DashboardService>),
  );

  return { calls, service };
}

const transfer = {
  businessDate: '2026-10-01',
  createdAt: '2026-10-01T09:00:00.000Z',
  hospital: { hospitalCode: 'H1', hospitalName: 'Saket', id: 'h1', isActive: true },
  hospitalId: 'h1',
  id: 't1',
  lines: [
    {
      acceptedQty: 4,
      batchNumber: 'B1',
      item: { id: 'i1', itemCode: 'ITM001', itemName: 'Rice' },
      itemId: 'i1',
      rejectedQty: 1,
      rejectionReason: 'Torn bag',
      sentQty: 5,
    },
  ],
  remarks: 'not needed',
  status: 'ACKNOWLEDGED',
  transferDate: '2026-10-01T00:00:00.000Z',
  transferNumber: 'TRF-0001',
  updatedAt: '2026-10-01T09:30:00.000Z',
};

test('records: each source is asked like the portal asked the list, with the cap as the page size', async () => {
  const { calls, service } = serviceWith();
  const all = ['TRANSFER_VIEW', 'KITCHEN_PRODUCTION_VIEW', 'GRN_VIEW'];

  await service.records({ fromDate: '2026-09-01T00:00:00.000Z', hospitalId: 'h1' }, all);

  const period = {
    fromDate: '2026-09-01T00:00:00.000Z',
    hospitalId: 'h1',
    limit: DASHBOARD_RECORDS_CAP,
    page: 1,
    sortOrder: 'desc',
  };
  assert.deepEqual(calls.transfers, { ...period, sortBy: 'transferDate' });
  assert.deepEqual(calls.productions, { ...period, sortBy: 'productionDate', status: 'POSTED' });
  assert.deepEqual(calls.grns, { ...period, sortBy: 'receivedDate', status: 'POSTED_TO_STOCK' });
});

test('records: only the fields the dashboard reads, and truncated when the total is larger', async () => {
  const { service } = serviceWith({ transfers: { items: [transfer], total: 1 } });

  const result = await service.records({ fromDate: '2026-09-01' }, ['KITCHEN_TRANSFER_VIEW']);

  assert.deepEqual(result.transfers, {
    items: [
      {
        createdAt: transfer.createdAt,
        hospital: transfer.hospital,
        hospitalId: 'h1',
        id: 't1',
        lines: [
          {
            acceptedQty: 4,
            item: { itemName: 'Rice' },
            itemId: 'i1',
            rejectedQty: 1,
            rejectionReason: 'Torn bag',
          },
        ],
        status: 'ACKNOWLEDGED',
        transferDate: transfer.transferDate,
        updatedAt: transfer.updatedAt,
      },
    ],
    truncated: false,
  });

  const big = serviceWith({ transfers: { items: [transfer], total: DASHBOARD_RECORDS_CAP + 1 } });
  assert.equal(
    (await big.service.records({ fromDate: '2026-09-01' }, ['TRANSFER_VIEW'])).transfers?.truncated,
    true,
  );
});

test('records: a source the user may not view is neither read nor returned', async () => {
  const { calls, service } = serviceWith();

  const result = await service.records({ fromDate: '2026-09-01' }, ['GRN_VIEW']);

  assert.deepEqual(Object.keys(calls), ['grns']);
  assert.equal(result.transfers, undefined);
  assert.equal(result.productions, undefined);
  assert.ok(result.grns);
});

test('setup: counts what each list totals, here or everywhere as the dashboard did', async () => {
  const { calls, service } = serviceWith({ grns: { items: [{ grnNumber: 'GRN-1' }] } });
  const all = [
    'EMPLOYEE_VIEW',
    'GRN_VIEW',
    'HOSPITAL_VIEW',
    'ITEM_VIEW',
    'KITCHEN_ITEM_VIEW',
    'KITCHEN_VIEW',
    'RESTAURANT_MENU_VIEW',
    'RESTAURANT_VIEW',
    'STORE_ITEM_VIEW',
    'STORE_VIEW',
    'TRANSFER_VIEW',
  ];

  const result = await service.setup({ hospitalId: 'h1' }, all);

  assert.deepEqual(result.counts, {
    employees: 7,
    hospitals: 7,
    items: 7,
    kitchenItems: 7,
    kitchens: 7,
    menus: 7,
    restaurants: 7,
    storeItems: 7,
    stores: 7,
  });
  assert.deepEqual(result.firstGrn, { grnNumber: 'GRN-1' });
  assert.equal(result.firstTransfer, null);
  // Same queries as before (page size 1); locations and items are not limited to the location.
  assert.deepEqual(calls.stores, { hospitalId: 'h1', limit: 1, page: 1, sortOrder: 'desc' });
  assert.deepEqual(calls.hospitals, { limit: 1, page: 1, sortOrder: 'desc' });
  assert.deepEqual(calls.items, { limit: 1, page: 1, sortOrder: 'desc' });
  assert.deepEqual(calls.grns, {
    hospitalId: 'h1',
    limit: 1,
    page: 1,
    sortBy: 'createdAt',
    sortOrder: 'asc',
    status: 'POSTED_TO_STOCK',
  });
  assert.deepEqual(calls.transfers, {
    hospitalId: 'h1',
    limit: 1,
    page: 1,
    sortBy: 'createdAt',
    sortOrder: 'asc',
    status: 'ACKNOWLEDGED',
  });
});

test('setup: without a permission its count and first record are left out', async () => {
  const { calls, service } = serviceWith();

  const result = await service.setup({}, ['STORE_VIEW']);

  assert.deepEqual(Object.keys(calls), ['stores']);
  assert.equal(result.counts.stores, 7);
  assert.equal(result.counts.items, undefined);
  assert.equal(result.firstGrn, undefined);
  assert.equal(result.firstTransfer, undefined);
});
