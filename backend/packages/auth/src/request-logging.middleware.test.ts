import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loggedPath } from './request-logging.middleware';

void test('logged paths drop the query string, which can carry the board token', () => {
  assert.equal(
    loggedPath({ originalUrl: '/fandb/api/v1/order-board/r1?token=secret' }),
    '/fandb/api/v1/order-board/r1',
  );
  assert.equal(loggedPath({ url: '/api/v1/users?search=98765' }), '/api/v1/users');
  assert.equal(loggedPath({ originalUrl: '/api/v1/health' }), '/api/v1/health');
  assert.equal(loggedPath({}), '');
});
