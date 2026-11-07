import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl, startHarness, type Harness } from './int-harness.js';

const inventoryIds = {
  grn_batches: 'grn_batch_id',
  grn_lines: 'grn_line_id',
  grns: 'grn_id',
  kitchen_production_lines: 'kitchen_production_line_id',
  kitchen_productions: 'kitchen_production_id',
  stock_balances: 'stock_balance_id',
  stock_ledgers: 'stock_ledger_id',
  transfer_acknowledgement_lines: 'transfer_acknowledgement_line_id',
  transfer_acknowledgements: 'transfer_acknowledgement_id',
  transfer_lines: 'transfer_line_id',
  transfers: 'transfer_id',
};

describe.skipIf(!databaseUrl)('integration harness', { timeout: 30_000 }, () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);
  afterAll(() => h?.app.close());

  it('signs in as the seeded Super Admin, and refuses a call with no token', async () => {
    expect((await h.api('GET', '/hospitals?limit=1')).status).toBe(200);
    expect((await h.api('GET', '/hospitals?limit=1', undefined, '')).status).toBe(401);
  });

  it('refuses any call off this machine, so no gateway is ever reached', async () => {
    await expect(fetch('https://example.com/')).rejects.toThrow(/may not call https:\/\/example\.com/);
  });

  it('names each inventory table’s id, and the links to it, after the table', async () => {
    const rows = await h.rawQuery<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1) AND column_name LIKE '%id'`,
      Object.keys(inventoryIds),
    );
    const columns = (table: string) =>
      rows.filter((row) => row.table_name === table).map((row) => row.column_name);
    for (const [table, id] of Object.entries(inventoryIds)) {
      expect(columns(table), table).toContain(id);
      expect(columns(table), table).not.toContain('id');
    }
    expect(columns('kitchen_production_lines')).toContain('kitchen_production_id');
    expect(columns('transfer_acknowledgement_lines')).toContain('transfer_acknowledgement_id');
  });

  // Last: it moves this run's Super Admin to a new session, so h.token stops working.
  it('a new sign-in works at once; the earlier browser is signed out', async () => {
    // Browser A's request caches the user's access.
    expect((await h.api('GET', '/hospitals?limit=1')).status).toBe(200);
    // Browser B signs in: the session version moves on.
    const [user] = await h.rawQuery<{ id: string; sessionVersion: number }>(
      `UPDATE users SET session_version = session_version + 1 WHERE id = $1::uuid
       RETURNING id, session_version AS "sessionVersion"`,
      h.superAdmin.id,
    );
    expect((await h.api('GET', '/hospitals?limit=1', undefined, h.signFor(user!))).status).toBe(200);
    expect((await h.api('GET', '/hospitals?limit=1')).status).toBe(401);
  });
});
