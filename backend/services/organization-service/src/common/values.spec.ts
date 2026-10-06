import { Prisma } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import {
  optionalText,
  quantitiesMatch,
  toDate,
  toDateOnly,
  toNumber,
  toOptionalBoolean,
} from './values';

describe('shared value helpers', () => {
  test('toNumber reads Prisma decimals and numbers', () => {
    expect(toNumber(new Prisma.Decimal('12.345'))).toBe(12.345);
    expect(toNumber(7)).toBe(7);
  });

  test('quantitiesMatch allows under half a thousandth', () => {
    expect(quantitiesMatch(1.0004, 1)).toBe(true);
    expect(quantitiesMatch(0.1 + 0.2, 0.3)).toBe(true);
    expect(quantitiesMatch(1.001, 1)).toBe(false);
  });

  test('optionalText trims and drops blanks', () => {
    expect(optionalText('  rice ')).toBe('rice');
    expect(optionalText('   ')).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
  });

  test('toDateOnly gives the UTC calendar day, whatever the server zone', () => {
    const day = (value: string | Date) => toDateOnly(value).toISOString();
    for (const zone of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
      process.env.TZ = zone;
      expect(day('2026-12-04')).toBe('2026-12-04T00:00:00.000Z');
      // A string's own date part wins over the instant it names.
      expect(day('2026-12-04T02:00:00+05:30')).toBe('2026-12-04T00:00:00.000Z');
      expect(day('2026-12-04T23:30:00-05:00')).toBe('2026-12-04T00:00:00.000Z');
      // A Date gives its UTC day.
      expect(day(new Date('2026-12-04T20:30:00.000Z'))).toBe('2026-12-04T00:00:00.000Z');
      expect(day(new Date('2026-12-03T20:30:00.000Z'))).toBe('2026-12-03T00:00:00.000Z');
    }
    process.env.TZ = 'UTC';
  });

  test('toDate parses as Date does', () => {
    expect(toDate('2026-12-04T05:30:00.000Z').toISOString()).toBe('2026-12-04T05:30:00.000Z');
  });

  test('toOptionalBoolean maps query strings and leaves anything else for validation', () => {
    expect(
      [undefined, null, '', true, 'true', false, 'false', 'yes'].map(toOptionalBoolean),
    ).toEqual([undefined, undefined, undefined, true, true, false, false, 'yes']);
  });
});
