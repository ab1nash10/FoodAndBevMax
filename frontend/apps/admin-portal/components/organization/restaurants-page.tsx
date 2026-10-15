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
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel } from '@/components/ui';
import { Toggle } from '@/components/ui-controls';
import { IfCanOpen } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import type { Restaurant, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Pencil, Plus, QrCode, Utensils } from 'lucide-react';
import { useState } from 'react';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/organization/shared/list-controls';
import {
  activeFilterToBoolean,
  formatDate,
  listLimit,
} from '@/components/organization/shared/utils';
import {
  formatRestaurantLocationDisplay,
  freezeServicesMessage,
} from '@/components/organization/shared/locations';
import {
  getRestaurantStatusBadges,
  allowsOnlineOrdering,
  isRestaurantOpen,
} from '@/components/organization/shared/restaurants';
import type { ActiveFilter } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';
import { prefetchOnIntent, restaurantDetailQuery } from '@/lib/detail-queries';

function RestaurantThumbnail({ restaurant }: Readonly<{ restaurant: Restaurant }>) {
  if (restaurant.thumbnailUrl) {
    return (
      <div
        aria-label={`${restaurant.restaurantName} thumbnail`}
        className="h-14 w-14 shrink-0 rounded-lg border border-ds-border bg-cover bg-center shadow-xs"
        role="img"
        // Quoted, so a stored value cannot break out of url(); prefixed, so an uploaded
        // /uploads/... path resolves under the routing prefix like the avatars do.
        style={{ backgroundImage: `url(${JSON.stringify(withBasePath(restaurant.thumbnailUrl))})` }}
      />
    );
  }

  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-tile bg-ds-tile-locations-bg text-ds-tile-locations-fg">
      <Utensils className="h-6 w-6" />
    </span>
  );
}

