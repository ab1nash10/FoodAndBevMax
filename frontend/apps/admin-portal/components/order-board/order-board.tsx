'use client';

import { useBoardFeed } from '@/lib/order-board/source';
import { BoardCanvas } from './board-canvas';

export interface OrderBoardProps {
  demo: boolean;
  restaurantId: string;
  sound: boolean;
  theme: 'dark' | 'light';
  token: string | undefined;
}

/** The order status board for the TV above the collection counter. */
export function OrderBoard({ demo, restaurantId, token }: Readonly<OrderBoardProps>) {
  const { feed } = useBoardFeed(restaurantId, { demo, token });

  return (
    <BoardCanvas>
      <div className="flex h-full flex-col">
        <header className="h-[128px] shrink-0 bg-ds-brand-panel px-[48px] text-white">
          <h1 className="pt-[32px] text-[44px] font-extrabold">{feed?.restaurantName}</h1>
        </header>
        <main className="grid min-h-0 flex-1 grid-cols-[700px_1fr] gap-[40px] p-[40px]">
          <section aria-label="Preparing" />
          <section aria-label="Ready" />
        </main>
        <footer className="h-[88px] shrink-0 border-t border-ds-border bg-ds-surface" />
      </div>
    </BoardCanvas>
  );
}
