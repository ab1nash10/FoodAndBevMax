import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessResolver } from './access-resolver';
import type { JwtPayload, JwtRequestUser } from './types';

interface AuthorizationHeaderRequest {
  headers?: Record<string, string | string[] | undefined>;
}

function extractBearerToken(request: AuthorizationHeaderRequest): string | null {
  const headerValue = request.headers?.authorization ?? request.headers?.Authorization;
  const authorization = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!authorization) {
    return null;
  }

  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token || extraParts.length > 0) {
    return null;
  }

  return token;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly access: AccessResolver,
  ) {
    super({
      algorithms: ['HS256'],
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromExtractors([extractBearerToken]),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtRequestUser> {
    // Refresh tokens are signed with their own secret, but if the two secrets were ever set to
    // the same value a refresh token would verify here; its type claim is what tells them apart.
    if (!payload.sub || payload.type === 'refresh') {
      throw new UnauthorizedException('Invalid JWT payload');
    }

    // Authority is the database, not the token's frozen claims, so a revoked right stops
    // working on the next request instead of surviving until the token expires.
    const access = await this.access.resolve(payload.sub);

    if (!access) {
      throw new UnauthorizedException('User is not registered or active');
    }

    return {
      allowedHospitalIds: access.allowedHospitalIds,
      email: payload.email,
      id: payload.sub,
      locationScope: access.locationScope,
      mobile: payload.mobile,
      permissions: access.permissions,
      roles: access.roles,
    };
  }
}
