'use client';

import { AppPageHeader, EmptyState } from '@/components/design-system';
import { LoadError } from '@/components/location-empty-states';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { RestaurantOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, CheckCircle2 } from 'lucide-react';

// A steward sees an order turn ready within this.
const REFRESH_MS = 10_000;
const deliveriesKey = ['my-deliveries'] as const;

type Delivery = RestaurantOrder & { restaurantName: string };

function DeliveryCard({
  isPending,
  onDelivered,
  order,
}: Readonly<{ isPending: boolean; onDelivered?: () => void; order: Delivery }>) {
  return (
    <li className="rounded-md border border-ds-border bg-ds-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums text-ds-text">{order.orderNumber}</span>
        <span className="text-xs font-medium text-ds-muted">{order.restaurantName}</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-base font-semibold text-ds-link">
        <BedDouble aria-hidden="true" className="h-4 w-4" />
        {order.roomNumber ?? 'Room not given'}
        {order.bedNumber ? ` · Bed ${order.bedNumber}` : ''}
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-ds-text">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.name}
          </li>
        ))}
      </ul>
      {order.instructions ? (
        <p className="mt-2 rounded bg-ds-status-pending-bg px-2 py-1 text-xs text-ds-status-pending-fg">
          {order.instructions}
        </p>
      ) : null}
      {onDelivered ? (
        <Button className="mt-3 w-full" disabled={isPending} onClick={onDelivered} type="button">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          Delivered
        </Button>
      ) : null}
    </li>
  );
}

/**
 * A steward's own room orders today, at every restaurant they deliver for: ready ones to take to
 * the bed (marked delivered there), and those still in the kitchen.
 */
export function MyDeliveriesPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const deliveries = useQuery({
    queryFn: async () => (await organizationApi.listMyDeliveries()).data,
    queryKey: deliveriesKey,
    refetchInterval: REFRESH_MS,
  });
  const deliver = useMutation({
    mutationFn: (id: string) => organizationApi.markOrderDelivered(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Not delivered',
        variant: 'error',
      });
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: deliveriesKey });
    },
  });
  const orders = deliveries.data ?? [];
  const ready = orders.filter((order) => order.status === 'READY');
  const cooking = orders.filter((order) => order.status !== 'READY');

  return (
    <section className="space-y-4">
      <AppPageHeader
        description="Room orders given to you. Take a ready one to the bed, then tap Delivered."
        title="My Deliveries"
      />
      {deliveries.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : deliveries.isError ? (
        <Panel className="p-4">
          <LoadError error={deliveries.error} />
        </Panel>
      ) : orders.length === 0 ? (
        <EmptyState
          description="When a cashier or the kitchen gives you a room order, it appears here."
          title="No deliveries for you right now"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { list: ready, title: 'Ready to take' },
            { list: cooking, title: 'In the kitchen' },
          ].map(({ list, title }) => (
            <Panel className="p-0" key={title}>
              <h2 className="flex items-center justify-between border-b border-ds-border px-4 py-2.5 text-sm font-semibold text-ds-text">
                {title}
                <span className="rounded-full bg-ds-subtle px-2 py-0.5 text-xs tabular-nums text-ds-muted">
                  {list.length}
                </span>
              </h2>
              <ul className="space-y-3 p-3">
                {list.map((order) => (
                  <DeliveryCard
                    isPending={deliver.isPending && deliver.variables === order.id}
                    key={order.id}
                    onDelivered={
                      order.status === 'READY' ? () => deliver.mutate(order.id) : undefined
                    }
                    order={order}
                  />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
