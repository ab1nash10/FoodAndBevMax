import type { ReadyTileView } from '@/lib/order-board/rules';
import styles from './board.module.css';
import { ServiceIcon, serviceLabels } from './service-type';

/** A ready order: how long it has waited, outlined amber with "Collect soon" once that is long. */
export function ReadyTile({ order }: Readonly<{ order: ReadyTileView }>) {
  return (
    <li
      className={`flex min-w-0 flex-col justify-center gap-[12px] rounded-[28px] border-2 px-[24px] ${styles.rise} ${
        order.collectSoon
          ? 'border-ds-status-pending-fg bg-ds-status-pending-bg'
          : 'border-ds-teal-border bg-ds-status-ok-bg'
      }`}
    >
      <p className="truncate text-[74px] font-extrabold leading-[0.95] tracking-[-0.045em] tabular-nums text-ds-text">
        {order.orderNumber}
      </p>
      {/* Two short lines, so neither is cut off: how long it has waited, then eat here / take
          away (the counter shows on the "Now ready" card). */}
      <div className="flex flex-col gap-[4px] text-[18px] font-semibold">
        <p className={order.collectSoon ? 'text-ds-status-pending-fg' : 'text-ds-teal-text'}>
          {order.collectSoon
            ? 'Collect soon'
            : order.readyMinutes === 0
              ? 'Ready just now'
              : `Ready ${order.readyMinutes} min ago`}
        </p>
        {order.serviceType ? (
          <p className="flex min-w-0 items-center gap-[6px] text-ds-text-3">
            <ServiceIcon className="h-[20px] w-[20px] shrink-0" type={order.serviceType} />
            <span className="truncate">{serviceLabels[order.serviceType]}</span>
          </p>
        ) : order.counterName ? (
          <p className="truncate text-ds-text-3">{order.counterName}</p>
        ) : null}
      </div>
    </li>
  );
}
