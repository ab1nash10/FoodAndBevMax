// Usage: <SetupChecklist steps={setupSteps(counts, firsts, canOpen)} />
// "Finish setting up AAHAR": a progress bar and one row per step. Done steps are ticked and
// quiet, the next step is highlighted, and every unfinished step the user may act on links to
// its create page.

import { Check } from 'lucide-react';
import Link from 'next/link';
import type { SetupStep } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

export function SetupChecklist({ steps }: Readonly<{ steps: SetupStep[] }>) {
  const done = steps.filter((step) => step.done).length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <section
      aria-labelledby="setup-heading"
      className="overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-3.5 pt-[18px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-extrabold text-ds-text" id="setup-heading">
            Finish setting up AAHAR
          </h2>
          <p className="text-[13px] text-ds-muted">
            {done} of {steps.length} done · menus and prices unlock restaurant ordering and stock
            valuation
          </p>
        </div>
        <div className="flex min-w-[220px] flex-[0_1_300px] items-center gap-3">
          <div
            aria-label="Setup progress"
            aria-valuemax={steps.length}
            aria-valuemin={0}
            aria-valuenow={done}
            className="h-2 flex-1 overflow-hidden rounded-full bg-ds-status-neutral-bg"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-ds-chart-full"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[13px] font-extrabold tabular-nums text-ds-text">{percent}%</span>
        </div>
      </div>
      <ul className="grid border-t border-ds-divider grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {steps.map((step) => (
          <li
            className={cn(
              'flex items-center gap-3 border-b border-ds-divider px-5 py-3',
              step.doing ? 'bg-ds-status-pending-bg' : 'bg-ds-surface',
            )}
            key={step.key}
          >
            <span
              className={cn(
                'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2',
                step.done
                  ? 'border-ds-chart-full bg-ds-chart-full text-white'
                  : step.doing
                    ? 'border-ds-chart-partial bg-ds-surface text-ds-chart-partial'
                    : 'border-ds-ring bg-ds-surface',
              )}
            >
              {step.done ? (
                <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
              ) : step.doing ? (
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              ) : null}
              <span className="sr-only">
                {step.done ? 'Done' : step.doing ? 'Next step' : 'To do'}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span
                className={cn(
                  'text-[13.5px] font-bold',
                  step.done ? 'text-ds-text-3' : 'text-ds-text',
                )}
              >
                {step.title}
              </span>
              <span className="text-xs text-ds-muted">{step.detail}</span>
            </span>
            {step.cta ? (
              <Link
                className="inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-ds-primary bg-ds-primary px-3 text-[12.5px] font-bold text-white transition hover:bg-ds-primary-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2"
                href={step.cta.href}
              >
                {step.cta.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
