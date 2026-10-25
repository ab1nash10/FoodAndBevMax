import { RefreshCw } from 'lucide-react';

/** Shown while refreshes fail; the last orders stay on screen underneath. */
export function ReconnectingBadge() {
  return (
    <p
      className="absolute left-1/2 top-[136px] z-10 flex -translate-x-1/2 items-center gap-[12px] rounded-full bg-ds-status-pending-bg px-[26px] py-[12px] text-[22px] font-bold text-ds-status-pending-fg shadow-[0_18px_40px_-16px_rgb(16_24_40/0.45)] ring-2 ring-ds-status-pending-fg/25"
      role="status"
    >
      <RefreshCw
        aria-hidden="true"
        className="h-[24px] w-[24px] motion-safe:animate-spin"
        strokeWidth={2.6}
      />
      Reconnecting… the numbers shown may be a minute old
    </p>
  );
}
