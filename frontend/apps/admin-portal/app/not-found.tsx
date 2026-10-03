'use client';

import { Button } from '@aahar/ui';
import { LayoutDashboard, SearchX } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/auth-provider';
import { EmptyState } from '@/components/design-system';
import { getBreadcrumbTrail } from '@/lib/navigation';

// Every unmatched path (still a 404), inside the shell: the sidebar stays and the breadcrumb
// falls back to the nearest known parent, which is also where "Back" goes.
export default function NotFoundPage() {
  return (
    <AdminShell>
      <NotFoundContent />
    </AdminShell>
  );
}

function NotFoundContent() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const parent = getBreadcrumbTrail(pathname, null, hasPermission)
    .slice(0, -1)
    .reverse()
    .find((crumb) => crumb.href);

  return (
    <section className="py-10">
      <EmptyState
        action={
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {parent?.href && parent.href !== '/dashboard' ? (
              <Button asChild>
                <Link href={parent.href}>Back to {parent.label}</Link>
              </Button>
            ) : null}
            <Button asChild variant={parent?.href === '/dashboard' ? 'default' : 'outline'}>
              <Link href="/dashboard">
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                Go to Dashboard
              </Link>
            </Button>
          </div>
        }
        description="This address does not match a page. It may have moved, or the link is mistyped."
        icon={SearchX}
        title="Page not found"
      />
    </section>
  );
}
