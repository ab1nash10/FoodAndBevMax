import type { ReadyTileView } from '@/lib/order-board/rules';
import { ServiceIcon, serviceLabels } from './service-type';

/** A ready order: teal, or amber with "collect soon" once it has waited too long. */
export function ReadyTile({ order }: Readonly<{ order: ReadyTileView }>) {
  return (
    <li
      className={`flex min-w-0 flex-col justify-center rounded-[22px] border-2 px-[28px] ${
        order.collectSoon
          ? 'border-ds-status-pending-fg/40 bg-ds-status-pending-bg'
          : 'border-ds-teal-border bg-ds-teal-soft'
      }`}
    >
      <p className="truncate text-[80px] font-extrabold leading-none tabular-nums text-ds-teal-text">
        {order.orderNumber}
      </p>
      <p className="mt-[12px] flex min-w-0 items-center gap-[10px] text-[22px] font-semibold text-ds-teal-text">
        {order.counterName ? <span className="truncate">{order.counterName}</span> : null}
        {order.counterName && order.serviceType ? <span aria-hidden="true">·</span> : null}
        {order.serviceType ? (
          <span className="flex shrink-0 items-center gap-[6px]">
            <ServiceIcon className="h-[22px] w-[22px]" type={order.serviceType} />
            {serviceLabels[order.serviceType]}
          </span>
        ) : null}
      </p>
      {order.collectSoon ? (
        <p className="mt-[8px] self-start rounded-full bg-ds-status-pending-fg/15 px-[14px] py-[4px] text-[20px] font-bold text-ds-status-pending-fg">
          {order.readyMinutes} min · collect soon
        </p>
      ) : (
        <p className="mt-[8px] text-[20px] font-medium text-ds-muted">
          {order.readyMinutes === 0 ? 'Ready just now' : `Ready ${order.readyMinutes} min ago`}
        </p>
      )}
    </li>
  );
}
