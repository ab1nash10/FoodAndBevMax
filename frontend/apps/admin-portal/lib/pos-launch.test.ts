import { strict as assert } from 'node:assert';
import { afterEach, test, vi } from 'vitest';
import { clearAaharClientStorage } from './auth-storage';
import { isPosWindow, launchedComputerName, rememberPosLaunch } from './pos-launch';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (name: string) => store.get(name) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (name: string) => void store.delete(name),
    setItem: (name: string, value: string) => void store.set(name, value),
  };
}

function openAt(search: string, standalone = false) {
  vi.stubGlobal('window', {
    dispatchEvent: () => true,
    localStorage: fakeStorage(),
    location: { search },
    matchMedia: () => ({ matches: standalone }),
    sessionStorage: fakeStorage(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the launcher’s computer name is kept through a sign-out or an expired session', () => {
  openAt('?pc=%20HO-LAP-1651%20');
  rememberPosLaunch();
  clearAaharClientStorage();

  assert.equal(launchedComputerName(), 'HO-LAP-1651');
  assert.equal(isPosWindow(), true);
});

test('a plain portal tab is no POS window and has no computer name', () => {
  openAt('?reason=session-expired');
  rememberPosLaunch();

  assert.equal(launchedComputerName(), '');
  assert.equal(isPosWindow(), false);
});

test('the installed POS app is a POS window without the launcher', () => {
  openAt('', true);

  assert.equal(isPosWindow(), true);
});
