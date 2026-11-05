'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useLocationContext } from '@/components/location-context';
import { AppPageHeader } from '@/components/design-system';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { saveTillKey, usePosTill } from './shared';

/**
 * Why the till does not open for the location picked in the portal: it is another location's.
 * Null when it is the picked location's, or when all locations are picked.
 */
export function tillElsewhere(
  tillHospitalIds: string[],
  scopedHospitalId: string | undefined,
  locations: ReadonlyArray<{ hospitalName: string; id: string }>,
): string | null {
  if (!scopedHospitalId || tillHospitalIds.includes(scopedHospitalId)) return null;

  const nameOf = (id: string) => locations.find((location) => location.id === id)?.hospitalName;
  const tillAt =
    tillHospitalIds
      .map(nameOf)
      .filter((name): name is string => Boolean(name))
      .join(' or ') || 'another location';

  return `This till is at ${tillAt}, and you have ${nameOf(scopedHospitalId) ?? 'another location'} picked. Pick ${tillAt} at the top to use the POS here.`;
}

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
  // Only the picked location's devices: none are listed until a location is picked.
  const { scopedHospitalId } = useLocationContext();
  const devices = useQuery({
    enabled: Boolean(scopedHospitalId),
    queryFn: async () =>
      (
        await organizationApi.listPosDevices({
          hospitalId: scopedHospitalId,
          isActive: true,
          limit: 100,
        })
      ).data.items,
    queryKey: queryKeys.posDevices('till-setup', scopedHospitalId),
  });
  // A browser cannot read the computer's name: the admin types it, and the server checks it is
  // the device's Host Name.
  const [computerName, setComputerName] = useState('');
  const enroll = useMutation({
    mutationFn: async (posDeviceId: string) =>
      (await organizationApi.enrollTill(posDeviceId, computerName.trim())).data.tillKey,
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
        Type this computer’s name, then pick its POS device. Only this browser becomes the till;
        cashiers cannot change it.
      </p>
      <label className="mt-3 block text-sm font-medium text-ds-text" htmlFor="till-computer-name">
        This computer’s name
      </label>
      <input
        aria-describedby="till-computer-name-hint"
        className="mt-1 h-10 w-full rounded-control-lg border border-ds-border bg-ds-surface px-3 font-mono text-sm text-ds-text outline-hidden focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/15"
        id="till-computer-name"
        onChange={(event) => setComputerName(event.target.value)}
        placeholder="e.g. HO-LAP-1651"
        value={computerName}
      />
      <p className="mt-1 text-xs text-ds-muted" id="till-computer-name-hint">
        Windows: Settings → System → About → Device name. It must be the POS device’s Host Name.
      </p>
      {enroll.isError ? (
        <p className="mt-2 text-sm text-ds-status-bad-fg" role="alert">
          {getApiErrorMessage(enroll.error)}
        </p>
      ) : null}
      {!scopedHospitalId ? (
        <p className="mt-3 text-sm text-ds-muted">
          Pick a location at the top to see its POS devices.
        </p>
      ) : devices.isLoading ? (
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
                  disabled={!restaurants || !computerName.trim() || enroll.isPending}
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
  const { availableLocations, isLoadingLocations, scopedHospitalId } = useLocationContext();

  if (till.isLoading || isLoadingLocations) {
    return <Skeleton className="h-64 w-full" />;
  }

  const notATill = !till.isError && !till.data?.till;
  const problem = till.isError
    ? getApiErrorMessage(till.error)
    : notATill
      ? 'This computer is not set up as a till, so the POS screens do not open here.'
      : !till.data?.allowed
        ? `You are not assigned to the location of this till’s restaurant (${till.data?.restaurants.join(', ')}), so the POS screens do not open for you. Ask an admin to give you access to its location.`
        : tillElsewhere(till.data.hospitalIds, scopedHospitalId, availableLocations);

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
