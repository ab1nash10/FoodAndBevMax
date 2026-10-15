import { CookingPot } from 'lucide-react';
import type { PreparingTileView } from '@/lib/order-board/rules';
import { PreparingTile } from './preparing-tile';

/** "Preparing": orders in the kitchen, soonest first, 3×3 and never scrolling. */
export function PreparingGrid({
  more,
  orders,
  total,
}: Readonly<{ more: number; orders: PreparingTileView[]; total: number }>) {
  return (
    <section aria-label="Preparing" className="flex min-h-0 flex-1 flex-col">
      <h2 className="flex items-center gap-[14px] text-[40px] font-extrabold leading-tight text-ds-text">
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-ds-status-info-bg text-ds-status-info-fg">
          <CookingPot aria-hidden="true" className="h-[30px] w-[30px]" strokeWidth={2.4} />
        </span>
        Preparing
        <span className="rounded-full bg-ds-status-info-bg px-[16px] py-[2px] text-[26px] font-bold tabular-nums text-ds-status-info-fg">
          {total}
        </span>
      </h2>
      <p className="mt-[4px] text-[22px] font-medium text-ds-muted">We&apos;re cooking these now</p>
      <ul className="mt-[18px] grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-[16px]">
        {orders.map((order) => (
          <PreparingTile key={order.orderNumber} order={order} />
        ))}
        {more ? (
          <li className="flex items-center justify-center rounded-[18px] border-2 border-dashed border-ds-border text-[34px] font-extrabold text-ds-muted">
            +{more} more
          </li>
        ) : null}
      </ul>
    </section>
  );
}
