/**
 * Keys whose values never reach a log line or an audit row, matched without regard to case.
 * The logger redacts them at the top level and one level down (pino paths); `scrubSecrets`
 * removes them at any depth before a value is saved.
 */
export const SECRET_KEYS = [
  'accessToken',
  'apiKey',
  'apiSecret',
  'authorization',
  'boardToken',
  'clientSecret',
  'cookie',
  'databaseUrl',
  'DATABASE_URL',
  'keyHash',
  'otp',
  'password',
  'passwordHash',
  'redisUrl',
  'REDIS_URL',
  'refreshToken',
  'secret',
  'tillKey',
  'token',
] as const;

/** Keys holding a phone number: logged as the last four digits only. */
export const PHONE_KEYS = ['mobile', 'mobileNumber', 'phone', 'phoneNumber'] as const;

export const REDACTED = '[REDACTED]';

const HEADER_PATHS = [
  'headers.authorization',
  'headers.cookie',
  'headers["x-till-key"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-till-key"]',
  'res.headers["set-cookie"]',
];

export const REDACT_PATHS = [
  ...HEADER_PATHS,
  ...[...SECRET_KEYS, ...PHONE_KEYS].flatMap((key) => [key, `*.${key}`]),
];

/** `9815925566` → `******5566`; anything without four digits is hidden entirely. */
export function maskPhone(value: string | number | null | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');

  return digits.length >= 4
    ? `${'*'.repeat(Math.max(digits.length - 4, 2))}${digits.slice(-4)}`
    : REDACTED;
}

const phoneKeys = new Set<string>(PHONE_KEYS.map((key) => key.toLowerCase()));
const secretKeys = new Set<string>(SECRET_KEYS.map((key) => key.toLowerCase()));

/** pino's censor: phone numbers keep their last four digits, everything else is removed. */
export function censor(value: unknown, path: string[]): string {
  const key = path[path.length - 1]?.toLowerCase() ?? '';

  return phoneKeys.has(key) && (typeof value === 'string' || typeof value === 'number')
    ? maskPhone(value)
    : REDACTED;
}

export function isSecretKey(key: string): boolean {
  return secretKeys.has(key.toLowerCase());
}

/** A copy of `value` with every secret key removed at any depth; for audit values. */
export function scrubSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubSecrets);
  }

  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSecretKey(key) ? REDACTED : scrubSecrets(entry),
    ]),
  );
}
