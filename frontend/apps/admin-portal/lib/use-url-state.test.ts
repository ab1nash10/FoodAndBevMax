import { strict as assert } from 'node:assert';
import type { MouseEvent } from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { openRowLink, setUrlParams } from './use-url-state';

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

// A row: what was clicked, and the row with its record link.
function rowClick(hitControl: boolean) {
  const link = { click: vi.fn() };
  const event = {
    currentTarget: { querySelector: (selector: string) => (selector === 'a[data-row-link]' ? link : null) },
    target: { closest: (selector: string) => (hitControl && selector.includes('button') ? {} : null) },
  } as unknown as MouseEvent<HTMLTableRowElement>;
  openRowLink(event);
  return link.click.mock.calls.length;
}

test('a click on the row opens its record; a click on a control in the row does not', () => {
  assert.equal(rowClick(false), 1);
  assert.equal(rowClick(true), 0);
});
