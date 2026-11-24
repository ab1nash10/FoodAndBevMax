import { ApiClientError } from '@aahar/api-client';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { at, router } from '@/test/next-navigation';
import { refreshStoredSession } from '@/lib/api';
import { AuthProvider, useAuth } from './auth-provider';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
// The API calls the screen makes, each a typed stand-in.
type AuthApi = typeof ApiModule.authApi;
const authApi = vi.hoisted(() => ({
  logout: vi.fn<AuthApi['logout']>(),
}));
type UserApi = typeof ApiModule.userApi;
const userApi = vi.hoisted(() => ({
  getMyAccess: vi.fn<UserApi['getMyAccess']>(),
}));
vi.mock('@/lib/api', () => ({
  authApi,
  refreshStoredSession: vi.fn(),
  setApiSessionExpiredHandler: vi.fn(),
  userApi,
}));

const storageKey = 'aahar.admin.auth';

/** An access token as the auth service signs it; only the payload matters to the portal. */
function token(payload: Record<string, unknown>) {
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  return `header.${body}.signature`;
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600;

const asha = (exp = inAnHour()) =>
  token({
    exp,
    name: 'Asha Rao',
    permissions: ['ITEM_VIEW', 'ITEM_CREATE'],
    roles: ['Store Manager'],
    sub: 'u-1',
  });

function storeSession(accessToken: string, savedAt = new Date().toISOString()) {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ accessToken, refreshToken: 'refresh-1', savedAt }),
  );
}

// Shows what a screen reads from useAuth, and offers its sign-in and sign-out.
function Probe() {
  const auth = useAuth();

  return (
    <div>
      <p>{auth.isReady ? 'ready' : 'starting'}</p>
      <p>{auth.isAuthenticated ? `signed in as ${auth.currentUser?.name}` : 'signed out'}</p>
      <p>{auth.hasPermission('ITEM_CREATE') ? 'may create items' : 'may not create items'}</p>
      <p>
        {auth.hasPermission(['USER_EDIT', 'ITEM_VIEW']) ? 'may see items' : 'may not see items'}
      </p>
      <p>{auth.hasPermission('USER_EDIT') ? 'may edit users' : 'may not edit users'}</p>
      <button
        onClick={() => auth.signIn({ accessToken: asha(), refreshToken: 'refresh-2' })}
        type="button"
      >
        Sign in
      </button>
      <button onClick={() => void auth.logout()} type="button">
        Log out
      </button>
    </div>
  );
}

const renderProvider = () =>
  renderScreen(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  at('/dashboard');
  authApi.logout.mockReturnValue(reply({ loggedOut: true }));
  // The session check every few minutes: nothing to say in these tests.
  userApi.getMyAccess.mockReturnValue(new Promise(() => undefined));
});

describe('the signed-in session', () => {
  it('is ready and signed out when nothing is stored', async () => {
    renderProvider();

    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(refreshStoredSession).not.toHaveBeenCalled();
  });

  it('opens at once on a fresh stored token, with its name and permissions', async () => {
    storeSession(asha());
    renderProvider();

    expect(await screen.findByText('signed in as Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('may create items')).toBeInTheDocument();
    // Any one of a list of permissions is enough.
    expect(screen.getByText('may see items')).toBeInTheDocument();
    expect(screen.getByText('may not edit users')).toBeInTheDocument();
    expect(refreshStoredSession).not.toHaveBeenCalled();
  });

  it('renews an expired token before opening, and keeps the user signed in', async () => {
    storeSession(asha(anHourAgo()));
    vi.mocked(refreshStoredSession).mockImplementation(() => {
      storeSession(asha());
      return Promise.resolve('new-token');
    });
    renderProvider();

    expect(await screen.findByText('signed in as Asha Rao')).toBeInTheDocument();
    expect(refreshStoredSession).toHaveBeenCalledOnce();
  });

  it('sends the user to sign in again when the renewal is refused', async () => {
    storeSession(asha(anHourAgo()));
    vi.mocked(refreshStoredSession).mockRejectedValue(
      new ApiClientError(401, 'Refresh token revoked'),
    );
    renderProvider();

    expect(await screen.findByText('Session expired')).toBeInTheDocument();
    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith('/auth/login?reason=session-expired');
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('keeps a still-valid session when the renewal only failed on the network', async () => {
    // Saved over a minute ago: renewed in the background, but the token itself is still good.
    storeSession(asha(), new Date(Date.now() - 5 * 60_000).toISOString());
    vi.mocked(refreshStoredSession).mockRejectedValue(new ApiClientError(500, 'Network down'));
    renderProvider();

    expect(await screen.findByText('signed in as Asha Rao')).toBeInTheDocument();
    await act(() => Promise.resolve());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('takes the user to the sign-in page from the expiry notice', async () => {
    storeSession(asha(anHourAgo()));
    vi.mocked(refreshStoredSession).mockRejectedValue(
      new ApiClientError(401, 'Refresh token revoked'),
    );
    const { user } = renderProvider();

    await user.click(await screen.findByRole('button', { name: 'Login Again' }));

    expect(router.replace).toHaveBeenLastCalledWith('/auth/login');
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument();
  });

  it('signs in with new tokens and stores them for the next visit', async () => {
    const { user } = renderProvider();
    await screen.findByText('ready');

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('signed in as Asha Rao')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({
      refreshToken: 'refresh-2',
    });
  });

  it('logs out: forgets the session and tells the server to end it', async () => {
    storeSession(asha());
    const { user } = renderProvider();
    await screen.findByText('signed in as Asha Rao');

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(screen.getByText('signed out')).toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(authApi.logout).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
  });

  it('follows a sign-out made in another tab', async () => {
    storeSession(asha());
    renderProvider();
    await screen.findByText('signed in as Asha Rao');

    localStorage.removeItem(storageKey);
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: storageKey })));

    expect(screen.getByText('signed out')).toBeInTheDocument();
  });
});

describe('signing out after 8 hours without activity (the user, 2026-11-23)', () => {
  const lastInput = (hoursAgo: number) =>
    localStorage.setItem('aahar.last-activity', String(Date.now() - hoursAgo * 3_600_000));

  it('signs out a screen opened again after 8 idle hours, and ends the session on the server', async () => {
    storeSession(asha());
    lastInput(9);
    renderProvider();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/login?reason=idle'));
    expect(screen.queryByText('signed in as Asha Rao')).not.toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(refreshStoredSession).not.toHaveBeenCalled();
  });

  it('keeps a screen used within the 8 hours signed in', async () => {
    storeSession(asha());
    lastInput(7);
    renderProvider();

    expect(await screen.findByText('signed in as Asha Rao')).toBeInTheDocument();
    await act(() => Promise.resolve());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('never signs out the POS till, however long it sat idle', async () => {
    at('/pos/billing');
    storeSession(asha());
    lastInput(20);
    renderProvider();

    expect(await screen.findByText('signed in as Asha Rao')).toBeInTheDocument();
    await act(() => Promise.resolve());
    expect(router.replace).not.toHaveBeenCalled();
    expect(authApi.logout).not.toHaveBeenCalled();
  });
});
