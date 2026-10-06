import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Redis is optional. With REDIS_URL set (redis://, or rediss:// for TLS such as ElastiCache with
 * in-transit encryption; a password or ACL user goes in the URL), OTPs, refresh tokens and rate
 * limits are shared by every instance and survive restarts. Without it each process keeps its
 * own in memory, which is only correct for a single replica.
 */
export function redisUrl(): string | undefined {
  return process.env.REDIS_URL?.trim() || undefined;
}

// One connection per process, shared by everything that uses Redis.
let shared: Redis | null | undefined;

export function getSharedRedis(): Redis | null {
  if (shared !== undefined) {
    return shared;
  }

  const url = redisUrl();

  if (!url) {
    shared = null;
    return shared;
  }

  const client = new Redis(url, {
    // A hung Redis fails the command rather than holding the request open.
    commandTimeout: 2000,
    connectTimeout: 5000,
    // Keeps AAHAR's keys apart when the Redis is shared with other applications.
    keyPrefix: 'aahar:',
    // During an outage a command fails after one reconnect attempt instead of queueing forever.
    maxRetriesPerRequest: 1,
  });

  // ioredis reports every failed reconnect; log the transitions, not each attempt. The message
  // never contains the URL, so no password reaches the log.
  let isDown = false;
  client.on('error', (error: Error) => {
    if (!isDown) {
      isDown = true;
      console.error(JSON.stringify({ event: 'redis_unavailable', message: error.message }));
    }
  });
  client.on('ready', () => {
    if (isDown) {
      isDown = false;
      console.info(JSON.stringify({ event: 'redis_reconnected' }));
    }
  });

  shared = client;
  return shared;
}

export async function closeSharedRedis(): Promise<void> {
  const client = shared;
  shared = undefined;

  if (client) {
    await client.quit().catch(() => client.disconnect());
  }
}

// Fixed window per key: the first hit starts a window of `ttl` ms; going over the limit sets a
// block key for `blockDuration` ms (or, with no block duration, until the window ends) and
// clears the count so the next window starts fresh, as the in-memory storage does. One script,
// so concurrent requests on different instances cannot race. Both keys share a hash tag, so it
// also runs on a clustered Redis.
const THROTTLE_SCRIPT = `
local ttl, limit, block = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local blockLeft = redis.call('PTTL', KEYS[2])
if blockLeft > 0 then
  return { limit + 1, blockLeft, 1, blockLeft }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end
local ttlLeft = redis.call('PTTL', KEYS[1])
if ttlLeft < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
  ttlLeft = ttl
end
if hits > limit then
  if block > 0 then
    redis.call('SET', KEYS[2], '1', 'PX', block)
    redis.call('DEL', KEYS[1])
    return { hits, ttlLeft, 1, block }
  end
  return { hits, ttlLeft, 1, ttlLeft }
end
return { hits, ttlLeft, 0, 0 }
`;

/**
 * Rate-limit counts shared through Redis, so a limit holds across every instance and restart.
 * A rate limiter must not take the API down with it: while Redis is unreachable each instance
 * falls back to counting in its own memory, as it did before Redis.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.redis.status === 'ready') {
      try {
        const tag = `throttle:{${throttlerName}:${key}}`;
        const [totalHits, ttlLeft, blocked, blockLeft] = (await this.redis.eval(
          THROTTLE_SCRIPT,
          2,
          tag,
          `${tag}:block`,
          ttl,
          limit,
          blockDuration,
        )) as [number, number, number, number];

        return {
          isBlocked: blocked === 1,
          timeToBlockExpire: Math.ceil(blockLeft / 1000),
          timeToExpire: Math.ceil(ttlLeft / 1000),
          totalHits,
        };
      } catch {
        // Fall through to the in-memory count; the client already logged the outage.
      }
    }

    return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
  }
}

/** The throttler storage to use: Redis when REDIS_URL is set, otherwise the built-in memory one. */
export function createThrottlerStorage(): ThrottlerStorage | undefined {
  const redis = getSharedRedis();

  return redis ? new RedisThrottlerStorage(redis) : undefined;
}
