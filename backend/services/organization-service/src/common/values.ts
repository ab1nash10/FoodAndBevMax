import type { Prisma } from '@prisma/client';

/** Prisma returns quantities as Decimal; they are compared and summed as numbers. */
export function toNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

/** Quantities carry three decimals, so two are equal when they differ by under half of 0.001. */
export function quantitiesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0005;
}

/**
 * The UTC calendar day of a value, as a Date at UTC midnight (what a Postgres DATE column holds).
 * A string's own YYYY-MM-DD wins, so "2026-12-04T02:00+05:30" is the 4th; a Date gives its UTC
 * day. Never the server's local day, which put dates a day early on hosts east of UTC.
 */
export function toDateOnly(value: string | Date): Date {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    }
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function toDate(value: string): Date {
  return new Date(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A from/to filter on a timestamp column. A date on its own (YYYY-MM-DD) means that whole day at
 * the hospital (India, +05:30): "to 21 Oct" includes everything on the 21st, where comparing with
 * its midnight dropped the day. A full timestamp is used exactly as given.
 */
export function timestampRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date; lte?: Date } {
  const startOf = (day: string) => new Date(`${day}T00:00:00+05:30`);

  return {
    ...(from ? { gte: dateOnlyPattern.test(from) ? startOf(from) : toDate(from) } : {}),
    ...(to
      ? dateOnlyPattern.test(to)
        ? { lt: new Date(startOf(to).getTime() + DAY_MS) }
        : { lte: toDate(to) }
      : {}),
  };
}

/** Trimmed text, or undefined when nothing is left. */
export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

/** A query-string boolean for class-transformer: 'true'/'false' become booleans, blank is unset. */
export function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}
