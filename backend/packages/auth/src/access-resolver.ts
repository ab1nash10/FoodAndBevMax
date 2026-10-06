import { Inject, Injectable } from '@nestjs/common';
import { LocationScope, type PrismaClient } from '@prisma/client';
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
  sessionVersion: number;
}

/**
 * True while a token still belongs to the user's current session. Tokens issued before session
 * versions existed carry none, which counts as 0, so they stay valid until the first bump.
 */
export function isSessionCurrent(tokenVersion: number | undefined, userVersion: number): boolean {
  return (tokenVersion ?? 0) === userVersion;
}

/** The widest scope any of the user's roles carries wins. */
function widestScope(scopes: LocationScope[]): LocationScopeName {
  if (scopes.includes(LocationScope.ALL)) return 'ALL';
  if (scopes.includes(LocationScope.MULTI)) return 'MULTI';

  return 'SINGLE';
}

/** One row of the access query in AccessResolver.resolve. */
interface AccessRow {
  assignedHospitalIds: string[];
  hospitalId: string | null;
  inheritedCodes: string[];
  overrides: { code: string; granted: boolean }[];
  // A deleted role keeps its user_roles rows, so the query filters on the role too, or its
  // holders kept its location scope and name after the delete.
  roles: { locationScope: LocationScope; name: string }[];
  sessionVersion: number;
}

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
    // One round trip instead of one per relation (eight with Prisma's include). Only live rows
    // count: the link, the role, the role's grant and the permission must all be undeleted.
    const [user] = await this.prisma.$queryRaw<AccessRow[]>`
      SELECT
        u.session_version AS "sessionVersion",
        u.hospital_id::text AS "hospitalId",
        COALESCE((
          SELECT json_agg(json_build_object('name', r.name, 'locationScope', r.location_scope::text))
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND ur.deleted_at IS NULL AND r.deleted_at IS NULL
        ), '[]'::json) AS "roles",
        COALESCE((
          SELECT json_agg(p.code)
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = u.id AND ur.deleted_at IS NULL AND r.deleted_at IS NULL
            AND rp.deleted_at IS NULL AND p.deleted_at IS NULL
        ), '[]'::json) AS "inheritedCodes",
        COALESCE((
          SELECT json_agg(json_build_object('code', p.code, 'granted', up.granted))
          FROM user_permissions up
          JOIN permissions p ON p.id = up.permission_id
          WHERE up.user_id = u.id AND up.deleted_at IS NULL AND p.deleted_at IS NULL
        ), '[]'::json) AS "overrides",
        COALESCE((
          SELECT json_agg(uh.hospital_id::text)
          FROM user_hospitals uh
          WHERE uh.user_id = u.id AND uh.deleted_at IS NULL
        ), '[]'::json) AS "assignedHospitalIds"
      FROM users u
      WHERE u.id = ${userId}::uuid AND u.deleted_at IS NULL AND u.status = 'ACTIVE'
    `;

    if (!user) {
      return null;
    }

    const locationScope = widestScope(user.roles.map((role) => role.locationScope));
    // A user's home hospital counts as an assignment so existing accounts keep working.
    const assigned = new Set(user.assignedHospitalIds);
    if (user.hospitalId) assigned.add(user.hospitalId);

    return {
      allowedHospitalIds: locationScope === 'ALL' ? null : [...assigned],
      locationScope,
      permissions: mergePermissionCodes(user.inheritedCodes, user.overrides),
      roles: user.roles.map((role) => role.name),
      sessionVersion: user.sessionVersion,
    };
  }
}
