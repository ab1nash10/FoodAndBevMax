import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TokenService } from '../../auth/services/token.service';
import { RedisService } from './redis.service';

// Before the imports run: nothing listens on port 1, so every Redis command fails as it does
// during an outage.
vi.hoisted(() => {
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
});

describe('while Redis is unreachable', { timeout: 15_000 }, () => {
  const store = new RedisService();
  afterAll(() => store.onModuleDestroy());

  it('says sign-in is briefly unavailable (503), not a server error', async () => {
    const failure = store.get('any');
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(failure).rejects.toThrow(
      'Sign-in is briefly unavailable. Please try again in a minute.',
    );
  });

  it('a refresh is not called an invalid token, so the portal keeps the user signed in', async () => {
    const secret = 'refresh-secret-for-the-outage-test-0123456789';
    const jwt = new JwtService();
    const refreshToken = await jwt.signAsync(
      { jti: 'token-1', sub: 'user-1', type: 'refresh' },
      { algorithm: 'HS256', expiresIn: 60, secret },
    );
    const tokens = new TokenService(new ConfigService({ JWT_REFRESH_SECRET: secret }), jwt, store);

    await expect(tokens.verifyRefreshToken(refreshToken)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
