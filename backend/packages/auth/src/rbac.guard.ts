import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditLoggerService } from './audit-logger.service';
import { PERMISSIONS_KEY, ROLES_KEY } from './constants';
import { recordPermissionDenied, type DeniedRequest } from './permission-denied';
import type { JwtRequestUser } from './types';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly audit?: AuditLoggerService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<DeniedRequest & { user?: JwtRequestUser }>();
    const user = request.user;

    if (!user) {
      return false;
    }

    const hasRequiredRole =
      !requiredRoles?.length || requiredRoles.some((role) => user.roles.includes(role));
    const hasRequiredPermission =
      !requiredPermissions?.length ||
      requiredPermissions.some((permission) => user.permissions.includes(permission));

    if (hasRequiredRole && hasRequiredPermission) {
      return true;
    }

    recordPermissionDenied(this.audit, request, {
      permissions: requiredPermissions,
      reason: hasRequiredRole ? 'missing_permission' : 'missing_role',
      roles: requiredRoles,
    });
    return false;
  }
}
