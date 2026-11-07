import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuditApi } from './audit';

/** Records each request's URL and auth header, answering with `body`. */
function backend(body: string, contentType = 'application/json') {
  const calls: Array<{ auth: string | null; url: string }> = [];
  // The client always passes the URL as a string.
  const fetcher = ((url: string, init?: RequestInit) => {
    calls.push({ auth: new Headers(init?.headers).get('Authorization'), url });
    return Promise.resolve(new Response(body, { headers: { 'Content-Type': contentType } }));
  }) as typeof fetch;

  return {
    api: createAuditApi({ baseUrl: 'http://api/', fetcher, getAccessToken: () => 't0k' }),
    calls,
  };
}

const page = JSON.stringify({ data: { items: [], nextCursor: 'c2' }, success: true });

void test('the list sends only the filters that are set, signed in', async () => {
  const { api, calls } = backend(page);

  const response = await api.listAuditLogs({
    action: '',
    cursor: 'c1',
    entityName: 'grns',
    limit: 50,
  });

  assert.equal(response.data.nextCursor, 'c2');
  assert.equal(calls[0]?.url, 'http://api/audit-logs?cursor=c1&entityName=grns&limit=50');
  assert.equal(calls[0]?.auth, 'Bearer t0k');
});

void test("a record's history is under its entity name and id, escaped", async () => {
  const { api, calls } = backend(page);

  await api.getRecordHistory('grns', 'a/b', { cursor: 'c1' });

  assert.equal(calls[0]?.url, 'http://api/audit-logs/grns/a%2Fb?cursor=c1');
});

void test('the export comes back as the CSV text', async () => {
  const { api, calls } = backend('Time,Action\r\n1,GRN_POST', 'text/csv');

  assert.equal(await api.exportAuditLogs({ q: 'rice' }), 'Time,Action\r\n1,GRN_POST');
  assert.equal(calls[0]?.url, 'http://api/audit-logs/export?q=rice');
});
