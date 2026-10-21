import type { StoreStockLevel } from '@aahar/api-client';
import { cn } from '@/lib/utils';
import { COVER_SCALE_DAYS, type ExpiryTone } from './levels';

// Pieces Stock levels and Today share.

export const toneChip: Record<ExpiryTone, string> = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
};

export const levelChip: Record<StoreStockLevel['level'], { className: string; label: string }> = {
  LOW: { className: 'bg-ds-status-pending-bg text-ds-status-pending-fg', label: 'Running low' },
  OK: { className: 'bg-ds-status-ok-bg text-ds-status-ok-fg', label: 'In stock' },
  OUT: { className: 'bg-ds-status-bad-bg text-ds-status-bad-fg', label: 'Out of stock' },
};

/** On hand as days of cover, a full bar being two weeks of stock. */
export function CoverBar({ item }: Readonly<{ item: StoreStockLevel }>) {
  const width =
    item.level === 'OUT' || item.coverDays === null
      ? 0
      : Math.max(4, Math.min(100, (item.coverDays / COVER_SCALE_DAYS) * 100));

  return (
    <span aria-hidden="true" className="relative block h-2 rounded-full bg-ds-divider">
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
          item.level === 'LOW' ? 'bg-ds-status-pending-fg' : 'bg-ds-primary',
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function Chip({ children, className }: Readonly<{ children: string; className: string }>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
        className,
      )}
    >
      {children}
    </span>
  );
}
