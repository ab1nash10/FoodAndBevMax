import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@aahar/auth';
import { RedisService } from '../../common/redis/redis.service';
import type { AuthTokens, RefreshTokenPayload } from '../auth.types';

type JwtExpiresIn = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

// A replaced refresh token stays on record as spent for the rest of its life, so presenting it
// again is caught as reuse. Within this grace it is a portal tab that woke with the others and
// lost the race (the portal then takes the pair its sibling stored), not a stolen copy.
const REUSE_GRACE_MS = 60_000;
const SPENT_PREFIX = 'spent:';

/** A refresh token presented again after it was replaced: someone else may hold a copy. */
export class RefreshTokenReusedError extends UnauthorizedException {
  constructor(readonly userId: string) {
    super('Invalid refresh token');
  }
}

interface TokenUser {
  email?: string | null;
  id: string;
  mobile?: string | null;
  name: string;
  permissions: string[];
  roles: string[];
  sessionVersion: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  /** `authTime` is when the user signed in; omitted, this is a new sign-in. */
  async issueTokens(user: TokenUser, authTime?: number): Promise<AuthTokens> {
    const refreshTokenId = randomUUID();
    const accessPayload: JwtPayload = {
      email: user.email,
      mobile: user.mobile,
      name: user.name,
      permissions: user.permissions,
      roles: user.roles,
      sub: user.id,
      sv: user.sessionVersion,
    };
    const refreshPayload: RefreshTokenPayload = {
      authTime: authTime ?? Math.floor(Date.now() / 1000),
      jti: refreshTokenId,
      sub: user.id,
      sv: user.sessionVersion,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload),
      this.jwt.signAsync(refreshPayload, {
        expiresIn: this.getRefreshTokenTtl() as JwtExpiresIn,
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }),
    ]);

    await this.redis.setWithExpiry(
      this.getRefreshTokenKey(refreshTokenId),
      user.id,
      this.getRefreshTokenTtlSeconds(),
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    const payload = await this.jwt
      .verifyAsync<RefreshTokenPayload>(refreshToken, {
        algorithms: ['HS256'],
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      })
      .catch(() => {
        throw new UnauthorizedException('Invalid refresh token');
      });

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Not caught: during a Redis outage this is a 503, which the portal rides out. Calling it
    // an invalid token signed every user out whenever Redis blinked.
    const storedUserId = await this.redis.get(this.getRefreshTokenKey(payload.jti));

    if (
      storedUserId?.startsWith(SPENT_PREFIX) &&
      Date.now() - Number(storedUserId.slice(SPENT_PREFIX.length)) >= REUSE_GRACE_MS
    ) {
      throw new RefreshTokenReusedError(payload.sub);
    }

    if (storedUserId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return payload;
  }

  /** Marks a token replaced by refresh as spent, for as long as it would have lived. */
  async spendRefreshToken(payload: RefreshTokenPayload): Promise<void> {
    await this.redis.setWithExpiry(
      this.getRefreshTokenKey(payload.jti),
      `${SPENT_PREFIX}${Date.now()}`,
      payload.exp ? payload.exp - Date.now() / 1000 : this.getRefreshTokenTtlSeconds(),
    );
  }

  /** Resolves true only if this call revoked a still-live token. */
  revokeRefreshToken(refreshTokenId: string): Promise<boolean> {
    return this.redis.delete(this.getRefreshTokenKey(refreshTokenId));
  }

  private getRefreshTokenKey(refreshTokenId: string): string {
    return `auth:refresh:${refreshTokenId}`;
  }

  private getRefreshTokenTtl(): string {
    return this.config.get<string>('JWT_REFRESH_TOKEN_TTL') ?? '7d';
  }

  private getRefreshTokenTtlSeconds(): number {
    const ttl = this.getRefreshTokenTtl();
    const match = /^(?<value>\d+)(?<unit>ms|s|m|h|d|w|y)$/.exec(ttl);

    if (!match?.groups) {
      return 7 * 24 * 60 * 60;
    }

    const multipliers: Record<string, number> = {
      d: 24 * 60 * 60,
      h: 60 * 60,
      m: 60,
      ms: 1 / 1000,
      s: 1,
      w: 7 * 24 * 60 * 60,
      y: 365 * 24 * 60 * 60,
    };
    const value = Number(match.groups.value);
    const unit = match.groups.unit as keyof typeof multipliers;

    const multiplier = multipliers[unit] ?? 7 * 24 * 60 * 60;

    return Math.max(1, Math.floor(value * multiplier));
  }
}
