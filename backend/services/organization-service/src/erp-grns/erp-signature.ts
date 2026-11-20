import { createHash, timingSafeEqual } from 'node:crypto';

/** How far the ERP's X-Timestamp may be from this server's clock, either way. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/** The APIMethod part of the signed text: always GRN for this API. */
export const ERP_API_METHOD = 'GRN';

// India has no daylight saving, so IST is always UTC+05:30.
const IST_OFFSET_MS = 330 * 60_000;

/**
 * What the ERP signs, in the EAM team's format: api_key|APIMethod|X-Timestamp|token. The key and
 * token are fixed and only the minute changes; neither the body nor the path is part of it.
 */
export function stringToSign(apiKey: string, timestamp: string, token: string): string {
  return [apiKey, ERP_API_METHOD, timestamp, token].join('|');
}

/** SHA-512 of the text, as lowercase hex (128 characters). */
export function sign(text: string): string {
  return createHash('sha512').update(text, 'utf8').digest('hex');
}

/**
 * Constant time, so how long it takes does not reveal how much of a guess was right. Hex in either
 * case is taken, as ERPs differ in what they write.
 */
export function signatureMatches(expected: string, given: string): boolean {
  const hex = given.toLowerCase();

  return (
    /^[0-9a-f]{128}$/.test(hex) &&
    timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hex, 'hex'))
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
