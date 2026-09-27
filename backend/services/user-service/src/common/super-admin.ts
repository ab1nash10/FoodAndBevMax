import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * The seeded platform owner role. Its rights may only ever be changed by another Super Admin,
 * so that no lesser role can edit, delete, grant or revoke Super Admin access.
 */
export const SUPER_ADMIN_ROLE = 'Super Admin';

export function isSuperAdminRole(role: { name: string }): boolean {
  return role.name === SUPER_ADMIN_ROLE;
}

export function holdsSuperAdminRole(userRoles: Array<{ role: { name: string } }>): boolean {
  return userRoles.some(({ role }) => isSuperAdminRole(role));
}

export function assertSuperAdminActor(actorRoles: string[] | undefined): void {
  if (!actorRoles?.includes(SUPER_ADMIN_ROLE)) {
    throw new ForbiddenException('Only a Super Admin can change Super Admin access');
  }
}

/** The platform must never be left without a way in: the last Super Admin cannot be removed. */
export function assertSuperAdminRemains(remainingActiveSuperAdmins: number): void {
  if (remainingActiveSuperAdmins === 0) {
    throw new ConflictException('At least one active Super Admin must remain');
  }
}
