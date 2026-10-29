import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADDRESS_THROTTLER, UserThrottlerGuard, addressThrottler } from './user-throttler.guard';

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

void test('signed-out sign-in requests are counted per identity, not per hospital address', async () => {
  const at = (body: Record<string, unknown>) => tracker({ body, ip: '203.0.113.7' });

  assert.equal(await at({ mobile: ' 9876543210 ', otp: '123456' }), 'mobile:9876543210');
  assert.equal(await at({ email: 'Ravi@Max.in', password: 'x' }), 'email:ravi@max.in');
  // Two people renewing from the same address are counted apart, by session.
  const first = await at({ refreshToken: 'token-one' });
  const second = await at({ refreshToken: 'token-two' });
  assert.match(first, /^session:[0-9a-f]{32}$/);
  assert.notEqual(first, second);
  assert.equal(await at({ refreshToken: 'token-one' }), first);
  // Nothing to key on: by address, as before.
  assert.equal(await at({}), '203.0.113.7');
});

void test('kiosks, order boards and order pushes are counted per restaurant or key, not per address', async () => {
  // Every kiosk and board behind one hospital network shares its public address.
  const at = (request: Record<string, unknown>) => tracker({ ip: '203.0.113.7', ...request });

  assert.equal(await at({ params: { restaurantId: 'cafe' } }), 'restaurant:cafe');
  assert.equal(await at({ params: { restaurantId: 'canteen' } }), 'restaurant:canteen');
  const push = await at({ headers: { 'x-order-key': 'rsk_one' } });
  assert.match(push, /^order-key:[0-9a-f]{32}$/);
  assert.notEqual(push, await at({ headers: { 'x-order-key': 'rsk_two' } }));
  // A signed-in user stays counted as themselves.
  assert.equal(await at({ params: { restaurantId: 'cafe' }, user: { id: 'u' } }), 'user:u');
});

void test('the address ceiling counts by address and skips signed-in requests', () => {
  const options = addressThrottler(3_000);
  const context = (request: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

  assert.equal(options.name, ADDRESS_THROTTLER);
  assert.equal(options.limit, 3_000);
  assert.equal(options.skipIf?.(context({ user: { id: 'user-a' } })), true);
  assert.equal(options.skipIf?.(context({})), false);
});
