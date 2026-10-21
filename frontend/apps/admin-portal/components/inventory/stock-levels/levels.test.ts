import { expect, test } from 'vitest';
import { coverLabel, expiryLabel, expiryTone, matchesFilter } from './levels';

test('expiry reads as a person says it, and turns amber then red as it nears', () => {
  expect([null, -2, 0, 1, 5, 45, 90].map(expiryLabel)).toEqual([
    '—',
    'Expired',
    'Today',
    'Tomorrow',
    'In 5 days',
    'In 45 days',
    'In 3 months',
  ]);
  expect([null, -1, 0, 1, 2, 7, 8].map(expiryTone)).toEqual([
    'neutral',
    'bad',
    'bad',
    'bad',
    'pending',
    'pending',
    'neutral',
  ]);
});

test('cover in words, and the quick filters', () => {
  expect(
    [
      { coverDays: 0, level: 'OUT' as const },
      { coverDays: null, level: 'OK' as const },
      { coverDays: 0.4, level: 'LOW' as const },
      { coverDays: 1.2, level: 'LOW' as const },
      { coverDays: 9.6, level: 'OK' as const },
    ].map(coverLabel),
  ).toEqual(['Out', 'No recent issues', 'Under a day', '~1 day', '~10 days']);
  expect(matchesFilter({ level: 'OK' }, 'expiring', 3)).toBe(true);
  expect(matchesFilter({ level: 'OK' }, 'expiring', -1)).toBe(true);
  expect(matchesFilter({ level: 'OK' }, 'expiring', 30)).toBe(false);
  expect(matchesFilter({ level: 'OK' }, 'expiring', null)).toBe(false);
  expect(matchesFilter({ level: 'LOW' }, 'low', null)).toBe(true);
  expect(matchesFilter({ level: 'OUT' }, 'out', null)).toBe(true);
  expect(matchesFilter({ level: 'OUT' }, 'all', null)).toBe(true);
});
