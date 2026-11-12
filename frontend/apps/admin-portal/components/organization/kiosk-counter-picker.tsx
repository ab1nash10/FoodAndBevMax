'use client';

import type { Restaurant } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const words = {
  help: "Paid at the kiosk by UPI or this counter's card machine; taken only while this counter has a shift open, and counted in that shift's takings.",
  label: 'Kiosk orders are billed at',
  none: 'No counter: the kiosk takes no orders',
  off: 'The kiosk shows the menu but takes no orders.',
  offTitle: 'Kiosk turned off',
  saved: 'Kiosk orders, paid at the kiosk, are billed there while it has a shift open.',
  savedTitle: 'Kiosk counter saved',
};

/**
 * Which counter the restaurant's kiosk orders are billed at. They are taken only while that
 * counter has a shift open, and go into that shift's takings. None: the kiosk is off.
 */
export function KioskCounterPicker({
  className = 'mt-5',
  restaurant,
}: Readonly<{ className?: string; restaurant: Restaurant }>) {
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const current = restaurant.kioskCounterId ?? '';
  const [counterId, setCounterId] = useState(current);
  const countersQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listCounters({
          isActive: true,
          limit: 100,
          restaurantId: restaurant.id,
        })
      ).data.items,
    queryKey: queryKeys.restaurants('kiosk-counters', restaurant.id),
  });
  const save = useMutation({
    mutationFn: (next: string): Promise<unknown> =>
      organizationApi.setRestaurantKioskCounter(restaurant.id, next || null),
    onError: (error) => {
      setCounterId(current);
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kiosk counter not saved',
        variant: 'error',
      });
    },
    onSuccess: (_, next) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      showToast({
        description: next ? words.saved : words.off,
        title: next ? words.savedTitle : words.offTitle,
      });
    },
  });
  const canEdit = hasPermission('RESTAURANT_UPDATE');
  const id = 'kiosk-counter';

  return (
    <div
      className={`${className} grid gap-2 rounded-[24px] border border-ds-border bg-ds-surface p-4 sm:p-5`}
    >
      <label className="text-sm font-bold text-ds-text" htmlFor={id}>
        {words.label}
      </label>
      <Select
        disabled={!canEdit || save.isPending || countersQuery.isLoading}
        id={id}
        onChange={(event) => {
          setCounterId(event.target.value);
          save.mutate(event.target.value);
        }}
        value={counterId}
      >
        <option value="">{words.none}</option>
        {(countersQuery.data ?? []).map((counter) => (
          <option key={counter.id} value={counter.id}>
            {counter.counterName} ({counter.counterCode})
          </option>
        ))}
      </Select>
      <p className="text-xs leading-relaxed text-ds-muted">{words.help}</p>
    </div>
  );
}
