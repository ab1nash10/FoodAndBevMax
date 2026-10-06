import type { AuthTokens } from '@aahar/api-client';

const STORAGE_KEY = 'aahar.admin.auth';
export const AUTH_STORAGE_EVENT = 'aahar:auth-storage-changed';
const AAHAR_STORAGE_PREFIXES = ['aahar.', 'aahar-', 'aahar:'];

export interface StoredAuth extends AuthTokens {
  savedAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function dispatchAuthStorageEvent(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_STORAGE_EVENT));
  }
}

export function readStoredAuth(): StoredAuth | null {
  if (!canUseStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredAuth>;

    if (!parsed.accessToken || !parsed.refreshToken) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveStoredAuth(tokens: AuthTokens): StoredAuth {
  const storedAuth: StoredAuth = {
    ...tokens,
    savedAt: new Date().toISOString(),
  };

  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAuth));
  }

  dispatchAuthStorageEvent();

  return storedAuth;
}

export function clearAaharClientStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  [window.localStorage, window.sessionStorage].forEach((storage) => {
    const keysToRemove: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (key && AAHAR_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => storage.removeItem(key));
  });

  dispatchAuthStorageEvent();
}

export function getStoredAccessToken(): string | null {
  return readStoredAuth()?.accessToken ?? null;
}

export function getStoredRefreshToken(): string | null {
  return readStoredAuth()?.refreshToken ?? null;
}
