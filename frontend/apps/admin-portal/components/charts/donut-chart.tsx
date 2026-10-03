// Usage:
//   <DonutChart
//     ariaLabel="Acknowledgement outcomes: 86% in full, 9% partial, 5% rejected"
//     centerLabel="in full" centerValue="86%"
//     segments={[{ className: 'stroke-ds-chart-full', key: 'full', value: 61 }]}
//   />
// A ring of segments in the order given, starting at 12 o'clock, over a neutral track.

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  ariaLabel,
  centerLabel,
  centerValue,
  segments,
  size = 132,
}: Readonly<{
  ariaLabel: string;
  centerLabel: string;
  centerValue: string;
  segments: Array<{ className: string; key: string; value: number }>;
  size?: number;
}>) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg aria-label={ariaLabel} height={size} role="img" viewBox="0 0 120 120" width={size}>
        <circle
          className="stroke-ds-status-neutral-bg"
          cx="60"
          cy="60"
          fill="none"
          r={RADIUS}
          strokeWidth="14"
        />
        {total > 0
          ? segments.map((segment) => {
              const length = (segment.value / total) * CIRCUMFERENCE;
              const circle = (
                <circle
                  className={segment.className}
                  cx="60"
                  cy="60"
                  fill="none"
                  key={segment.key}
                  r={RADIUS}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-offset}
                  strokeWidth="14"
                  transform="rotate(-90 60 60)"
                />
              );
              offset += length;

              return circle;
            })
          : null}
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-[22px] font-extrabold tabular-nums text-ds-text">{centerValue}</span>
        <span className="text-[11px] font-semibold text-ds-muted">{centerLabel}</span>
      </span>
    </div>
  );
}
