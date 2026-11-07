import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { flashRecord } from './flash-record';

// A row element that records its attributes; `shown` is whether it takes space on screen.
function row(shown = true) {
  const attributes = new Set<string>();
  return {
    attributes,
    getBoundingClientRect: () => ({}),
    getClientRects: () => (shown ? [{}] : []),
    removeAttribute: (name: string) => attributes.delete(name),
    scrollIntoView: vi.fn(),
    setAttribute: (name: string) => attributes.add(name),
  };
}

let onPage: Record<string, ReturnType<typeof row>>;
let selectors: string[];

beforeEach(() => {
  vi.useFakeTimers();
  onPage = {};
  selectors = [];
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/"/g, '\\"') });
  vi.stubGlobal('document', {
    querySelector: (selector: string) => {
      selectors.push(selector);
      const id = /data-record-id="(.*)"\]$/.exec(selector)?.[1] ?? '';
      return onPage[id] ?? null;
    },
  });
  vi.stubGlobal('window', { setTimeout });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('a record on screen glows, scrolls into view, and stops glowing after 1.8 s', async () => {
  onPage.r1 = row();
  assert.equal(await flashRecord('r1'), true);
  assert.ok(onPage.r1.attributes.has('data-flash'));
  assert.deepEqual(onPage.r1.scrollIntoView.mock.calls, [[{ behavior: 'smooth', block: 'nearest' }]]);
  vi.advanceTimersByTime(1800);
  assert.equal(onPage.r1.attributes.has('data-flash'), false);
});

test('a record that arrives with the refetch is still found', async () => {
  const found = flashRecord('r2');
  vi.advanceTimersByTime(300);
  onPage.r2 = row();
  vi.advanceTimersByTime(60);
  assert.equal(await found, true);
});

test('a record that never shows, or is hidden, gives up after about 0.9 s', async () => {
  onPage.hidden = row(false);
  const result = flashRecord('hidden');
  await vi.advanceTimersByTimeAsync(1000);
  assert.equal(await result, false);
});

test('the id is escaped before it goes into the selector', async () => {
  onPage.r3 = row();
  await flashRecord('r3');
  const result = flashRecord('a"b');
  await vi.advanceTimersByTimeAsync(1000);
  await result;
  assert.ok(selectors.includes('[data-record-id="a\\"b"]'));
});
