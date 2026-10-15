'use client';

import Link from 'next/link';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { IfCanOpen } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { INDIAN_STATES, getCitiesForState } from '@/lib/india-locations';
import type { Hospital as HospitalRecord, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
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
import { useLegalEntityNames } from '@/components/organization/shared/hooks';
import { LegalEntityCell } from '@/components/organization/shared/legal-entity-select';
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

  const entityNamesQuery = useLegalEntityNames();
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

  const hasFilters = Boolean(
    searchInput || activeFilter || stateFilter || cityFilter || onlinePaymentFilter,
  );

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setStateFilter('');
    setCityFilter('');
    setOnlinePaymentFilter('');
    setPage(1);
  }

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
        <ListToolbar>
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [activeFilter, stateFilter, cityFilter, onlinePaymentFilter].filter(Boolean).length
            }
          >
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
            </FilterField>
            <FilterField label="State">
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
            </FilterField>
            <FilterField label="City">
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
            </FilterField>
            <FilterField label="Online payment">
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
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Created date', value: 'createdAt' },
              { label: 'Updated date', value: 'updatedAt' },
              { label: 'Name', value: 'title' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void locationsQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[22%] px-4 py-2.5">Location</th>
                <th className="w-[20%] px-4 py-2.5">Entity</th>
                <th className="w-[21%] px-4 py-2.5">Address</th>
                <th className="w-[10%] px-4 py-2.5">Online payment</th>
                <th className="w-[14%] px-4 py-2.5">Status</th>
                <th className="w-[8%] px-4 py-2.5">Updated</th>
                <th className="w-16 px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((location) => {
                  const title = getLocationTitle(location);
                  const displayName = getLocationDisplayName(location);
                  const place = [location.city, location.state].filter(Boolean).join(', ');

                  return (
                    <tr className="hover:bg-ds-subtle" key={location.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ds-text">{title}</p>
                        <p className="line-clamp-1 text-xs text-ds-muted">
                          {[getLocationCode(location), displayName === title ? null : displayName]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <LegalEntityCell
                          entity={
                            location.legalEntityId
                              ? entityNamesQuery.data?.get(location.legalEntityId)
                              : undefined
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p
                          className="line-clamp-1 text-ds-text-3"
                          title={location.address ?? undefined}
                        >
                          {nullableText(location.address)}
                        </p>
                        <p className="line-clamp-1 text-xs text-ds-muted">
                          {[place, getLocationPostalCode(location)].filter(Boolean).join(' ') ||
                            nullableText(null)}
                        </p>
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
                      <td className="px-4 py-3 text-xs text-ds-muted">
                        {formatDate(location.updatedAt)}
                      </td>
                      <td className="px-2 py-3">
                        <Button asChild size="icon" variant="outline">
                          <Link
                            aria-label={`Edit ${title}`}
                            href={`/masters/hospitals/${location.id}/locations#details`}
                            title="Edit"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={7}
                  error={locationsQuery.error}
                  isError={locationsQuery.isError}
                  isLoading={locationsQuery.isLoading}
                  atLocation={false}
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
