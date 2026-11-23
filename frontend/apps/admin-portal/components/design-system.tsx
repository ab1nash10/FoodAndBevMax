import { Panel, Skeleton } from '@/components/ui';
import { ModuleEyebrow } from '@/components/module-eyebrow';
import { withBasePath } from '@/lib/base-path';
import { pageSizes as standardPageSizes } from '@/lib/list-limit';
import { statusPresentation, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { FoodType, InventoryLocationType } from '@aahar/api-client';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import Image from 'next/image';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

interface BrandMarkProps {
  collapsed?: boolean;
  className?: string;
}

/** The product's mark: "F&B" on a Max-blue tile (the product was renamed from AAHAR, 2026-11-22). */
export function FnbMark({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-linear-to-br from-[#2477cf] to-ds-primary text-[12px] font-extrabold tracking-[-0.02em] text-white shadow-[0_8px_18px_-8px_rgb(11_87_164/0.8)]',
        className,
      )}
    >
      F&amp;B
    </span>
  );
}

export function BrandMark({ collapsed = false, className }: BrandMarkProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <FnbMark />
      {collapsed ? (
        <span className="sr-only">F&amp;B</span>
      ) : (
        <span className="min-w-0">
          <span className="block text-[15px] font-extrabold leading-5 tracking-[0.02em] text-ds-text">
            F&amp;B
          </span>
          <span className="block truncate text-[11.5px] leading-4 text-ds-muted">
            Food &amp; Beverage
          </span>
        </span>
      )}
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
    // Premium look (2026-11-22, canvas row C): the module over a large title, its count in a
    // pill, the actions on the right. No `isolate` or clipping: a dialog or menu opened from
    // `action` must not be trapped inside it.
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ds-link">
            {eyebrow}
          </p>
        ) : (
          <ModuleEyebrow />
        )}
        <h1 className="mt-1.5 flex flex-wrap items-center gap-3 text-[30px] font-bold leading-9 tracking-[-0.035em] text-ds-text sm:text-[38px] sm:leading-[44px]">
          {title}
          {/* Sans, not mono: Geist Mono's slashed zero reads as "Ø". */}
          {count === undefined ? null : (
            <span className="rounded-full bg-ds-primary-soft px-3 py-0.5 text-[14px] font-semibold leading-6 tracking-normal text-ds-link tabular-nums">
              {count}
            </span>
          )}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-ds-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2.5">{action}</div> : null}
    </div>
  );
}

/**
 * The one look of every list table: quiet sticky header, roomy rows that light up on hover,
 * codes and numbers in mono. Use these instead of per-page class strings.
 */
export const tableStyles = {
  code: 'font-mono text-[12px] text-ds-muted',
  // Premium look: quiet words on white, so the data reads first.
  head: 'sticky top-0 z-10 border-y border-ds-divider bg-ds-surface text-left text-[12.5px] font-medium text-ds-muted',
  num: 'font-mono tabular-nums',
  /** A secondary column left out on phones, so the ones that matter fit without scrolling. */
  phoneHidden: 'hidden sm:table-cell',
  /** A record row. Clicking it does nothing: its own buttons and links act (the user's rule). */
  row: 'row-accent group border-t border-ds-divider transition-colors duration-150 hover:bg-ds-selected',
  table: 'w-full text-[13.5px]',
  td: 'px-4 py-3 align-middle first:pl-5',
  th: 'px-4 py-3 font-medium first:pl-5',
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
  pageSizes = standardPageSizes,
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
    'grid h-8 w-8 place-items-center rounded-control border border-ds-input bg-ds-surface text-ds-text-2 pointer-coarse:h-11 pointer-coarse:w-11 transition hover:bg-ds-subtle disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary';

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
              className="h-8 rounded-control border border-ds-input bg-ds-surface px-2 font-mono text-[12.5px] text-ds-text pointer-coarse:h-11"
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
  // Only words that start with a letter or digit: "Khichdi (Light Diet)" is KL, not K(.
  const initials = name
    .split(/\s+/)
    .map((word) => /[\p{L}\p{N}]/u.exec(word)?.[0])
    .filter((letter): letter is string => Boolean(letter))
    .slice(0, 2)
    .map((letter) => letter.toUpperCase())
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
 * A row's "Open ›": always shown, as the row itself opens nothing.
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
        'inline-flex h-8 items-center gap-0.5 rounded-control px-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-[opacity,background-color] duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
        nextStep
          ? 'bg-ds-primary-soft text-ds-link hover:bg-ds-primary hover:text-white'
          : 'text-ds-link hover:bg-ds-primary-soft',
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold',
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
