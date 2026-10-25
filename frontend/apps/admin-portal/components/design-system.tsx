import { Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { FoodType, InventoryLocationType } from '@aahar/api-client';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
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
      <div className="min-w-0">
        {eyebrow ? <p className="text-[13px] font-medium text-ds-muted">{eyebrow}</p> : null}
        <h1 className="mt-0.5 flex items-center gap-2.5 text-[28px] font-semibold leading-[34px] tracking-[-0.015em] text-ds-text">
          {title}
          {count === undefined ? null : (
            <span className="rounded-full bg-ds-primary-soft px-[9px] py-0.5 text-xs font-medium tracking-normal text-ds-link tabular-nums">
              {count}
            </span>
          )}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-5 text-ds-text-2">{description}</p>
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
  children,
  description,
  eyebrow,
  title,
}: Readonly<{
  action?: ReactNode;
  /** The hero's right side: its quick tiles. */
  children?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
}>) {
  return (
    // The Dashboard's hero: brand blue easing into violet, two soft circles for depth.
    <section className="relative isolate overflow-hidden rounded-[28px] bg-[linear-gradient(105deg,#0b57a4_0%,#327ad9_60%,#8c80fa_100%)] px-5 py-5 text-white shadow-[0_30px_60px_-30px_rgb(11_87_164/0.6)] sm:px-9 sm:py-8">
      <span
        aria-hidden="true"
        className="absolute left-[62%] top-[-120px] -z-10 h-[300px] w-[300px] rounded-full bg-white/10"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-[-110px] right-[-40px] -z-10 h-[220px] w-[220px] rounded-full bg-white/8"
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/85">
              {eyebrow}
            </p>
          ) : null}
          {/* The full title always shows: a long name wraps, it is never cut off. */}
          <h1 className="mt-2 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-white wrap-anywhere sm:mt-2.5 sm:text-[40px] sm:leading-[1.15]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2.5 text-[15px] leading-6 text-white/90">{description}</p>
          ) : null}
          {action ? <div className="mt-5 flex flex-wrap items-center gap-2.5">{action}</div> : null}
        </div>
        {children ? <div className="min-w-0 lg:shrink-0">{children}</div> : null}
      </div>
    </section>
  );
}

export interface QuickTile {
  /** Work waiting there now: a badge ("2 waiting"), or "All done" at 0. Undefined: no badge. */
  count?: number;
  /** What the count is, e.g. "to verify"; "waiting" by default. */
  countLabel?: string;
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
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 lg:*:w-[150px] 2xl:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;

