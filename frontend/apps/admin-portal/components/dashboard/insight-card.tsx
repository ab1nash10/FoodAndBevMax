// Usage:
//   <InsightItem cta="See transfers" href="/inventory/transfers?view=ACKNOWLEDGED&date=7d"
//     title="Acknowledgements are 18% faster than the previous week" tone="good" />
// One "what changed" row in the dashboard hero's card, linking to the cause: good (green,
// trending up), warning (amber) or bad (red), each with an icon so the tone never rests on colour.

import { AlertTriangle, ChevronRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { InsightTone } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

const chips: Record<InsightTone, string> = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  good: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  warning: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
};

export function InsightItem({
  cta,
  href,
  title,
  tone,
}: Readonly<{ cta: string; href: string; title: string; tone: InsightTone }>) {
  const Icon = tone === 'good' ? TrendingUp : AlertTriangle;

  return (
    <Link
      className="group flex items-center gap-3 rounded-[14px] p-3 text-ds-text transition hover:bg-ds-selected focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary"
      href={href}
    >
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', chips[tone])}>
        <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        <span className="sr-only">
          {tone === 'good' ? 'Good news' : tone === 'warning' ? 'Warning' : 'Problem'}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold leading-snug">{title}</span>
        <span className="text-xs text-ds-muted">{cta}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-ds-muted transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
