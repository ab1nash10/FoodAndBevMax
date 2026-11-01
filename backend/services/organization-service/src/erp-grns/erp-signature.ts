import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** How far the ERP's X-Timestamp may be from this server's clock, either way. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

// India has no daylight saving, so IST is always UTC+05:30.
const IST_OFFSET_MS = 330 * 60_000;

/**
 * What the ERP signs: the method, the path with its query string as called (including the
 * /fandb/api/v1 prefix), X-Timestamp, X-Nonce and the SHA-256 of the exact body bytes, one per
 * line. The body goes in as a hash so the text stays short and can never contain a newline.
 */
export function stringToSign(
  method: string,
  pathWithQuery: string,
  timestamp: string,
  nonce: string,
  body: Buffer,
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');

  return [method.toUpperCase(), pathWithQuery, timestamp, nonce, bodyHash].join('\n');
}

/** HMAC-SHA256 of the text with the shared secret, as lowercase hex. */
export function sign(secret: string, text: string): string {
  return createHmac('sha256', secret).update(text, 'utf8').digest('hex');
}

/** Constant time, so how long it takes does not reveal how much of a guess was right. */
export function signatureMatches(expected: string, given: string): boolean {
  return (
    /^[0-9a-f]{64}$/.test(given) &&
    timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'))
  );
}

/** "28/10/2026/17/40", India time, as milliseconds since 1970; null when it is not a real time. */
export function parseErpTimestamp(text: string): number | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\/(\d{2})\/(\d{2})$/.exec(text);

  if (!match) {
    return null;
  }

  const [day, month, year, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const asIst = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Date.UTC rolls 31/02 into March and hour 24 into the next day; a real time reads back as given.
  const isReal =
    asIst.getUTCFullYear() === year &&
    asIst.getUTCMonth() === month - 1 &&
    asIst.getUTCDate() === day &&
    asIst.getUTCHours() === hour &&
    asIst.getUTCMinutes() === minute;

  return isReal ? asIst.getTime() - IST_OFFSET_MS : null;
}

/** The current India time as X-Timestamp expects it. */
export function formatErpTimestamp(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const two = (value: number) => String(value).padStart(2, '0');

  return [
    two(ist.getUTCDate()),
    two(ist.getUTCMonth() + 1),
    ist.getUTCFullYear(),
    two(ist.getUTCHours()),
    two(ist.getUTCMinutes()),
  ].join('/');
}
