import { Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { FoodType, InventoryLocationType } from '@aahar/api-client';
import type { LucideIcon } from 'lucide-react';
import { Check, Inbox, X } from 'lucide-react';
import Image from 'next/image';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface BrandMarkProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandMark({ collapsed = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control-lg border border-ds-border bg-ds-logo-chip p-1.5">
        <Image
          alt="AAHAR"
          className="h-full w-full object-contain"
          height={44}
          src={withBasePath('/brand/aahar-logo.png')}
          width={44}
        />
      </span>
      {!collapsed ? (
        <span className="min-w-0">
          <span className="block text-[15px] font-extrabold leading-5 tracking-[0.08em] text-ds-text">
            AAHAR
          </span>
          <span className="block truncate text-[11.5px] leading-4 text-ds-muted">
            Food & Cafeteria Platform
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function MaxHealthcareMark({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center rounded-control bg-ds-logo-chip px-2 py-1.5',
        className,
      )}
    >
      <Image
        alt="Max Healthcare"
        className="h-5 w-auto"
        height={58}
        src={withBasePath('/brand/max-logo.svg')}
        width={168}
      />
    </div>
  );
}

interface AppPageHeaderProps {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
}

/**
 * Page title block from the UI concepts: eyebrow, title, description and actions straight on
 * the page background. `icon` is still accepted from older call sites, but the concepts show no
 * icon here, so it is not drawn.
 */
export function AppPageHeader({ action, description, eyebrow, title }: AppPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ds-teal-text">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-[-0.01em] text-ds-text">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-ds-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  );
}

interface ChartCardProps extends ComponentPropsWithoutRef<'section'> {
  action?: ReactNode;
  children?: ReactNode;
  description?: string;
  title: string;
}

export function ChartCard({
  action,
  children,
  className,
  description,
  title,
  ...props
}: ChartCardProps) {
  return (
    <Panel className={cn('p-4', className)} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
          {description ? <p className="mt-1 text-[13px] text-ds-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children ?? <PlaceholderChart />}</div>
    </Panel>
  );
}

function PlaceholderChart() {
  const bars = [44, 72, 58, 86, 64, 92, 76];

  return (
    <div className="flex h-48 items-end gap-3 rounded-tile border border-dashed border-ds-border bg-ds-subtle p-4">
      {bars.map((height, index) => (
        <div className="flex flex-1 items-end" key={`${height}-${index}`}>
          <div className="w-full rounded-t-md bg-ds-primary/80" style={{ height: `${height}%` }} />
        </div>
      ))}
    </div>
  );
}

const foodTypeLabels: Record<FoodType, string> = {
  EGGETARIAN: 'Egg',
  NON_VEG: 'Non-veg',
  VEG: 'Veg',
};

/** Veg / non-veg / egg mark from the menu concept: a square with a dot or a triangle. */
export function FoodTypeMarker({ type }: Readonly<{ type: FoodType }>) {
  return (
    <span
      aria-label={foodTypeLabels[type]}
      className={cn(
        'inline-grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-2',
        type === 'VEG' && 'border-ds-food-veg',
        type === 'NON_VEG' && 'border-ds-food-non-veg',
        type === 'EGGETARIAN' && 'border-ds-food-egg',
      )}
      role="img"
      title={foodTypeLabels[type]}
    >
      {type === 'NON_VEG' ? (
        <span className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent border-b-ds-food-non-veg" />
      ) : (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            type === 'VEG' ? 'bg-ds-food-veg' : 'bg-ds-food-egg-dot',
          )}
        />
      )}
    </span>
  );
}

interface EmptyStateProps {
  action?: ReactNode;
  description?: string;
  icon?: LucideIcon;
  title: string;
}

export function EmptyState({ action, description, icon: Icon = Inbox, title }: EmptyStateProps) {
  return (
    <div className="grid min-h-36 place-items-center rounded-tile border border-dashed border-ds-border bg-ds-subtle p-5 text-center">
      <div>
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-tile bg-ds-surface text-ds-teal-text ring-1 ring-ds-border">
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <h3 className="mt-3 text-sm font-bold text-ds-text">{title}</h3>
        {description ? <p className="mt-1 text-sm text-ds-muted">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton className="h-10 w-full" key={`loading-skeleton-${index}`} />
      ))}
    </div>
  );
}

interface DataTableWrapperProps extends ComponentPropsWithoutRef<'div'> {
  footer?: ReactNode;
  toolbar?: ReactNode;
}

export function DataTableWrapper({
  children,
  className,
  footer,
  toolbar,
  ...props
}: DataTableWrapperProps) {
  return (
    <Panel className={cn('overflow-hidden', className)} {...props}>
      {toolbar ? <div className="border-b border-ds-divider p-4">{toolbar}</div> : null}
      <div className="overflow-x-auto">{children}</div>
      {footer ? <div className="border-t border-ds-divider p-4">{footer}</div> : null}
    </Panel>
  );
}

interface FormSectionProps extends ComponentPropsWithoutRef<'section'> {
  children: ReactNode;
  description?: string;
  title: string;
}

export function FormSection({
  children,
  className,
  description,
  title,
  ...props
}: FormSectionProps) {
  return (
    <section
      className={cn(
        'rounded-card border border-ds-border bg-ds-surface p-4 shadow-card',
        className,
      )}
      {...props}
    >
      <div className="mb-4">
        <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-ds-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const statusToneClasses: Record<StatusTone, string> = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
};

/**
 * Dot + label chip for any transfer, acknowledgement, GRN, production or stock status (see
 * lib/status.ts). The label always carries the meaning, so colour is never the only cue.
 */
export function StatusChip({
  className,
  label,
  long = false,
  status,
}: Readonly<{ className?: string; label?: string; long?: boolean; status: string }>) {
  const presentation = statusPresentation(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold',
        statusToneClasses[presentation.tone],
        className,
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label ?? (long ? (presentation.long ?? presentation.label) : presentation.label)}
    </span>
  );
}

