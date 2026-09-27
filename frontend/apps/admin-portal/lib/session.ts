export interface SessionUser {
  email: string | null;
  hospitalId: string | null;
  id: string;
  mobile: string | null;
  permissions: string[];
  roles: string[];
}

interface JwtSessionPayload {
  email?: string | null;
  exp?: number;
  hospital_id?: string | null;
  hospitalId?: string | null;
  mobile?: string | null;
  permissions?: unknown;
  roles?: unknown;
  sub?: string;
}

function decodeBase64Url(value: string): string {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddedValue = normalizedValue.padEnd(
    normalizedValue.length + ((4 - (normalizedValue.length % 4)) % 4),
    '=',
  );

  return window.atob(paddedValue);
}

export function decodeJwtPayload(token: string): JwtSessionPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const [, payload] = token.split('.');

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload)) as JwtSessionPayload;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function getAccessTokenSecondsRemaining(token: string): number | null {
  const payload = decodeJwtPayload(token);

  if (!payload?.exp) {
    return null;
  }

  return payload.exp - Math.floor(Date.now() / 1000);
}

export function isAccessTokenExpired(token: string, skewSeconds = 30): boolean {
  const secondsRemaining = getAccessTokenSecondsRemaining(token);

  return secondsRemaining !== null && secondsRemaining <= skewSeconds;
}

export function sessionUserFromAccessToken(token: string): SessionUser | null {
  const payload = decodeJwtPayload(token);

  if (!payload?.sub) {
    return null;
  }

  return {
    email: payload.email ?? null,
    hospitalId: payload.hospitalId ?? payload.hospital_id ?? null,
    id: payload.sub,
    mobile: payload.mobile ?? null,
    permissions: stringArray(payload.permissions),
    roles: stringArray(payload.roles),
  };
}
