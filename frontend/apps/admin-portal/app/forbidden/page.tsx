import { Button } from '@aahar/ui';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-normal text-slate-950 dark:text-white">
          Permission needed
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          You do not have permission to access this page.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
