import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { logger, type AuditService } from '@aahar/logging';
import { recordPermissionDenied, shouldSaveDenial } from './permission-denied';

void test('a denial is saved once a minute per user and route, but logged every time', () => {
  const warn = mock.method(logger, 'warn', () => {});
  const record = mock.fn(() => Promise.resolve());
  const audit = { record } as unknown as AuditService;
  const request = { method: 'POST', route: { path: '/api/v1/grns' }, user: { id: 'u-denied' } };

  for (let i = 0; i < 3; i += 1) {
    recordPermissionDenied(audit, request, {
      permissions: ['GRN_CREATE'],
      reason: 'missing_permission',
    });
  }
  recordPermissionDenied(
    audit,
    { ...request, route: { path: '/api/v1/items' } },
    { reason: 'missing_permission' },
  );

  assert.equal(warn.mock.callCount(), 4);
  assert.equal(record.mock.callCount(), 2, 'one row for each route');
  mock.restoreAll();
});

void test('the minute window reopens after sixty seconds', () => {
  assert.equal(shouldSaveDenial('k', 0), true);
  assert.equal(shouldSaveDenial('k', 59_999), false);
  assert.equal(shouldSaveDenial('k', 60_000), true);
});
