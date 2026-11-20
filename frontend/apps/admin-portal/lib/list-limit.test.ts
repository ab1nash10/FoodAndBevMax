import { expect, test } from 'vitest';
import { pageSizes, rowsPerPage } from './list-limit';

test('every list offers the usual page sizes', () => {
  expect(pageSizes).toEqual([10, 20, 25, 50, 100]);
});

test('rows per page: the link first, then the last choice on this browser, else the default', () => {
  // ?rows=50 in the link wins.
  expect(rowsPerPage('50', '20', 10)).toBe(50);
  // No ?rows=: the size picked last time, on any list.
  expect(rowsPerPage(null, '25', 10)).toBe(25);
  expect(rowsPerPage(null, null, 10)).toBe(10);
  // Anything not offered (typed in the link, or an old saved value) falls back.
  expect(rowsPerPage('7', '20', 10)).toBe(20);
  expect(rowsPerPage('5000', 'junk', 10)).toBe(10);
});
