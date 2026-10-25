import { HOLD_MINUTES, type ReadyTileView } from '@/lib/order-board/rules';
import { glass } from './board-header';
import { ReadyTile } from './ready-tile';

/** "Ready to collect", its count and how long orders are kept: above the "Now ready" card. */
export function ReadyHeading({ total }: Readonly<{ total: number }>) {
  return (
    <div className="flex items-center gap-[16px]">
      {/* A solid green pill: the side people look at for their number. */}
      <h2 className="flex h-[68px] items-center gap-[16px] rounded-full bg-ds-ready-banner pl-[30px] pr-[10px] text-[36px] font-bold tracking-[-0.02em] text-white shadow-[0_14px_30px_-14px_rgb(15_123_99/0.8)]">
        Ready to collect
        <span className="grid h-[50px] min-w-[50px] place-items-center rounded-full bg-white/95 px-[14px] text-[28px] font-extrabold tabular-nums text-ds-ready-banner">
          {total}
        </span>
      </h2>
      <span className="ml-auto text-[21px] text-ds-text-3">
        Kept for {HOLD_MINUTES} min once ready
      </span>
    </div>
  );
}

/** Where the "Now ready" card goes while nothing is ready yet. */
export function ReadyEmpty() {
  return (
    <div className={`grid flex-1 place-items-center rounded-[40px] text-center ${glass}`}>
      <div>
        <p className="text-[44px] font-bold">Your number appears here</p>
        <p className="mt-[12px] text-[26px] text-ds-text-3">the moment it is ready to collect</p>
      </div>
    </div>
  );
}

/** The ready orders after the "Now ready" card, newest first, 4×2 and never scrolling. */
export function ReadyGrid({ more, orders }: Readonly<{ more: number; orders: ReadyTileView[] }>) {
  return orders.length || more ? (
    <ul
      aria-label="More ready orders"
      className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-[18px]"
    >
      {orders.map((order) => (
        <ReadyTile key={order.orderNumber} order={order} />
      ))}
      {more ? (
        <li className="flex items-center justify-center rounded-[28px] border-2 border-dashed border-ds-teal-border text-[36px] font-extrabold text-ds-teal-text">
          +{more} more
        </li>
      ) : null}
    </ul>
  ) : null;
}