          return (
            <li key={tile.href}>
              <Link
                className={cn(
                  'group flex h-full min-h-[118px] flex-col justify-between gap-4 rounded-[20px] p-4 text-ds-text ring-1 ring-ds-text/5 transition duration-150 hover:shadow-card-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-link motion-safe:hover:-translate-y-0.5',
                  `tile-${tile.tone}`,
                )}
                href={tile.href}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-ds-surface text-ds-link shadow-xs">
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  </span>
                  {tile.count ? (
                    <span className="rounded-full bg-ds-status-pending-bg px-2 py-0.5 text-xs font-bold tabular-nums whitespace-nowrap text-ds-status-pending-fg">
                      {tile.count} {tile.countLabel ?? 'waiting'}
                    </span>
                  ) : tile.count === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ds-surface/75 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ds-status-ok-fg">
                      <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                      All done
                    </span>
                  ) : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-snug">{tile.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ds-text-3">
                    {tile.detail}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
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
  /** Its icon on a `rich` card. */
  icon?: LucideIcon;
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

const richTile: Record<NonNullable<Stat['tone']>, string> = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  default: 'bg-ds-primary-soft text-ds-link',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
};

/**
 * The numbers a list is about, above it, as one slim row of filter pills: each part of the
 * list with its count, a click away. They look like what they are (buttons) and leave the list
 * near the top. Values load as dashes so the row never jumps. `rich`: stage cards instead (icon,
 * big number, label), for a list whose stages are the point (Transfers). `share` is kept for
 * callers but no longer drawn.
 */
export function StatStrip({
  label,
  rich = false,
  stats,
}: Readonly<{ label: string; rich?: boolean; stats: Stat[] }>) {
  if (rich) {
    return (
      <div aria-label={label} className="flex flex-wrap gap-3" role="group">
        {stats.map((stat) => {
          const tone = stat.tone ?? 'default';
          const Icon = stat.icon;
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                  richTile[tone],
                )}
              >
                {Icon ? (
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                ) : (
                  <span className={cn('h-2.5 w-2.5 rounded-full', statDot[tone])} />
                )}
              </span>
              <span className="flex min-w-0 flex-col text-left">
                <span className="text-[28px] font-semibold leading-[34px] tabular-nums text-ds-text">
                  {stat.value}
                </span>
                <span className="text-[13px] leading-4 text-ds-text-2">{stat.label}</span>
              </span>
            </>
          );
          const box = cn(
            'flex min-w-[150px] flex-1 items-center gap-3 rounded-[18px] border bg-ds-surface py-3 pl-3 pr-3 shadow-card sm:pr-5 transition-colors duration-150 sm:flex-none',
            stat.active
              ? 'border-ds-primary ring-1 ring-inset ring-ds-primary'
              : 'border-ds-border',
          );

          return stat.onSelect ? (
            <button
              aria-pressed={stat.active ?? false}
              className={cn(
                box,
                'cursor-pointer hover:border-ds-primary-border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-link',
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

  return (
    <div
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-[22px] bg-ds-subtle p-1 ring-1 ring-ds-border"
      role="group"
    >
      {stats.map((stat) => {
        const tone = stat.tone ?? 'default';
        const body = (
          <>
            <span
              aria-hidden="true"
              className={cn('h-2 w-2 shrink-0 rounded-full', statDot[tone])}
            />
            <span className="whitespace-nowrap">{stat.label}</span>
            {/* Sans, not mono: Geist Mono's slashed zero reads as "Ø". */}
            <span
              className={cn(
                'min-w-6 rounded-full px-1.5 text-center text-xs font-medium tabular-nums',
                stat.active ? 'bg-ds-primary-soft text-ds-link' : 'text-ds-muted',
              )}
            >
              {stat.value}
            </span>
          </>
        );
        const box = cn(
          'inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-2 text-[13.5px] font-medium transition-[background-color,box-shadow,color] duration-150',
          // ds-link, not ds-primary: a primary ring would vanish on the dark theme's blue tiles.
          stat.active ? 'bg-ds-surface text-ds-text shadow-card' : 'text-ds-text-2',
        );

        return stat.onSelect ? (
          <button
            aria-pressed={stat.active ?? false}
            className={cn(
              box,
              'cursor-pointer hover:text-ds-text focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-link pointer-coarse:h-11',
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
  // v3: a tinted header band, so the columns read at a glance.
  head: 'sticky top-0 z-10 border-y border-ds-border bg-ds-subtle text-left text-[12px] text-ds-muted',
  num: 'font-mono tabular-nums',
  /** A secondary column left out on phones, so the ones that matter fit without scrolling. */
  phoneHidden: 'hidden sm:table-cell',
  /** A row the whole of which opens the record. */
  row: 'row-accent group cursor-pointer border-t border-ds-divider transition-colors duration-150 hover:bg-ds-subtle',
  table: 'w-full text-[13.5px]',
  td: 'px-4 py-3.5 align-middle first:pl-6',
  th: 'px-4 py-2.5 font-medium first:pl-6',
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

// The pastel washes of the stat tiles, each with a readable ink.
const avatarTiles = [
  'tile-blue text-ds-link',
  'tile-violet text-violet-700 dark:text-violet-300',
  'tile-rose text-ds-status-bad-fg',
  'tile-green text-ds-status-ok-fg',
  'tile-amber text-ds-food-egg',
];

/**
 * A record's picture where it has none: its initials on a pastel tile picked by its name (so a
 * record keeps its colour everywhere), the food mark on its corner.
 */
export function RecordAvatar({
  foodType,
  name,
  size = 'md',
}: Readonly<{ foodType?: FoodType; name: string; size?: 'md' | 'sm' }>) {
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
        'record-avatar relative grid shrink-0 place-items-center font-semibold ring-1 ring-ds-text/5 transition-transform duration-150',
        // sm: beside a second line in a busy row (a GRN's store and vendor, a transfer's ends).
        size === 'sm' ? 'h-8 w-8 rounded-[10px] text-[11.5px]' : 'h-10 w-10 rounded-xl text-[13px]',
        avatarTiles[
          [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % avatarTiles.length
        ],
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

const progressTones = {
  bad: 'bg-ds-status-bad-fg',
  default: 'bg-ds-link',
  ok: 'bg-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-fg',
} as const;

/**
 * How far along a record is, inside its list row: a short line of text over a thin bar ("97%
 * accepted", "4 of 6 received", "12 days left"). `value` is 0–1. From data the row already has,
 * so it costs no request.
 */
export function InlineProgress({
  label,
  tone = 'default',
  value,
}: Readonly<{ label: string; tone?: keyof typeof progressTones; value: number }>) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);

  return (
    <span className="mt-1.5 block w-full max-w-36">
      <span className="block text-[11.5px] leading-4 text-ds-muted tabular-nums">{label}</span>
      <span
        aria-hidden="true"
        className="mt-1 block h-1 overflow-hidden rounded-full bg-ds-divider"
      >
        <span
          className={cn('block h-full rounded-full', progressTones[tone])}
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  );
}

/**
 * A row's "Open ›": shows when the row is hovered or it has focus (always on touch screens, which
 * have no hover), so a list reads clean but its next step is one obvious click.
 */
export function RowOpen({
  className,
  label,
  nextStep = false,
  text = 'Open',
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    label: string;
    /** The row is waiting on the user ("Verify", "Acknowledge"): always shown, filled. */
    nextStep?: boolean;
    text?: string;
  }
>) {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex h-8 items-center gap-0.5 rounded-full px-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-[opacity,background-color] duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        nextStep
          ? 'bg-ds-primary-soft text-ds-link hover:bg-ds-primary hover:text-white'
          : 'text-ds-link opacity-0 group-hover:opacity-100 hover:bg-ds-primary-soft focus-visible:opacity-100 pointer-coarse:opacity-100',
        className,
      )}
      type="button"
      {...props}
    >
      {text}
      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.2} />
    </button>
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
        {/* A small blue-and-white scene (a blank card on a soft pool, the page's icon on its
            corner) instead of a bare icon; drawn from the theme's colours, so it suits both. */}
        <span aria-hidden="true" className="relative mx-auto block h-[84px] w-[120px]">
          <svg className="h-full w-full" viewBox="0 0 120 84">
            <ellipse className="fill-ds-primary-soft" cx="60" cy="48" rx="54" ry="32" />
            <rect
              className="fill-ds-surface stroke-ds-border"
              height="40"
              rx="8"
              strokeWidth="1.5"
              transform="rotate(-7 60 40)"
              width="58"
              x="28"
              y="18"
            />
            <rect
              className="fill-ds-surface stroke-ds-primary-border"
              height="40"
              rx="8"
              strokeWidth="1.5"
              width="58"
              x="34"
              y="24"
            />
            <rect className="fill-ds-primary-border" height="5" rx="2.5" width="24" x="42" y="33" />
            <rect className="fill-ds-divider" height="4" rx="2" width="38" x="42" y="43" />
            <rect className="fill-ds-divider" height="4" rx="2" width="28" x="42" y="51" />
            <circle className="fill-ds-link" cx="100" cy="18" opacity="0.35" r="3" />
            <circle className="fill-ds-food-egg-dot" cx="16" cy="60" opacity="0.45" r="2.5" />
            <circle className="fill-ds-link" cx="22" cy="24" opacity="0.25" r="2" />
          </svg>
          <span className="absolute right-1 bottom-0 grid h-9 w-9 place-items-center rounded-full bg-ds-primary text-white shadow-md ring-4 ring-ds-subtle-2">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
        </span>
        <h3 className="mt-3 text-[15px] font-semibold text-ds-text">{title}</h3>
        {description ? <p className="mt-1 text-sm text-ds-muted">{description}</p> : null}
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * A list's loading rows, shaped like its real ones (an avatar and two lines, then a short bar per
 * column), so nothing jumps when the data arrives. `cells` are the other columns' classes, e.g.
 * `tableStyles.phoneHidden` for a column phones leave out; `avatar` for lists whose rows have one.
 */
export function TableSkeletonRows({
  avatar = false,
  cells,
  rows = 6,
}: Readonly<{ avatar?: boolean; cells: Array<string | undefined>; rows?: number }>) {
  return Array.from({ length: rows }, (_, row) => (
    <tr aria-hidden="true" className="border-t border-ds-divider" key={`skeleton-${row}`}>
      <td className="px-4 py-3">
        <span className="flex items-center gap-3">
          {avatar ? <Skeleton className="h-10 w-10 shrink-0 rounded-xl" /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton
              className="h-3.5 rounded-full"
              style={{ width: `${55 + ((row * 17) % 35)}%` }}
            />
            <Skeleton className="h-3 w-20 rounded-full" />
          </span>
        </span>
      </td>
      {cells.map((className, column) => (
        <td className={cn('px-4 py-3', className)} key={column}>
          <Skeleton
            className="h-3.5 rounded-full"
            style={{ width: `${40 + (((row + column) * 23) % 45)}%` }}
          />
        </td>
      ))}
    </tr>
  ));
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
      {toolbar ? <div className="px-5 py-4">{toolbar}</div> : null}
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
