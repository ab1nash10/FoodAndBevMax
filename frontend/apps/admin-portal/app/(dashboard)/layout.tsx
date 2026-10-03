import { AdminShell } from '@/components/admin-shell';
import { Suspense, type ReactNode } from 'react';

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Lists keep their filters in the URL (useSearchParams), which needs a Suspense boundary.
  return (
    <AdminShell>
      <Suspense>{children}</Suspense>
    </AdminShell>
  );
}
