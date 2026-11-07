import { strict as assert } from 'node:assert';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, test, vi } from 'vitest';
import type { RedisService } from '../../common/redis/redis.service';
import type { RefreshTokenPayload } from '../auth.types';
import { RefreshTokenReusedError, TokenService } from './token.service';

afterEach(() => {
  vi.useRealTimers();
});

const user = {
  id: 'user-1',
  name: 'Asha',
  permissions: [],
  roles: [],
  sessionVersion: 3,
};

function tokenService() {
  const entries = new Map<string, { expiresAt: number; value: string }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt <= Date.now()) entries.delete(key);
    return entries.get(key);
  };
  const redis = {
    delete: (key: string) => Promise.resolve(live(key) ? entries.delete(key) : false),
    get: (key: string) => Promise.resolve(live(key)?.value ?? null),
    setWithExpiry: (key: string, value: string, ttlSeconds: number) => {
      entries.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return Promise.resolve();
    },
  };
  const config = new ConfigService({
    JWT_REFRESH_SECRET: 'refresh-secret-for-this-test-0123456789',
  });

  return new TokenService(
    config,
    new JwtService({ secret: 'access-secret-for-this-test-0123456789' }),
    redis as unknown as RedisService,
  );
}

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as RefreshTokenPayload;

test('a spent refresh token presented after a minute is reuse; within the minute it is only refused', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const tokens = tokenService();
  const { refreshToken } = await tokens.issueTokens(user);
  const payload = await tokens.verifyRefreshToken(refreshToken);

  await tokens.spendRefreshToken(payload);

  // Tabs waking together all refresh with the same token: a late one is refused, not punished.
  vi.advanceTimersByTime(59_000);
  await assert.rejects(
    tokens.verifyRefreshToken(refreshToken),
    (error: unknown) =>
      error instanceof UnauthorizedException && !(error instanceof RefreshTokenReusedError),
  );

  vi.advanceTimersByTime(2_000);
  await assert.rejects(
    tokens.verifyRefreshToken(refreshToken),
    (error: unknown) =>
      error instanceof RefreshTokenReusedError &&
      error.userId === 'user-1' &&
      error.message === 'Invalid refresh token',
  );
});

test('a revoked (signed out) token is refused without being called reuse', async () => {
  const tokens = tokenService();
  const { refreshToken } = await tokens.issueTokens(user);
  const payload = await tokens.verifyRefreshToken(refreshToken);

  await tokens.revokeRefreshToken(payload.jti);

  await assert.rejects(
    tokens.verifyRefreshToken(refreshToken),
    (error: unknown) =>
      error instanceof UnauthorizedException && !(error instanceof RefreshTokenReusedError),
  );
});

test('the sign-in time rides along on every refreshed token', async () => {
  const tokens = tokenService();
  const before = Math.floor(Date.now() / 1000);

  const first = claimsOf((await tokens.issueTokens(user)).refreshToken);
  assert.ok((first.authTime ?? 0) >= before, 'a new sign-in starts the clock');

  const refreshed = claimsOf((await tokens.issueTokens(user, 1_700_000_000)).refreshToken);
  assert.equal(refreshed.authTime, 1_700_000_000);
});
