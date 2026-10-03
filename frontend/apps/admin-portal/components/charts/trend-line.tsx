// Usage:
//   <TrendLine ariaLabel="Kitchen wastage, average 3.4%, 1 day above the 5% limit"
//     firstLabel="Fri 25" lastLabel="Thu 1" threshold={5} thresholdLabel="5% limit"
//     values={[2.8, 3.4, null, 5.6]} />
// A 150px line with a soft area and a dashed threshold line. Null values are gaps; a single
// value shows as a dot. The scale always leaves room above the threshold.

import { linePoints, pathOf } from './geometry';

const WIDTH = 320;
const HEIGHT = 140;
const INSET = 8;

export function TrendLine({
  ariaLabel,
  firstLabel,
  lastLabel,
  threshold,
  thresholdLabel,
  values,
}: Readonly<{
  ariaLabel: string;
  firstLabel: string;
  lastLabel: string;
  threshold: number;
  thresholdLabel: string;
  values: Array<number | null>;
}>) {
  const defined = values.filter((value): value is number => value !== null);
  const max = Math.max(threshold * 1.6, Math.ceil(Math.max(0, ...defined) * 1.15));
  const points = linePoints(values, { height: HEIGHT, inset: INSET, max, min: 0, width: WIDTH });
  const thresholdY = INSET + (1 - threshold / max) * (HEIGHT - INSET * 2);
  const line = pathOf(points);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <svg
          aria-label={ariaLabel}
          className="block h-[150px] w-full"
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <line
            className="stroke-ds-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={WIDTH}
            y1={HEIGHT - INSET}
            y2={HEIGHT - INSET}
          />
          <line
            className="stroke-ds-chart-rejected"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={WIDTH}
            y1={thresholdY}
            y2={thresholdY}
          />
          {points.length > 1 ? (
            <>
              <path
                className="fill-ds-chart-wastage/10"
                d={`${line} L${points.at(-1)!.x},${HEIGHT - INSET} L${points[0]!.x},${HEIGHT - INSET} Z`}
              />
              <path
                className="stroke-ds-chart-wastage"
                d={line}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
        </svg>
        {points.length === 1 ? (
          <span
            aria-hidden="true"
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ds-chart-wastage"
            style={{
              left: `${(points[0]!.x / WIDTH) * 100}%`,
              top: `${(points[0]!.y / HEIGHT) * 100}%`,
            }}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute right-0 translate-y-[-120%] text-[11px] font-bold text-ds-status-bad-fg"
          style={{ top: `${(thresholdY / HEIGHT) * 100}%` }}
        >
          {thresholdLabel}
        </span>
      </div>
      <div aria-hidden="true" className="flex justify-between text-[11px] text-ds-muted">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
