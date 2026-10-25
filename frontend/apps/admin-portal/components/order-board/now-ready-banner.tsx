import type { ReadyTileView } from '@/lib/order-board/rules';
import styles from './board.module.css';
import { orderDetails } from './service-type';

/**
 * The most recent ready order, as large as the board allows: a solid green card with a light running
 * round its edge. It pops in when called and glows while it is the one just called.
 */
export function NowReadyBanner({
  highlight,
  order,
}: Readonly<{ highlight: boolean; order: ReadyTileView }>) {
  const details = orderDetails(order);

  return (
    <section
      aria-label={`Now ready: ${order.orderNumber}`}
      aria-live="polite"
      className={`relative shrink-0 overflow-hidden rounded-[40px] p-[3px] ${highlight ? styles.glow : styles.pop}`}
    >
      <div
        aria-hidden="true"
        className={`absolute left-1/2 top-1/2 -ml-[800px] -mt-[800px] h-[1600px] w-[1600px] ${styles.spin}`}
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0 55%, rgb(15 123 99) 70%, rgb(125 211 252) 80%, transparent 92%)',
        }}
      />
      <div className="relative flex min-h-[290px] items-center gap-[36px] rounded-[37px] bg-ds-ready-banner px-[46px] py-[30px] text-white">
        <div className="min-w-0 flex-1">
          <span className="inline-flex h-[46px] items-center rounded-full bg-white/95 px-[20px] text-[19px] font-extrabold tracking-[0.18em] text-ds-ready-banner">
            NOW READY
          </span>
          <p className="mt-[22px] line-clamp-2 text-[36px] font-semibold leading-tight tracking-[-0.01em]">
            Please collect at {order.counterName ?? 'the counter'}
          </p>
          {details ? <p className="mt-[10px] text-[24px] text-white/90">{details}</p> : null}
        </div>
        <p
          className={`shrink-0 whitespace-nowrap font-extrabold leading-[0.85] tracking-[-0.045em] text-white tabular-nums drop-shadow-[0_6px_18px_rgb(0_0_0/0.25)] ${
            order.orderNumber.length > 4 ? 'text-[176px]' : 'text-[236px]'
          }`}
        >
          {order.orderNumber}
        </p>
      </div>
    </section>
  );
}
