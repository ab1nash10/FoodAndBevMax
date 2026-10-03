// Usage:
//   <HorizontalBarList ariaLabel="Most transferred items, times sent"
//     items={[{ href: '/masters/items?id=…', key: 'i1', label: 'Toned milk', value: 42 }]} />
// Ranked rows, each a label (a link when it has an href the user may open), its number and a
// bar scaled to the largest value.

import { RecordLink } from '@/components/record-link';

export function HorizontalBarList({
  ariaLabel,
  items,
}: Readonly<{
  ariaLabel: string;
  items: Array<{ href?: string | null; key: string; label: string; value: number }>;
}>) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li className="flex flex-col gap-1" key={item.key}>
          <span className="flex justify-between gap-2 text-[12.5px]">
            <RecordLink className="min-w-0 truncate font-bold text-ds-text" href={item.href}>
              {item.label}
            </RecordLink>
            <span className="font-extrabold tabular-nums text-ds-text-2">{item.value}</span>
          </span>
          <span
            aria-hidden="true"
            className="h-2 overflow-hidden rounded-full bg-ds-status-neutral-bg"
          >
            <span
              className="block h-full rounded-full bg-ds-chart-series"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
