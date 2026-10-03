// Shared SVG maths for the line charts (Sparkline, TrendLine): values to points, points to a path.

export interface Point {
  x: number;
  y: number;
}

/**
 * Evenly spaced points for the defined values (nulls are skipped, keeping their slot), scaled
 * between `min` and `max` inside `inset` from the top and bottom.
 */
export function linePoints(
  values: Array<number | null>,
  {
    height,
    inset,
    max,
    min,
    width,
  }: { height: number; inset: number; max: number; min: number; width: number },
): Point[] {
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values.flatMap((value, index) =>
    value === null
      ? []
      : [
          {
            x: Number((index * step).toFixed(1)),
            y: Number((inset + (1 - (value - min) / span) * (height - inset * 2)).toFixed(1)),
          },
        ],
  );
}

export const pathOf = (points: Point[]) =>
  points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
