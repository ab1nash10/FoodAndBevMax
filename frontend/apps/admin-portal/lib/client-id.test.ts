import { afterEach, expect, test, vi } from 'vitest';
import { newClientId } from './client-id';

afterEach(() => vi.unstubAllGlobals());

test('a fresh id each time', () => {
  expect(newClientId()).not.toBe(newClientId());
});

test('on a plain http address, where browsers withhold crypto.randomUUID, it still gives an id', () => {
  // A phone opening the QR page at http://<pc address>:3000 crashed at checkout (2026-11-16).
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });

  const first = newClientId();
  expect(first).toMatch(/^[0-9a-f]{32}$/);
  expect(newClientId()).not.toBe(first);
});
