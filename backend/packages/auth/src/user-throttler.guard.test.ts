import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UserThrottlerGuard } from './user-throttler.guard';

// getTracker reads only the request, so the guard's own dependencies are not needed here.
const guard = Object.create(UserThrottlerGuard.prototype) as UserThrottlerGuard & {
  ipv6SubnetPrefix: number;
};
guard.ipv6SubnetPrefix = 56;
const tracker = (request: Record<string, unknown>) =>
  (guard as unknown as { getTracker(r: Record<string, unknown>): Promise<string> }).getTracker(
    request,
  );

void test('two signed-in users on one address are counted apart', async () => {
  assert.equal(await tracker({ ip: '203.0.113.7', user: { id: 'user-a' } }), 'user:user-a');
  assert.equal(await tracker({ ip: '203.0.113.7', user: { id: 'user-b' } }), 'user:user-b');
});

void test('a request without a signed-in user is counted by address', async () => {
  assert.equal(await tracker({ ip: '203.0.113.7' }), '203.0.113.7');
  assert.equal(await tracker({ ip: '203.0.113.7', user: { id: '' } }), '203.0.113.7');
});
