'use client';

import { useState } from 'react';
import type { RestaurantOrder } from '@aahar/api-client';
import { AppPageHeader, EmptyState } from '@/components/design-system';
import { OrderBoard, useRestaurantOrders } from '@/components/organization/restaurant-orders-page';
import { Panel, Skeleton } from '@/components/ui';
import { FilterSearch, FilterTabs } from '@/components/ui-controls';
import { getApiErrorMessage } from '@/lib/api';
import { useUrlParam } from '@/lib/use-url-state';
import { CounterPicker, NoCounter, usePosCounter } from './shared';

type OrderView = 'all' | 'counter' | 'online' | 'room';

const views: OrderView[] = ['all', 'counter', 'room', 'online'];

function viewOf(order: RestaurantOrder): Exclude<OrderView, 'all'> {
  if (order.channel === 'ROOM') return 'room';
  return order.source === 'COUNTER' ? 'counter' : 'online';
}

/**
 * The live orders of the counter's restaurant, as the kitchen works them: billed at a counter,
 * for a room, or sent in by kiosks, QR and other apps.
 */
export function PosOrdersPageClient() {
  const { counter, counters, query: countersQuery, setCounterId } = usePosCounter();
  const [view, setView] = useUrlParam<OrderView>('view', 'all', views);
  const [search, setSearch] = useState('');
  const ordersQuery = useRestaurantOrders(counter?.restaurantId);
  const orders = ordersQuery.data ?? [];
  const term = search.trim().toLowerCase();
  const shown = orders.filter(
    (order) =>
      (view === 'all' || viewOf(order) === view) &&
      (!term ||
        order.orderNumber.toLowerCase().includes(term) ||
        (order.billNumber ?? '').toLowerCase().includes(term) ||
        (order.roomNumber ?? '').toLowerCase().includes(term)),
  );
  const count = (which: Exclude<OrderView, 'all'>) =>
    orders.filter((order) => viewOf(order) === which).length;

  if (!counter) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Orders" />
        <NoCounter isLoading={countersQuery.isLoading} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={<CounterPicker counter={counter} counters={counters} onChange={setCounterId} />}
        count={orders.length}
        description={`Open orders at ${counter.restaurant.restaurantName}, newest last. Pending and ready numbers also show on the TV board.`}
        title="Orders"
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Order source"
          onChange={setView}
          options={[
            { count: orders.length, label: 'All', value: 'all' },
            { count: count('counter'), label: 'Counter', value: 'counter' },
            { count: count('room'), label: 'Room', value: 'room' },
            { count: count('online'), label: 'Online & kiosk', value: 'online' },
          ]}
          value={view}
        />
        <div className="ml-auto w-full sm:w-72">
          <FilterSearch
            label="Search orders"
            onChange={setSearch}
            placeholder="Order no., bill no. or room"
            value={search}
          />
        </div>
      </div>
      {ordersQuery.isLoading ? (
        <Panel className="p-4">
          <Skeleton className="h-40 w-full" />
        </Panel>
      ) : ordersQuery.isError ? (
        <Panel className="p-4 text-sm text-ds-muted">{getApiErrorMessage(ordersQuery.error)}</Panel>
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            description="Bills completed at the counter appear here at once, as do orders from kiosks, QR ordering and other apps."
            title="No open orders"
          />
        </Panel>
      ) : (
        <OrderBoard orders={shown} restaurantId={counter.restaurantId} />
      )}
    </section>
  );
}
