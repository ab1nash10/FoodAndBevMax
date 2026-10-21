'use client';

// Usage: <SetupChecklist steps={setupSteps(counts, firsts, canOpen)} />
// "Finish setting up <location>" (AAHAR for All Locations): a progress bar and one row per step.
// Done steps are ticked and quiet, the next step is highlighted, and every unfinished step the
// user may act on links to its create page. From 80% done it folds to one line (a progress
// ring, the next step and its button) that expands back to the full list.

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useLocationName } from '@/components/location-empty-states';
import type { SetupStep } from '@/lib/dashboard-stats';
import { cn } from '@/lib/utils';

const ctaClass =
  'inline-flex h-8 items-center whitespace-nowrap rounded-lg border border-ds-primary bg-ds-primary px-3 text-[12.5px] font-bold text-white transition hover:bg-ds-primary-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2';

const toggleClass =
  'inline-flex h-8 items-center whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-bold text-ds-primary transition hover:bg-ds-primary-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';

export function SetupChecklist({ steps }: Readonly<{ steps: SetupStep[] }>) {
  const [expanded, setExpanded] = useState(false);
  const done = steps.filter((step) => step.done).length;
  const foldable = steps.length > 0 && done / steps.length >= 0.8;

  if (foldable && !expanded) {
    return <SetupSummary done={done} onExpand={() => setExpanded(true)} steps={steps} />;
  }

  return (
    <FullChecklist
      done={done}
      onCollapse={foldable ? () => setExpanded(false) : undefined}
      steps={steps}
    />
  );
}

/** The folded checklist: a ring with "9/10", what is left, what is done, and the next step. */
function SetupSummary({
  done,
  onExpand,
  steps,
}: Readonly<{ done: number; onExpand: () => void; steps: SetupStep[] }>) {
  const left = steps.length - done;
  const next = steps.find((step) => step.doing);
  const percent = Math.round((done / steps.length) * 100);

  return (
    <section
      aria-labelledby="setup-heading"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-ds-border bg-ds-surface px-5 py-3.5 shadow-card"
    >
      <div
        aria-label="Setup progress"
        aria-valuemax={steps.length}
        aria-valuemin={0}
        aria-valuenow={done}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
        role="progressbar"
        style={{
          background: `conic-gradient(var(--color-ds-primary) ${percent}%, var(--color-ds-primary-soft) 0)`,
        }}
      >
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-ds-surface font-mono text-[11px] font-bold text-ds-text">
          {done}/{steps.length}
        </span>
      </div>
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <h2 className="text-[14.5px] font-semibold text-ds-text" id="setup-heading">
          {left === 1 && next ? `One setup step left: ${next.title}` : `${left} setup steps left`}
        </h2>
        <p className="truncate text-[12.5px] text-ds-muted">
          Done:{' '}
          {steps
            .filter((step) => step.done)
            .map((step) => step.title)
            .join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {next?.cta ? (
          <Link className={ctaClass} href={next.cta.href}>
            {next.cta.label}
          </Link>
        ) : null}
        <button aria-expanded={false} className={toggleClass} onClick={onExpand} type="button">
          Show all steps
        </button>
      </div>
    </section>
  );
}

function FullChecklist({
  done,
  onCollapse,
  steps,
}: Readonly<{ done: number; onCollapse?: () => void; steps: SetupStep[] }>) {
  const locationName = useLocationName();
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <section
      aria-labelledby="setup-heading"
      className="overflow-hidden rounded-card border border-ds-border bg-ds-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-3.5 pt-[18px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold text-ds-text" id="setup-heading">
            Finish setting up {locationName ?? 'AAHAR'}
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
            <div className="h-full rounded-full bg-ds-primary" style={{ width: `${percent}%` }} />
          </div>
          <span className="font-mono text-[13px] font-extrabold text-ds-text">{percent}%</span>
          {onCollapse ? (
            <button aria-expanded className={toggleClass} onClick={onCollapse} type="button">
              Show less
            </button>
          ) : null}
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
                  ? 'border-ds-primary bg-ds-primary text-white'
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
              <Link className={ctaClass} href={step.cta.href}>
                {step.cta.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
