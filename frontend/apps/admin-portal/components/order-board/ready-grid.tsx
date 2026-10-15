import { CircleCheck } from 'lucide-react';
import type { ReadyTileView } from '@/lib/order-board/rules';
import { ReadyTile } from './ready-tile';

/** "Ready to collect": the ready orders after the banner, newest first, never scrolling. */
export function ReadyGrid({
  more,
  orders,
  total,
}: Readonly<{ more: number; orders: ReadyTileView[]; total: number }>) {
  return (
    <section aria-label="Ready to collect" className="flex min-h-0 flex-1 flex-col">
      <h2 className="flex items-center gap-[14px] text-[36px] font-extrabold text-ds-text">
        <CircleCheck
          aria-hidden="true"
          className="h-[36px] w-[36px] text-ds-teal-text"
          strokeWidth={2.6}
        />
        Ready to collect
        <span className="rounded-full bg-ds-teal-soft px-[16px] py-[2px] text-[26px] font-bold tabular-nums text-ds-teal-text">
          {total}
        </span>
      </h2>
      <ul className="mt-[18px] grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-[20px]">
        {orders.map((order) => (
          <ReadyTile key={order.orderNumber} order={order} />
        ))}
        {more ? (
          <li className="flex items-center justify-center rounded-[22px] border-2 border-dashed border-ds-teal-border text-[40px] font-extrabold text-ds-teal-text">
            +{more} more
          </li>
        ) : null}
      </ul>
    </section>
  );
}
