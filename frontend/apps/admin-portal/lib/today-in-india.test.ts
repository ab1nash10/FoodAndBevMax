import { strict as assert } from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { todayInIndia } from './today-in-india';

afterEach(() => {
  vi.useRealTimers();
});

// India is UTC+5:30, so the day turns at 18:30 UTC, whatever this machine's own zone is.
test('the date turns at midnight in India, not at midnight UTC', () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-25T18:29:59Z') });
  assert.equal(todayInIndia(), '2026-10-25');
  vi.setSystemTime(Date.parse('2026-10-25T18:30:00Z'));
  assert.equal(todayInIndia(), '2026-10-26');
});

test('the date is YYYY-MM-DD, padded, across a year end', () => {
  vi.useFakeTimers({ now: Date.parse('2026-12-31T19:00:00Z') });
  assert.equal(todayInIndia(), '2027-01-01');
  vi.setSystemTime(Date.parse('2027-02-03T00:00:00Z'));
  assert.equal(todayInIndia(), '2027-02-03');
});
