import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test, vi } from 'vitest';
import {
  AUTH_STORAGE_EVENT,
  clearAaharClientStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  readStoredAuth,
  saveStoredAuth,
} from './auth-storage';

const key = 'aahar.admin.auth';

// A small Storage: enough of the real one (length, key, getItem...) for these functions.
function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (name: string) => store.get(name) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (name: string) => void store.delete(name),
    setItem: (name: string, value: string) => void store.set(name, value),
    store,
  };
}

let local: ReturnType<typeof fakeStorage>;
let session: ReturnType<typeof fakeStorage>;
let events: string[];

beforeEach(() => {
  local = fakeStorage();
  session = fakeStorage();
  events = [];
  vi.stubGlobal('window', {
    dispatchEvent: (event: Event) => events.push(event.type),
    localStorage: local,
    sessionStorage: session,
  });
  vi.useFakeTimers({ now: Date.parse('2026-10-26T06:30:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('saved tokens are read back with when they were saved, and the app is told', () => {
  const saved = saveStoredAuth({ accessToken: 'a1', refreshToken: 'r1' });
  assert.equal(saved.savedAt, '2026-10-26T06:30:00.000Z');
  assert.deepEqual(readStoredAuth(), saved);
  assert.equal(getStoredAccessToken(), 'a1');
  assert.equal(getStoredRefreshToken(), 'r1');
  assert.deepEqual(events, [AUTH_STORAGE_EVENT]);
});

test('an entry missing a token, or not JSON, is removed and reads as signed out', () => {
  local.setItem(key, JSON.stringify({ accessToken: 'a1' }));
  assert.equal(readStoredAuth(), null);
  assert.equal(local.store.has(key), false);

  local.setItem(key, '{oops');
  assert.equal(getStoredAccessToken(), null);
  assert.equal(local.store.has(key), false);
});

test('an older entry without savedAt still signs in', () => {
  local.setItem(key, JSON.stringify({ accessToken: 'a1', refreshToken: 'r1' }));
  assert.equal(readStoredAuth()?.savedAt, '2026-10-26T06:30:00.000Z');
});

test('sign-out clears every aahar key in both storages and nothing else', () => {
  for (const name of [
    'aahar.admin.auth',
    'aahar-theme',
    'aahar:pos',
    'portal-density.u1',
    'other',
  ]) {
    local.setItem(name, 'x');
  }
  session.setItem('aahar.draft', 'x');
  session.setItem('keep', 'x');

  clearAaharClientStorage();

  assert.deepEqual([...local.store.keys()], ['portal-density.u1', 'other']);
  assert.deepEqual([...session.store.keys()], ['keep']);
  assert.deepEqual(events, [AUTH_STORAGE_EVENT]);
});

test('sign-out keeps the till key: the computer stays a till for the next cashier', () => {
  local.setItem('aahar.pos.tillKey', 'till_x');
  local.setItem('aahar.admin.auth', 'x');

  clearAaharClientStorage();

  assert.deepEqual([...local.store.keys()], ['aahar.pos.tillKey']);
});

test('on the server there is nothing stored and saving still returns the tokens', () => {
  vi.stubGlobal('window', undefined);
  assert.equal(readStoredAuth(), null);
  assert.equal(saveStoredAuth({ accessToken: 'a', refreshToken: 'r' }).accessToken, 'a');
  assert.doesNotThrow(() => clearAaharClientStorage());
});
