'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing, ChefHat, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { ApiClientError } from '@aahar/api-client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { publicOrganizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import { queryKeys } from '@/lib/query-keys';

const REFRESH_MS = 5000;
// A number that just turned ready stands out for this long.
const HIGHLIGHT_MS = 15_000;

function useClock(): string {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const timer = window.setInterval(tick, 10_000);

    return () => window.clearInterval(timer);
  }, []);

  return time;
}

/** Order numbers that appeared in `ready` within the last HIGHLIGHT_MS. */
function useJustReady(ready: string[] | undefined): Set<string> {
  const firstSeen = useRef(new Map<string, number>());
  const isFirstLoad = useRef(true);
  const [, rerender] = useState(0);
  const now = Date.now();

  if (ready) {
    for (const number of ready) {
      // What is already ready when the screen opens is not news.
      if (!firstSeen.current.has(number)) {
        firstSeen.current.set(number, isFirstLoad.current ? 0 : now);
      }
    }
    for (const number of firstSeen.current.keys()) {
      if (!ready.includes(number)) firstSeen.current.delete(number);
    }
    isFirstLoad.current = false;
  }

  useEffect(() => {
    const timer = window.setInterval(() => rerender((n) => n + 1), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return new Set(
    [...firstSeen.current].filter(([, seen]) => now - seen < HIGHLIGHT_MS).map(([n]) => n),
  );
}

function LogoChip({ alt, src, wide }: Readonly<{ alt: string; src: string; wide?: boolean }>) {
  return (
    <span className="inline-flex h-[5.2vh] items-center rounded-[0.8vh] bg-ds-logo-chip px-[0.8vw]">
      <Image
        alt={alt}
        className={wide ? 'h-[3.2vh] w-auto' : 'h-[4vh] w-auto'}
        height={wide ? 58 : 44}
        priority
        src={withBasePath(src)}
        width={wide ? 168 : 44}
      />
    </span>
  );
}

function OrderColumn({
  children,
  count,
  empty,
  hint,
  icon: Icon,
  title,
  tone,
}: Readonly<{
  children: ReactNode;
  count: number;
  empty: string;
  hint: string;
  icon: LucideIcon;
  title: string;
  tone: 'pending' | 'ok';
}>) {
  const toneClasses =
    tone === 'ok'
      ? 'border-ds-status-ok-fg/30 [--tone-bg:var(--color-ds-status-ok-bg)] [--tone-fg:var(--color-ds-status-ok-fg)]'
      : 'border-ds-status-pending-fg/20 [--tone-bg:var(--color-ds-status-pending-bg)] [--tone-fg:var(--color-ds-status-pending-fg)]';

  return (
    <section
      aria-label={title}
      className={`flex min-h-0 flex-col overflow-hidden rounded-[1.6vh] border-2 bg-ds-surface shadow-sm ${toneClasses}`}
    >
      <header className="flex items-center gap-[1vw] bg-[var(--tone-bg)] px-[1.6vw] py-[1.6vh] text-[var(--tone-fg)]">
        <Icon aria-hidden="true" className="h-[4.4vh] w-[4.4vh] shrink-0" strokeWidth={2.2} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[2.2vw] font-extrabold leading-tight">{title}</h2>
          <p className="text-[1.1vw] font-medium opacity-80">{hint}</p>
        </div>
        <span className="rounded-full bg-ds-surface px-[1vw] py-[0.4vh] text-[1.8vw] font-extrabold tabular-nums">
          {count}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-[1.6vw]">
        {count === 0 ? (
          <p className="pt-[6vh] text-center text-[1.5vw] font-medium text-ds-muted">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * The pickup board for a TV at the counter, in the portal's colours: amber for orders being
 * prepared, green for orders ready to collect. Opened from the restaurant's secret link; no
 * sign-in, order numbers only.
 */
export function OrderBoard({ token }: Readonly<{ token: string }>) {
  const clock = useClock();
  const board = useQuery({
    queryFn: async () => (await publicOrganizationApi.getOrderBoard(token)).data,
    queryKey: queryKeys.orderBoard(token),
    refetchInterval: (query) =>
      query.state.error instanceof ApiClientError && query.state.error.status === 404
        ? false
        : REFRESH_MS,
    refetchIntervalInBackground: true,
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 3,
  });
  const justReady = useJustReady(board.data?.ready);
  const invalidLink = board.error instanceof ApiClientError && board.error.status === 404;
  const preparing = board.data?.preparing ?? [];
  const ready = board.data?.ready ?? [];

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-ds-page text-ds-text">
      <header className="flex items-center gap-[1.4vw] bg-ds-brand-panel px-[2.4vw] py-[1.6vh] text-white">
        <LogoChip alt="AAHAR" src="/brand/aahar-logo.png" />
        <LogoChip alt="Max Healthcare" src="/brand/max-logo.svg" wide />
        <div className="ml-[0.6vw] min-w-0 flex-1">
          <p className="text-[1vw] font-semibold uppercase tracking-[0.18em] text-ds-brand-panel-accent">
            Order status
          </p>
          <h1 className="truncate text-[2.4vw] font-extrabold leading-tight">
            {board.data?.restaurantName ?? ' '}
          </h1>
        </div>
        <span className="text-[2.4vw] font-bold tabular-nums">{clock}</span>
      </header>

      {invalidLink ? (
        <div className="flex flex-1 items-center justify-center p-[4vw] text-center">
          <div>
            <h2 className="text-[2.6vw] font-extrabold">This board link is no longer valid</h2>
            <p className="mt-[2vh] text-[1.5vw] text-ds-muted">
              Ask the restaurant admin for the current TV link (Restaurants → Activity).
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-[1.6vw] p-[1.6vw]">
          <OrderColumn
            count={preparing.length}
            empty="No orders in the kitchen right now"
            hint="Your order is being prepared"
            icon={ChefHat}
            title="Preparing"
            tone="pending"
          >
            <ul className="grid grid-cols-3 gap-[1vw]">
              {preparing.map((number) => (
                <li
                  className="rounded-[1vh] border border-ds-border bg-ds-subtle py-[1.6vh] text-center text-[2.8vw] font-bold tabular-nums text-ds-text"
                  key={number}
                >
                  {number}
                </li>
              ))}
            </ul>
          </OrderColumn>

          <OrderColumn
            count={ready.length}
            empty="Ready orders will appear here"
            hint="Please collect from the counter"
            icon={BellRing}
            title="Ready for pickup"
            tone="ok"
          >
            <ul className="grid grid-cols-3 gap-[1.2vw]">
              {ready.map((number) => (
                <li
                  className={`rounded-[1.2vh] py-[2.4vh] text-center text-[4vw] font-extrabold tabular-nums ${
                    justReady.has(number)
                      ? 'animate-pulse bg-ds-status-ok-fg text-white ring-[0.5vh] ring-ds-brand-panel-accent'
                      : 'bg-ds-status-ok-bg text-ds-status-ok-fg'
                  }`}
                  key={number}
                >
                  {number}
                </li>
              ))}
            </ul>
          </OrderColumn>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-ds-border bg-ds-surface px-[2.4vw] py-[1.2vh] text-[1.2vw] text-ds-muted">
        <span>
          Look for your order number. When it shows under{' '}
          <strong className="font-bold text-ds-status-ok-fg">Ready for pickup</strong>, please
          collect it from the counter.
        </span>
        {board.isError && !invalidLink ? (
          <span className="font-semibold text-ds-status-pending-fg">Reconnecting…</span>
        ) : (
          <span>Powered by AAHAR</span>
        )}
      </footer>
    </main>
  );
}
