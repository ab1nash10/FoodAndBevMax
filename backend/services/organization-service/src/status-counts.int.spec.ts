// The tab counts of the stock lists over HTTP against a real database: they come from one grouped
// query, ignore the tab being viewed and keep the other filters. The suite makes its own location,
// so other suites cannot move them.
//
// Runs only with DATABASE_URL_TEST: a migrated and seeded database it may write to.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseUrl,
  firstOf,
  receiveStock,
  run,
  startHarness,
  type Body,
  type Harness,
} from './testing/int-harness.js';

const items = (data: Body) => data.items as Body[];
const idOf = (data: Body) => data.id as string;

describe.skipIf(!databaseUrl)('status counts (integration)', { timeout: 30_000 }, () => {
  let h: Harness;
  let hospitalId = '';

  beforeAll(async () => {
    h = await startHarness();
    const ok = (...args: Parameters<Harness['ok']>) => h.ok(...args);
    // Creating a location also makes its Main Store.
    hospitalId = idOf(
      await ok('POST', '/hospitals', {
        city: 'Gurugram',
        locationCode: `SC${run}`,
        state: 'Haryana',
        title: `Int Counts ${run}`,
      }),
    );
    const storeId = idOf(firstOf(items(await ok('GET', `/stores?hospitalId=${hospitalId}`))));
    const categoryId = idOf(
      await ok('POST', '/item-categories', { categoryName: `Int Counts ${run}` }),
    );
    const itemId = idOf(await ok('POST', '/items', { itemName: `Int Count ${run}`, type: 'VEG' }));
    await ok('POST', '/store-items', { categoryId, itemId, storeId });
    await receiveStock(h, { batchNumber: `SCP-${run}`, itemId, qty: 5, storeId });
  }, 120_000);

  afterAll(() => h?.app.close());

  // The ERP GRN put one batch (60 days to expiry) into the store, with one ledger line.
  it('stock ledgers count every reference type in the same request', async () => {
    const result = await h.api(
      'GET',
      `/stock-ledgers?hospitalId=${hospitalId}&limit=0&referenceType=TRANSFER&referenceTypeCounts=true`,
    );
    expect(result.status).toBe(200);
    expect(result.data.meta).toMatchObject({ referenceTypeCounts: { GRN_ENTRY: 1 }, total: 0 });
  });

  it('store stock counts every state from one load', async () => {
    const result = await h.api(
      'GET',
      `/store-stock/summary?hospitalId=${hospitalId}&limit=0&statusCounts=true`,
    );
    expect(result.status).toBe(200);
    expect(result.data.meta).toMatchObject({ statusCounts: { AVAILABLE: 1 }, total: 1 });
  });

  it('without the flag the response is as before', async () => {
    const result = await h.api('GET', `/stock-ledgers?hospitalId=${hospitalId}&limit=0`);
    expect(result.data.meta).not.toHaveProperty('referenceTypeCounts');
  });
});
