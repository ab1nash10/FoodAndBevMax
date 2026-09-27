import { Injectable, OnModuleDestroy } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import Redis from 'ioredis';

/**
 * Key-value store for OTPs and the refresh-token denylist.
 *
 * Redis is commented out for now and this keeps the same three methods in process, so
 * nothing that uses it had to change. To put Redis back: restore the two imports above and
 * the commented members below, delete the in-memory ones, and restore REDIS_URL in
 * backend/packages/config (it is commented out there too) and in the Helm chart.
 *
 * ponytail: a Map per process. Two consequences while this is in place -
 *   * everything is lost on restart, so a deploy signs everyone out and voids pending OTPs;
 *   * nothing is shared between pods, so with more than one replica a refresh or an OTP
 *     verify that lands on a different pod than the one that issued it will fail.
 * Single replica is therefore required until Redis returns.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  // private readonly client: Redis;

  // Entries carry their own expiry because a Map has no TTL; reads drop what has expired.
  private readonly entries = new Map<string, { expiresAtMs: number; value: string }>();
  private readonly sweeper: NodeJS.Timeout;

  // constructor(config: ConfigService) {
  //   this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
  //     connectTimeout: 1000,
  //     enableOfflineQueue: false,
  //     maxRetriesPerRequest: 1,
  //   });
  //   this.client.on('error', () => undefined);
  // }
  constructor() {
    // Expired keys are dropped on read, but a key nobody reads again would sit there for
    // the life of the process, so sweep periodically as well.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  // These stay Promise-returning so every caller is unchanged, but there is nothing to
  // await in process, so they are not `async`.
  //
  // Resolves true only for the caller that actually removed a live key, which is what lets an
  // OTP or a refresh token be consumed once even when two requests race on it. Redis `DEL`
  // returns the same signal as a count.
  delete(key: string): Promise<boolean> {
    // return (await this.client.del(key)) > 0;
    const entry = this.entries.get(key);
    this.entries.delete(key);

    return Promise.resolve(Boolean(entry && entry.expiresAtMs > Date.now()));
  }

  get(key: string): Promise<string | null> {
    // return this.client.get(key);
    const entry = this.entries.get(key);

    if (!entry) {
      return Promise.resolve(null);
    }

    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);

      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value);
  }

  onModuleDestroy(): void {
    // this.client.disconnect();
    clearInterval(this.sweeper);
    this.entries.clear();
  }

  setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    // await this.client.set(key, value, 'EX', ttlSeconds);
    this.entries.set(key, { expiresAtMs: Date.now() + ttlSeconds * 1000, value });

    return Promise.resolve();
  }

  private sweep(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAtMs <= now) {
        this.entries.delete(key);
      }
    }
  }
}
