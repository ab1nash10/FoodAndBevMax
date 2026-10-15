import { ShoppingBag, UtensilsCrossed } from 'lucide-react';
import type { BoardOrder } from '@/lib/order-board/rules';

export const serviceLabels = { DINE_IN: 'Eat here', TAKE_AWAY: 'Take away' } as const;

/** The eat here / take away icon, as in the footer legend. */
export function ServiceIcon({
  className,
  type,
}: Readonly<{ className?: string; type: NonNullable<BoardOrder['serviceType']> }>) {
  const Icon = type === 'TAKE_AWAY' ? ShoppingBag : UtensilsCrossed;

  return <Icon aria-hidden="true" className={className} strokeWidth={2.2} />;
}

/** "Eat here · 3 items", from what the order has. */
export function orderDetails(order: BoardOrder): string {
  return [
    order.serviceType ? serviceLabels[order.serviceType] : null,
    order.itemCount ? `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