const typeTagClasses: Record<InventoryLocationType, string> = {
  COUNTER: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  KITCHEN: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  RESTAURANT: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
  STORE: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
};

/** Small STORE / KITCHEN / RESTAURANT / COUNTER tag in front of a location name. */
export function TypeTag({ type }: Readonly<{ type: InventoryLocationType }>) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-[5px] px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.04em]',
        typeTagClasses[type],
      )}
    >
      {type}
    </span>
  );
}

export type StepState = 'current' | 'done' | 'stopped' | 'todo';

export interface StepItem {
  /** Second line: a time, a person or what the step does. */
  detail?: string;
  label: string;
  state: StepState;
}

const stepStateLabels: Record<StepState, string> = {
  current: 'in progress',
  done: 'done',
  stopped: 'stopped',
  todo: 'not started',
};

const stepMarkClasses: Record<StepState, string> = {
  current: 'border-ds-status-info-fg bg-ds-status-info-bg text-ds-status-info-fg',
  done: 'border-ds-teal bg-ds-teal text-white',
  stopped: 'border-ds-status-bad-fg bg-ds-status-bad-bg text-ds-status-bad-fg',
  todo: 'border-ds-input bg-ds-surface text-ds-muted',
};

/** Horizontal progress, for example a GRN going Draft, Under verification, Accepted, Posted. */
export function Stepper({ label, steps }: Readonly<{ label: string; steps: StepItem[] }>) {
  return (
    <ol
      aria-label={label}
      className="flex flex-wrap items-center gap-2 rounded-card border border-ds-border bg-ds-surface px-4 py-3 shadow-card"
    >
      {steps.map((step, index) => (
        <li
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex min-w-[150px] flex-1 items-center gap-2"
          key={step.label}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold',
              stepMarkClasses[step.state],
            )}
          >
            {step.state === 'done' ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : step.state === 'stopped' ? (
              <X className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              index + 1
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                'text-[13px] font-bold',
                step.state === 'todo' ? 'text-ds-text-3' : 'text-ds-text',
              )}
            >
              {step.label}
              <span className="sr-only"> ({stepStateLabels[step.state]})</span>
            </span>
            {step.detail ? (
              <span className="text-[11.5px] text-ds-muted">{step.detail}</span>
            ) : null}
          </span>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                'h-0.5 min-w-4 flex-1 rounded-full',
                step.state === 'done' ? 'bg-ds-teal' : 'bg-ds-divider',
              )}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const timelineDotClasses: Record<StepState, string> = {
  current: 'border-ds-stage-preparing bg-ds-stage-preparing',
  done: 'border-ds-teal bg-ds-teal',
  stopped: 'border-ds-status-bad-fg bg-ds-status-bad-fg',
  todo: 'border-ds-input bg-ds-surface',
};

/** Vertical history: a dot per step, joined by a line. */
export function Timeline({ label, steps }: Readonly<{ label?: string; steps: StepItem[] }>) {
  return (
    <ol aria-label={label}>
      {steps.map((step, index) => (
        <li className="flex gap-2.5" key={step.label}>
          <div className="flex w-3 flex-col items-center">
            <span
              aria-hidden="true"
              className={cn(
                'mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border-2',
                timelineDotClasses[step.state],
              )}
            />
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="min-h-[18px] w-0.5 flex-1 bg-ds-divider" />
            ) : null}
          </div>
          <div className="pb-3">
            <p
              className={cn(
                'text-[12.5px] font-bold',
                step.state === 'stopped'
                  ? 'text-ds-status-bad-fg'
                  : step.state === 'todo'
                    ? 'text-ds-muted'
                    : 'text-ds-text',
              )}
            >
              {step.label}
              <span className="sr-only"> ({stepStateLabels[step.state]})</span>
            </p>
            {step.detail ? <p className="text-[11.5px] text-ds-muted">{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Keyboard shortcut keys, for example Ctrl + K. */
export function KeyboardHint({
  className,
  keys,
}: Readonly<{ className?: string; keys: string[] }>) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {keys.map((key) => (
        <kbd
          className="rounded-[6px] border border-ds-border bg-ds-subtle px-1.5 py-0.5 font-sans text-[11px] font-bold leading-none text-ds-text-3"
          key={key}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** Side card with a title, label/value rows and anything else below them. */
export function SummaryCard({
  children,
  className,
  rows,
  sticky = false,
  title,
}: Readonly<{
  children?: ReactNode;
  className?: string;
  rows?: Array<{ label: string; value: ReactNode }>;
  sticky?: boolean;
  title: string;
}>) {
  return (
    <aside
      aria-label={title}
      className={cn(
        'flex flex-col gap-3.5 rounded-card border border-ds-border bg-ds-surface p-4 shadow-card',
        sticky && 'nav:sticky nav:top-20',
        className,
      )}
    >
      <h2 className="text-[15px] font-extrabold text-ds-text">{title}</h2>
      {rows?.length ? (
        <dl className="space-y-2 rounded-tile bg-ds-subtle p-3 text-[13px]">
          {rows.map((row) => (
            <div className="flex justify-between gap-2" key={row.label}>
              <dt className="text-ds-muted">{row.label}</dt>
              <dd className="text-right font-bold tabular-nums text-ds-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </aside>
  );
}
