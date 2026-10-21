import { expect, test } from 'vitest';
import { axisMax } from './geometry';

test('the axis top keeps the midline label a whole number', () => {
  expect([[], [0], [3], [4], [5], [9], [10], [11], [25]].map(axisMax)).toEqual([
    4, 4, 4, 4, 10, 10, 10, 20, 30,
  ]);
  expect([[], [5], [11], [25]].map((values) => axisMax(values) / 2).every(Number.isInteger)).toBe(
    true,
  );
});
