'use client';

import { Link2Off, LoaderCircle, Moon, ScanLine, WifiOff } from 'lucide-react';
import { formatTime } from '@/lib/order-board/format';
import { playChime, useBoardTheme, useJustReady, useWakeLock } from '@/lib/order-board/live';
import { boardView } from '@/lib/order-board/rules';
import { useBoardFeed, useServerNow } from '@/lib/order-board/source';
import { BoardCanvas } from './board-canvas';
import { BoardFooter } from './board-footer';
import { BoardHeader } from './board-header';
import { BoardMessage } from './board-message';
import { HowItWorks } from './how-it-works';
import { NowReadyBanner } from './now-ready-banner';
import { PreparingGrid } from './preparing-grid';
import { ReadyGrid } from './ready-grid';
import { ReconnectingBadge } from './reconnecting-badge';

export interface OrderBoardProps {
  demo: boolean;
  restaurantId: string;
  sound: boolean;
  theme: 'dark' | 'light';
  token: string | undefined;
}

/** The order status board for the TV above the collection counter. */
export function OrderBoard({ demo, restaurantId, sound, theme, token }: Readonly<OrderBoardProps>) {
  const { feed, invalidLink, reconnecting, serverOffset } = useBoardFeed(restaurantId, {
    demo,
    token,
  });
  const now = useServerNow(serverOffset);
  const orders = feed?.orders ?? [];
  const view = boardView(orders, now);
  const justReady = useJustReady(
    view.nowReady?.orderNumber,
    feed?.orders.filter((order) => order.status === 'READY').map((order) => order.orderNumber),
    sound ? playChime : undefined,
  );
  useWakeLock();
  useBoardTheme(theme);

  let body;
  if (!token && !demo) {
    body = (
      <BoardMessage
        detail="Open this screen with the board link from AAHAR: Restaurants → Activity → Copy link."
        icon={ScanLine}
        title="This screen needs its board link"
        tone="pending"
      />
    );
  } else if (invalidLink) {
    body = (
      <BoardMessage
        detail="It was replaced or the restaurant was removed. Ask the restaurant admin for the current link (Restaurants → Activity)."
        icon={Link2Off}
        title="This board link is no longer valid"
        tone="pending"
      />
    );
  } else if (!feed) {
    body = reconnecting ? (
      <BoardMessage
        detail="Orders will appear as soon as the connection is back."
        icon={WifiOff}
        title="Connecting to AAHAR…"
        tone="pending"
      />
    ) : (
      <BoardMessage icon={LoaderCircle} title="Loading orders…" />
    );
  } else if (orders.length === 0) {
    body = feed.isOpen ? (
      <BoardMessage
        detail="Order at the kiosk or counter. Your number appears here while it is prepared."
        icon={ScanLine}
        title="No orders right now"
        tone="ready"
      >
        <HowItWorks className="w-[880px] text-left" />
      </BoardMessage>
    ) : (
      <BoardMessage
        detail={feed.opensAt ? `Opens at ${formatTime(feed.opensAt)}` : 'See you next time.'}
        icon={Moon}
        title="Kitchen closed"
      />
    );
  } else {
    body = (
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
          {view.nowReady ? (
            <NowReadyBanner
              highlight={justReady}
              key={view.nowReady.orderNumber}
              order={view.nowReady}
            />
          ) : null}
          <ReadyGrid more={view.readyMore} orders={view.ready} total={view.readyTotal} />
        </div>
      </main>
    );
  }

  return (
    <BoardCanvas>
      <div className="relative flex h-full flex-col">
        <BoardHeader
          locationName={feed?.locationName}
          now={now}
          restaurantName={feed?.restaurantName ?? 'Order status'}
          slotEndsAt={feed?.isOpen ? feed.slotEndsAt : undefined}
          slotLabel={feed ? (feed.isOpen ? feed.slotName : 'Closed') : undefined}
        />
        {body}
        <BoardFooter helpCounterName={feed?.helpCounterName} />
        {reconnecting && feed ? <ReconnectingBadge /> : null}
      </div>
    </BoardCanvas>
  );
}
