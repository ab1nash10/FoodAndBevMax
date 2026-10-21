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
const ACTIVITY_WRITE_INTERVAL_MS = 60_000;

/** How long a user's resolved access is reused (see AccessResolver.resolve). */
export const ACCESS_CACHE_MS = 5_000;
/** Users kept in the cache per process; the least recently looked up go first. */
const ACCESS_CACHE_MAX = 10_000;

/** How long after a user's last activity an admin must wait to change their credentials. */
export const CREDENTIAL_LOCK_MS = 8 * 60 * 60 * 1000;

/** Until when an admin cannot change this user's password, email or mobile; null if they can. */
export function credentialsLockedUntil(lastActiveAt: Date | null, now = Date.now()): Date | null {
  const until = lastActiveAt ? lastActiveAt.getTime() + CREDENTIAL_LOCK_MS : 0;

  return until > now ? new Date(until) : null;
}

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
 * a permission change, a role change, a disable, a delete or a sign-out takes effect on the next
 * request in the service that made it (ForgetAccessOnWriteInterceptor), and within
 * ACCESS_CACHE_MS everywhere else.
 */
@Injectable()
export class AccessResolver {
  constructor(@Inject(AUTH_PRISMA) private readonly prisma: PrismaClient) {}

  private readonly activityWrittenAt = new Map<string, number>();

  /**
   * Notes that the user is signed in and using the portal (users.last_active_at), at most once
   * a minute per process. Fire and forget: a failed write never fails the request. Raw SQL so
   * updated_at, which the user lists sort by, does not move on every request.
   */
  recordActivity(userId: string, now = Date.now()): void {
    const lastWrite = this.activityWrittenAt.get(userId);

    if (lastWrite !== undefined && now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) {
      return;
    }

    this.activityWrittenAt.set(userId, now);
    this.prisma
      .$executeRaw`UPDATE users SET last_active_at = now() WHERE id = ${userId}::uuid`.catch(() =>
      this.activityWrittenAt.delete(userId),
    );
  }

  private readonly cache = new Map<
    string,
    { access: Promise<ResolvedAccess | null>; at: number }
  >();

  /**
   * The user's access, looked up at most once per ACCESS_CACHE_MS per process. A page sends its
   * requests together (10-18 of them), so they now share one lookup instead of each running the
   * query; concurrent requests share the one in flight. A write in this process that changes
   * access calls forget() at once; one made in another service shows here within the window.
   */
  resolve(userId: string): Promise<ResolvedAccess | null> {
    const now = Date.now();
    const hit = this.cache.get(userId);

    if (hit && now - hit.at < ACCESS_CACHE_MS) {
      return hit.access;
    }

    const access = this.load(userId);

    // Re-inserted so the map stays in least-recently-looked-up order for the size cap.
    this.cache.delete(userId);
    this.cache.set(userId, { access, at: now });
    if (this.cache.size > ACCESS_CACHE_MAX) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    access.catch(() => this.cache.delete(userId));

    return access;
  }

  /** Drops cached access: one user's, or everyone's after a change that may touch many. */
  forget(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  private async load(userId: string): Promise<ResolvedAccess | null> {
    // One round trip instead of one per relation (eight with Prisma's include). Only live rows
    // count: the link, the role, the role's grant and the permission must all be undeleted, and
    // the role active (making a role inactive revokes it from everyone who holds it).
    const [user] = await this.prisma.$queryRaw<AccessRow[]>`
      SELECT
        u.session_version AS "sessionVersion",
        u.hospital_id::text AS "hospitalId",
        COALESCE((
          SELECT json_agg(json_build_object('name', r.name, 'locationScope', r.location_scope::text))
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id AND ur.deleted_at IS NULL AND r.deleted_at IS NULL
            AND r.status = 'ACTIVE'
        ), '[]'::json) AS "roles",
        COALESCE((
          SELECT json_agg(p.code)
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE ur.user_id = u.id AND ur.deleted_at IS NULL AND r.deleted_at IS NULL
            AND r.status = 'ACTIVE'
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
