import type { Delivery } from './types';

export const roomOf = (order: Delivery) =>
  order.roomNumber
    ? `Room ${order.roomNumber}${order.bedNumber ? ` · Bed ${order.bedNumber}` : ''}`
    : 'Room not given';

export function itemCount(order: Delivery) {
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return `${count} item${count === 1 ? '' : 's'}`;
}

/** Whole minutes from `iso` to `now`, never negative. */
export const minutesSince = (iso: string | null, now: number) =>
  iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0;

/** "Ready 6 min ago", "Ready just now". */
export function agoText(prefix: string, iso: string | null, now: number) {
  const minutes = minutesSince(iso, now);

  return minutes < 1 ? `${prefix} just now` : `${prefix} ${minutes} min ago`;
}

/** "5:32 pm", in India time. */
export const timeOf = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : '';
