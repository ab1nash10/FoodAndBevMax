'use client';

import { useEffect, useState } from 'react';
import { HOLD_MINUTES } from '@/lib/order-board/rules';
import { glass } from './board-header';
import styles from './board.module.css';

const steps = ['Order', 'Watch for your number', 'Collect'];
const tips = [
  `Kept for ${HOLD_MINUTES} min once ready`,
  'Staff: show your ID at pickup',
  'Eat here or take away: tell the counter',
];
const TIP_MS = 5_000;

/** How it works in three words, a tip that changes every few seconds, and where to ask. */
export function BoardFooter({ helpCounterName }: Readonly<{ helpCounterName?: string }>) {
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTip((index) => (index + 1) % tips.length), TIP_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <footer
      className={`mx-[56px] mb-[22px] flex h-[88px] shrink-0 items-center gap-[26px] rounded-full pl-[30px] pr-[14px] ${glass}`}
    >
      <ol aria-label="How it works" className="flex shrink-0 items-center gap-[26px]">
        {steps.map((step, index) => (
          <li className="flex items-center gap-[12px] text-[20px] font-semibold" key={step}>
            <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-ds-primary-soft text-[18px] font-bold text-ds-link">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="flex min-w-0 flex-1 justify-center overflow-hidden text-[21px] font-semibold text-ds-text-2">
        {/* Keyed, so each tip runs its fade in and out afresh. */}
        <span className={`truncate ${styles.tip}`} key={tip}>
          {tips[tip]}
        </span>
      </p>
      <p className="flex h-[60px] shrink-0 items-center rounded-full bg-ds-primary-soft px-[26px] text-[21px] text-ds-text-2">
        Can&apos;t see your number?&nbsp;
        <b className="font-bold text-ds-text">Ask at {helpCounterName ?? 'the counter'}</b>
      </p>
    </footer>
  );
}
