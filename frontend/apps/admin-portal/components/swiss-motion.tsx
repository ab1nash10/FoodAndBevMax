'use client';

/**
 * Swiss motion: movement only where something changed, along the grid, short and crisp.
 * - A row of choices (tabs, module pills, a segmented switch) has one indicator
 *   that slides to the chosen item instead of jumping (`useSlidingIndicator` + `SlideIndicator`).
 * Nothing waits on it: the indicator is placed before the first paint without sliding.
 * Reduced motion turns it off (globals.css).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface IndicatorBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

/**
 * Measures the chosen item of a row (found by `selector`, e.g. '[aria-selected="true"]') each
 * time `chosen` changes or the row resizes.
 */
export function useSlidingIndicator<T extends HTMLElement>(selector: string, chosen: unknown) {
  const rowRef = useRef<T>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const [slides, setSlides] = useState(false);

  const moveTo = useCallback(() => {
    const row = rowRef.current;
    const target = row?.querySelector(selector);

    if (!row || !target) {
      setBox(null);
      return;
    }

    const outer = row.getBoundingClientRect();
    const inner = target.getBoundingClientRect();
    setBox({
      height: inner.height,
      left: inner.left - outer.left + row.scrollLeft - row.clientLeft,
      top: inner.top - outer.top + row.scrollTop - row.clientTop,
      width: inner.width,
    });
  }, [selector]);

  useLayoutEffect(() => moveTo(), [moveTo, chosen]);

  useEffect(() => {
    // Placed once without sliding; it slides from the next frame on.
    const frame = requestAnimationFrame(() => setSlides(true));
    const row = rowRef.current;
    const observer = new ResizeObserver(() => moveTo());

    if (row) observer.observe(row);
    // Web fonts change the items' widths once they load.
    void document.fonts?.ready.then(() => moveTo());

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [moveTo]);

  return { box, rowRef, slides };
}

/**
 * The indicator itself, inside the row (which must be `relative`). `underline` is a 2px bar along
 * the item's bottom edge, `inset` px in from each side; otherwise it fills the item, behind it.
 */
export function SlideIndicator({
  box,
  className,
  inset = 0,
  slides,
  underline = false,
}: Readonly<{
  box: IndicatorBox | null;
  className: string;
  inset?: number;
  slides: boolean;
  underline?: boolean;
}>) {
  if (!box || box.width === 0) return null;

  return (
    <span
      aria-hidden="true"
      className={cn('slide-indicator', className)}
      data-slides={slides ? '' : undefined}
      style={
        underline
          ? {
              // A 1px bar stretched to the item's width: the slide stays a transform.
              height: 2,
              transform: `translate(${box.left + inset}px, ${box.top + box.height - 2}px) scaleX(${box.width - inset * 2})`,
              width: 1,
            }
          : {
              height: box.height,
              transform: `translate(${box.left}px, ${box.top}px)`,
              width: box.width,
            }
      }
    />
  );
}

/**
 * A new screen slides in from where it was opened: from the right for a page further along the
 * menu (`rank`, its place in the menu), from the left for one before it. It is readable from its first frame and runs on the
 * compositor, so no click waits on it (a React ViewTransition held clicks ~0.9 s; this holds
 * none). Returns the ref for the element that holds the screen.
 */
export function useScreenEnter<T extends HTMLElement>(pathname: string, rank: number) {
  const ref = useRef<T>(null);
  const shown = useRef({ pathname, rank });

  useLayoutEffect(() => {
    const from = shown.current;
    shown.current = { pathname, rank };
    const screen = ref.current;

    // Only between menu entries: a panel or form under the same entry (its own URL, the list
    // under it) slides in by itself, so the list stays still.
    if (rank < 0 || from.rank < 0 || rank === from.rank) return;
    if (typeof screen?.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    screen.animate(
      [
        { opacity: 0.5, transform: `translateX(${rank > from.rank ? 16 : -16}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }, [pathname, rank]);

  return ref;
}
