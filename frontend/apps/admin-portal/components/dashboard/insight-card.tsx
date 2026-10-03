// Usage:
//   <InsightCard cta="See transfers" href="/inventory/transfers?view=ACKNOWLEDGED&date=7d"
//     title="Acknowledgements are 18% faster than the previous week" tone="good" />
// A "what changed" card that links to the cause: good (green, trending up), warning (amber)
// or bad (red), each with an icon so the tone never rests on colour alone.

import { AlertTriangle, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { InsightTone } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

const tones: Record<InsightTone, { card: string; text: string }> = {
  bad: { card: 'border-ds-status-bad-fg/20 bg-ds-status-bad-bg', text: 'text-ds-status-bad-fg' },
  good: { card: 'border-ds-status-ok-fg/20 bg-ds-status-ok-bg', text: 'text-ds-status-ok-fg' },
  warning: {
    card: 'border-ds-status-pending-fg/20 bg-ds-status-pending-bg',
    text: 'text-ds-status-pending-fg',
  },
};

export function InsightCard({
  cta,
  href,
  title,
  tone,
}: Readonly<{ cta: string; href: string; title: string; tone: InsightTone }>) {
  const Icon = tone === 'good' ? TrendingUp : AlertTriangle;

  return (
    <Link
      className={cn(
        'flex items-start gap-3 rounded-tile border px-3.5 py-3 text-ds-text transition hover:brightness-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        tones[tone].card,
      )}
      href={href}
    >
      <span
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ds-surface',
          tones[tone].text,
        )}
      >
        <Icon aria-hidden="true" className="h-[15px] w-[15px]" strokeWidth={2} />
        <span className="sr-only">
          {tone === 'good' ? 'Good news' : tone === 'warning' ? 'Warning' : 'Problem'}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-bold leading-[1.35]">{title}</span>
        <span className={cn('text-xs font-bold', tones[tone].text)}>{cta} →</span>
      </span>
    </Link>
  );
}
