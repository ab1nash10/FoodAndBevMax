import { Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { FoodType, InventoryLocationType } from '@aahar/api-client';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Layers,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

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
  /** How many records the page lists, beside the title. */
  count?: number;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
}

/**
 * Page title block: title, description and actions straight on the page background. The
 * breadcrumb above already names the section, so `eyebrow` is only for context it doesn't give
 * (the restaurant an order board belongs to). `icon` is still accepted from older call sites,
 * but not drawn.
 */
export function AppPageHeader({ action, count, description, eyebrow, title }: AppPageHeaderProps) {
  return (
    // No `isolate`: a dialog opened from `action` must not be trapped under the page below.
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div aria-hidden="true" className="page-art" />
      <div className="min-w-0">
        {eyebrow ? <p className="text-[13px] text-ds-muted">{eyebrow}</p> : null}
        <h1 className="mt-0.5 flex items-center gap-3 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ds-text sm:text-[32px]">
          {title}
          {count === undefined ? null : (
            <span className="rounded-full bg-ds-primary-soft px-2.5 py-0.5 font-mono text-[13px] font-medium tracking-normal text-ds-link">
              {count}
            </span>
          )}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-ds-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  );
}

/**
 * The Dashboard's welcome: a large greeting over a soft colour field that drifts slowly, its
 * actions under it, a floating card (`aside`) over the colour on the right, and anything quick to
 * reach below.
 */
export function HeroHeader({
  action,
  aside,
  children,
  description,
  eyebrow,
  title,
}: Readonly<{
  action?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
}>) {
  return (
    <section className="relative isolate overflow-hidden rounded-[28px] border border-ds-border bg-ds-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
      <div aria-hidden="true" className="hero-art" />
      <div className="relative flex flex-col gap-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? <p className="text-[13px] font-medium text-ds-muted">{eyebrow}</p> : null}
          {/* The full title always shows: a long name wraps, it is never cut off. */}
          <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ds-text wrap-anywhere sm:text-[48px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-[15px] leading-6 text-ds-text-3">{description}</p>
          ) : null}
          {action ? <div className="mt-6 flex flex-wrap items-center gap-2.5">{action}</div> : null}
        </div>
        {aside ? <div className="w-full shrink-0 lg:w-[380px]">{aside}</div> : null}
      </div>
      {children ? <div className="relative mt-8">{children}</div> : null}
    </section>
  );
}

export interface QuickTile {
  detail: string;
  href: string;
  icon: LucideIcon;
  title: string;
  tone: 'blue' | 'green' | 'rose' | 'violet';
}

