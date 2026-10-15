'use client';

import { boardView } from '@/lib/order-board/rules';
import { useBoardFeed, useServerNow } from '@/lib/order-board/source';
import { BoardHeader } from './board-header';
import { NowReadyBanner } from './now-ready-banner';
import { HowItWorks } from './how-it-works';
import { ReadyGrid } from './ready-grid';
import { PreparingGrid } from './preparing-grid';
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
  const { feed, serverOffset } = useBoardFeed(restaurantId, { demo, token });
  const now = useServerNow(serverOffset);
  const view = boardView(feed?.orders ?? [], now);

  return (
    <BoardCanvas>
      <div className="flex h-full flex-col">
        <BoardHeader
          locationName={feed?.locationName}
          now={now}
          restaurantName={feed?.restaurantName}
          slotEndsAt={feed?.slotEndsAt}
          slotLabel={feed?.slotName}
        />
        <main className="grid min-h-0 flex-1 grid-cols-[700px_1fr] gap-[40px] p-[40px]">
          <div className="flex min-h-0 flex-col gap-[28px]">
            <PreparingGrid
              more={view.preparingMore}
              orders={view.preparing}
              total={view.preparingTotal}
            />
            <HowItWorks />
          </div>
          <div className="flex min-h-0 flex-col gap-[28px]">
            {view.nowReady ? <NowReadyBanner highlight={false} order={view.nowReady} /> : null}
            <ReadyGrid more={view.readyMore} orders={view.ready} total={view.readyTotal} />
          </div>
        </main>
        <footer className="h-[88px] shrink-0 border-t border-ds-border bg-ds-surface" />
      </div>
    </BoardCanvas>
  );
}
