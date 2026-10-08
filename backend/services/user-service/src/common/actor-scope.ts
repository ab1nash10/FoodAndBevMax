import { ForbiddenException } from '@nestjs/common';
import type { JwtRequestUser, LocationScopeName } from '@aahar/auth';
import type { Prisma } from '@prisma/client';
import { SUPER_ADMIN_ROLE } from './super-admin';

/**
 * Keeps an actor inside their own reach when managing other users.
 *
 * `@Permissions('USER_UPDATE')` only proves the caller may manage users in general. Without these
 * checks an Admin could list and edit users at every hospital, assign themselves every hospital,
 * or grant permissions and location scope they do not hold themselves.
 *
 * Super Admin (LocationScope.ALL) is unrestricted, and the Super Admin rules in super-admin.ts
 * still apply on top of these.
 */

const SCOPE_RANK: Record<LocationScopeName, number> = { SINGLE: 0, MULTI: 1, ALL: 2 };

interface UserHospitals {
  assignedHospitals: Array<{ hospitalId: string }>;
  hospitalId: string | null;
}

function isSuperAdmin(actor: JwtRequestUser): boolean {
  return actor.roles.includes(SUPER_ADMIN_ROLE);
}

// Every caller is authenticated, so a missing actor means a wiring mistake: refuse, not allow.
function requireActor(actor: JwtRequestUser | undefined): JwtRequestUser {
  if (!actor) {
    throw new ForbiddenException('Access denied');
  }

  return actor;
}

export function hospitalIdsOf(user: UserHospitals): string[] {
  const ids = new Set(user.assignedHospitals.map(({ hospitalId }) => hospitalId));
  if (user.hospitalId) ids.add(user.hospitalId);

  return [...ids];
}

/** Users working at one of these hospitals: as their default location or an assigned one. */
export function usersWorkingAt(hospitalIds: string[]): Prisma.UserWhereInput {
  return {
    OR: [
      { hospitalId: { in: hospitalIds } },
      { assignedHospitals: { some: { deletedAt: null, hospitalId: { in: hospitalIds } } } },
    ],
  };
}

/** Users the actor may see: anyone working at one of the actor's hospitals. */
export function userReachWhere(actor: JwtRequestUser | undefined): Prisma.UserWhereInput {
  const allowed = requireActor(actor).allowedHospitalIds;

  return allowed === null ? {} : usersWorkingAt(allowed);
}

/**
 * Users the actor may change: every hospital the user works at must be one of the actor's, so
 * sharing one hospital is not enough to edit someone who also works elsewhere.
 */
export function assertUserWithinReach(user: UserHospitals, actor: JwtRequestUser | undefined) {
  const allowed = requireActor(actor).allowedHospitalIds;

  if (allowed === null) {
    return;
  }

  const ids = hospitalIdsOf(user);

  if (!ids.length || ids.some((id) => !allowed.includes(id))) {
    throw new ForbiddenException('This user works at a location outside your assigned access');
  }
}

export function assertHospitalsWithinReach(
  hospitalIds: string[],
  actor: JwtRequestUser | undefined,
) {
  const allowed = requireActor(actor).allowedHospitalIds;

  if (allowed !== null && hospitalIds.some((id) => !allowed.includes(id))) {
    throw new ForbiddenException('You can only assign locations within your own access');
  }
}

/** A role may only be granted by someone whose own location scope is at least as wide. */
export function assertCanGrantScope(
  role: { locationScope: LocationScopeName; name: string },
  actor: JwtRequestUser | undefined,
) {
  const current = requireActor(actor);

  if (SCOPE_RANK[role.locationScope] > SCOPE_RANK[current.locationScope]) {
    throw new ForbiddenException(`You cannot assign the ${role.name} role`);
  }
}

/** Nobody but a Super Admin may grant a permission they do not hold themselves. */
export function assertHoldsPermissions(codes: string[], actor: JwtRequestUser | undefined) {
  const current = requireActor(actor);

  if (isSuperAdmin(current)) {
    return;
  }

  const missing = codes.filter((code) => !current.permissions.includes(code));

  if (missing.length) {
    throw new ForbiddenException(
      `You cannot grant permissions you do not hold: ${missing.join(', ')}`,
    );
  }
}

/** Only a Super Admin may change their own role, locations, status or permissions. */
export function assertNotSelf(
  userId: string,
  actor: JwtRequestUser | undefined,
  what: string,
): void {
  const current = requireActor(actor);

  if (current.id === userId && !isSuperAdmin(current)) {
    throw new ForbiddenException(`You cannot change your own ${what}`);
  }
}

export function sameIds(left: string[], right: string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);

  return a.size === b.size && [...a].every((id) => b.has(id));
}
