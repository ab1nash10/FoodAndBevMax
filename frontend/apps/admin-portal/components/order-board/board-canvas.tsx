'use client';

import { useEffect, useState, type ReactNode } from 'react';
import styles from './board.module.css';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/**
 * The board is designed at 1920×1080 and scaled as a whole to fit any TV: letterboxed, never
 * stretched or cropped. Sizes inside are plain pixels on that canvas. Behind it, three soft pools
 * of colour drift slowly (sky, violet, mint), as on the portal's pages.
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
        className="relative shrink-0 overflow-hidden bg-ds-page text-ds-text"
        style={{
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          width: CANVAS_WIDTH,
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className={`absolute -left-[160px] -top-[220px] h-[900px] w-[900px] rounded-full ${styles.driftA}`}
            style={{
              background: 'radial-gradient(closest-side, rgb(56 189 248 / 0.28), transparent)',
            }}
          />
          <div
            className={`absolute -right-[240px] -top-[120px] h-[820px] w-[1000px] rounded-full ${styles.driftB}`}
            style={{
              background: 'radial-gradient(closest-side, rgb(167 139 250 / 0.26), transparent)',
            }}
          />
          <div
            className={`absolute -bottom-[420px] left-[640px] h-[800px] w-[1100px] rounded-full ${styles.driftC}`}
            style={{
              background: 'radial-gradient(closest-side, rgb(52 211 153 / 0.2), transparent)',
            }}
          />
        </div>
        <div className="relative h-full">{children}</div>
      </div>
    </div>
  );
}
