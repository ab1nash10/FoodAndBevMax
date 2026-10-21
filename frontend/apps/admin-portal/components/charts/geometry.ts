// Shared chart maths: values to points and points to a path for the line charts (Sparkline,
// TrendLine), and the bar chart's axis top.

/**
 * The top of a count axis with a labelled midline: 4 for small counts, else the next multiple
 * of 10, so the midline is a whole number that sits where it says (a top of 5 put "3" on 2.5).
 */
export function axisMax(values: number[]): number {
  const max = Math.max(0, ...values);

  return max <= 4 ? 4 : Math.ceil(max / 10) * 10;
}

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
