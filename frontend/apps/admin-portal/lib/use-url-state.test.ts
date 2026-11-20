import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { setUrlParams } from './use-url-state';

// The hooks are React glue over next/navigation; these are the parts that touch the URL and DOM.
const calls: Array<[string, string]> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('window', {
    history: {
      pushState: (_: unknown, __: string, url: string) => calls.push(['push', url]),
      replaceState: (_: unknown, __: string, url: string) => calls.push(['replace', url]),
    },
    location: { hash: '#top', pathname: '/fandb/masters/items', search: '?q=dal&page=3' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('params are set or removed in place, keeping the path, the others and the hash', () => {
  setUrlParams({ id: 'i1', page: null });
  assert.deepEqual(calls, [['replace', '/fandb/masters/items?q=dal&id=i1#top']]);
});

test('an empty value removes the param, and push makes a history entry', () => {
  setUrlParams({ page: '', q: null }, 'push');
  assert.deepEqual(calls, [['push', '/fandb/masters/items#top']]);
});
