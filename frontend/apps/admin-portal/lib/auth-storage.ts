import type { AuthTokens } from '@aahar/api-client';

const STORAGE_KEY = 'aahar.admin.auth';
export const AUTH_STORAGE_EVENT = 'aahar:auth-storage-changed';
const AAHAR_STORAGE_PREFIXES = ['aahar.', 'aahar-', 'aahar:'];
/** The browser's till key belongs to the computer, not the user: a sign-out keeps it. */
export const TILL_KEY_STORAGE_KEY = 'aahar.pos.tillKey';
/** The till launcher's computer name and window (lib/pos-launch): the computer's, too. */
export const POS_COMPUTER_NAME_KEY = 'aahar.pos.computerName';
export const POS_WINDOW_KEY = 'aahar.pos.window';
const KEPT_ON_SIGN_OUT = [TILL_KEY_STORAGE_KEY, POS_COMPUTER_NAME_KEY, POS_WINDOW_KEY];
/**
 * The till's unsent bills, one key per counter (lib/pos-offline-queue): money already taken, so
 * a sign-out, or a sign-in elsewhere, keeps them for their cashier to send.
 */
export const UNSENT_BILLS_KEY_PREFIX = 'aahar.pos.unsent-bills.';
/** Guests' paid online payments no bill has taken yet, per counter (lib/pos-held-payments). */
export const HELD_PAYMENTS_KEY_PREFIX = 'aahar.pos.held-payment.';
const KEPT_PREFIXES_ON_SIGN_OUT = [UNSENT_BILLS_KEY_PREFIX, HELD_PAYMENTS_KEY_PREFIX];

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

      if (
        key &&
        !KEPT_ON_SIGN_OUT.includes(key) &&
        !KEPT_PREFIXES_ON_SIGN_OUT.some((prefix) => key.startsWith(prefix)) &&
        AAHAR_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
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
