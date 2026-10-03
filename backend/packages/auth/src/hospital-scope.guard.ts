import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './constants';
import type { JwtRequestUser } from './types';

interface ScopedRequest {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  user?: JwtRequestUser;
}

/**
 * Keeps a request inside the hospitals its caller is allowed to act in.
 *
 * Every hospital-scoped endpoint takes `hospitalId` from the query string or body. Until now
 * nothing checked it, so any authenticated user could read or write another location's data by
 * passing a different id. This guard rejects that, and narrows an unscoped list request to the
 * caller's own hospitals so a single-location user cannot see the whole platform by omitting the
 * filter.
 *
 * Super Admin carries LocationScope.ALL and is not constrained.
 */
@Injectable()
export class HospitalScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const allowed = request.user?.allowedHospitalIds;

    // No user means another guard already rejected it; null means unrestricted (Super Admin).
    if (!request.user || allowed === null || allowed === undefined) {
      return true;
    }

    if (allowed.length === 0) {
      throw new ForbiddenException('No location is assigned to this account');
    }

    const requested = [request.query?.hospitalId, request.body?.hospitalId].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    for (const hospitalId of requested) {
      if (!allowed.includes(hospitalId)) {
        throw new ForbiddenException('This location is outside your assigned access');
      }
    }

    return true;
  }
}
