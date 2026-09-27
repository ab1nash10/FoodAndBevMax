import { Badge, Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
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
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm shadow-slate-900/10 ring-1 ring-white/70 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-800">
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
          <span className="block text-lg font-semibold leading-5 text-brand-navy dark:text-white">
            AAHAR
          </span>
          <span className="block truncate text-xs font-medium text-slate-500 dark:text-slate-400">
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
        'inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
    >
      <Image
        alt="Max Healthcare"
        className="h-8 w-auto"
        height={32}
        src={withBasePath('/brand/max-logo.svg')}
        width={110}
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

export function AppPageHeader({
  action,
  description,
  eyebrow,
  icon: Icon,
  title,
}: AppPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-mint text-brand-teal ring-1 ring-emerald-100 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900">
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-normal text-brand-teal dark:text-teal-300">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-brand-navy dark:text-white">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
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

const toneClasses = {
  amber:
    'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
  blue: 'bg-blue-50 text-brand-blue ring-blue-100 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
  emerald:
    'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900',
  teal: 'bg-brand-mint text-brand-teal ring-emerald-100 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900',
  violet:
    'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
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
    <Panel className="group h-full p-5 transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md hover:shadow-brand-blue/10 dark:hover:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn('grid h-11 w-11 place-items-center rounded-xl ring-1', toneClasses[tone])}
        >
          <Icon className="h-5 w-5" />
        </span>
        {href ? (
          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-brand-blue" />
        ) : null}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-20" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-normal text-brand-navy dark:text-white">
          {value}
        </p>
      )}
      {trend ? (
        <p className="mt-3 text-xs font-medium text-brand-teal dark:text-teal-300">{trend}</p>
      ) : null}
    </Panel>
  );

  return href ? <Link href={href}>{content}</Link> : content;
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
    <Panel className={cn('p-5', className)} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children ?? <PlaceholderChart />}</div>
    </Panel>
  );
}

export function PlaceholderChart() {
  const bars = [44, 72, 58, 86, 64, 92, 76];

  return (
    <div className="flex h-48 items-end gap-3 rounded-lg border border-dashed border-slate-200 bg-brand-mint/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      {bars.map((height, index) => (
        <div className="flex flex-1 items-end" key={`${height}-${index}`}>
          <div
            className="w-full rounded-t-md bg-brand-blue/80 shadow-sm shadow-brand-blue/10"
            style={{ height: `${height}%` }}
          />
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/55">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-xl font-semibold text-slate-950 dark:text-white">{value}</div>
    </div>
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
    <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-slate-200 bg-brand-mint/50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/50">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-white text-brand-teal shadow-sm dark:bg-slate-950 dark:text-slate-400">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadingSkeleton({ rows = 5 }: Readonly<{ rows?: number }>) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton className="h-12 w-full" key={`loading-skeleton-${index}`} />
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
      {toolbar ? (
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">{toolbar}</div>
      ) : null}
      <div className="overflow-x-auto">{children}</div>
      {footer ? (
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">{footer}</div>
      ) : null}
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
        'rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950',
        className,
      )}
      {...props}
    >
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
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

  return <Badge variant={inferredVariant}>{normalizedStatus}</Badge>;
}
