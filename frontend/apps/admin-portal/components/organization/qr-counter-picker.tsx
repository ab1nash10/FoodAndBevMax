'use client';

import type { Restaurant } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Which counter the restaurant's QR (room-service) orders are billed at. They are taken only
 * while that counter has a shift open, and go into that shift's takings. None: QR orders off.
 */
export function QrCounterPicker({ restaurant }: Readonly<{ restaurant: Restaurant }>) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [counterId, setCounterId] = useState(restaurant.qrCounterId ?? '');
  const countersQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listCounters({
          isActive: true,
          limit: 100,
          restaurantId: restaurant.id,
        })
      ).data.items,
    queryKey: queryKeys.restaurants('qr-counters', restaurant.id),
  });
  const save = useMutation({
    mutationFn: (next: string) =>
      organizationApi.setRestaurantQrCounter(restaurant.id, next || null),
    onError: (error) => {
      setCounterId(restaurant.qrCounterId ?? '');
      showToast({
        description: getApiErrorMessage(error),
        title: 'QR counter not saved',
        variant: 'error',
      });
    },
    onSuccess: (_, next) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      showToast({
        description: next
          ? 'Room-service orders from the QR are billed there while it has a shift open.'
          : 'The QR shows the menu but takes no orders.',
        title: next ? 'QR counter saved' : 'QR ordering turned off',
      });
    },
  });
  const canEdit = hasPermission('RESTAURANT_UPDATE');

  return (
    <div className="mt-5 grid gap-2 rounded-[24px] border border-ds-border bg-ds-surface p-4 sm:p-5">
      <label className="text-sm font-bold text-ds-text" htmlFor="qr-counter">
        Room-service orders are billed at
      </label>
      <Select
        disabled={!canEdit || save.isPending || countersQuery.isLoading}
        id="qr-counter"
        onChange={(event) => {
          setCounterId(event.target.value);
          save.mutate(event.target.value);
        }}
        value={counterId}
      >
        <option value="">No counter: QR ordering is off</option>
        {(countersQuery.data ?? []).map((counter) => (
          <option key={counter.id} value={counter.id}>
            {counter.counterName} ({counter.counterCode})
          </option>
        ))}
      </Select>
      <p className="text-xs leading-relaxed text-ds-muted">
        Orders are taken only while this counter has a shift open, are paid by UPI on the guest's
        phone, and count in that shift's takings. Counter pickup is ordered at the kiosk.
      </p>
    </div>
  );
}
