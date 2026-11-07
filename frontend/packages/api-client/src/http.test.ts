import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClientError, createApiClient } from './http';

/** A fetcher that answers with the given statuses in turn (0 = the connection drops). */
function backend(...statuses: number[]) {
  const calls: string[] = [];
  const fetcher = (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init?.method ?? 'GET');
    const status = statuses[Math.min(calls.length, statuses.length) - 1] ?? 200;

    if (status === 0) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }

    return Promise.resolve(
      new Response(JSON.stringify(status === 200 ? { ok: true } : { message: 'Down' }), {
        headers: { 'Content-Type': 'application/json' },
        status,
      }),
    );
  };

  return { calls, client: createApiClient({ baseUrl: 'http://api', fetcher }) };
}

void test('a read rides out a restart: 503 or a dropped connection is retried', async () => {
  const { calls, client } = backend(503, 0, 200);

  assert.deepEqual(await client.request('/items'), { ok: true });
  assert.equal(calls.length, 3);
});

void test('a read that keeps failing gives up after three tries with the error', async () => {
  const { calls, client } = backend(502, 502, 502, 200);

  await assert.rejects(
    client.request('/items'),
    (error: unknown) => error instanceof ApiClientError && error.status === 502,
  );
  assert.equal(calls.length, 3);
});

void test('a write is never retried: a second POST could place an order twice', async () => {
  const { calls, client } = backend(503, 200);

  await assert.rejects(client.request('/orders', { body: {}, method: 'POST' }), ApiClientError);
  assert.deepEqual(calls, ['POST']);
});

void test('other errors are not retried', async () => {
  const { calls, client } = backend(500, 200);

  await assert.rejects(client.request('/items'), ApiClientError);
  assert.equal(calls.length, 1);
});
