import { Inject, Injectable } from '@nestjs/common';
import { LocationScope, UserStatus, type PrismaClient } from '@prisma/client';
import type { LocationScopeName } from './types';

/**
 * Injection token for the host service's PrismaService. Every service already owns a
 * PrismaService extending PrismaClient, so each binds its own instance rather than this
 * package opening a second connection pool.
 */
export const AUTH_PRISMA = Symbol('AUTH_PRISMA');

export interface ResolvedAccess {
  allowedHospitalIds: string[] | null;
  locationScope: LocationScopeName;
  permissions: string[];
  roles: string[];
}

/** The widest scope any of the user's roles carries wins. */
function widestScope(scopes: LocationScope[]): LocationScopeName {
  if (scopes.includes(LocationScope.ALL)) return 'ALL';
  if (scopes.includes(LocationScope.MULTI)) return 'MULTI';

  return 'SINGLE';
}

const accessInclude = {
  assignedHospitals: {
    select: { hospitalId: true },
    where: { deletedAt: null },
  },
  permissionOverrides: {
    include: { permission: true },
    where: { deletedAt: null },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
            where: { deletedAt: null },
          },
        },
      },
    },
    // A deleted role keeps its user_roles rows, so filter on the role too, or its holders kept
    // its location scope and name after the delete.
    where: { deletedAt: null, role: { deletedAt: null } },
  },
} as const;

/**
 * Applies per-user overrides on top of the permissions inherited from roles. A revoking override
 * must win over an inherited grant, which is what makes a targeted revocation meaningful.
 */
export function mergePermissionCodes(
  inheritedCodes: string[],
  overrides: ReadonlyArray<{ code: string; granted: boolean }>,
): string[] {
  const permissions = new Set(inheritedCodes);

  overrides.forEach(({ code, granted }) => {
    if (granted) permissions.add(code);
    else permissions.delete(code);
  });

  return [...permissions];
}

/**
 * Resolves a user's current roles and permissions from the database.
 *
 * Access tokens also carry a permissions array, but it is frozen at issue time, so a revoked
 * right stayed usable for the remainder of the token's life. Reading the live values here means
 * a permission change, a role change, a disable or a delete takes effect on the next request.
 */
@Injectable()
export class AccessResolver {
  constructor(@Inject(AUTH_PRISMA) private readonly prisma: PrismaClient) {}

  // ponytail: one query per authenticated request. Redis is already in the stack — cache per
  // user and drop the key on any role/permission write if request volume makes this show up.
  async resolve(userId: string): Promise<ResolvedAccess | null> {
    const user = await this.prisma.user.findFirst({
      include: accessInclude,
      where: {
        deletedAt: null,
        id: userId,
        status: UserStatus.ACTIVE,
      },
    });

    if (!user) {
      return null;
    }

    const inheritedCodes = user.roles.flatMap((userRole) =>
      userRole.role.permissions
        .filter((rolePermission) => rolePermission.permission.deletedAt === null)
        .map((rolePermission) => rolePermission.permission.code),
    );
    const overrides = user.permissionOverrides
      .filter(({ permission }) => permission.deletedAt === null)
      .map(({ granted, permission }) => ({ code: permission.code, granted }));

    const locationScope = widestScope(user.roles.map((userRole) => userRole.role.locationScope));
    // A user's home hospital counts as an assignment so existing accounts keep working.
    const assigned = new Set(user.assignedHospitals.map(({ hospitalId }) => hospitalId));
    if (user.hospitalId) assigned.add(user.hospitalId);

    return {
      allowedHospitalIds: locationScope === 'ALL' ? null : [...assigned],
      locationScope,
      permissions: mergePermissionCodes(inheritedCodes, overrides),
      roles: user.roles.map((userRole) => userRole.role.name),
    };
  }
}
