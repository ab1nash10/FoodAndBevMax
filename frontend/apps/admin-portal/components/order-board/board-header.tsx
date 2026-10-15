import { Clock } from 'lucide-react';
import Image from 'next/image';
import { withBasePath } from '@/lib/base-path';
import { formatSlot, formatTime } from '@/lib/order-board/format';

function LogoChip({ alt, src, width }: Readonly<{ alt: string; src: string; width: number }>) {
  return (
    <span className="flex h-[84px] shrink-0 items-center justify-center rounded-[18px] bg-ds-logo-chip px-[14px]">
      <Image
        alt={alt}
        className="h-[60px] w-auto"
        height={60}
        priority
        src={withBasePath(src)}
        width={width}
      />
    </span>
  );
}

/** Logos, restaurant and location, the meal slot, and the server's clock. */
export function BoardHeader({
  locationName,
  now,
  restaurantName,
  slotEndsAt,
  slotLabel,
}: Readonly<{
  locationName?: string;
  now: number;
  restaurantName?: string;
  slotEndsAt?: string;
  /** The slot's name, or what to show instead (e.g. while closed). */
  slotLabel?: string;
}>) {
  return (
    <header className="flex h-[128px] shrink-0 items-center gap-[28px] bg-ds-brand-panel px-[48px] text-white">
      <LogoChip alt="AAHAR" src="/brand/aahar-logo.png" width={60} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[44px] font-extrabold leading-[1.2]">
          {restaurantName ?? ''}
        </h1>
        {locationName ? (
          <p className="truncate text-[22px] font-medium text-white/80">{locationName}</p>
        ) : null}
      </div>
      {slotLabel ? (
        <span className="flex shrink-0 items-center gap-[12px] rounded-full border-2 border-white/30 bg-white/10 px-[24px] py-[10px] text-[24px] font-semibold">
          <Clock aria-hidden="true" className="h-[26px] w-[26px]" strokeWidth={2.4} />
          {formatSlot(slotLabel, slotEndsAt)}
        </span>
      ) : null}
      <time className="shrink-0 text-[56px] font-extrabold tabular-nums leading-none">
        {formatTime(now)}
      </time>
      <LogoChip alt="Max Healthcare" src="/brand/max-logo.svg" width={170} />
    </header>
  );
}
