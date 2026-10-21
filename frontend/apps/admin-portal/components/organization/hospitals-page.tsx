'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { DateTimeCell, RowAction, StatStrip, tableStyles } from '@/components/design-system';
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
import { canOpenPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';
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
  const router = useRouter();
  const { hasPermission } = useAuth();
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

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (await organizationApi.listHospitals({ isActive, limit: 0 })).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.hospitals('stats'),
  });
  const stats = statsQuery.data;

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

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

  return (
    <section className="space-y-5">
      <PageHeader
        count={stats?.all}
        action={
          <IfCanOpen href="/masters/locations/new">
            <Button asChild>
              <Link href="/masters/locations/new">
                <Plus className="h-4 w-4" />
                New location
              </Link>
            </Button>
          </IfCanOpen>
        }
        icon={MapPin}
        subtitle="Manage operating locations for food and cafeteria services."
        title="Locations"
      />
      <StatStrip
        label="Locations at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All locations',
            onSelect: () => showStatus(''),
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive · services frozen',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />
      <Panel>
        <ListToolbar>
          <SearchInput
            label="Search locations"
            placeholder="Name, code, city or bill prefix"
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
          <table className={cn(tableStyles.table, 'min-w-215 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[22%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[20%]')}>Entity</th>
                <th className={cn(tableStyles.th, 'w-[21%]')}>Address</th>
                <th className={cn(tableStyles.th, 'w-[10%]')}>Online payment</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[9%]')}>Updated</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((location) => {
                  const title = getLocationTitle(location);
                  const displayName = getLocationDisplayName(location);
                  const place = [location.city, location.state].filter(Boolean).join(', ');
                  const editHref = `/masters/locations/${location.id}/edit`;
                  const canOpen = canOpenPath(editHref, hasPermission);

                  return (
                    <tr
                      className={cn(tableStyles.row, !canOpen && 'cursor-default')}
                      key={location.id}
                      onClick={canOpen ? () => router.push(editHref) : undefined}
                    >
                      <td className={tableStyles.td}>
                        <p className={cn('truncate', tableStyles.title)}>{title}</p>
                        <p className="truncate text-xs text-ds-muted">
                          <span className={tableStyles.code}>{getLocationCode(location)}</span>
                          {displayName === title ? null : ` · ${displayName}`}
                        </p>
                      </td>
                      <td className={tableStyles.td}>
                        <LegalEntityCell
                          entity={
                            location.legalEntityId
                              ? entityNamesQuery.data?.get(location.legalEntityId)
                              : undefined
                          }
                        />
                      </td>
                      <td className={tableStyles.td}>
                        <p
                          className="line-clamp-1 text-ds-text-2"
                          title={location.address ?? undefined}
                        >
                          {nullableText(location.address)}
                        </p>
                        <p className="line-clamp-1 text-xs text-ds-muted">
                          {[place, getLocationPostalCode(location)].filter(Boolean).join(' ') ||
                            nullableText(null)}
                        </p>
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {location.onlinePaymentOption}
                      </td>
                      {/* Its own click: switching the status does not open the location. */}
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                        <StatusToggleCell
                          disabled={statusMutation.isPending && statusUpdatingId === location.id}
                          isActive={location.isActive}
                          onToggle={() => toggleLocationStatus(location)}
                          showFrozenMessage={!location.isActive}
                        />
                      </td>
                      <td className={tableStyles.td}>
                        <DateTimeCell value={location.updatedAt} />
                      </td>
                      <td className={cn(tableStyles.td, 'pr-3')}>
                        <span className="flex justify-end">
                          {canOpen ? (
                            <RowAction
                              icon={Pencil}
                              label={`Edit ${title}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(editHref);
                              }}
                            />
                          ) : null}
                        </span>
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
