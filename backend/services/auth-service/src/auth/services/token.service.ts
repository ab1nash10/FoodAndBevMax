import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '@aahar/auth';
import { RedisService } from '../../common/redis/redis.service';
import type { AuthTokens, RefreshTokenPayload } from '../auth.types';

type JwtExpiresIn = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

interface TokenUser {
  email?: string | null;
  id: string;
  mobile?: string | null;
  permissions: string[];
  roles: string[];
}

@Injectable()
export class TokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async issueTokens(user: TokenUser): Promise<AuthTokens> {
    const refreshTokenId = randomUUID();
    const accessPayload: JwtPayload = {
      email: user.email,
      mobile: user.mobile,
      permissions: user.permissions,
      roles: user.roles,
      sub: user.id,
    };
    const refreshPayload: RefreshTokenPayload = {
      jti: refreshTokenId,
      sub: user.id,
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
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        algorithms: ['HS256'],
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const storedUserId = await this.redis.get(this.getRefreshTokenKey(payload.jti));

      if (storedUserId !== payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid refresh token');
    }
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
