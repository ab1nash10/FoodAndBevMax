import { expect, test } from 'vitest';
import { formatDay, formatSlot, formatTime } from './format';

test('times are India time, whatever the machine is set to', () => {
  expect(formatTime('2026-10-15T07:42:00Z')).toBe('1:12 PM');
  expect(formatTime(Date.parse('2026-10-15T18:30:00Z'))).toBe('12:00 AM');
  expect(formatSlot('Lunch', '2026-10-15T09:30:00Z')).toBe('Lunch · till 3:00 PM');
  expect(formatSlot('Lunch')).toBe('Lunch');
  // 22 Oct 2026, 1:00 AM in India is still 21 Oct in UTC.
  expect(formatDay(Date.parse('2026-10-21T19:30:00Z'))).toBe('Thu 22 Oct');
});
