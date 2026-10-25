'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderSource, OrderStatus, RestaurantOrder } from '@aahar/api-client';
import { Copy, ExternalLink, MonitorSmartphone, RefreshCw, Tv, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useConfirm } from '@/components/confirm-provider';
import { AppPageHeader, EmptyState } from '@/components/design-system';
import { OrderKeyButton } from '@/components/order-key-button';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { restaurantDetailQuery } from '@/lib/detail-queries';
import { queryKeys } from '@/lib/query-keys';

// The kitchen and the TV see a new order within this.
const REFRESH_MS = 5000;

const columns: Array<{
  next?: { label: string; status: OrderStatus };
  status: OrderStatus;
  title: string;
}> = [
  { next: { label: 'Send to kitchen', status: 'PREPARING' }, status: 'PLACED', title: 'Active' },
  { next: { label: 'Ready', status: 'READY' }, status: 'PREPARING', title: 'In kitchen' },
  {
    next: { label: 'Collected', status: 'COLLECTED' },
    status: 'READY',
    title: 'Ready / delivery',
  },
];

const sourceLabels: Record<OrderSource, string> = {
  COUNTER: 'Counter',
  KIOSK: 'Kiosk',
  OTHER: 'App',
  POS: 'POS',
  QR: 'QR',
};

function minutesSince(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

  return minutes < 1 ? 'just now' : `${minutes} min`;
}

/** Ticks once a minute so the "x min" ages move without a refetch. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function BoardLinkControls({ restaurantId }: Readonly<{ restaurantId: string }>) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const linkQuery = useQuery({
    queryFn: async () =>
      (await organizationApi.getRestaurantBoardLink(restaurantId)).data.boardToken,
    queryKey: queryKeys.restaurantBoardLink(restaurantId),
    staleTime: Infinity,
  });
  const resetMutation = useMutation({
    mutationFn: async () =>
      (await organizationApi.getRestaurantBoardLink(restaurantId, true)).data.boardToken,
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Link not replaced',
        variant: 'error',
      });
    },
    onSuccess(token) {
      queryClient.setQueryData(queryKeys.restaurantBoardLink(restaurantId), token);
      showToast({ description: 'The old TV link no longer works.', title: 'New TV link ready' });
    },
  });
  const url = linkQuery.data
    ? `${window.location.origin}${withBasePath(`/board/${restaurantId}?token=${linkQuery.data}`)}`
    : null;
  // The self-service kiosk opens with the same secret as the TV board.
  const kioskUrl = linkQuery.data
    ? `${window.location.origin}${withBasePath(`/kiosk/${restaurantId}?token=${linkQuery.data}`)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={!url}
        onClick={() => url && window.open(url, '_blank', 'noopener')}
        type="button"
      >
        <Tv aria-hidden="true" className="h-4 w-4" />
        Open TV board
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      <Button
        disabled={!url}
        onClick={() => {
          if (!url) return;
          void navigator.clipboard
            .writeText(url)
            .then(() =>
              showToast({ description: 'Open it in the TV’s browser.', title: 'TV link copied' }),
            );
        }}
        type="button"
        variant="outline"
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
        Copy link
      </Button>
      <Button
        disabled={!kioskUrl}
        onClick={() => kioskUrl && window.open(kioskUrl, '_blank', 'noopener')}
        type="button"
        variant="outline"
      >
        <MonitorSmartphone aria-hidden="true" className="h-4 w-4" />
        Open kiosk
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      </Button>
      <Button
        aria-label="Copy kiosk link"
        disabled={!kioskUrl}
        onClick={() => {
          if (!kioskUrl) return;
          void navigator.clipboard.writeText(kioskUrl).then(() =>
            showToast({
              description: 'Open it full screen in the kiosk’s browser.',
              title: 'Kiosk link copied',
            }),
          );
        }}
        size="icon"
        title="Copy kiosk link"
        type="button"
        variant="outline"
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button
        disabled={!url || resetMutation.isPending}
        onClick={() =>
          void confirm({
            confirmLabel: 'Make new link',
            description: 'TV boards and kiosks using the current link will stop working.',
            title: 'Make a new TV and kiosk link?',
            tone: 'danger',
          }).then((confirmed) => {
            if (confirmed) resetMutation.mutate();
          })
        }
        title="Make a new link and turn the current one off"
        type="button"
        variant="ghost"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        New link
      </Button>
    </div>
  );
}

function OrderCard({
  canUpdate,
  isPending,
  now,
  onMove,
  order,
  next,
}: Readonly<{
  canUpdate: boolean;
  isPending: boolean;
  next?: { label: string; status: OrderStatus };
  now: number;
  onMove: (status: OrderStatus) => void;
  order: RestaurantOrder;
}>) {
  const confirm = useConfirm();

  return (
    <li className="rounded-md border border-ds-border bg-ds-surface p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums text-ds-text">{order.orderNumber}</span>
        <span className="flex items-center gap-2 text-xs text-ds-muted">
          <span className="rounded bg-ds-subtle px-1.5 py-0.5 font-medium">
            {order.channel === 'ROOM' ? 'Room' : sourceLabels[order.source]}
          </span>
          {minutesSince(order.placedAt, now)}
        </span>
      </div>
      {order.roomNumber ? (
        <p className="mt-1 text-sm font-semibold text-ds-link">
          Room {order.roomNumber}
          {order.bedNumber ? ` · Bed ${order.bedNumber}` : ''}
        </p>
      ) : null}
      {order.billNumber ? (
        <p className="font-mono text-[11px] text-ds-muted">{order.billNumber}</p>
      ) : null}
      {order.items.length ? (
        <ul className="mt-2 space-y-0.5 text-sm text-ds-text">
          {order.items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.name}
              {item.note ? <span className="block text-xs text-ds-muted">{item.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {order.instructions ? (
        <p className="mt-2 rounded bg-ds-status-pending-bg px-2 py-1 text-xs text-ds-status-pending-fg">
          {order.instructions}
        </p>
      ) : null}
      {canUpdate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {next ? (
            <Button
              disabled={isPending}
              onClick={() => onMove(next.status)}
              size="sm"
              type="button"
            >
              {order.channel === 'ROOM' && next.status === 'COLLECTED' ? 'Delivered' : next.label}
            </Button>
          ) : null}
          {order.status === 'READY' ? (
            <Button
              disabled={isPending}
              onClick={() => onMove('PREPARING')}
              size="sm"
              title="Back to preparing"
              type="button"
              variant="ghost"
            >
              <Undo2 aria-hidden="true" className="h-4 w-4" />
              Not ready
            </Button>
          ) : order.source === 'COUNTER' ? null : (
            // A counter bill is cancelled from Bill History, with a reason and a restock.
            <Button
              disabled={isPending}
              onClick={() =>
                void confirm({
                  confirmLabel: 'Cancel order',
                  title: `Cancel order ${order.orderNumber}?`,
                  tone: 'danger',
                }).then((confirmed) => {
                  if (confirmed) onMove('CANCELLED');
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * A restaurant's live orders, as the kitchen works them: New -> Preparing -> Ready for pickup ->
 * Collected. Ready and preparing order numbers also show on the restaurant's TV board.
 */
