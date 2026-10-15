'use client';

import { Button } from '@aahar/ui';
import { CircleAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { authApi, getApiErrorMessage } from '@/lib/api';
import { startPageAfterSignIn } from '@/lib/start-page';
import { MicrosoftMark } from './microsoft-sign-in';

/**
 * Where Microsoft sends the browser back: hands the code to the auth service, which checks it
 * and starts the usual AAHAR session for the user with that email.
 */
export function MicrosoftCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // The code and state are single-use: development mode runs effects twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state');

    if (params.get('error') || !code || !state) {
      setError(
        params.get('error') === 'access_denied'
          ? 'Microsoft sign-in was cancelled.'
          : 'Microsoft did not complete the sign-in. Please try again.',
      );
      return;
    }

    authApi
      .microsoftCallback({ code, state })
      .then(async (response) => {
        signIn(response.data);
        router.replace(await startPageAfterSignIn(response.data.accessToken));
      })
      .catch((reason: unknown) => setError(getApiErrorMessage(reason)));
  }, [params, router, signIn]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ds-page p-6">
      <div className="w-full max-w-md rounded-card border border-ds-border bg-ds-surface p-8 text-center shadow-sm">
        <MicrosoftMark className="mx-auto h-9 w-9" />
        {error ? (
          <>
            <p className="mt-5 flex items-center justify-center gap-2 text-base font-bold text-ds-text">
              <CircleAlert aria-hidden="true" className="h-5 w-5 text-ds-status-bad-fg" />
              Could not sign you in
            </p>
            <p className="mt-2 text-sm text-ds-muted" role="alert">
              {error}
            </p>
            <Button asChild className="mt-6 w-full">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-ds-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Signing you in with Microsoft…
          </p>
        )}
      </div>
    </main>
  );
}
