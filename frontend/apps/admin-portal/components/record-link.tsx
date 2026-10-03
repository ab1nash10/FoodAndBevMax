'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { canOpenPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * A record name or number that links to its page, or plain text when there is nowhere to go
 * (no href) or the user may not open that page.
 */
export function RecordLink({
  children,
  className,
  href,
}: Readonly<{ children: ReactNode; className?: string; href: string | null | undefined }>) {
  const { hasPermission } = useAuth();

  if (!href || !canOpenPath(href, hasPermission)) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      className={cn(
        'rounded-xs underline-offset-2 hover:text-ds-teal-text hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        className,
      )}
      href={href}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

/** Renders its children (a "New …" or "Edit" button) only when the user may open `href`. */
export function IfCanOpen({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  const { hasPermission } = useAuth();

  return canOpenPath(href, hasPermission) ? children : null;
}
