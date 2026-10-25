import type { PreparingTileView } from '@/lib/order-board/rules';
import { glass } from './board-header';
import { PreparingTile } from './preparing-tile';

/** "Preparing": orders in the kitchen, soonest first, 3×3 and never scrolling, on a glass card. */
export function PreparingGrid({
  more,
  orders,
  total,
}: Readonly<{ more: number; orders: PreparingTileView[]; total: number }>) {
  return (
    <section
      aria-label="Preparing"
      className={`flex min-h-0 flex-1 flex-col gap-[22px] rounded-[40px] p-[30px] ${glass}`}
    >
      <div className="flex items-center gap-[16px]">
        <h2 className="flex h-[60px] items-center gap-[14px] rounded-full bg-ds-primary pl-[26px] pr-[8px] text-[32px] font-bold tracking-[-0.02em] text-white shadow-[0_14px_30px_-14px_rgb(11_87_164/0.8)]">
          Preparing
          <span className="grid h-[44px] min-w-[44px] place-items-center rounded-full bg-white/95 px-[12px] text-[24px] font-extrabold tabular-nums text-ds-primary">
            {total}
          </span>
        </h2>
        <span className="ml-auto text-[20px] text-ds-text-3">We&apos;re cooking these now</span>
      </div>
      <ul className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-[14px]">
        {orders.map((order) => (
          <PreparingTile key={order.orderNumber} order={order} />
        ))}
        {more ? (
          <li className="flex items-center justify-center rounded-[24px] border-2 border-dashed border-ds-primary-border text-[30px] font-extrabold text-ds-link">
            +{more} more
          </li>
        ) : null}
      </ul>
    </section>
  );
}
