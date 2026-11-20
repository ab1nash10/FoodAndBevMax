'use client';

import type { QrRoom } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, ChevronRight, ConciergeBell, Loader2, ReceiptText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import {
  clockLabel,
  isSettled,
  myOrders,
  orderStatus,
  progressSteps,
  readyLabel,
  timeOf,
} from '@/lib/qr-order';
import { cn } from '@/lib/utils';
import { MyOrders, Notice, QrScreen } from './qr-order';

type Restaurant = QrRoom['restaurants'][number];

const orderHref = (restaurant: Restaurant, roomId: string, roomName: string) =>
  withBasePath(
    `/order/${restaurant.id}?${new URLSearchParams({ room: roomName, roomId, token: restaurant.token })}`,
  );

const card = 'flex items-center gap-3.5 rounded-[18px] p-4';

/**
 * A bed's QR: where the food goes, this phone's order in progress, and the restaurants that
 * deliver to rooms there (In Room Dining), open or not. Each open one opens its menu with the
 * bed filled in.
 */
export function RoomQr({ roomId }: Readonly<{ roomId: string }>) {
  const [orders, setOrders] = useState<null | 'all' | { id: string; key: string }>(null);
  const [latest, setLatest] = useState<{ id: string; key: string } | null>(null);
  const roomQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrRoom(roomId)).data,
    queryKey: ['qr-room', roomId],
    retry: false,
  });
  // This phone's newest order, read after the page is up (the server has no phone storage).
  useEffect(() => setLatest(myOrders()[0] ?? null), []);
  const latestQuery = useQuery({
    enabled: Boolean(latest),
    queryFn: async () => (await publicOrganizationApi.getQrOrder(latest!.id, latest!.key)).data,
    queryKey: ['qr-order', latest?.id],
    refetchInterval: 15_000,
    retry: false,
  });
  const room = roomQuery.data;
  const going = latestQuery.data && !isSettled(latestQuery.data) ? latestQuery.data : null;

  if (orders) {
    return (
      <QrScreen>
        <MyOrders initial={orders === 'all' ? null : orders} onBack={() => setOrders(null)} />
      </QrScreen>
    );
  }

  return (
    <QrScreen>
      <header className="flex flex-col gap-3.5 bg-ds-brand-panel px-5 pb-[72px] pt-[max(20px,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-white/75">
            Max Healthcare
          </p>
          <button
            className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/12 px-3.5 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-white"
            onClick={() => setOrders('all')}
            type="button"
          >
            <ReceiptText aria-hidden="true" className="h-[18px] w-[18px]" /> My orders
          </button>
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
          What would you like to eat?
        </h1>
      </header>
      <div className="-mt-[52px] flex flex-1 flex-col gap-3 px-4 pb-8">
        {roomQuery.isLoading ? (
          <div className={cn(card, 'justify-center bg-ds-surface py-10')}>
            <Loader2 aria-label="Loading" className="h-8 w-8 animate-spin text-ds-link" />
          </div>
        ) : !room ? (
          <div className="-mx-4">
            <Notice tone="bad" title="This QR code is not working">
              {getApiErrorMessage(roomQuery.error)} Please ask the ward staff for help.
            </Notice>
          </div>
        ) : (
          <>
            <section
              aria-label="Where your food goes"
              className={cn(card, 'bg-ds-surface shadow-[0_8px_24px_-12px_rgba(12,46,84,.35)]')}
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-orange-700 text-white">
                <BedDouble aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-orange-800">Delivering to your bed</p>
                <p className="text-[19px] font-extrabold leading-tight">{room.roomName}</p>
                <p className="text-sm text-ds-muted">{room.locationAddress ?? room.locationName}</p>
              </div>
            </section>

            {going ? (
              <button
                className="grid gap-2.5 rounded-[18px] border-[1.5px] border-ds-primary-border bg-ds-surface p-4 text-left focus-visible:outline-2 focus-visible:outline-ds-primary"
                onClick={() => setOrders(latest)}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-bold uppercase tracking-wide text-ds-link">
                    Your order {going.orderNumber ?? ''}
                  </span>
                  <span className="text-[15px] font-semibold text-ds-link">Track ›</span>
                </span>
                <span className="text-[17px] font-bold">
                  {orderStatus(going)}
                  {going.readyBy && !going.readyAt ? ` · expected by ${timeOf(going.readyBy)}` : ''}
                </span>
                <span aria-hidden="true" className="grid grid-cols-4 gap-1.5">
                  {progressSteps(going).map((step) => (
                    <span
                      className={cn(
                        'h-1.5 rounded-full',
                        step.state === 'todo' ? 'bg-ds-border' : 'bg-ds-primary',
                      )}
                      key={step.label}
                    />
                  ))}
                </span>
              </button>
            ) : null}

            <h2 className="mx-1 mt-3 text-[15px] font-bold text-ds-text-2">
              Restaurants that deliver to your bed
            </h2>
            {room.restaurants.length === 0 ? (
              <p
                className="rounded-[18px] bg-ds-status-pending-bg p-4 text-base text-ds-status-pending-fg"
                role="status"
              >
                No restaurant here delivers to rooms right now. Please ask the ward staff.
              </p>
            ) : (
              <ul aria-label="Restaurants" className="grid gap-3">
                {room.restaurants.map((restaurant) => (
                  <li key={restaurant.id}>
                    <RestaurantCard
                      href={orderHref(restaurant, roomId, room.roomName)}
                      restaurant={restaurant}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </QrScreen>
  );
}

function RestaurantCard({ href, restaurant }: Readonly<{ href: string; restaurant: Restaurant }>) {
  const icon = (
    <span
      className={cn(
        'grid h-14 w-14 shrink-0 place-items-center rounded-2xl',
        restaurant.open ? 'bg-ds-primary-soft text-ds-link' : 'bg-ds-subtle text-ds-muted',
      )}
    >
      <ConciergeBell aria-hidden="true" className="h-7 w-7" />
    </span>
  );

  // Closed: shown, so a guest knows it exists and when it opens, but nothing to tap.
  if (!restaurant.open) {
    return (
      <div className={cn(card, 'border border-dashed border-ds-border bg-ds-subtle')}>
        {icon}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[17px] font-bold text-ds-text-2">{restaurant.restaurantName}</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ds-surface px-2.5 py-0.5 text-[13px] font-bold text-ds-text-2">
              Closed
            </span>
            {restaurant.opensAt ? (
              <span className="text-sm text-ds-muted">
                Opens at {clockLabel(restaurant.opensAt)}
              </span>
            ) : null}
          </span>
        </span>
      </div>
    );
  }

  return (
    <a
      className={cn(
        card,
        'bg-ds-surface text-ds-text shadow-xs focus-visible:outline-2 focus-visible:outline-ds-primary',
      )}
      href={href}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[17px] font-bold">{restaurant.restaurantName}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ds-status-ok-bg px-2.5 py-0.5 text-[13px] font-bold text-ds-status-ok-fg">
            Open now
          </span>
          {restaurant.readyMinutes ? (
            <span className="text-sm text-ds-muted">{readyLabel(restaurant.readyMinutes)}</span>
          ) : null}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 text-ds-muted" />
    </a>
  );
}