export function RestaurantsPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [onlineUpdatingId, setOnlineUpdatingId] = useState<string | null>(null);

  const restaurantsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId: scopedHospitalId,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: queryKeys.restaurants({
      activeFilter,
      page,
      scopedHospitalId,
      search,
      sortBy,
      sortOrder,
    }),
  });

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setPage(1);
  });

  const onlineToggleMutation = useMutation({
    // The Online Ordering switch is the Online Orders option, not the Offline one.
    mutationFn: ({ id, nextIsOnline }: { id: string; nextIsOnline: boolean }) =>
      organizationApi.updateRestaurant(id, { isOnlineOrdersEnabled: nextIsOnline }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Online ordering was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setOnlineUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      showToast({
        title: variables.nextIsOnline ? 'Online ordering turned on' : 'Online ordering turned off',
        variant: 'success',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      // Offline means not active, so it follows this switch.
      organizationApi.updateRestaurant(id, { isActive, isOffline: !isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantOptions() });
      showToast({
        title: variables.isActive ? 'Restaurant activated' : 'Restaurant deactivated',
        variant: 'success',
      });
    },
  });

  const hasFilters = Boolean(searchInput || activeFilter);

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setPage(1);
  }

  function toggleRestaurantStatus(restaurant: Restaurant) {
    const nextIsActive = !restaurant.isActive;

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    statusMutation.mutate({ id: restaurant.id, isActive: nextIsActive });
  }

  const items = restaurantsQuery.data?.items ?? [];
  const meta = restaurantsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  const sortOptions = [
    { label: 'Created date', value: 'createdAt' },
    { label: 'Restaurant name', value: 'restaurantName' },
    { label: 'Restaurant code', value: 'restaurantCode' },
    { label: 'Status', value: 'isActive' },
  ];

  const handleOnlineToggle = (restaurant: Restaurant) => {
    setOnlineUpdatingId(restaurant.id);
    onlineToggleMutation.mutate({
      id: restaurant.id,
      nextIsOnline: !allowsOnlineOrdering(restaurant),
    });
  };

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/restaurants/new">
            <Button asChild>
              <Link href="/masters/restaurants/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Organization"
        icon={Utensils}
        subtitle="Manage restaurant profiles and ordering availability."
        title="Restaurants"
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
          <FiltersMenu activeCount={activeFilter ? 1 : 0}>
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
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
            options={sortOptions}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void restaurantsQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[30%] px-3 py-2.5">Restaurant</th>
                <th className="w-[14%] whitespace-nowrap px-3 py-2.5">Online Ordering</th>
                <th className="w-[17%] whitespace-nowrap px-3 py-2.5">Restaurant Availability</th>
                <th className="w-[19%] px-3 py-2.5">Restaurant Status</th>
                <th className="w-[168px] px-3 py-2.5 min-[1320px]:w-[300px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((restaurant) => {
                  const isOpen = isRestaurantOpen(restaurant);
                  const isOnline = allowsOnlineOrdering(restaurant);
                  const statusBadges = getRestaurantStatusBadges(restaurant);
                  const isOnlineUpdating = onlineUpdatingId === restaurant.id;

                  return (
                    <tr className="hover:bg-ds-subtle" key={restaurant.id}>
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-4">
                          <RestaurantThumbnail restaurant={restaurant} />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-ds-text">
                              {restaurant.restaurantName}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-ds-muted">
                              {formatRestaurantLocationDisplay(restaurant.hospital)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-ds-muted">
                              {restaurant.restaurantCode} · Updated{' '}
                              {formatDate(restaurant.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {/* Both switches read the same way: the switch, then its state. */}
                        <div
                          className="flex items-center gap-2"
                          // A closed restaurant takes no online orders; its switch is locked off.
                          title={
                            isOpen ? undefined : 'Activate the restaurant to change online ordering'
                          }
                        >
                          <Toggle
                            ariaLabel={`${restaurant.restaurantName} online ordering`}
                            checked={isOnline}
                            disabled={isOnlineUpdating || !isOpen}
                            onChange={() => handleOnlineToggle(restaurant)}
                          />
                          <span
                            className={cn(
                              'text-xs font-bold',
                              isOnline ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {isOnline ? 'On' : 'Off'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Toggle
                            ariaLabel={`${restaurant.restaurantName} restaurant availability`}
                            checked={restaurant.isActive}
                            disabled={statusMutation.isPending}
                            onChange={() => toggleRestaurantStatus(restaurant)}
                          />
                          <span
                            className={cn(
                              'text-xs font-bold',
                              restaurant.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {restaurant.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {statusBadges.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {statusBadges.map((badge) => (
                              <Badge key={badge.label} variant={badge.variant}>
                                {badge.label}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-ds-muted">None set</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <IfCanOpen href={`/masters/restaurants/${restaurant.id}/edit`}>
                            <Button asChild size="icon" variant="outline">
                              <Link
                                aria-label={`Edit ${restaurant.restaurantName}`}
                                href={`/masters/restaurants/${restaurant.id}/edit`}
                                title="Edit"
                                {...prefetchOnIntent(() =>
                                  queryClient.prefetchQuery(restaurantDetailQuery(restaurant.id)),
                                )}
                              >
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                              </Link>
                            </Button>
                          </IfCanOpen>
                          {/* Square like Edit on narrower screens, where the labels would push
                              the row past the window; the title names them there. */}
                          <Button
                            aria-label={`Print QR for ${restaurant.restaurantName}`}
                            className="min-[1320px]:w-auto min-[1320px]:px-4"
                            onClick={() =>
                              showToast({
                                title: 'QR printing will be available in QR module.',
                                variant: 'info',
                              })
                            }
                            size="icon"
                            title="Print QR"
                            type="button"
                            variant="outline"
                          >
                            <QrCode aria-hidden="true" className="h-4 w-4" />
                            <span className="hidden min-[1320px]:inline">Print QR</span>
                          </Button>
                          <Button
                            aria-label={`Activity for ${restaurant.restaurantName}`}
                            className="min-[1320px]:w-auto min-[1320px]:px-4"
                            onClick={() =>
                              showToast({
                                title:
                                  'Customer Orders Activity will be available in Restaurant Operations.',
                                variant: 'info',
                              })
                            }
                            size="icon"
                            title="Activity"
                            type="button"
                            variant="outline"
                          >
                            <Activity aria-hidden="true" className="h-4 w-4" />
                            <span className="hidden min-[1320px]:inline">Activity</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={5}
                  error={restaurantsQuery.error}
                  isError={restaurantsQuery.isError}
                  isLoading={restaurantsQuery.isLoading}
                  label="restaurants"
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
