'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { authApi, getApiErrorMessage } from '@/lib/api';

/** Microsoft's four-square mark, as its sign-in buttons show it. */
export function MicrosoftMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 21 21">
      <rect fill="#F25022" height="10" width="10" x="0" y="0" />
      <rect fill="#7FBA00" height="10" width="10" x="11" y="0" />
      <rect fill="#00A4EF" height="10" width="10" x="0" y="11" />
      <rect fill="#FFB900" height="10" width="10" x="11" y="11" />
    </svg>
  );
}

/**
 * "Sign in with Microsoft", shown only when the server has it set up. Sends the browser to
 * Microsoft; it comes back to /auth/microsoft/callback.
 */
export function MicrosoftSignIn({ disabled }: Readonly<{ disabled?: boolean }>) {
  const { showToast } = useToast();
  const config = useQuery({
    queryFn: async () => (await authApi.microsoftConfig()).data,
    queryKey: ['auth', 'microsoft-config'],
    retry: false,
    staleTime: 5 * 60_000,
  });
  const start = useMutation({
    mutationFn: async () => (await authApi.microsoftAuthorize()).data.url,
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Microsoft sign-in',
        variant: 'error',
      });
    },
    onSuccess(url) {
      window.location.assign(url);
    },
  });

  if (!config.data?.enabled) return null;

  // Stays busy after success too: the browser is on its way to Microsoft.
  const busy = start.isPending || start.isSuccess;

  return (
    <>
      <div
        aria-hidden="true"
        className="flex items-center gap-3 text-[12px] font-semibold text-ds-muted"
      >
        <span className="h-px flex-1 bg-ds-border" />
        or
        <span className="h-px flex-1 bg-ds-border" />
      </div>
      <button
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-ds-input bg-ds-surface text-[14.5px] font-bold text-ds-text transition hover:bg-ds-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:opacity-60"
        disabled={disabled || busy}
        onClick={() => start.mutate()}
        type="button"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
        ) : (
          <MicrosoftMark className="h-5 w-5" />
        )}
        Sign in with Microsoft
      </button>
    </>
  );
}
