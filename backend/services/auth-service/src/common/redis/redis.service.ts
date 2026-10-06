import { closeSharedRedis, getSharedRedis } from '@aahar/auth';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

// INCR and its expiry in one step, so a crash between them cannot leave a counter that never
// expires.
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Key-value store for OTPs, their cooldowns and attempt counters, and the refresh tokens.
 *
 * With REDIS_URL set it is Redis, shared by every auth-service instance, so a code sent through
 * one pod verifies on another and a restart signs nobody out. Without it, it is a Map in this
 * process - fine for development, but then a deploy signs everyone out and voids pending OTPs,
 * and more than one replica breaks sign-in, because each pod only knows its own keys.
 *
 * Every operation that decides something - consuming a code, claiming the resend slot,
 * counting a failed attempt - is a single atomic step, so concurrent requests on different
 * instances cannot both win.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client = getSharedRedis();

  // The in-process fallback. Entries carry their own expiry because a Map has no TTL; reads
  // drop what has expired, and a periodic sweep drops what nobody reads again.
  private readonly entries = new Map<string, { expiresAtMs: number; value: string }>();
  private readonly sweeper?: NodeJS.Timeout;

  constructor() {
    if (this.client) {
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      console.warn(
        JSON.stringify({
          event: 'redis_not_configured',
          message:
            'REDIS_URL is not set: OTPs and refresh tokens live in this process. Run a single replica; a restart signs everyone out.',
        }),
      );
    }

    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /**
   * Resolves true only for the caller that actually removed a live key, which is what lets an
   * OTP or a refresh token be consumed once even when two requests race on it.
   */
  async delete(key: string): Promise<boolean> {
    if (this.client) {
      return (await this.client.del(key)) > 0;
    }

    const entry = this.live(key);
    this.entries.delete(key);

    return Boolean(entry);
  }

  async get(key: string): Promise<string | null> {
    if (this.client) {
      return await this.client.get(key);
    }

    return this.live(key)?.value ?? null;
  }

  /** Adds one and returns the new count; the first increment starts the expiry window. */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.client) {
      return Number(await this.client.eval(INCREMENT_SCRIPT, 1, key, toMs(ttlSeconds)));
    }

    const entry = this.live(key);
    const count = Number(entry?.value ?? 0) + 1;
    this.entries.set(key, {
      expiresAtMs: entry?.expiresAtMs ?? Date.now() + toMs(ttlSeconds),
      value: String(count),
    });

    return count;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) {
      clearInterval(this.sweeper);
    }

    this.entries.clear();
    await closeSharedRedis();
  }

  /** Sets the key only if it is absent; resolves true when this call set it. */
  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.client) {
      return (await this.client.set(key, value, 'PX', toMs(ttlSeconds), 'NX')) === 'OK';
    }

    if (this.live(key)) {
      return false;
    }

    this.entries.set(key, { expiresAtMs: Date.now() + toMs(ttlSeconds), value });

    return true;
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client) {
      await this.client.set(key, value, 'PX', toMs(ttlSeconds));
      return;
    }

    this.entries.set(key, { expiresAtMs: Date.now() + toMs(ttlSeconds), value });
  }

  private live(key: string): { expiresAtMs: number; value: string } | undefined {
    const entry = this.entries.get(key);

    if (entry && entry.expiresAtMs <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
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

// Milliseconds, so sub-second TTLs (the self-check uses them) work in Redis too; at least 1.
function toMs(ttlSeconds: number): number {
  return Math.max(1, Math.round(ttlSeconds * 1000));
}
