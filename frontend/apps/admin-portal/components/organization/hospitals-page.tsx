'use client';

import Link from 'next/link';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { IfCanOpen } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { INDIAN_STATES, getCitiesForState } from '@/lib/india-locations';
import type { Hospital as HospitalRecord, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, MapPin, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ActiveFilterSelect,
  FlexibleToolbar,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusToggleCell,
} from '@/components/organization/shared/list-controls';
import {
  activeFilterToBoolean,
  formatDate,
  listLimit,
  nullableText,
} from '@/components/organization/shared/utils';
import {
  freezeServicesMessage,
  getLocationCode,
  getLocationDisplayName,
  getLocationPostalCode,
  getLocationTitle,
} from '@/components/organization/shared/locations';
import { onlinePaymentOptions } from '@/components/organization/shared/locations';
import type { ActiveFilter, OnlinePaymentFilter } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function HospitalsPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [onlinePaymentFilter, setOnlinePaymentFilter] = useState<OnlinePaymentFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const cityOptions = getCitiesForState(stateFilter);

  useEffect(() => {
    if (cityFilter && cityOptions.length > 0 && !cityOptions.includes(cityFilter)) {
      setCityFilter('');
    }
  }, [cityFilter, cityOptions]);

  const locationsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        city: cityFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        onlinePaymentOption: onlinePaymentFilter || undefined,
        page,
        search,
        sortBy,
        sortOrder,
        state: stateFilter || undefined,
      });

      return response.data;
    },
    queryKey: queryKeys.hospitals({
      activeFilter,
      cityFilter,
      onlinePaymentFilter,
      page,
      search,
      sortBy,
      sortOrder,
      stateFilter,
    }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateHospital(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitals() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalOptions() });
      showToast({
        title: variables.isActive ? 'Location activated' : 'Location deactivated',
        variant: 'success',
      });
    },
  });

  const items = locationsQuery.data?.items ?? [];
  const meta = locationsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  function toggleLocationStatus(location: HospitalRecord) {
    const nextIsActive = !location.isActive;

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    setStatusUpdatingId(location.id);
    statusMutation.mutate({ id: location.id, isActive: nextIsActive });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/locations/new">
            <Button asChild>
              <Link href="/masters/locations/new">
                <Plus className="h-4 w-4" />
                Add Location
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Masters"
        icon={MapPin}
        subtitle="Manage operating locations for food and cafeteria services."
        title="Locations"
      />
      <Panel>
        <FlexibleToolbar>
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <Select
            onChange={(event) => {
              setStateFilter(event.target.value);
              setPage(1);
            }}
            value={stateFilter}
          >
            <option value="">All states</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
          <Select
            disabled={!stateFilter}
            onChange={(event) => {
              setCityFilter(event.target.value);
              setPage(1);
            }}
            value={cityFilter}
          >
            <option value="">All cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setOnlinePaymentFilter(event.target.value as OnlinePaymentFilter);
              setPage(1);
            }}
            value={onlinePaymentFilter}
          >
            <option value="">All payment options</option>
            {onlinePaymentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="title">Name</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void locationsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </FlexibleToolbar>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[18%] px-4 py-2.5">Title</th>
                <th className="w-[13%] px-4 py-2.5">Location Code</th>
                <th className="w-[17%] px-4 py-2.5">Display Name</th>
                <th className="w-[12%] px-4 py-2.5">State</th>
                <th className="w-[12%] px-4 py-2.5">City</th>
                <th className="w-[10%] px-4 py-2.5">Postal Code</th>
                <th className="w-[12%] px-4 py-2.5">Online Payment</th>
                <th className="w-[18%] px-4 py-2.5">Status</th>
                <th className="w-[13%] px-4 py-2.5">Updated</th>
                <th className="w-[12%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((location) => (
                  <tr className="hover:bg-ds-subtle" key={location.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-ds-text">{getLocationTitle(location)}</p>
                        <p className="line-clamp-1 text-xs text-ds-muted">
                          {nullableText(location.address)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{getLocationCode(location)}</td>
                    <td className="px-4 py-3 text-ds-text-3">{getLocationDisplayName(location)}</td>
                    <td className="px-4 py-3 text-ds-text-3">{nullableText(location.state)}</td>
                    <td className="px-4 py-3 text-ds-text-3">{nullableText(location.city)}</td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {nullableText(getLocationPostalCode(location))}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{location.onlinePaymentOption}</td>
                    <td className="px-4 py-3">
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === location.id}
                        isActive={location.isActive}
                        onToggle={() => toggleLocationStatus(location)}
                        showFrozenMessage={!location.isActive}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-muted">
                      {formatDate(location.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/masters/hospitals/${location.id}/locations#details`}>
                          <Eye className="h-4 w-4" />
                          View/Edit
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={10}
                  error={locationsQuery.error}
                  isError={locationsQuery.isError}
                  isLoading={locationsQuery.isLoading}
                  label="locations"
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}
