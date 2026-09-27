import { Button } from '@aahar/ui';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-sm font-semibold uppercase tracking-normal text-teal-700 dark:text-teal-300">
          Page not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950 dark:text-white">
          This page does not exist
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          The page you are looking for may have moved or is no longer available.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
