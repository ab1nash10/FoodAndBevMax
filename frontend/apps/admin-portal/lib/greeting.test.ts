import { expect, test } from 'vitest';
import { greetingAt } from './greeting';

test('morning until noon, afternoon 12:00–15:59, evening from 16:00', () => {
  expect([0, 11, 12, 15, 16, 23].map(greetingAt)).toEqual([
    'Good morning',
    'Good morning',
    'Good afternoon',
    'Good afternoon',
    'Good evening',
    'Good evening',
  ]);
});
