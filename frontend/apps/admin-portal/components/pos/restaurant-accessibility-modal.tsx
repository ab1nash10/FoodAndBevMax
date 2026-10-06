'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PosDevice } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { Modal } from '@/components/ui-controls';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useRestaurantOptions } from '@/components/pos/shared/utils';
import { queryKeys } from '@/lib/query-keys';

export function RestaurantAccessibilityModal({
  device,
  onClose,
}: Readonly<{
  device?: PosDevice;
  onClose: () => void;
}>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const restaurantsQuery = useRestaurantOptions(device?.hospitalId);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setSelectedIds(device?.restaurantIds ?? []);
  }, [device]);

  const mutation = useMutation({
    mutationFn: (restaurantIds: string[]) => {
      if (!device) {
        throw new Error('No POS device selected.');
      }

      return organizationApi.updatePosDevice(device.id, { restaurantIds });
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant accessibility was not updated',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.posDevices() });
      showToast({ title: 'Restaurant accessibility updated', variant: 'success' });
      onClose();
    },
  });

  const toggleRestaurant = (restaurantId: string) => {
    setSelectedIds((current) =>
      current.includes(restaurantId)
        ? current.filter((id) => id !== restaurantId)
        : [...current, restaurantId],
    );
  };

  return (
    <Modal
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !device}
            onClick={() => mutation.mutate(selectedIds)}
            type="button"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(device)}
      title={"Restaurant's Accessibility - " + (device?.code ?? '')}
    >
      <div className="grid gap-2">
        {restaurantsQuery.isLoading ? <Skeleton className="h-11" /> : null}
        {!restaurantsQuery.isLoading && restaurantsQuery.data?.length === 0 ? (
          <p className="text-sm text-ds-muted">No active restaurants found for this location.</p>
        ) : null}
        {restaurantsQuery.data?.map((restaurant) => (
          <label
            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-ds-text-2 shadow-xs"
            key={restaurant.id}
          >
            <input
              checked={selectedIds.includes(restaurant.id)}
              className="h-4 w-4 accent-teal-600"
              onChange={() => toggleRestaurant(restaurant.id)}
              type="checkbox"
            />
            {restaurant.restaurantName}
          </label>
        ))}
      </div>
    </Modal>
  );
}
