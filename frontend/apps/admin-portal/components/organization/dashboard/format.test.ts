import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { formatAge, plural } from './format';

const now = Date.parse('2026-10-26T06:30:00Z');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

test('ages read as just now, minutes, hours with minutes, then days', () => {
  assert.equal(formatAge(ago(0.5), now), 'just now');
  assert.equal(formatAge(ago(1), now), '1m');
  assert.equal(formatAge(ago(59), now), '59m');
  assert.equal(formatAge(ago(60), now), '1h');
  assert.equal(formatAge(ago(65), now), '1h 05m');
  assert.equal(formatAge(ago(23 * 60 + 59), now), '23h 59m');
  assert.equal(formatAge(ago(24 * 60), now), '1d');
  assert.equal(formatAge(ago(3 * 24 * 60 + 600), now), '3d');
});

test('a time a little ahead of this clock reads as just now, not negative', () => {
  assert.equal(formatAge(ago(-5), now), 'just now');
});

test('plural adds an s except for one', () => {
  assert.equal(plural(1, 'transfer'), '1 transfer');
  assert.equal(plural(0, 'transfer'), '0 transfers');
  assert.equal(plural(2, 'GRN'), '2 GRNs');
});
