import type { PreparingTileView } from '@/lib/order-board/rules';
import styles from './board.module.css';
import { serviceLabels } from './service-type';

/**
 * The ring's full span. The board knows when an order should be ready but not when it was
 * placed, so the ring shows closeness to ready: empty at this many minutes out, full at "now".
 */
const RING_MINUTES = 15;
const RING_LENGTH = 2 * Math.PI * 27;

/** An order being prepared: its number, eat here / take away, and a ring with "~n min". */
export function PreparingTile({ order }: Readonly<{ order: PreparingTileView }>) {
  const close = Math.min(1, Math.max(0.06, 1 - (order.etaMinutes - 1) / RING_MINUTES));

  return (
    // The number gets the whole width ("A 137" as well as "0026"); service and ring sit under it.
    <li
      className={`flex min-w-0 flex-col justify-center gap-[14px] rounded-[24px] border border-ds-text/[0.07] bg-ds-surface px-[20px] ${styles.rise}`}
    >
      <p className="whitespace-nowrap text-[50px] font-extrabold leading-none tracking-[-0.045em] tabular-nums">
        {order.orderNumber}
      </p>
      <div className="flex items-center justify-between gap-[10px]">
        {order.serviceType ? (
          // The words alone: beside the ring there is no room for an icon as well.
          <p className="min-w-0 truncate text-[17px] font-medium text-ds-text-3">
            {serviceLabels[order.serviceType]}
          </p>
        ) : (
          <span />
        )}
        <div className="relative h-[64px] w-[64px] shrink-0">
          <svg aria-hidden="true" className="-rotate-90" height="64" viewBox="0 0 64 64" width="64">
            <circle
              className="fill-none stroke-ds-primary-soft"
              cx="32"
              cy="32"
              r="27"
              strokeWidth="6"
            />
            <circle
              className="fill-none stroke-ds-primary transition-[stroke-dashoffset] duration-700"
              cx="32"
              cy="32"
              r="27"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - close)}
              strokeLinecap="round"
              strokeWidth="6"
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[15px] font-bold tabular-nums">
            {order.etaMinutes <= 1 ? 'now' : `${order.etaMinutes}m`}
          </span>
          <span className="sr-only">about {order.etaMinutes} min</span>
        </div>
      </div>
    </li>
  );
}