export function useRestaurantOrders(restaurantId: string | undefined) {
  return useQuery({
    enabled: Boolean(restaurantId),
    queryFn: async () => (await organizationApi.listRestaurantOrders(restaurantId!)).data,
    queryKey: queryKeys.restaurantOrders(restaurantId),
    refetchInterval: REFRESH_MS,
  });
}

/** The New / Preparing / Ready columns, each card moving its order on a tap. */
export function OrderBoard({
  orders,
  restaurantId,
}: Readonly<{ orders: RestaurantOrder[]; restaurantId: string }>) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const now = useNow();
  const canUpdate = hasPermission('ORDER_UPDATE');
  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      organizationApi.setRestaurantOrderStatus(id, status),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Order not updated',
        variant: 'error',
      });
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantOrders(restaurantId) });
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((column) => {
        const inColumn = orders.filter((order) => order.status === column.status);

        return (
          <Panel className="flex min-h-48 flex-col p-0" key={column.status}>
            <h2 className="flex items-center justify-between border-b border-ds-border px-4 py-2.5 text-sm font-semibold text-ds-text">
              {column.title}
              <span className="rounded-full bg-ds-subtle px-2 py-0.5 text-xs tabular-nums text-ds-muted">
                {inColumn.length}
              </span>
            </h2>
            <ul className="flex-1 space-y-3 p-3">
              {inColumn.map((order) => (
                <OrderCard
                  canUpdate={canUpdate}
                  isPending={moveMutation.isPending && moveMutation.variables?.id === order.id}
                  key={order.id}
                  next={column.next}
                  now={now}
                  onMove={(status) => moveMutation.mutate({ id: order.id, status })}
                  order={order}
                />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

export function RestaurantOrdersPageClient({ restaurantId }: Readonly<{ restaurantId: string }>) {
  const { hasPermission } = useAuth();
  const restaurantQuery = useQuery(restaurantDetailQuery(restaurantId));
  const ordersQuery = useRestaurantOrders(restaurantId);
  const orders = ordersQuery.data ?? [];
  const restaurantName = restaurantQuery.data?.restaurantName;
  // Names the record crumb: Restaurants > <name> > Orders.
  useBreadcrumbLabel(restaurantId, restaurantName);

  return (
    <div className="space-y-5">
      <AppPageHeader
        action={
          hasPermission('RESTAURANT_UPDATE') ? (
            <div className="flex flex-wrap items-center gap-2">
              <BoardLinkControls restaurantId={restaurantId} />
              <OrderKeyButton
                issue={async () =>
                  (await organizationApi.issueRestaurantOrderKey(restaurantId)).data.apiKey
                }
                label="Order key"
                name={restaurantName ?? 'this restaurant'}
                usage="lets this restaurant's kiosks, QR ordering and other apps send orders here"
              />
            </div>
          ) : null
        }
        description="Every order placed for this restaurant (POS, kiosk, QR or any other app), as the kitchen prepares it. Pending and ready order numbers also show on the restaurant's TV board."
        eyebrow={restaurantName ?? 'Restaurant'}
        title="Orders"
      />

      {ordersQuery.isLoading ? (
        <Panel className="p-4">
          <Skeleton className="h-40 w-full" />
        </Panel>
      ) : ordersQuery.isError ? (
        <Panel className="p-4 text-sm text-ds-muted">{getApiErrorMessage(ordersQuery.error)}</Panel>
      ) : orders.length === 0 ? (
        <Panel>
          <EmptyState
            description="Orders appear here as soon as they are placed. A POS sends them with its key (POS & Payment Machines); kiosks, QR ordering and other apps with this restaurant's Order key."
            title={`No open orders${restaurantName ? ` at ${restaurantName}` : ''}`}
          />
        </Panel>
      ) : (
        <OrderBoard orders={orders} restaurantId={restaurantId} />
      )}
    </div>
  );
}
