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
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
          Unable to load this page
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Please try again. If the issue continues, contact support.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
