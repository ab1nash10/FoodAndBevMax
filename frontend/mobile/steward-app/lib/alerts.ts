// When the phone rings: what changed between two looks at the steward's orders.
import type { Delivery } from './types.ts';

const ACTIVE = new Set(['PLACED', 'PREPARING', 'READY']);

/** Still theirs to take: not delivered, cancelled or given back. */
export const isActive = (order: Delivery) => !order.undeliveredReason && ACTIVE.has(order.status);

export interface DeliveryAlert {
  kind: 'new' | 'ready';
  order: Delivery;
}

/**
 * An order newly given to them ("new"; "ready" when it comes cooked), and one of theirs turning
 * ready. Nothing on the first look: what was there when the app opened is not news.
 */
export function newAlerts(before: Delivery[] | undefined, after: Delivery[]): DeliveryAlert[] {
  if (!before) return [];
  const known = new Map(before.filter(isActive).map((order) => [order.id, order.status]));

  return after.filter(isActive).flatMap((order): DeliveryAlert[] => {
    const was = known.get(order.id);

    if (was === undefined) return [{ kind: order.status === 'READY' ? 'ready' : 'new', order }];
    if (order.status === 'READY' && was !== 'READY') return [{ kind: 'ready', order }];
    return [];
  });
}
