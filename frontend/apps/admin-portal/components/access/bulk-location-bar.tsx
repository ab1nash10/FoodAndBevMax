'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessUser } from '@aahar/api-client';
import { Loader2, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast-provider';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi, userApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Bulk location assignment for the users list.
 *
 * Several locations can be picked, which is what an Admin (MULTI scope) needs. A single-location
 * role still accepts exactly one, so when the selection contains one of those the control stops
 * at one location rather than letting the request fail on the server.
 */
export function BulkLocationBar({
  onDone,
  selected,
}: Readonly<{ onDone: () => void; selected: AccessUser[] }>) {
  const [hospitalIds, setHospitalIds] = useState<string[]>([]);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const hospitalsQuery = useQuery({
    queryFn: async () => (await organizationApi.listHospitals({ limit: 100, page: 1 })).data,
    queryKey: queryKeys.accessHospitals(),
  });
  const hospitals = hospitalsQuery.data?.items ?? [];

  const singleScopeUsers = selected.filter((user) => user.locationScope === 'SINGLE');
  const multiScopeUsers = selected.filter((user) => user.locationScope === 'MULTI');
  const allScopeUsers = selected.filter((user) => user.locationScope === 'ALL');
  const limitedToOne = singleScopeUsers.length > 0;
  const exceedsSingleLimit = limitedToOne && hospitalIds.length > 1;

  const assignMutation = useMutation({
    mutationFn: () =>
      userApi.assignUserLocations({ hospitalIds, userIds: selected.map((u) => u.id) }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Locations were not assigned',
        variant: 'error',
      });
    },
    onSuccess(response) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessUsers() });
      showToast({
        description: `${response.data.updatedCount} user(s) updated.`,
        title: 'Locations assigned',
        variant: 'success',
      });
      setHospitalIds([]);
      onDone();
    },
  });

  const toggle = (id: string) =>
    setHospitalIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      // A single-location role can only ever hold one, so replace rather than add.
      return limitedToOne ? [id] : [...current, id];
    });

  return (
    <div className="space-y-3 border-b border-ds-teal-border/20 bg-ds-teal-soft/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-ds-teal-text">
          <MapPin className="h-4 w-4" />
          {selected.length} user(s) selected
        </span>
        <span className="text-xs text-ds-muted">
          {limitedToOne
            ? 'Pick one location — the selection includes a single-location role.'
            : 'Pick one or more locations.'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={hospitalIds.length === 0 || exceedsSingleLimit || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
            size="sm"
            type="button"
          >
            {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign {hospitalIds.length || ''} location{hospitalIds.length === 1 ? '' : 's'}
          </Button>
          <Button
            aria-label="Clear selection"
            onClick={onDone}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      <div
        aria-label="Locations to assign"
        className="flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-ds-border bg-white p-2"
        role="group"
      >
        {hospitalsQuery.isLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : hospitals.length === 0 ? (
          <p className="px-1 py-1 text-sm text-ds-muted">No locations available.</p>
        ) : (
          hospitals.map((hospital) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-ds-subtle"
              key={hospital.id}
            >
              <input
                checked={hospitalIds.includes(hospital.id)}
                onChange={() => toggle(hospital.id)}
                type={limitedToOne ? 'radio' : 'checkbox'}
              />
              {hospital.hospitalName}
            </label>
          ))
        )}
      </div>

      {allScopeUsers.length > 0 ? (
        <p className="text-xs text-ds-muted">
          {allScopeUsers.length} Super Admin–scope user(s) already reach every location, so this
          will not change what they can see.
        </p>
      ) : null}
      {multiScopeUsers.length > 0 ? (
        <p className="text-xs text-ds-muted">
          {multiScopeUsers.length} multi-location user(s) will be replaced with exactly the
          location(s) picked above.
        </p>
      ) : null}
      {limitedToOne ? (
        <p className="text-xs text-ds-status-pending-fg">
          {singleScopeUsers.length} selected user(s) hold a single-location role. Deselect them to
          assign several locations at once.
        </p>
      ) : null}
    </div>
  );
}
