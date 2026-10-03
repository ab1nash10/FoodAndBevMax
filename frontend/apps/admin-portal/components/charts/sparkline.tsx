// Usage: <Sparkline label="Transfers trend" tone="series" values={[3, 5, null, 8]} />
// A 32px trend line with a soft area under it. Null values are gaps (the line joins the points
// around them); with fewer than two points it keeps its height and draws nothing.

import { cn } from '@/lib/utils';
import { linePoints, pathOf } from './geometry';

const tones = {
  full: { area: 'fill-ds-teal-soft', line: 'stroke-ds-chart-full' },
  series: { area: 'fill-ds-chart-series/10', line: 'stroke-ds-chart-series' },
  wastage: { area: 'fill-ds-chart-wastage/10', line: 'stroke-ds-chart-wastage' },
};

export function Sparkline({
  className,
  label,
  tone = 'series',
  values,
}: Readonly<{
  className?: string;
  label: string;
  tone?: keyof typeof tones;
  values: Array<number | null>;
}>) {
  const defined = values.filter((value): value is number => value !== null);
  const points = linePoints(values, {
    height: 32,
    inset: 4,
    max: Math.max(...defined),
    min: Math.min(...defined),
    width: 100,
  });

  if (points.length < 2) {
    return <span aria-hidden="true" className={cn('block h-8', className)} />;
  }

  const line = pathOf(points);

  return (
    <svg
      aria-label={label}
      className={cn('block h-8 w-full', className)}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 32"
    >
      <path
        className={tones[tone].area}
        d={`${line} L${points.at(-1)!.x},32 L${points[0]!.x},32 Z`}
      />
      <path
        className={tones[tone].line}
        d={line}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
