import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessLogLevel, loggedPath, slowRequestMs } from './request-logging.middleware';

void test('logged paths drop the query string, which can carry the board token', () => {
  assert.equal(
    loggedPath({ originalUrl: '/fandb/api/v1/order-board/r1?token=secret' }),
    '/fandb/api/v1/order-board/r1',
  );
  assert.equal(loggedPath({ url: '/api/v1/users?search=98765' }), '/api/v1/users');
  assert.equal(loggedPath({ originalUrl: '/api/v1/health' }), '/api/v1/health');
  assert.equal(loggedPath({}), '');
});

void test('access log level: info below 400, warn for 4xx or slow, error for 5xx', () => {
  assert.equal(accessLogLevel(200, 120, 1000), 'info');
  assert.equal(accessLogLevel(304, 5, 1000), 'info');
  assert.equal(accessLogLevel(200, 1001, 1000), 'warn', 'slow');
  assert.equal(accessLogLevel(404, 3, 1000), 'warn');
  assert.equal(accessLogLevel(500, 3, 1000), 'error');
  assert.equal(accessLogLevel(503, 5000, 1000), 'error', 'a slow 5xx is still an error');
});

void test('SLOW_REQUEST_MS sets the slow threshold, 1000 ms by default', () => {
  assert.equal(slowRequestMs({}), 1000);
  assert.equal(slowRequestMs({ SLOW_REQUEST_MS: '250' }), 250);
  assert.equal(slowRequestMs({ SLOW_REQUEST_MS: 'nope' }), 1000);
});
