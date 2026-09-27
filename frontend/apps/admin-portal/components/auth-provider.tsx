'use client';

import { Button } from '@aahar/ui';
import { ApiClientError, type AuthTokens } from '@aahar/api-client';
import {
  AUTH_STORAGE_EVENT,
  clearAaharClientStorage,
  getStoredRefreshToken,
  readStoredAuth,
  saveStoredAuth,
  type StoredAuth,
} from '@/lib/auth-storage';
import { authApi, refreshStoredSession, setApiSessionExpiredHandler } from '@/lib/api';
import { isAccessTokenExpired, sessionUserFromAccessToken, type SessionUser } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface AuthContextValue {
  accessToken: string | null;
  currentUser: SessionUser | null;
  hasPermission: (permission: string | string[]) => boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (tokens: AuthTokens) => void;
  logout: () => Promise<void>;
  permissions: string[];
  refreshToken: string | null;
  refreshSession: () => Promise<boolean>;
  roles: string[];
  signIn: (tokens: AuthTokens) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const router = useRouter();

  const clearSessionState = useCallback(() => {
    clearAaharClientStorage();
    setAuth(null);
    queryClient.clear();
  }, [queryClient]);

  const expireSession = useCallback(
    (message = 'Your session has expired. Please login again.') => {
      clearSessionState();
      setSessionNotice(message);

      if (!pathname.startsWith('/auth/login')) {
        router.replace('/auth/login?reason=session-expired');
      }
    },
    [clearSessionState, pathname, router],
  );

  useEffect(() => {
    setApiSessionExpiredHandler(expireSession);

    return () => setApiSessionExpiredHandler(null);
  }, [expireSession]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      const storedAuth = readStoredAuth();

      if (!storedAuth) {
        if (isMounted) {
          setAuth(null);
          setIsReady(true);
        }

        return;
      }

      const savedAtTime = new Date(storedAuth.savedAt).getTime();
      const secondsSinceSave = Number.isFinite(savedAtTime)
        ? (Date.now() - savedAtTime) / 1000
        : Number.POSITIVE_INFINITY;
      const isExpired = isAccessTokenExpired(storedAuth.accessToken, 0);
      const shouldRefresh = isAccessTokenExpired(storedAuth.accessToken) || secondsSinceSave > 60;

      if (!shouldRefresh) {
        if (isMounted) {
          setAuth(storedAuth);
          setIsReady(true);
        }

        return;
      }

      try {
        const refreshedAccessToken = await refreshStoredSession();

        if (isMounted) {
          if (refreshedAccessToken) {
            setAuth(readStoredAuth());
          } else if (isExpired) {
            expireSession();
          } else {
            setAuth(storedAuth);
          }

          setIsReady(true);
        }
      } catch (error) {
        // Only a rejected refresh token ends the session; a network error with a still-valid
        // access token keeps the user signed in, and their next request retries the refresh.
        const rejected =
          error instanceof ApiClientError && (error.status === 401 || error.status === 403);

        if (isMounted) {
          if (!rejected && !isExpired) {
            setAuth(storedAuth);
          }

          setIsReady(true);
        }

        if (rejected || isExpired) {
          expireSession();
        }
      }
    }

    void bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [expireSession]);

  useEffect(() => {
    function syncAuthFromStorage() {
      const storedAuth = readStoredAuth();

      setAuth(storedAuth);

      if (!storedAuth) {
        queryClient.clear();
      }
    }

    function handleStorageEvent(event: StorageEvent) {
      if (!event.key || event.key.startsWith('aahar')) {
        syncAuthFromStorage();
      }
    }

    window.addEventListener(AUTH_STORAGE_EVENT, syncAuthFromStorage);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(AUTH_STORAGE_EVENT, syncAuthFromStorage);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [queryClient]);

  const signIn = useCallback(
    (tokens: AuthTokens) => {
      queryClient.clear();
      setSessionNotice(null);
      setAuth(saveStoredAuth(tokens));
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = auth?.refreshToken ?? getStoredRefreshToken();

    clearSessionState();

    if (refreshToken) {
      await authApi.logout({ refreshToken }).catch(() => undefined);
    }
  }, [auth?.refreshToken, clearSessionState]);

  const refreshSession = useCallback(async () => {
    try {
      const refreshedAccessToken = await refreshStoredSession();
      const storedAuth = readStoredAuth();

      setAuth(storedAuth);

      return Boolean(refreshedAccessToken);
    } catch {
      expireSession('Your session has expired or your access has changed. Please login again.');

      return false;
    }
  }, [expireSession]);

  const currentUser = useMemo(
    () => (auth?.accessToken ? sessionUserFromAccessToken(auth.accessToken) : null),
    [auth?.accessToken],
  );
  const permissions = useMemo(() => currentUser?.permissions ?? [], [currentUser?.permissions]);
  const roles = useMemo(() => currentUser?.roles ?? [], [currentUser?.roles]);
  const hasPermission = useCallback(
    (permission: string | string[]) => {
      const requestedPermissions = Array.isArray(permission) ? permission : [permission];

      if (requestedPermissions.length === 0) {
        return true;
      }

      return requestedPermissions.some((requestedPermission) =>
        permissions.includes(requestedPermission),
      );
    },
    [permissions],
  );
  const isAuthenticated = Boolean(auth?.accessToken && currentUser);

  const contextValue = useMemo(
    () => ({
      accessToken: auth?.accessToken ?? null,
      currentUser,
      hasPermission,
      isAuthenticated,
      isReady,
      login: signIn,
      logout,
      permissions,
      refreshToken: auth?.refreshToken ?? null,
      refreshSession,
      roles,
      signIn,
    }),
    [
      auth?.accessToken,
      auth?.refreshToken,
      currentUser,
      hasPermission,
      isAuthenticated,
      isReady,
      logout,
      permissions,
      refreshSession,
      roles,
      signIn,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {sessionNotice ? (
        <div className="fixed inset-x-4 top-5 z-[70] mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-xl shadow-amber-950/10 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          <p className="text-sm font-semibold">Session expired</p>
          <p className="mt-1 text-sm">{sessionNotice}</p>
          <div className="mt-3 flex justify-end">
            <Button
              onClick={() => {
                setSessionNotice(null);
                router.replace('/auth/login');
              }}
              size="sm"
              type="button"
            >
              <LogIn className="h-4 w-4" />
              Login Again
            </Button>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
