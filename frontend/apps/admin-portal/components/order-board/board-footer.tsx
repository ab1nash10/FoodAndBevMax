import { Clock3, IdCard } from 'lucide-react';
import { HOLD_MINUTES } from '@/lib/order-board/rules';
import { ServiceIcon, serviceLabels } from './service-type';

/** The legend for the tiles, how long orders are kept, and where to ask. */
export function BoardFooter({ helpCounterName }: Readonly<{ helpCounterName?: string }>) {
  const item = 'flex items-center gap-[10px]';

  return (
    <footer className="flex h-[88px] shrink-0 items-center justify-between gap-[32px] border-t-2 border-ds-border bg-ds-surface px-[48px] text-[22px] font-medium text-ds-muted">
      <ul className="flex min-w-0 items-center gap-[40px]">
        <li className={item}>
          <ServiceIcon className="h-[26px] w-[26px]" type="DINE_IN" />
          {serviceLabels.DINE_IN}
        </li>
        <li className={item}>
          <ServiceIcon className="h-[26px] w-[26px]" type="TAKE_AWAY" />
          {serviceLabels.TAKE_AWAY}
        </li>
        <li className={item}>
          <Clock3 aria-hidden="true" className="h-[26px] w-[26px]" strokeWidth={2.2} />
          Kept for {HOLD_MINUTES} min once ready
        </li>
        <li className={item}>
          <IdCard aria-hidden="true" className="h-[26px] w-[26px]" strokeWidth={2.2} />
          Staff: show your ID at pickup
        </li>
      </ul>
      <p className="shrink-0 font-bold text-ds-text">
        Can&apos;t see your number? Ask at {helpCounterName ?? 'the counter'}
      </p>
    </footer>
  );
}
