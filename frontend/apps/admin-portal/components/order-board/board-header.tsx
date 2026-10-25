import Image from 'next/image';
import { withBasePath } from '@/lib/base-path';
import { formatDay, formatSlot, formatTime } from '@/lib/order-board/format';
import styles from './board.module.css';

/** Frosted glass on the board's colour field: cards, pills and the footer bar. */
export const glass =
  'border border-ds-text/[0.07] bg-ds-surface/80 backdrop-blur-xl backdrop-saturate-150';

function LogoChip({ alt, src, width }: Readonly<{ alt: string; src: string; width: number }>) {
  return (
    <span className="flex h-[80px] shrink-0 items-center justify-center rounded-[24px] bg-ds-logo-chip px-[14px] shadow-[0_8px_24px_-12px_rgb(16_24_40/0.25)]">
      <Image
        alt={alt}
        className="h-[56px] w-auto"
        height={56}
        priority
        src={withBasePath(src)}
        width={width}
      />
    </span>
  );
}

/** Logos, restaurant and location, LIVE and the meal slot, and the server's clock and date. */
export function BoardHeader({
  live,
  locationName,
  now,
  restaurantName,
  slotEndsAt,
  slotLabel,
}: Readonly<{
  /** Orders are coming through: a pulsing LIVE pill. */
  live?: boolean;
  locationName?: string;
  now: number;
  restaurantName?: string;
  slotEndsAt?: string;
  /** The slot's name, or what to show instead (e.g. while closed). */
  slotLabel?: string;
}>) {
  const pill = `flex h-[54px] items-center gap-[12px] rounded-full px-[24px] text-[21px] font-semibold ${glass}`;

  return (
    <header className="flex h-[124px] shrink-0 items-center gap-[24px] px-[56px]">
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-[24px]">
        <LogoChip alt="AAHAR" src="/brand/aahar-logo.png" width={56} />
        <div className="min-w-0">
          <h1 className="truncate text-[44px] font-bold leading-none tracking-[-0.03em]">
            {restaurantName ?? ''}
          </h1>
          {locationName ? (
            <p className="mt-[8px] truncate text-[21px] font-medium text-ds-text-3">
              {locationName}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-[14px]">
        {live ? (
          <span className={`${pill} font-bold tracking-[0.16em]`}>
            <span
              aria-hidden="true"
              className={`h-[12px] w-[12px] rounded-full bg-[#34d399] shadow-[0_0_14px_#34d399] ${styles.live}`}
            />
            LIVE
          </span>
        ) : null}
        {slotLabel ? <span className={pill}>{formatSlot(slotLabel, slotEndsAt)}</span> : null}
      </div>
      <div className="flex flex-1 basis-0 items-center justify-end gap-[20px]">
        {/* A clock: the server draws it at one moment and the TV at another, so the text is
            expected to differ when the page wakes up; the TV's tick takes over at once. */}
        <div className="text-right">
          <time
            className="block whitespace-nowrap text-[68px] font-light leading-none tracking-[-0.04em] tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(now)}
          </time>
          <p
            className="mt-[4px] text-[18px] font-medium uppercase tracking-[0.06em] text-ds-text-3"
            suppressHydrationWarning
          >
            {formatDay(now)}
          </p>
        </div>
        <LogoChip alt="Max Healthcare" src="/brand/max-logo.svg" width={170} />
      </div>
    </header>
  );
}
