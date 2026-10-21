import { expect, test } from 'vitest';
import { readReceivePrefill, receivePrefillHref } from './receive-prefill';

test('receive prefill round-trips through the URL and drops blank or repeated items', () => {
  const href = receivePrefillHref({ hospitalId: 'h1', itemIds: ['a', 'b'], storeId: 's1' });

  expect(href.startsWith('/inventory/grns/new?')).toBe(true);
  expect(readReceivePrefill(new URL(href, 'http://x').searchParams)).toEqual({
    hospitalId: 'h1',
    itemIds: ['a', 'b'],
    storeId: 's1',
  });
  expect(readReceivePrefill(new URLSearchParams('store=s1&items=a,,a, b'))).toEqual({
    hospitalId: '',
    itemIds: ['a', 'b'],
    storeId: 's1',
  });
  expect(readReceivePrefill(new URLSearchParams('items=a'))).toBeNull();
});
