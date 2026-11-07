import { afterEach, expect, test, vi } from 'vitest';
import { POST } from './route';

// The address in the request is what Next builds from the Host header, which the caller writes.
const upload = () =>
  new Request('http://evil.example/fandb/api/uploads/restaurant-images', {
    body: 'x',
    headers: { authorization: 'Bearer token', 'content-length': '1' },
    method: 'POST',
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('with no user service address configured, uploads are refused, never checked at the Host', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('USER_SERVICE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_USER_API_URL', '/fandb/api/v1');

  const response = await POST(upload());

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ message: 'Uploads are not configured.' });
  expect(fetch).not.toHaveBeenCalled();
});

test('the access check goes to the configured user service', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('USER_SERVICE_URL', 'http://fandb-user/fandb/api/v1/');

  expect((await POST(upload())).status).toBe(401);
  expect(fetch.mock.calls[0]?.[0]).toBe('http://fandb-user/fandb/api/v1/users/me/access');

  // Local dev: only the portal's absolute API address is set.
  vi.stubEnv('USER_SERVICE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_USER_API_URL', 'http://localhost:4002/api/v1');
  await POST(upload());
  expect(fetch.mock.calls[1]?.[0]).toBe('http://localhost:4002/api/v1/users/me/access');
});
