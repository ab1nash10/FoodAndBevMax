import type { StoreStockLevel } from '@aahar/api-client';

/** The list's quick filters; "expiring" is a batch due within EXPIRING_DAYS (or past it). */
export type LevelFilter = 'all' | 'expiring' | 'low' | 'out';

export const EXPIRING_DAYS = 7;

/** The cover bar's full width, in days: two weeks of stock fills it. */
export const COVER_SCALE_DAYS = 14;

export type ExpiryTone = 'bad' | 'neutral' | 'pending';

/** "Expired", "Today", "Tomorrow", "In 5 days", "In 3 months"; "—" without a date. */
export function expiryLabel(days: number | null): string {
  if (days === null) {
    return '—';
  }

  if (days < 0) {
    return 'Expired';
  }

  if (days === 0) {
    return 'Today';
  }

  if (days === 1) {
    return 'Tomorrow';
  }

  return days < 60 ? `In ${days} days` : `In ${Math.round(days / 30)} months`;
}

/** Red when it is due today or past, amber within the week, quiet otherwise. */
export function expiryTone(days: number | null): ExpiryTone {
  if (days === null || days > EXPIRING_DAYS) {
    return 'neutral';
  }

  return days <= 1 ? 'bad' : 'pending';
}

/** How long the stock lasts, in words: "Out", "Under a day", "~3 days", "No recent issues". */
export function coverLabel(item: Pick<StoreStockLevel, 'coverDays' | 'level'>): string {
  if (item.level === 'OUT') {
    return 'Out';
  }

  if (item.coverDays === null) {
    return 'No recent issues';
  }

  if (item.coverDays < 1) {
    return 'Under a day';
  }

  const days = Math.round(item.coverDays);

  return `~${days} ${days === 1 ? 'day' : 'days'}`;
}

export function matchesFilter(
  item: Pick<StoreStockLevel, 'level'>,
  filter: LevelFilter,
  nextExpiryDays: number | null,
): boolean {
  switch (filter) {
    case 'expiring':
      return nextExpiryDays !== null && nextExpiryDays <= EXPIRING_DAYS;
    case 'low':
      return item.level === 'LOW';
    case 'out':
      return item.level === 'OUT';
    default:
      return true;
  }
}
