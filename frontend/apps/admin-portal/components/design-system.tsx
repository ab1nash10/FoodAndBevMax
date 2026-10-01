import { Badge, Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import type { FoodType } from '@aahar/api-client';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ChefHat, Inbox } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface BrandMarkProps {
  collapsed?: boolean;
  className?: string;
}

export function BrandMark({ collapsed = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-ds-teal-border bg-ds-teal-soft p-1.5">
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
          <span className="block text-[17px] font-extrabold leading-5 tracking-[0.02em] text-ds-text">
            AAHAR
          </span>
          <span className="block text-xs font-medium leading-4 text-ds-muted">
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
        'inline-flex h-10 shrink-0 items-center rounded-control border border-ds-border bg-white px-2',
        className,
      )}
    >
      <Image
        alt="Max Healthcare"
        className="h-6 w-auto"
        height={24}
        src={withBasePath('/brand/max-logo.svg')}
        width={82}
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
        <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-ds-text sm:text-[26px]">
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

interface KpiCardProps {
  href?: string;
  icon: LucideIcon;
  label: string;
  loading?: boolean;
  tone?: 'amber' | 'blue' | 'emerald' | 'rose' | 'teal' | 'violet';
  trend?: string;
  value: number | string;
}

// Icon tiles from the concepts; dark mode keeps the portal's existing dark shades.
const toneClasses = {
  amber: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-ds-tile-items-bg text-ds-tile-items-fg dark:bg-sky-950 dark:text-sky-300',
  emerald: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'bg-ds-tile-employees-bg text-ds-tile-employees-fg dark:bg-rose-950 dark:text-rose-300',
  teal: 'bg-ds-tile-locations-bg text-ds-tile-locations-fg dark:bg-teal-950 dark:text-teal-300',
  violet:
    'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg dark:bg-violet-950 dark:text-violet-300',
};

export function KpiCard({
  href,
  icon: Icon,
  label,
  loading,
  tone = 'teal',
  trend,
  value,
}: KpiCardProps) {
  const content = (
    <div className="h-full rounded-tile border border-ds-border bg-ds-subtle-2 p-3.5 transition group-hover:border-ds-primary/30 group-hover:bg-ds-surface group-focus-visible:ring-2 group-focus-visible:ring-ds-primary">
      <div className="flex items-start justify-between gap-3">
        <span className={cn('grid h-9 w-9 place-items-center rounded-control', toneClasses[tone])}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        {href ? (
          <ArrowUpRight
            aria-hidden="true"
            className="h-4 w-4 text-ds-muted transition group-hover:text-ds-link"
          />
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-14" />
      ) : (
        <p className="mt-3 text-2xl font-extrabold leading-none text-ds-text">{value}</p>
      )}
      <p className="mt-1.5 text-sm font-medium text-ds-text-3">{label}</p>
      {trend ? <p className="mt-1 text-xs font-medium text-ds-teal-text">{trend}</p> : null}
    </div>
  );

  return href ? (
    <Link className="group block rounded-tile focus-visible:outline-none" href={href}>
      {content}
    </Link>
  ) : (
    content
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
          <h2 className="text-base font-bold text-ds-text">{title}</h2>
          {description ? <p className="mt-1 text-[13px] text-ds-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children ?? <PlaceholderChart />}</div>
    </Panel>
  );
}

export function PlaceholderChart() {
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

interface MetricTileProps {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
}

export function MetricTile({ icon: Icon = ChefHat, label, value }: MetricTileProps) {
  return (
    <div className="rounded-tile border border-ds-border bg-ds-subtle-2 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ds-text-3">
        <Icon className="h-4 w-4" strokeWidth={1.8} />
        {label}
      </div>
      <div className="mt-3 text-xl font-extrabold text-ds-text">{value}</div>
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
        'rounded-card border border-ds-border bg-ds-surface p-4 shadow-sm shadow-ds-text/[0.04] dark:shadow-none',
        className,
      )}
      {...props}
    >
      <div className="mb-4">
        <h2 className="text-base font-bold text-ds-text">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-ds-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({
  status,
  variant,
}: Readonly<{ status: string; variant?: 'danger' | 'neutral' | 'success' | 'warning' | 'info' }>) {
  const normalizedStatus = status.toLowerCase().replaceAll('_', ' ');
  const inferredVariant =
    variant ??
    (/(active|available|posted|accepted|success|acknowledged)/i.test(status)
      ? 'success'
      : /(inactive|failed|cancelled|rejected|expired|out)/i.test(status)
        ? 'danger'
        : /(pending|near|draft|partial|low)/i.test(status)
          ? 'warning'
          : 'neutral');

  return (
    <Badge variant={inferredVariant}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {normalizedStatus}
    </Badge>
  );
}
