import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { glass } from './board-header';

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
    info: 'text-ds-link',
    pending: 'text-ds-status-pending-fg',
    ready: 'text-ds-teal-text',
  }[tone];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[40px] px-[160px] text-center">
      <span
        className={`flex h-[150px] w-[150px] items-center justify-center rounded-[48px] ${glass} ${toneClass}`}
      >
        <Icon aria-hidden="true" className="h-[68px] w-[68px]" strokeWidth={2} />
      </span>
      <div>
        <h2 className="text-[80px] font-extrabold leading-tight tracking-[-0.035em] text-ds-text">
          {title}
        </h2>
        {detail ? (
          <p className="mt-[14px] text-[32px] font-medium text-ds-text-3">{detail}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
