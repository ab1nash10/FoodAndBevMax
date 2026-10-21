'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { preferencesQueryKey } from '@/components/preferences/use-preferences';
import { userApi } from '@/lib/api';
import { homeHref } from '@/lib/navigation';

/**
 * Once the user is signed in, opens their start page (homeHref): the one saved in Preferences,
 * else the screen their role uses most. A slow or failed preferences request falls back to the
 * role's screen after 3 s rather than holding the user on a blank page.
 */
export function useGoHomeWhenSignedIn() {
  const { hasPermission, isAuthenticated, isReady } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!isReady || !isAuthenticated || started.current) {
      return;
    }

    started.current = true;

    void (async () => {
      let startPage: string | null = null;

      try {
        const preferences = await Promise.race([
          // Fills the cache the Preferences dialog and theme read, so they don't ask again.
          queryClient.fetchQuery({
            queryFn: async () => (await userApi.getMyPreferences()).data,
            queryKey: preferencesQueryKey,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        startPage = preferences?.startPage ?? null;
      } catch {
        // The role's screen it is.
      }

      router.replace(homeHref(hasPermission, startPage));
    })();
  }, [hasPermission, isAuthenticated, isReady, queryClient, router]);
}
