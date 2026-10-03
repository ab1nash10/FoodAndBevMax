import type { JwtRequestUser } from '@aahar/auth';

export interface RequestContextLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

export function getActorId(user?: JwtRequestUser): string | undefined {
  return user?.id;
}

export function getActorRoles(user?: JwtRequestUser): string[] | undefined {
  return user?.roles;
}

// `request.ip` already honours the one proxy hop trusted in configureSecurityBaseline. Reading
// X-Forwarded-For here directly took its first entry, which the client writes, so audit logs
// recorded whatever address the caller chose.
export function getIpAddress(request: RequestContextLike): string | undefined {
  return request.ip;
}
