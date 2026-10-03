import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, ROLES_KEY } from './constants';
import type { JwtRequestUser } from './types';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtRequestUser | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: JwtRequestUser }>();

    return request.user;
  },
);
