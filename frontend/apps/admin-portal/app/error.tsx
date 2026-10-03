'use client';

import { Button } from '@aahar/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error('AAHAR page error', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-ds-border bg-white p-8 text-center shadow-xl shadow-ds-text/10">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ds-status-pending-bg text-ds-status-pending-fg">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-normal text-ds-text dark:text-white">
          Unable to load this page
        </h1>
        <p className="mt-3 text-sm leading-6 text-ds-text-3">
          Please try again. If the issue continues, contact support.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-lg bg-ds-subtle px-3 py-2 text-xs font-medium text-ds-muted">
            Error ID: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset} type="button">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
