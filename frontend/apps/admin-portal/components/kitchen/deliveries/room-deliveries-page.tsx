'use client';

import type { RoomDeliveries, RoomDelivery } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, EmptyState } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

// As the restaurant order board: a new order or a steward's change shows within this.
const REFRESH_MS = 5000;

type Steward = RoomDeliveries['stewards'][number];

function minutesAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function stage(order: RoomDelivery): string {
  if (order.status === 'READY') return `Ready ${minutesAgo(order.readyAt ?? order.placedAt)}`;

  return order.status === 'PREPARING' ? 'In kitchen' : 'New';
}

function DeliveryCard({
  isPending,
  onSteward,
  order,
  stewards,
}: Readonly<{
  isPending: boolean;
  /** Set when the user may give orders to stewards. */
  onSteward?: (stewardId: string | null) => void;
  order: RoomDelivery;
  stewards: Steward[];
}>) {
  // Only a Delivery Operator of the order's own location can take it; the one who has it stays
  // listed even if they no longer are one, so the picker never shows someone else.
  const choices = stewards.filter((steward) => steward.hospitalIds.includes(order.hospitalId));
  if (order.stewardId && !choices.some((steward) => steward.id === order.stewardId)) {
    choices.push({
      employeeCode: '',
      hospitalIds: [order.hospitalId],
      id: order.stewardId,
      name: order.stewardName ?? 'Current steward',
    });
  }
  const ready = order.status === 'READY';

  return (
    <li className="rounded-md border border-ds-border bg-ds-surface p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tabular-nums text-ds-text">{order.orderNumber}</span>
        <span
          className={
            ready
              ? 'rounded bg-ds-status-ok-bg px-1.5 py-0.5 text-xs font-semibold text-ds-status-ok-fg'
              : 'rounded bg-ds-subtle px-1.5 py-0.5 text-xs font-medium text-ds-muted'
          }
        >
          {stage(order)}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-ds-link">
        Room {order.roomNumber ?? '-'}
        {order.bedNumber ? ` · Bed ${order.bedNumber}` : ''}
      </p>
      <p className="text-xs text-ds-muted">{order.restaurantName}</p>
      {order.items.length ? (
        <p className="mt-1.5 text-sm text-ds-text">
          {order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}
        </p>
      ) : null}
      {/* A steward gave it back from the bed: why, until someone gives it again. */}
      {order.undeliveredReason && !order.stewardId ? (
        <p className="mt-2 rounded bg-ds-status-bad-bg px-2 py-1 text-xs font-semibold text-ds-status-bad-fg">
          Couldn’t deliver: {order.undeliveredReason}
        </p>
      ) : null}
      {onSteward ? (
        <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ds-text-3">
          Steward
          <Select
            aria-label={`Steward for order ${order.orderNumber}`}
            className="h-8 min-w-0 flex-1 text-xs"
            disabled={isPending}
            onChange={(event) => onSteward(event.target.value || null)}
            value={order.stewardId ?? ''}
          >
            <option value="">None</option>
            {choices.map((steward) => (
              <option key={steward.id} value={steward.id}>
                {steward.employeeCode ? `${steward.name} (${steward.employeeCode})` : steward.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
    </li>
  );
}

function Section({
  children,
  count,
  title,
}: Readonly<{ children: ReactNode; count: number; title: string }>) {
  const id = useId();

  return (
    <Panel aria-labelledby={id} className="flex min-h-48 flex-col p-0" role="region">
      <h2
        className="flex items-center justify-between border-b border-ds-border px-4 py-2.5 text-sm font-semibold text-ds-text"
        id={id}
      >
        {title}
        <span className="rounded-full bg-ds-subtle px-2 py-0.5 text-xs tabular-nums text-ds-muted">
          {count}
        </span>
      </h2>
      <div className="flex-1 space-y-4 p-3">{children}</div>
    </Panel>
  );
}

/**
 * Room deliveries for whoever runs them (admins, the kitchen): every open room order at the
 * header's location, waiting ones first (with why a steward gave one back), then each steward's,
 * and who it can be given to. A steward's own phone screen is My deliveries (/deliveries).
 */
export function RoomDeliveriesPageClient() {
  const { hasPermission } = useAuth();
  const { locationLabel, scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canAssign = hasPermission('ORDER_STEWARD_ASSIGN');
  const deliveriesQuery = useQuery({
    queryFn: async () => (await organizationApi.listRoomDeliveries(scopedHospitalId)).data,
    queryKey: queryKeys.restaurantOrders('room-deliveries', scopedHospitalId),
    refetchInterval: REFRESH_MS,
  });
  const stewardMutation = useMutation({
    mutationFn: ({ id, stewardId }: { id: string; stewardId: string | null }) =>
      organizationApi.setOrderSteward(id, stewardId),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Steward not saved',
        variant: 'error',
      });
    },
    onSettled() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantOrders() });
    },
  });
  const data = deliveriesQuery.data;
  const orders = data?.orders ?? [];
  const stewards = data?.stewards ?? [];
  const waiting = orders.filter((order) => !order.stewardId);
  const taken = orders.filter((order) => order.stewardId);
  const bySteward = [...new Set(taken.map((order) => order.stewardId!))]
    .map((stewardId) => {
      const steward = stewards.find((candidate) => candidate.id === stewardId);
      const name =
        steward?.name ?? taken.find((order) => order.stewardId === stewardId)?.stewardName;

      return {
        id: stewardId,
        label: steward ? `${steward.name} (${steward.employeeCode})` : (name ?? 'Steward'),
        orders: taken.filter((order) => order.stewardId === stewardId),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
  const card = (order: RoomDelivery) => (
    <DeliveryCard
      isPending={stewardMutation.isPending && stewardMutation.variables?.id === order.id}
      key={order.id}
      onSteward={
        canAssign ? (stewardId) => stewardMutation.mutate({ id: order.id, stewardId }) : undefined
      }
      order={order}
      stewards={stewards}
    />
  );
  const delivered = data ? (
    <p className="text-sm text-ds-muted">
      Delivered today:{' '}
      <span className="font-semibold tabular-nums text-ds-text">{data.deliveredToday}</span>
    </p>
  ) : null;

  return (
    <div className="space-y-5">
      <AppPageHeader
        description={`Every open room order at ${scopedHospitalId ? locationLabel : 'your locations'}, and the steward taking it. Stewards see their own on their phone, under My deliveries.`}
        eyebrow="Kitchen"
        title="Room deliveries"
      />
      {deliveriesQuery.isLoading ? (
        <Panel className="p-4">
          <Skeleton className="h-40 w-full" />
        </Panel>
      ) : deliveriesQuery.isError ? (
        <Panel className="p-4 text-sm text-ds-muted">
          {getApiErrorMessage(deliveriesQuery.error)}
        </Panel>
      ) : orders.length === 0 ? (
        <Panel>
          <EmptyState
            description="A room order shows here from the moment it is placed until it is delivered at the bed."
            title="No room orders open right now"
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section count={waiting.length} title="Waiting for a steward">
            {waiting.length ? (
              <ul className="space-y-3">{waiting.map(card)}</ul>
            ) : (
              <p className="text-sm text-ds-muted">Every open room order has a steward.</p>
            )}
          </Section>
          <Section count={taken.length} title="With a steward">
            {bySteward.length ? (
              bySteward.map((group) => (
                <div aria-label={group.label} key={group.id} role="group">
                  <h3 className="mb-2 text-[13px] font-semibold text-ds-text-2">{group.label}</h3>
                  <ul className="space-y-3">{group.orders.map(card)}</ul>
                </div>
              ))
            ) : (
              <p className="text-sm text-ds-muted">No steward has a room order right now.</p>
            )}
          </Section>
        </div>
      )}
      {delivered}
    </div>
  );
}
