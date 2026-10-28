'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader } from '@/components/design-system';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { saveTillKey, usePosTill } from './shared';

/** Why a POS screen does not open on this computer. */
export function PosClosed({
  children,
  problem,
}: Readonly<{ children?: ReactNode; problem: string }>) {
  return (
    <div className="rounded-card border border-dashed border-ds-border bg-ds-surface p-8 text-center sm:p-10">
      <MonitorSmartphone aria-hidden="true" className="mx-auto h-8 w-8 text-ds-muted" />
      <p className="mx-auto mt-3 max-w-xl font-semibold text-ds-text">{problem}</p>
      {children}
    </div>
  );
}

/**
 * For an admin on a computer that is no till yet: pick the POS device it is, and this browser
 * becomes that till (the server hands it a key, kept here). Setting a device up again moves its
 * till here, and its old computer stops being one.
 */
function TillSetup() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryFn: async () =>
      (await organizationApi.listPosDevices({ isActive: true, limit: 100 })).data.items,
    queryKey: queryKeys.posDevices('till-setup'),
  });
  const enroll = useMutation({
    mutationFn: async (posDeviceId: string) =>
      (await organizationApi.enrollTill(posDeviceId)).data.tillKey,
    onSuccess: async (tillKey) => {
      saveTillKey(tillKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.posWhoAmI() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() }),
      ]);
    },
  });

  return (
    <div className="mx-auto mt-6 max-w-xl text-left">
      <p className="text-sm font-semibold text-ds-text">Set up this computer as a till</p>
      <p className="mt-0.5 text-xs text-ds-muted">
        Pick its POS device. Only this browser becomes the till; cashiers cannot change it.
      </p>
      {enroll.isError ? (
        <p className="mt-2 text-sm text-ds-status-bad-fg" role="alert">
          {getApiErrorMessage(enroll.error)}
        </p>
      ) : null}
      {devices.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ds-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading POS devices…
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {(devices.data ?? []).map((device) => {
            const restaurants = device.restaurants
              .filter((restaurant) => restaurant.isActive)
              .map((restaurant) => restaurant.restaurantName)
              .join(', ');

            return (
              <li
                className="flex items-center gap-3 rounded-control-lg border border-ds-border px-3 py-2.5"
                key={device.id}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ds-text">
                    {device.name}
                  </span>
                  <span className="block truncate text-xs text-ds-muted">
                    {restaurants || 'No restaurant mapped'}
                  </span>
                </span>
                <Button
                  aria-label={`Make this computer the till of ${device.name}`}
                  className="pointer-coarse:h-11"
                  disabled={!restaurants || enroll.isPending}
                  onClick={() => enroll.mutate(device.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  This computer
                </Button>
              </li>
            );
          })}
          {devices.data?.length === 0 ? (
            <li className="text-sm text-ds-muted">
              No active POS devices. Add one under POS &amp; Payment Machines.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/**
 * The POS module opens only in a browser an admin set up as a POS device's till, and only for a
 * user assigned to the location of one of its restaurants. Anywhere else, for anyone else, it
 * says why; an admin can set the computer up there.
 */
export function PosGate({ children }: Readonly<{ children: ReactNode }>) {
  const till = usePosTill();
  const canSetUp = useAuth().hasPermission('POS_DEVICE_UPDATE');

  if (till.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const notATill = !till.isError && !till.data?.till;
  const problem = till.isError
    ? getApiErrorMessage(till.error)
    : notATill
      ? 'This computer is not set up as a till, so the POS screens do not open here.'
      : !till.data?.allowed
        ? `You are not assigned to the location of this till’s restaurant (${till.data?.restaurants.join(', ')}), so the POS screens do not open for you. Ask an admin to give you access to its location.`
        : null;

  if (problem) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Point of Sale" />
        <PosClosed problem={problem}>
          {notATill ? (
            canSetUp ? (
              <TillSetup />
            ) : (
              <p className="mt-2 text-sm text-ds-muted">
                Ask an admin to open the POS on this computer and set it up as a till.
              </p>
            )
          ) : null}
        </PosClosed>
      </section>
    );
  }

  return children;
}
