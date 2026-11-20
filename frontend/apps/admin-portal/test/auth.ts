// The signed-in user for component tests. Use with
// vi.mock('@/components/auth-provider', () => import('@/test/auth')) and set what they may do
// with signedIn(['ROOM_VIEW', 'ROOM_CREATE']).
import { vi } from 'vitest';

const state = { permissions: [] as string[], roles: [] as string[] };

/** The user holds exactly these permissions (and roles) for the rest of the test. */
export function signedIn(permissions: string[], roles: string[] = []) {
  state.permissions = permissions;
  state.roles = roles;
}

export function useAuth() {
  return {
    accessToken: 'test-token',
    currentUser: { id: 'user-1', name: 'Test Admin', roles: state.roles },
    dismissSessionNotice: vi.fn(),
    hasPermission: (wanted: string | string[]) =>
      (Array.isArray(wanted) ? wanted : [wanted]).some((code) => state.permissions.includes(code)),
    isAuthenticated: true,
    isReady: true,
    login: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    permissions: state.permissions,
    refreshSession: vi.fn(() => Promise.resolve(true)),
    refreshToken: 'test-refresh',
    roles: state.roles,
    sessionNotice: null,
    signIn: vi.fn(),
  };
}

export function AuthProvider({ children }: { children: unknown }) {
  return children;
}
