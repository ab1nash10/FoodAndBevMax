import type { PreparingTileView } from '@/lib/order-board/rules';
import { ServiceIcon, serviceLabels } from './service-type';

/** An order being prepared: its number, eat here / take away and "~n min". */
export function PreparingTile({ order }: Readonly<{ order: PreparingTileView }>) {
  return (
    <li className="flex min-w-0 flex-col justify-center rounded-[18px] border-2 border-ds-border bg-ds-surface px-[20px]">
      <p className="truncate text-[52px] font-extrabold leading-[1.2] tabular-nums text-ds-text">
        {order.orderNumber}
      </p>
      <p className="mt-[10px] flex items-center justify-between gap-[8px] text-[21px] font-semibold text-ds-muted">
        {order.serviceType ? (
          <span className="flex min-w-0 items-center gap-[6px]">
            <ServiceIcon className="h-[22px] w-[22px] shrink-0" type={order.serviceType} />
            <span className="sr-only">{serviceLabels[order.serviceType]}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="shrink-0 tabular-nums text-ds-status-info-fg">
          ~{order.etaMinutes} min
        </span>
      </p>
    </li>
  );
}
