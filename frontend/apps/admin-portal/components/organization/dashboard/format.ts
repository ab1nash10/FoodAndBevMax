'use client';

import type { Grn } from '@aahar/api-client';

export const tones = {
  bad: 'bg-ds-status-bad-bg text-ds-status-bad-fg',
  employees: 'bg-ds-tile-employees-bg text-ds-tile-employees-fg',
  info: 'bg-ds-status-info-bg text-ds-status-info-fg',
  items: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  kitchens: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  locations: 'bg-ds-tile-locations-bg text-ds-tile-locations-fg',
  neutral: 'bg-ds-status-neutral-bg text-ds-status-neutral-fg',
  ok: 'bg-ds-status-ok-bg text-ds-status-ok-fg',
  pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
  restaurants: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
  stores: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
};

export const minute = 60_000;

export function formatAge(sinceIso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(sinceIso).getTime()) / minute));

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    const rest = minutes % 60;

    return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export const grnVerbs: Record<Grn['status'], string> = {
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  DRAFT: 'drafted',
  PARTIALLY_ACCEPTED: 'partially accepted',
  POSTED_TO_STOCK: 'posted to stock',
  REJECTED: 'rejected',
  UNDER_VERIFICATION: 'received',
};

export const pendingHref = '/inventory/transfers?view=PENDING_ACKNOWLEDGEMENT';
