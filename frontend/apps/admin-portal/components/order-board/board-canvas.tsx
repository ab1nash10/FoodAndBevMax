'use client';

import { useEffect, useState, type ReactNode } from 'react';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/**
 * The board is designed at 1920×1080 and scaled as a whole to fit any TV: letterboxed, never
 * stretched or cropped. Sizes inside are plain pixels on that canvas.
 */
export function BoardCanvas({ children }: Readonly<{ children: ReactNode }>) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT));
    fit();
    window.addEventListener('resize', fit);

    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="fixed inset-0 flex cursor-none select-none items-center justify-center overflow-hidden bg-black">
      <div
        className="shrink-0 overflow-hidden bg-ds-page text-ds-text"
        style={{
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          width: CANVAS_WIDTH,
        }}
      >
        {children}
      </div>
    </div>
  );
}
