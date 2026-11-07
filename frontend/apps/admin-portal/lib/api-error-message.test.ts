import { createApiClient } from '@aahar/api-client';
import { expect, test } from 'vitest';

const failWith = (status: number, message: string) =>
  createApiClient({
    baseUrl: 'http://api.test',
    fetcher: () =>
      Promise.resolve(
        new Response(JSON.stringify({ message, success: false }), {
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-1' },
          status,
        }),
      ),
  });

const errorOf = async (status: number, message: string) =>
  (await failWith(status, message)
    .request('/x')
    .catch((error: unknown) => error)) as Error;

test('a service that says it cannot do something now is shown in its own words', async () => {
  expect((await errorOf(503, 'Could not send the OTP. Please try again.')).message).toBe(
    'Could not send the OTP. Please try again. Request ID: req-1',
  );
});

test('a crash still shows the generic text, not what the server said', async () => {
  expect((await errorOf(500, 'Internal server error')).message).toBe(
    'Something went wrong. Please try again. If the issue continues, contact support. Request ID: req-1',
  );
});
