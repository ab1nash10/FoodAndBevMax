import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { logger, setRequestContext } from '@aahar/logging';
import type { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from './constants';
import type { JwtRequestUser } from './types';
import { loggedPath } from './request-logging.middleware';

interface AuthorizationHeaderRequest {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // The route template, for every log line and audit row of this request.
    const request = context.switchToHttp().getRequest<{ route?: { path?: string } }>();
    setRequestContext({ route: request.route?.path });

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false | null | undefined,
    info: Error | string | undefined,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      this.logJwtValidationFailure(context, err, info);
      throw err ?? new UnauthorizedException('Unauthorized');
    }

    const signedIn = user as Partial<JwtRequestUser>;
    setRequestContext({
      locationIds: signedIn.allowedHospitalIds,
      roles: signedIn.roles,
      userId: signedIn.id,
    });

    return user;
  }

  private logJwtValidationFailure(
    context: ExecutionContext,
    err: Error | null,
    info: Error | string | undefined,
  ): void {
    if (this.config.get<string>('NODE_ENV') !== 'development') {
      return;
    }

    const request = context.switchToHttp().getRequest<AuthorizationHeaderRequest>();
    const headerValue = request.headers?.authorization ?? request.headers?.Authorization;
    const authorization = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const parts = authorization?.trim().split(/\s+/) ?? [];
    const scheme = parts[0];
    const token = parts.length === 2 && scheme?.toLowerCase() === 'bearer' ? parts[1] : undefined;
    const infoError = info instanceof Error ? info : undefined;

    logger.warn(
      {
        errorMessage: err?.message,
        errorName: err?.name,
        hasAuthorizationHeader: Boolean(authorization),
        infoMessage: infoError?.message ?? (typeof info === 'string' ? info : undefined),
        infoName: infoError?.name,
        method: request.method,
        path: loggedPath(request),
        scheme,
        tokenLength: token?.length,
      },
      'jwt_validation_failed',
    );
  }
}