/** Where to go next, as pastel tiles (a hero's quick actions). Pass only tiles the user may open. */
export function QuickTiles({ label, tiles }: Readonly<{ label: string; tiles: QuickTile[] }>) {
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;

          return (
            <li key={tile.href}>
              <Link
                className={cn(
                  'group flex h-full min-h-[108px] flex-col justify-between gap-3 rounded-2xl p-4 text-ds-text ring-1 ring-ds-text/5 transition duration-200 hover:shadow-card-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-link motion-safe:hover:-translate-y-0.5',
                  `tile-${tile.tone}`,
                )}
                href={tile.href}
              >
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-ds-surface/75 text-ds-link shadow-xs">
                  <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-snug">{tile.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ds-text-3">
                    {tile.detail}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export interface Stat {
  /** Marks the stat whose filter the list shows now. */
  active?: boolean;
  label: string;
  /** Picking the stat filters the list to it. */
  onSelect?: () => void;
  /** Its part of the whole, 0–1: drawn as a thin bar under the number in a `rich` strip. */
  share?: number;
  tone?: 'bad' | 'default' | 'ok' | 'pending';
  value: ReactNode;
}

const statDot: Record<NonNullable<Stat['tone']>, string> = {
  bad: 'bg-ds-status-bad-fg',
  default: 'bg-ds-link',
  ok: 'bg-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-fg',
};

// From sm up a stat shows its tone as an icon in a tinted chip; phones keep the dot.
const statIcon: Record<NonNullable<Stat['tone']>, LucideIcon> = {
  bad: AlertTriangle,
  default: Layers,
  ok: CheckCircle2,
  pending: Clock3,
};

const statChip: Record<NonNullable<Stat['tone']>, string> = {
  bad: 'text-ds-status-bad-fg',
  default: 'text-ds-link',
  ok: 'text-ds-status-ok-fg',
  pending: 'text-ds-status-pending-fg',
};

// The same pastel washes as the Dashboard's quick tiles, one per tone.
const statTile: Record<NonNullable<Stat['tone']>, string> = {
  bad: 'tile-rose',
  default: 'tile-blue',
  ok: 'tile-green',
  pending: 'tile-violet',
};

/**
 * The numbers a list is about, above it, as pastel tiles: what is in it at a glance, and a
 * one-click filter to each part. Values load as dashes so the strip never jumps. `rich` adds a
 * soft glow in each tile's tone and a bar for each stat's `share` (being tried on Items).
 */
export function StatStrip({
  label,
  rich = false,
  stats,
}: Readonly<{ label: string; rich?: boolean; stats: Stat[] }>) {
  return (
    // As many columns as stats from md up, so three or four cards always fill the row.
    <div
      aria-label={label}
      className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(var(--stats),minmax(0,1fr))] md:gap-4"
      role="group"
      style={{ '--stats': stats.length } as CSSProperties}
    >
      {stats.map((stat) => {
        const tone = stat.tone ?? 'default';
        const Icon = statIcon[tone];
        const body = (
          <>
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ds-text-2 sm:gap-2.5">
              <span
                aria-hidden="true"
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full sm:hidden', statDot[tone])}
              />
              <span
                aria-hidden="true"
                className={cn(
                  'hidden h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ds-surface/80 shadow-xs sm:grid',
                  statChip[tone],
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              {stat.label}
            </span>
            {/* Sans, not mono: Geist Mono's slashed zero reads as "Ø" this large. */}
            <span className="text-[22px] font-semibold leading-none tracking-[-0.03em] text-ds-text tabular-nums sm:text-[30px]">
              {stat.value}
            </span>
            {rich && stat.share !== undefined ? (
              <span
                aria-hidden="true"
                className="hidden h-1 rounded-full bg-ds-surface/70 sm:block"
              >
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500',
                    statDot[tone],
                  )}
                  style={{ width: `${Math.round(Math.min(Math.max(stat.share, 0), 1) * 100)}%` }}
                />
              </span>
            ) : null}
            {rich ? (
              // A pool of the tile's tone in its corner; behind the text, never over it.
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute -top-10 -right-10 -z-10 h-32 w-32 rounded-full bg-current opacity-20 blur-2xl',
                  statChip[tone],
                )}
              />
            ) : null}
          </>
        );
        // Phones: one short row, the number before its label, so the list starts higher up.
        const box = cn(
          'flex flex-row-reverse items-center justify-end gap-2.5 rounded-2xl px-3 py-2.5 text-left transition duration-200 sm:min-h-[112px] sm:flex-col sm:items-stretch sm:justify-between sm:gap-4 sm:px-[18px] sm:py-4',
          statTile[tone],
          rich && 'relative isolate overflow-hidden',
          // ds-link, not ds-primary: a primary ring would vanish on the dark theme's blue tiles.
          stat.active ? 'ring-2 ring-ds-link shadow-card-hover' : 'ring-1 ring-ds-text/5',
        );

        return stat.onSelect ? (
          <button
            aria-pressed={stat.active ?? false}
            className={cn(
              box,
              'hover:shadow-card-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-link motion-safe:hover:-translate-y-0.5',
            )}
            key={stat.label}
            onClick={stat.onSelect}
            type="button"
          >
            {body}
          </button>
        ) : (
          <div className={box} key={stat.label}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The one look of every list table: quiet sticky header, roomy rows that light up on hover,
 * codes and numbers in mono. Use these instead of per-page class strings.
 */
export const tableStyles = {
  code: 'font-mono text-[12px] text-ds-muted',
  head: 'sticky top-0 z-10 border-b border-ds-divider bg-ds-surface text-left text-[12.5px] text-ds-muted',
  num: 'font-mono tabular-nums',
  /** A secondary column left out on phones, so the ones that matter fit without scrolling. */
  phoneHidden: 'hidden sm:table-cell',
  /** A row the whole of which opens the record. */
  row: 'group cursor-pointer border-t border-ds-divider transition-colors hover:bg-ds-selected',
  table: 'w-full text-[13.5px]',
  td: 'px-4 py-3.5 align-middle',
  th: 'px-4 py-3 font-semibold',
  title: 'font-semibold text-ds-text',
};

const cellDateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
const cellTimeFormatter = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' });

/**
 * A table cell's date with its time under it, so neither is cut off or split mid-time
 * ("13 Oct 2026, 6:56" / "pm") in a narrow column. `note` follows the time.
 */
export function DateTimeCell({
  note,
  title,
  value,
}: Readonly<{ note?: string; title?: string; value: string }>) {
  const date = new Date(value);

  return (
    <span className="block" title={title}>
      <span className="block whitespace-nowrap text-ds-text-2">
        {cellDateFormatter.format(date)}
      </span>
      <span className="block truncate text-[12px] text-ds-muted">
        {cellTimeFormatter.format(date)}
        {note ? ` · ${note}` : null}
      </span>
    </span>
  );
}

/** An icon action at the end of a row: quiet until the row is hovered or it has focus. */
export function RowAction({
  className,
  icon: Icon,
  label,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & { icon: LucideIcon; label: string }
>) {
  return (
    <button
      aria-label={label}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-lg text-ds-muted transition hover:bg-ds-subtle hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        className,
      )}
      title={label.split(' ')[0]}
      type="button"
      {...props}
    >
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

interface ListPagerProps {
  limit: number;
  /** "item" → "of 9 items"; leave out for "of 9". */
  noun?: string;
  onLimitChange?: (limit: number) => void;
  onPageChange: (page: number) => void;
  page: number;
  pageSizes?: readonly number[];
  total: number;
  totalPages: number;
}

/** The one footer every list shares: "1–25 of 132", rows per page when changeable, ‹ ›. */
export function ListPager({
  limit,
  noun,
  onLimitChange,
  onPageChange,
  page,
  pageSizes = [10, 25, 50, 100],
  total,
  totalPages,
}: ListPagerProps) {
  // Nothing to page through: the empty or error message above says why ("0–0 of 0" under a
  // failed load read as "there are none").
  if (total === 0) {
    return null;
  }

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const arrow =
    'grid h-9 w-9 place-items-center rounded-full border border-ds-border bg-ds-surface text-ds-text-2 transition hover:bg-ds-subtle disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ds-divider px-4 py-2.5 text-[13px] text-ds-muted">
      <span>
        <span className="font-mono text-ds-text-2">
          {first}–{last}
        </span>{' '}
        of <span className="font-mono text-ds-text-2">{total}</span>
        {noun ? ` ${total === 1 ? noun : `${noun}s`}` : null}
      </span>
      <span className="flex items-center gap-1.5">
        {onLimitChange ? (
          <label className="mr-1.5 flex items-center gap-1.5">
            Rows
            <select
              className="h-9 rounded-full border border-ds-border bg-ds-surface px-2.5 font-mono text-[13px] text-ds-text"
              onChange={(event) => onLimitChange(Number(event.target.value))}
              value={limit}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          aria-label="Previous page"
          className={arrow}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          aria-label="Next page"
          className={arrow}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        </button>
      </span>
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

const avatarTiles: Record<FoodType, string> = {
  EGGETARIAN: 'tile-amber text-ds-food-egg',
  NON_VEG: 'tile-rose text-ds-status-bad-fg',
  VEG: 'tile-green text-ds-status-ok-fg',
};

/** A record's picture where it has none: its initials on a pastel tile, the food mark on its corner. */
export function RecordAvatar({ foodType, name }: Readonly<{ foodType?: FoodType; name: string }>) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');

  return (
    // Only the initials are hidden from screen readers: the food mark still reads "Veg" etc.
    <span
      className={cn(
        'relative grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[13px] font-semibold ring-1 ring-ds-text/5',
        foodType ? avatarTiles[foodType] : 'tile-blue text-ds-link',
      )}
    >
      <span aria-hidden="true">{initials || '?'}</span>
      {foodType ? (
        <span className="absolute -right-1 -bottom-1 rounded-[5px] bg-ds-surface p-px shadow-xs">
          <FoodTypeMarker type={foodType} />
        </span>
      ) : null}
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
    <div className="grid min-h-40 place-items-center rounded-card border border-dashed border-ds-border bg-ds-subtle-2 p-6 text-center">
      <div>
        <span className="tile-blue mx-auto grid h-12 w-12 place-items-center rounded-2xl text-ds-link">
          <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <h3 className="mt-3.5 text-[15px] font-semibold text-ds-text">{title}</h3>
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

export interface FlowStep {
  label: string;
  /** Leave out for a step that can't be opened yet (one ahead of an unfinished step). */
  onSelect?: () => void;
  state: Exclude<StepState, 'stopped'>;
}

/**
 * The steps of a document being written (New GRN, New transfer, New production): numbered
 * pills joined by a line, the current one highlighted, done ones ticked and clickable to go back.
 */
export function FlowStepper({ label, steps }: Readonly<{ label: string; steps: FlowStep[] }>) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => (
        <li className="flex items-center gap-2" key={step.label}>
          <button
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'inline-flex h-10 items-center gap-2.5 rounded-full py-0 pl-1.5 pr-3.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary disabled:cursor-default',
              step.state === 'current' && 'bg-ds-selected text-ds-link',
              step.state === 'done' && 'text-ds-text hover:bg-ds-subtle',
              step.state === 'todo' && 'text-ds-muted',
            )}
            disabled={!step.onSelect || step.state === 'current'}
            onClick={step.onSelect}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid h-7 w-7 place-items-center rounded-full font-mono text-[13px] font-semibold',
                step.state === 'todo' ? 'bg-ds-divider text-ds-muted' : 'bg-ds-primary text-white',
              )}
            >
              {step.state === 'done' ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                index + 1
              )}
            </span>
            {step.label}
          </button>
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                'hidden h-0.5 w-8 rounded-full sm:block',
                step.state === 'done' ? 'bg-ds-primary' : 'bg-ds-border',
              )}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

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
  current: 'border-ds-primary bg-ds-primary text-white ring-4 ring-ds-primary-soft',
  done: 'border-ds-status-ok-fg bg-ds-status-ok-fg text-white ring-4 ring-ds-status-ok-bg',
  stopped: 'border-ds-status-bad-fg bg-ds-status-bad-bg text-ds-status-bad-fg',
  todo: 'border-ds-input bg-ds-surface text-ds-muted',
};

/** Horizontal progress, for example a GRN going Draft, Under verification, Accepted, Posted. */
export function Stepper({ label, steps }: Readonly<{ label: string; steps: StepItem[] }>) {
  return (
    // Bare: it sits inside a record's header card.
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-3 gap-y-4">
      {steps.map((step, index) => (
        <li
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex min-w-[150px] flex-1 items-center gap-2.5"
          key={step.label}
        >
          <span
            aria-hidden="true"
            className={cn(
              'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold',
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
                step.state === 'done' ? 'bg-ds-status-ok-fg' : 'bg-ds-divider',
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
  done: 'border-ds-primary bg-ds-primary',
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
