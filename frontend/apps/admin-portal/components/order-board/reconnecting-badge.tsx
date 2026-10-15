import { RefreshCw } from 'lucide-react';

/** Shown while refreshes fail; the last orders stay on screen underneath. */
export function ReconnectingBadge() {
  return (
    <p
      className="absolute bottom-[112px] right-[48px] z-10 flex items-center gap-[12px] rounded-full border-2 border-ds-status-pending-fg/30 bg-ds-status-pending-bg px-[24px] py-[10px] text-[22px] font-bold text-ds-status-pending-fg shadow-lg"
      role="status"
    >
      <RefreshCw
        aria-hidden="true"
        className="h-[24px] w-[24px] motion-safe:animate-spin"
        strokeWidth={2.6}
      />
      Reconnecting…
    </p>
  );
}
