'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
 * On a computer that is no till yet: anyone who may use the POS types the computer's name, and
 * this browser becomes the till of the POS device (at their locations) with that Host Name. The
 * server hands it a key, kept here; every browser typing the same name shares the till.
 */
function TillSetup() {
  const queryClient = useQueryClient();
  // A browser cannot read the computer's name: the user types it, and the server finds the
  // POS device whose Host Name it is.
  const [computerName, setComputerName] = useState('');
  const enroll = useMutation({
    mutationFn: async () => (await organizationApi.enrollTill(computerName.trim())).data.tillKey,
    onSuccess: async (tillKey) => {
      saveTillKey(tillKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.posWhoAmI() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() }),
      ]);
    },
  });

  return (
    <form
      className="mx-auto mt-6 max-w-xl text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (computerName.trim()) enroll.mutate();
      }}
    >
      <label className="block text-sm font-medium text-ds-text" htmlFor="till-computer-name">
        This computer’s name
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          aria-describedby="till-computer-name-hint"
          className="h-10 min-w-0 flex-1 rounded-control-lg border border-ds-border bg-ds-surface px-3 font-mono text-sm text-ds-text outline-hidden focus-visible:border-ds-primary focus-visible:ring-2 focus-visible:ring-ds-primary/15"
          id="till-computer-name"
          onChange={(event) => setComputerName(event.target.value)}
          placeholder="e.g. HO-LAP-1651"
          value={computerName}
        />
        <Button disabled={!computerName.trim() || enroll.isPending} type="submit">
          {enroll.isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : null}
          Open POS
        </Button>
      </div>
      <p className="mt-1 text-xs text-ds-muted" id="till-computer-name-hint">
        Windows: Settings → System → About → Device name. It must be the Host Name of a POS device
        at your locations.
      </p>
      {enroll.isError ? (
        <p className="mt-2 text-sm text-ds-status-bad-fg" role="alert">
          {getApiErrorMessage(enroll.error)}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The POS module opens only in a browser an admin set up as a POS device's till, and only for a
 * user assigned to the location of one of its restaurants. Anywhere else, for anyone else, it
 * says why; an admin can set the computer up there.
 */
export function PosGate({ children }: Readonly<{ children: ReactNode }>) {
  const till = usePosTill();
  const { availableLocations, isLoadingLocations, scopedHospitalId } = useLocationContext();

  if (till.isLoading || isLoadingLocations) {
    return <Skeleton className="h-64 w-full" />;
  }

  const notATill = !till.isError && !till.data?.till;
  const problem = till.isError
    ? getApiErrorMessage(till.error)
    : notATill
      ? 'This computer is not set up as a till yet. Type its name to open the POS here.'
      : !till.data?.allowed
        ? `You are not assigned to the location of this till’s restaurant (${till.data?.restaurants.join(', ')}), so the POS screens do not open for you. Ask an admin to give you access to its location.`
        : tillElsewhere(till.data.hospitalIds, scopedHospitalId, availableLocations);

  if (problem) {
    return (
      <section className="space-y-4">
        <AppPageHeader title="Point of Sale" />
        <PosClosed problem={problem}>{notATill ? <TillSetup /> : null}</PosClosed>
      </section>
    );
  }

  return children;
}
