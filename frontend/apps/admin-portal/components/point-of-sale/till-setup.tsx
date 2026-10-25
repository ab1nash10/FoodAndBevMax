'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Why Billing is closed on this computer, and for an admin, setting it up as a till: pick its
 * POS device and this browser remembers that device's hostname. Cashiers only see why.
 */
export function TillSetup({
  host,
  onChoose,
  problem,
}: Readonly<{ host: string; onChoose: (hostName: string) => void; problem: string }>) {
  const { hasPermission } = useAuth();
  const canSetUp = hasPermission('POS_DEVICE_UPDATE');
  const devices = useQuery({
    enabled: canSetUp,
    queryFn: async () =>
      (await organizationApi.listPosDevices({ isActive: true, limit: 100 })).data.items,
    queryKey: queryKeys.posDevices('till-setup'),
  });

  return (
    <div className="rounded-card border border-dashed border-ds-border bg-ds-surface p-8 text-center sm:p-10">
      <MonitorSmartphone aria-hidden="true" className="mx-auto h-8 w-8 text-ds-muted" />
      <p className="mx-auto mt-3 max-w-xl font-semibold text-ds-text">{problem}</p>
      {host ? <p className="mt-1 text-sm text-ds-muted">This computer: {host}</p> : null}

      {canSetUp ? (
        <div className="mx-auto mt-6 max-w-xl text-left">
          <p className="text-sm font-semibold text-ds-text">Set up this computer as a till</p>
          <p className="mt-0.5 text-xs text-ds-muted">
            Pick its POS device. This browser remembers it; cashiers cannot change it.
          </p>
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
                        {device.hostName ? `Hostname ${device.hostName}` : 'No hostname yet'}
                        {restaurants ? ` · ${restaurants}` : ' · No restaurant mapped'}
                      </span>
                    </span>
                    <Button
                      className="pointer-coarse:h-11"
                      disabled={!device.hostName || !restaurants}
                      onClick={() => device.hostName && onChoose(device.hostName)}
                      size="sm"
                      title={
                        device.hostName
                          ? undefined
                          : 'Add its hostname under POS & Payment Machines first'
                      }
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
      ) : (
        <p className="mt-2 text-sm text-ds-muted">
          Ask an admin to set up this computer as a till.
        </p>
      )}
    </div>
  );
}
