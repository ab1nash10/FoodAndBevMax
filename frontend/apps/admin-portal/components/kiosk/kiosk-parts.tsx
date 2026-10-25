'use client';

import { cn } from '@aahar/ui';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import styles from '@/components/order-board/board.module.css';
import { withBasePath } from '@/lib/base-path';

export { FoodArt, foodIcon, toneOf } from '@/components/food-art';

// Whole rupees as ₹130; paise only when there are some (₹5.86).
const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: 'currency',
});

export function formatRupees(value: number): string {
  return rupees.format(value);
}

/** A raised white card on the kiosk's colour field. */
export const card =
  'rounded-[28px] border border-ds-text/[0.06] bg-ds-surface/90 shadow-[0_18px_40px_-24px_rgb(16_24_40/0.35)] backdrop-blur-xl';

/** The kiosk's main action: a tall blue pill. */
export const primaryButton =
  'inline-flex h-[72px] items-center justify-center gap-3 rounded-full bg-(image:--ds-primary-gradient) px-10 text-[24px] font-bold text-white shadow-[0_16px_32px_-14px_rgb(11_87_164/0.7)] transition active:scale-[0.98] disabled:opacity-50';

/** The full screen, with the board's slow pools of colour behind it. */
export function KioskBackdrop({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-ds-page text-ds-text [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className={`absolute -left-[20vw] -top-[20vh] h-[80vmax] w-[80vmax] rounded-full ${styles.driftA}`}
          style={{
            background: 'radial-gradient(closest-side, rgb(56 189 248 / 0.26), transparent)',
          }}
        />
        <div
          className={`absolute -right-[25vw] top-[10vh] h-[70vmax] w-[70vmax] rounded-full ${styles.driftB}`}
          style={{
            background: 'radial-gradient(closest-side, rgb(167 139 250 / 0.22), transparent)',
          }}
        />
        <div
          className={`absolute -bottom-[30vh] left-[10vw] h-[70vmax] w-[80vmax] rounded-full ${styles.driftC}`}
          style={{
            background: 'radial-gradient(closest-side, rgb(52 211 153 / 0.18), transparent)',
          }}
        />
      </div>
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

export function KioskLogo({ size = 64 }: Readonly<{ size?: number }>) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[22px] bg-ds-logo-chip shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)]"
      style={{ height: size, padding: size / 6 }}
    >
      <Image
        alt="AAHAR"
        className="h-full w-auto"
        height={size}
        priority
        src={withBasePath('/brand/aahar-logo.png')}
        width={size}
      />
    </span>
  );
}

/** Logo, restaurant and location; Start over on the right. */
export function KioskHeader({
  locationName,
  onStartOver,
  restaurantName,
}: Readonly<{ locationName?: string; onStartOver: () => void; restaurantName?: string }>) {
  return (
    <header className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-6 sm:gap-5 sm:px-10">
      <KioskLogo />
      <div className="min-w-0 flex-1">
        <h1 className="line-clamp-2 text-[clamp(22px,5vw,36px)] font-bold leading-tight tracking-[-0.02em]">
          {restaurantName ?? ''}
        </h1>
        {locationName ? (
          <p className="truncate text-[18px] font-medium text-ds-text-3">{locationName}</p>
        ) : null}
      </div>
      <button
        className={cn(
          card,
          'flex h-[60px] shrink-0 items-center gap-2 rounded-full px-5 text-[19px] font-semibold text-ds-text-2 active:scale-[0.98] sm:px-6',
        )}
        onClick={onStartOver}
        type="button"
      >
        <RotateCcw aria-hidden="true" className="h-5 w-5" />
        {/* Icon only on a phone, where the title needs the room. */}
        <span className="max-sm:sr-only">Start over</span>
      </button>
    </header>
  );
}

/** − n + for a touch screen: 56 px targets, the count between them. */
export function Stepper({
  label,
  onChange,
  quantity,
  max,
}: Readonly<{
  label: string;
  max: number;
  onChange: (quantity: number) => void;
  quantity: number;
}>) {
  const button =
    'grid h-14 w-14 place-items-center rounded-full bg-ds-primary-soft text-ds-link transition active:scale-95 disabled:opacity-40';

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label={`One less ${label}`}
        className={button}
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <Minus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
      </button>
      <span className="w-9 text-center text-[26px] font-bold tabular-nums">{quantity}</span>
      <button
        aria-label={`One more ${label}`}
        className={button}
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <Plus aria-hidden="true" className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}
