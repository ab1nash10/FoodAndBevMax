import type { ReadyTileView } from '@/lib/order-board/rules';
import { orderDetails } from './service-type';

/** The most recent ready order, as large as the board allows. */
export function NowReadyBanner({
  highlight,
  order,
}: Readonly<{ highlight: boolean; order: ReadyTileView }>) {
  const details = orderDetails(order);

  return (
    <section
      aria-label={`Now ready: ${order.orderNumber}`}
      aria-live="polite"
      className={`flex h-[280px] shrink-0 items-center gap-[48px] rounded-[28px] bg-ds-ready-banner px-[56px] text-white ${
        highlight ? 'board-just-ready' : ''
      }`}
    >
      <div className="shrink-0">
        <p className="text-[26px] font-bold uppercase tracking-[0.2em] text-white/85">Now ready</p>
        <p className="whitespace-nowrap text-[160px] font-extrabold leading-[0.95] tabular-nums">
          {order.orderNumber}
        </p>
      </div>
      <span aria-hidden="true" className="h-[168px] w-[3px] shrink-0 rounded-full bg-white/35" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[48px] font-extrabold leading-[1.15]">
          Please collect at {order.counterName ?? 'the counter'}
        </p>
        {details ? (
          <p className="mt-[10px] text-[30px] font-medium text-white/90">{details}</p>
        ) : null}
      </div>
    </section>
  );
}
