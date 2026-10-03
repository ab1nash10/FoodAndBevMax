'use client';

import type { UserPreferences, UserPreferencesInput } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import { userApi } from '@/lib/api';

export const preferencesQueryKey = ['my-preferences'] as const;

/** The signed-in user's saved preferences. Sign-in and sign-out clear the query cache. */
export function usePreferences() {
  const { isAuthenticated } = useAuth();

  return useQuery<UserPreferences>({
    enabled: isAuthenticated,
    queryFn: async () => (await userApi.getMyPreferences()).data,
    queryKey: preferencesQueryKey,
    staleTime: 5 * 60_000,
  });
}

export function useSavePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UserPreferencesInput) =>
      (await userApi.updateMyPreferences(body)).data,
    onSuccess(preferences) {
      queryClient.setQueryData(preferencesQueryKey, preferences);
    },
  });
}

/**
 * Applies the account's saved theme on this device. Only a change in the saved value is
 * applied, so it never fights a local switch made through the header button.
 */
export function useApplyThemePreference() {
  const { data } = usePreferences();
  const { setTheme } = useTheme();
  const applied = useRef<string | null>(null);
  const savedTheme = data?.theme ?? null;

  useEffect(() => {
    if (savedTheme && savedTheme !== applied.current) {
      applied.current = savedTheme;
      setTheme(savedTheme);
    }
  }, [savedTheme, setTheme]);
}
