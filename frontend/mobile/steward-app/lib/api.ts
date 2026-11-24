// The F&B services this app talks to, and the signed-in steward's session.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Delivery, Tokens, UndeliveredReason } from './types';

// ponytail: the dev stack on the PC that served this app, over plain http. The phone reached that
// PC at this host (same Wi-Fi), or at localhost through `adb reverse` (USB). Point these at the
// AWS address once it has a maxhealthcare.com name and its certificate.
const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
const AUTH_URL = `http://${host}:4001/api/v1`;
const ORGANIZATION_URL = `http://${host}:4003/api/v1`;

const SESSION_KEY = 'fandb.session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// The phone's secure store; the browser's storage when previewed on the web.
const store = {
  get: () =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(SESSION_KEY) ?? null)
      : SecureStore.getItemAsync(SESSION_KEY),
  set: (value: string | null) => {
    if (Platform.OS === 'web') {
      if (value) globalThis.localStorage?.setItem(SESSION_KEY, value);
      else globalThis.localStorage?.removeItem(SESSION_KEY);
      return Promise.resolve();
    }
    return value
      ? SecureStore.setItemAsync(SESSION_KEY, value)
      : SecureStore.deleteItemAsync(SESSION_KEY);
  },
};

async function call<T>(url: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'Can’t reach F&B. Check the phone is connected to the same network as the F&B computer.',
    );
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    message?: string | string[];
  } | null;

  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(response.status, message || `Something went wrong (${response.status}).`);
  }
  return body?.data as T;
}

// The session, kept here so every request and screen shares one.
export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { name: string | null; permissions: string[]; status: 'signedIn' };

let tokens: Tokens | null = null;
let state: SessionState = { status: 'loading' };
let refreshing: Promise<Tokens> | null = null;
const listeners = new Set<() => void>();

/** The name and permissions in the access token (a JWT); none when it can't be read. */
function userOf(accessToken: string): { name: string | null; permissions: string[] } | null {
  try {
    const part = accessToken.split('.')[1] ?? '';
    const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const json = decodeURIComponent(
      Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const payload = JSON.parse(json) as { name?: string | null; permissions?: string[] };
    return { name: payload.name ?? null, permissions: payload.permissions ?? [] };
  } catch {
    return null;
  }
}

function setTokens(next: Tokens | null) {
  tokens = next;
  const user = next ? userOf(next.accessToken) : null;
  state = user ? { ...user, status: 'signedIn' } : { status: 'signedOut' };
  void store.set(next && user ? JSON.stringify(next) : null);
  listeners.forEach((listener) => listener());
}

export const session = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Opens the app where it was left: the saved session, if there is one. */
export async function restoreSession() {
  const saved = await store.get().catch(() => null);
  setTokens(saved ? (JSON.parse(saved) as Tokens) : null);
}

/** Texts a one-time code to the steward's registered mobile. */
export function sendCode(mobile: string) {
  return call(`${AUTH_URL}/auth/send-otp`, { body: JSON.stringify({ mobile }), method: 'POST' });
}

export async function signIn(mobile: string, otp: string) {
  setTokens(
    await call<Tokens>(`${AUTH_URL}/auth/verify-otp`, {
      body: JSON.stringify({ mobile, otp }),
      method: 'POST',
    }),
  );
}

export async function signOut() {
  const refreshToken = tokens?.refreshToken;
  setTokens(null);
  if (refreshToken) {
    await call(`${AUTH_URL}/auth/logout`, {
      body: JSON.stringify({ refreshToken }),
      method: 'POST',
    }).catch(() => undefined);
  }
}

/** A request as the steward; an expired access token is renewed once (shared by all at once). */
async function authed<T>(url: string, init?: RequestInit): Promise<T> {
  if (!tokens) throw new ApiError(401, 'Sign in again.');
  try {
    return await call<T>(url, init, tokens.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  const refreshToken = tokens.refreshToken;
  refreshing ??= call<Tokens>(`${AUTH_URL}/auth/refresh`, {
    body: JSON.stringify({ refreshToken }),
    method: 'POST',
  }).finally(() => {
    refreshing = null;
  });
  try {
    setTokens(await refreshing);
  } catch (error) {
    // Signed in somewhere else, or the session ended: back to sign-in.
    if (error instanceof ApiError && error.status !== 0) setTokens(null);
    throw error;
  }
  return call<T>(url, init, tokens?.accessToken);
}

export const deliveriesApi = {
  list: () => authed<Delivery[]>(`${ORGANIZATION_URL}/restaurant-orders/deliveries`),
  /** A phone order needs the guest's six digits: scanned from their QR, or typed. */
  delivered: (id: string, code?: string) =>
    authed(`${ORGANIZATION_URL}/restaurant-orders/${id}/delivered`, {
      body: code ? JSON.stringify({ code }) : undefined,
      method: 'POST',
    }),
  notDelivered: (id: string, reason: UndeliveredReason) =>
    authed(`${ORGANIZATION_URL}/restaurant-orders/${id}/not-delivered`, {
      body: JSON.stringify({ reason }),
      method: 'POST',
    }),
};
