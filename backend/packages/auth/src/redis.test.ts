import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import Redis from 'ioredis';
import {
  RedisThrottlerStorage,
  closeSharedRedis,
  createThrottlerStorage,
  getSharedRedis,
} from './redis';

// The Redis cases need a server: REDIS_URL=redis://localhost:6379 pnpm --filter @aahar/auth test
const withRedis = { skip: process.env.REDIS_URL ? false : 'REDIS_URL not set' };
const unique = (name: string) => `${name}-${process.pid}-${Date.now()}`;

after(async () => {
  await closeSharedRedis();
});

void test('without REDIS_URL the throttler keeps its built-in memory storage', () => {
  if (process.env.REDIS_URL) {
    return;
  }

  assert.equal(createThrottlerStorage(), undefined);
  assert.equal(getSharedRedis(), null);
});

void test('an unreachable Redis falls back to counting in memory instead of failing', async () => {
  const dead = new Redis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0 });
  const storage = new RedisThrottlerStorage(dead);
  const key = unique('fallback');

  const first = await storage.increment(key, 1000, 2, 1000, 'default');
  await storage.increment(key, 1000, 2, 1000, 'default');
  const third = await storage.increment(key, 1000, 2, 1000, 'default');

  assert.deepEqual([first.totalHits, first.isBlocked], [1, false]);
  assert.equal(third.isBlocked, true, 'the limit still applies per instance');
  dead.disconnect();
});

void test('limits, blocks and resets through Redis', withRedis, async () => {
  const redis = getSharedRedis();
  assert.ok(redis);
  await new Promise((resolve) =>
    redis.status === 'ready' ? resolve(null) : redis.once('ready', resolve),
  );
  const storage = new RedisThrottlerStorage(redis);
  const key = unique('limit');

  const hits = [];
  for (let i = 0; i < 3; i += 1) {
    hits.push(await storage.increment(key, 1000, 3, 1500, 'default'));
  }
  assert.deepEqual(
    hits.map((h) => [h.totalHits, h.isBlocked]),
    [
      [1, false],
      [2, false],
      [3, false],
    ],
  );
  assert.equal(hits[0]?.timeToExpire, 1, 'the window is reported in whole seconds');

  const over = await storage.increment(key, 1000, 3, 1500, 'default');
  assert.equal(over.isBlocked, true, 'the request over the limit is blocked');
  assert.equal(over.timeToBlockExpire, 2, 'Retry-After rounds the block up to whole seconds');
  assert.equal((await storage.increment(key, 1000, 3, 1500, 'default')).isBlocked, true);

  await sleep(1600);
  const afterBlock = await storage.increment(key, 1000, 3, 1500, 'default');
  assert.deepEqual([afterBlock.totalHits, afterBlock.isBlocked], [1, false], 'a fresh window');
});

void test('every instance shares one count', withRedis, async () => {
  const redis = getSharedRedis();
  assert.ok(redis);
  const podA = new RedisThrottlerStorage(redis);
  const podB = new RedisThrottlerStorage(redis);
  const key = unique('shared');

  await podA.increment(key, 5000, 3, 5000, 'default');
  await podB.increment(key, 5000, 3, 5000, 'default');
  await podA.increment(key, 5000, 3, 5000, 'default');
  assert.equal((await podB.increment(key, 5000, 3, 5000, 'default')).isBlocked, true);
});

void test('without a block duration the window decides', withRedis, async () => {
  const redis = getSharedRedis();
  assert.ok(redis);
  const storage = new RedisThrottlerStorage(redis);
  const key = unique('noblock');

  await storage.increment(key, 800, 2, 0, 'default');
  await storage.increment(key, 800, 2, 0, 'default');
  const over = await storage.increment(key, 800, 2, 0, 'default');
  assert.equal(over.isBlocked, true);
  assert.equal(over.timeToBlockExpire, 1);
  await sleep(900);
  assert.equal((await storage.increment(key, 800, 2, 0, 'default')).isBlocked, false);
});

void test('keys carry the aahar: prefix and a shared hash tag', withRedis, async () => {
  const redis = getSharedRedis();
  assert.ok(redis);
  const storage = new RedisThrottlerStorage(redis);
  const key = unique('prefix');
  await storage.increment(key, 5000, 1, 5000, 'default');
  await storage.increment(key, 5000, 1, 5000, 'default');

  const raw = new Redis(process.env.REDIS_URL as string);
  const found = await raw.keys(`*${key}*`);
  raw.disconnect();
  assert.deepEqual(found.sort(), [`aahar:throttle:{default:${key}}:block`]);
});
