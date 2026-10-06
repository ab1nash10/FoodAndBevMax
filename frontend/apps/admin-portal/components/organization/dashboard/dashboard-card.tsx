'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/design-system';
import { cn } from '@/lib/utils';
import { Button } from '@aahar/ui';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** A dashboard card: heading, optional subtitle and action, then a body that fills the card. */
export function DashboardCard({
  action,
  children,
  className,
  id,
  subtitle,
  title,
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id: string;
  subtitle?: ReactNode;
  title: string;
}>) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[15px] font-extrabold text-ds-text" id={id}>
            {title}
          </h2>
          {subtitle ? <p className="text-[12.5px] text-ds-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A failed source: what happened and a way to try again. */
export function CardError({ onRetry }: Readonly<{ onRetry: () => unknown }>) {
  return (
    <EmptyState
      action={
        <Button onClick={() => void onRetry()} size="sm" type="button" variant="outline">
          Try again
        </Button>
      }
      description="The numbers could not be loaded. Check the connection and try again."
      icon={AlertTriangle}
      title="Could not load this"
    />
  );
}

/** A whole card whose source failed. */
export function ErrorCard({ onRetry, title }: Readonly<{ onRetry: () => unknown; title: string }>) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-ds-border bg-ds-surface px-[18px] py-4 shadow-card"
    >
      <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
      <CardError onRetry={onRetry} />
    </section>
  );
}

/** A link inside running text (counts in subtitles): looks like text, underlines on hover. */
export function InlineLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <Link
      className="rounded-sm font-bold text-ds-link underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      {children}
    </Link>
  );
}

export function SectionLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <Link
      className="inline-flex min-h-8 items-center gap-1 rounded-control px-2 text-[12.5px] font-bold text-ds-link hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      {children}
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
    </Link>
  );
}
