import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** A whole-board message: empty, closed, connecting, or a link problem. */
export function BoardMessage({
  children,
  detail,
  icon: Icon,
  title,
  tone = 'info',
}: Readonly<{
  children?: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  title: string;
  tone?: 'info' | 'pending' | 'ready';
}>) {
  const toneClass = {
    info: 'bg-ds-status-info-bg text-ds-status-info-fg',
    pending: 'bg-ds-status-pending-bg text-ds-status-pending-fg',
    ready: 'bg-ds-teal-soft text-ds-teal-text',
  }[tone];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[40px] px-[160px] text-center">
      <span
        className={`flex h-[140px] w-[140px] items-center justify-center rounded-full ${toneClass}`}
      >
        <Icon aria-hidden="true" className="h-[72px] w-[72px]" strokeWidth={2.2} />
      </span>
      <div>
        <h2 className="text-[64px] font-extrabold leading-tight text-ds-text">{title}</h2>
        {detail ? (
          <p className="mt-[16px] text-[30px] font-medium text-ds-muted">{detail}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
