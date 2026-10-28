import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loggedPath, shouldLogRequest } from './request-logging.middleware';

void test('logged paths drop the query string, which can carry the board token', () => {
  assert.equal(
    loggedPath({ originalUrl: '/fandb/api/v1/order-board/r1?token=secret' }),
    '/fandb/api/v1/order-board/r1',
  );
  assert.equal(loggedPath({ url: '/api/v1/users?search=98765' }), '/api/v1/users');
  assert.equal(loggedPath({ originalUrl: '/api/v1/health' }), '/api/v1/health');
  assert.equal(loggedPath({}), '');
});

void test('only failed or slow requests are logged: a line per request cost ~12% CPU under load', () => {
  assert.equal(shouldLogRequest(200, 120), false);
  assert.equal(shouldLogRequest(304, 5), false);
  assert.equal(shouldLogRequest(200, 500), true, 'slow');
  assert.equal(shouldLogRequest(404, 3), true, 'failed');
  assert.equal(shouldLogRequest(500, 3), true);
  assert.equal(shouldLogRequest(200, 3, true), true, 'while counting queries, every request');
});
