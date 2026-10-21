import type { StoreStockMovementDay } from '@aahar/api-client';
import { formatQuantity } from '@/components/inventory/shared/utils';
import { cn } from '@/lib/utils';

const dayLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

/**
 * Received and sent out per day, side by side, scaled to the busiest day. Every day keeps a
 * faint base, so quiet days still read as days; the ends are dated.
 */
export function MovementBars({
  className,
  days,
}: Readonly<{ className?: string; days: StoreStockMovementDay[] }>) {
  const peak = Math.max(1, ...days.flatMap((day) => [day.qtyIn, day.qtyOut]));
  const total = (pick: (day: StoreStockMovementDay) => number) =>
    formatQuantity(days.reduce((sum, day) => sum + pick(day), 0));
  const first = days[0];
  const last = days.at(-1);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        aria-label={`Over ${days.length} days: ${total((day) => day.qtyIn)} in, ${total(
          (day) => day.qtyOut,
        )} out`}
        className="grid h-24 items-end gap-1.5"
        role="img"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((day) => (
          <span
            className="flex h-full items-end gap-0.5 border-b-2 border-ds-divider"
            key={day.date}
            title={`${dayLabel.format(new Date(day.date))}: ${formatQuantity(day.qtyIn)} in, ${formatQuantity(day.qtyOut)} out`}
          >
            <span
              className="flex-1 rounded-t-[3px] bg-ds-primary transition-[height] duration-500"
              style={{ height: `${(day.qtyIn / peak) * 100}%` }}
            />
            <span
              className="flex-1 rounded-t-[3px] bg-ds-chart-series/40 transition-[height] duration-500"
              style={{ height: `${(day.qtyOut / peak) * 100}%` }}
            />
          </span>
        ))}
      </div>
      {first && last ? (
        <div aria-hidden="true" className="flex justify-between text-[11px] text-ds-muted">
          <span>{dayLabel.format(new Date(first.date))}</span>
          <span>Today</span>
        </div>
      ) : null}
    </div>
  );
}
