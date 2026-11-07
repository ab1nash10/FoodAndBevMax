import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import {
  AUDIT_VALUE_LIMIT_BYTES,
  auditDiff,
  auditRowData,
  AuditService,
  capAuditValue,
  type AuditClient,
} from './audit';
import { runWithRequestContext } from './context';
import { logger } from './logger';
import { REDACTED } from './redact';

afterEach(() => mock.restoreAll());

void test('a diff keeps only the changed fields, ignoring updatedAt/updatedBy', () => {
  assert.deepEqual(
    auditDiff(
      { name: 'Rice', price: 10, updatedAt: '2026-01-01', lines: [{ qty: 1 }] },
      { name: 'Rice', price: 12, updatedAt: '2026-02-01', lines: [{ qty: 2 }], code: 'R1' },
    ),
    {
      newValue: { code: 'R1', lines: [{ qty: 2 }], price: 12 },
      oldValue: { code: null, lines: [{ qty: 1 }], price: 10 },
    },
  );
});

void test('with one side only, that side is kept whole (create, delete, event payload)', () => {
  assert.deepEqual(auditDiff(undefined, { a: 1 }), { newValue: { a: 1 }, oldValue: undefined });
  assert.deepEqual(auditDiff({ a: 1 }, undefined), { newValue: undefined, oldValue: { a: 1 } });
  assert.deepEqual(auditDiff(undefined, new Date('2026-01-01T00:00:00Z')), {
    newValue: '2026-01-01T00:00:00.000Z',
    oldValue: undefined,
  });
});

void test('a value over 16 kB is cut and marked; smaller ones are untouched', () => {
  const small = { note: 'x'.repeat(100) };
  assert.equal(capAuditValue(small), small);

  const capped = capAuditValue({ note: 'x'.repeat(40_000) }) as Record<string, unknown>;
  assert.equal(capped._truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(capped)) <= AUDIT_VALUE_LIMIT_BYTES);
});

void test('the row takes who/where from the request; secrets never reach it', () => {
  const data = runWithRequestContext(
    {
      hospitalId: 'h-1',
      ip: '10.0.0.9',
      locationIds: ['h-1', 'h-2'],
      requestId: 'req-9',
      roles: ['Inventory Manager'],
      source: 'api',
      userId: 'u-1',
    },
    () =>
      auditRowData({
        action: 'UPDATE',
        entityId: 'e-1',
        entityName: 'users',
        newValue: { name: 'B', passwordHash: 'new-hash' },
        oldValue: { name: 'A', passwordHash: 'old-hash' },
      }),
  );

  assert.equal(data.requestId, 'req-9');
  assert.equal(data.userId, 'u-1');
  assert.equal(data.actorRole, 'Inventory Manager');
  assert.equal(data.hospitalId, 'h-1');
  assert.equal(data.ipAddress, '10.0.0.9');
  assert.equal(data.source, 'api');
  assert.deepEqual(data.newValue, { name: 'B' }); // the hash is scrubbed on both sides: no change
  assert.ok(!JSON.stringify(data).includes('new-hash'));
  assert.ok(!JSON.stringify(data).includes('old-hash'));
});

void test('a hospital the caller is not assigned to is not taken from the request', () => {
  const superAdmin = runWithRequestContext(
    { hospitalId: 'typed-by-hand', locationIds: null, requestId: 'r' },
    () => auditRowData({ action: 'CREATE', entityId: 'e', entityName: 'items' }),
  );
  assert.equal(superAdmin.hospitalId, undefined);

  const explicit = runWithRequestContext(
    { hospitalId: 'h-1', locationIds: ['h-1'], requestId: 'r' },
    () => auditRowData({ action: 'CREATE', entityId: 'e', entityName: 'items', hospitalId: null }),
  );
  assert.equal(explicit.hospitalId, null, 'an explicit null (a shared master) wins');
});

void test('outside a request the source is "system"', () => {
  assert.equal(auditRowData({ action: 'CREATE', entityId: 'e', entityName: 'x' }).source, 'system');
});

function fakeClient(failures: number) {
  const rows: unknown[] = [];
  let calls = 0;
  const client = {
    auditLog: {
      create: ({ data }: { data: unknown }) => {
        calls += 1;
        if (calls <= failures) return Promise.reject(new Error('database down'));
        rows.push(data);
        return Promise.resolve({ id: 'a' });
      },
    },
  };

  return { calls: () => calls, client: client as unknown as AuditClient, rows };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

void test('with tx the row is written by the transaction, and its failure is thrown', async () => {
  const base = fakeClient(0);
  const tx = fakeClient(1);
  const audit = new AuditService(base.client, [1, 1]);

  await assert.rejects(
    audit.record({ action: 'GRN_POST', entityId: 'g', entityName: 'grns' }, { tx: tx.client }),
    /database down/,
  );
  await audit.record({ action: 'GRN_POST', entityId: 'g', entityName: 'grns' }, { tx: tx.client });

  assert.equal(tx.rows.length, 1);
  assert.equal(base.calls(), 0);
});

void test('without tx the write is retried in the background and never throws', async () => {
  const flaky = fakeClient(2);
  await new AuditService(flaky.client, [1, 1]).record({
    action: 'CREATE',
    entityId: 'e',
    entityName: 'x',
  });
  await settle();
  assert.equal(flaky.rows.length, 1, 'third attempt saves');

  const error = mock.method(logger, 'error', () => {});
  const down = fakeClient(10);
  await new AuditService(down.client, [1, 1]).record({
    action: 'CREATE',
    entityId: 'e',
    entityName: 'x',
  });
  await settle();
  assert.equal(down.calls(), 3);
  assert.equal(error.mock.callCount(), 1);
  assert.equal(error.mock.calls[0]?.arguments[1], 'audit_write_failed');
});

void test('scrubbing marks a secret even when only one side is present', () => {
  const data = auditRowData({
    action: 'CREATE',
    entityId: 'e',
    entityName: 'pos_devices',
    newValue: { apiKey: 'k-123', name: 'Till 1' },
  });
  assert.deepEqual(data.newValue, { apiKey: REDACTED, name: 'Till 1' });
});
