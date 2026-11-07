import { createApiClient } from '@aahar/api-client';
import { expect, test } from 'vitest';

const sent = async (path: string, tillKey: string | null, headers?: Record<string, string>) => {
  let seen: Headers | undefined;
  const client = createApiClient({
    baseUrl: 'http://api.test',
    fetcher: (_url, init) => {
      seen = new Headers(init?.headers);
      return Promise.resolve(new Response('{"data":null}', { status: 200 }));
    },
    getTillKey: () => tillKey,
  });
  await client.request(path, { headers });
  return seen?.get('X-Till-Key') ?? null;
};

test('POS requests carry the till key; nothing else does', async () => {
  expect(await sent('/pos/menu', 'till_k')).toBe('till_k');
  expect(await sent('/pos/orders', 'till_k')).toBe('till_k');
  expect(await sent('/items', 'till_k')).toBeNull();
  // No till on this browser, or not on a POS screen: nothing is sent.
  expect(await sent('/pos/menu', null)).toBeNull();
  // A key the call names itself wins.
  expect(await sent('/pos/whoami', 'till_k', { 'X-Till-Key': 'till_other' })).toBe('till_other');
});
