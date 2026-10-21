'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { RowAction, StatStrip, tableStyles } from '@/components/design-system';
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
import { canOpenPath } from '@/lib/navigation';
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
import { Activity, BadgePercent, Pencil, Plus, QrCode, Utensils } from 'lucide-react';
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
import { StaffDiscountPanel } from '@/components/organization/staff-discount-panel';
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
  const router = useRouter();
  const { hasPermission } = useAuth();
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
  const [staffDiscountRestaurant, setStaffDiscountRestaurant] = useState<Restaurant | null>(null);

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

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listRestaurants({
            hospitalId: scopedHospitalId,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.restaurants('stats', scopedHospitalId ?? 'all'),
  });
  const stats = statsQuery.data;

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

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
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
        count={stats?.all}
        action={
          <IfCanOpen href="/masters/restaurants/new">
            <Button asChild>
              <Link href="/masters/restaurants/new">
                <Plus className="h-4 w-4" />
                New restaurant
              </Link>
            </Button>
          </IfCanOpen>
        }
        icon={Utensils}
        subtitle="Manage restaurant profiles and ordering availability."
        title="Restaurants"
      />
      <StatStrip
        label="Restaurants at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All restaurants',
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
            label: 'Inactive · offline',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />
      <Panel>
        <ListToolbar>
          <SearchInput
            label="Search restaurants"
            placeholder="Name, code, mobile, GST or FSSAI no."
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
          <table className={cn(tableStyles.table, 'min-w-215 table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[34%]')}>Restaurant</th>
                <th className={cn(tableStyles.th, 'w-[15%] whitespace-nowrap')}>Online ordering</th>
                <th className={cn(tableStyles.th, 'w-[16%] whitespace-nowrap')}>Availability</th>
                <th className={cn(tableStyles.th, 'w-[21%]')}>Restaurant status</th>
                <th className={cn(tableStyles.th, 'w-40')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((restaurant) => {
                  const isOpen = isRestaurantOpen(restaurant);
                  const isOnline = allowsOnlineOrdering(restaurant);
                  const statusBadges = getRestaurantStatusBadges(restaurant);
                  const isOnlineUpdating = onlineUpdatingId === restaurant.id;
                  const editHref = `/masters/restaurants/${restaurant.id}/edit`;
                  const ordersHref = `/masters/restaurants/${restaurant.id}/orders`;
                  const canEdit = canOpenPath(editHref, hasPermission);
                  const prefetchDetail = prefetchOnIntent(() =>
                    queryClient.prefetchQuery(restaurantDetailQuery(restaurant.id)),
                  );

                  return (
                    <tr
                      className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                      key={restaurant.id}
                      onClick={canEdit ? () => router.push(editHref) : undefined}
                      onMouseEnter={canEdit ? prefetchDetail.onMouseEnter : undefined}
                    >
                      <td className={tableStyles.td}>
                        <div className="flex min-w-0 items-center gap-3">
                          <RestaurantThumbnail restaurant={restaurant} />
                          <div className="min-w-0">
                            <p className={cn('truncate', tableStyles.title)}>
                              {restaurant.restaurantName}
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[13px] text-ds-muted">
                              {formatRestaurantLocationDisplay(restaurant.hospital)}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-ds-muted">
                              <span className={tableStyles.code}>{restaurant.restaurantCode}</span>
                              {' · Updated '}
                              {formatDate(restaurant.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Its own click: switching online ordering does not open the restaurant. */}
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
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
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
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
                      <td className={tableStyles.td}>
                        {statusBadges.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
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
                      <td className={cn(tableStyles.td, 'pr-3')}>
                        <span className="flex justify-end gap-0.5">
                          {canEdit ? (
                            <RowAction
                              icon={Pencil}
                              label={`Edit ${restaurant.restaurantName}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(editHref);
                              }}
                              {...prefetchDetail}
                            />
                          ) : null}
                          <RowAction
                            icon={QrCode}
                            label={`Print QR for ${restaurant.restaurantName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              showToast({
                                title: 'QR printing will be available in QR module.',
                                variant: 'info',
                              });
                            }}
                          />
                          <RowAction
                            icon={BadgePercent}
                            label={`Staff discount for ${restaurant.restaurantName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setStaffDiscountRestaurant(restaurant);
                            }}
                            title="Staff discount"
                          />
                          {canOpenPath(ordersHref, hasPermission) ? (
                            // Activity: the restaurant's live orders and its TV board.
                            <RowAction
                              icon={Activity}
                              label={`Activity for ${restaurant.restaurantName}: orders and TV board`}
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(ordersHref);
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
      <StaffDiscountPanel
        onClose={() => setStaffDiscountRestaurant(null)}
        restaurant={staffDiscountRestaurant}
      />
    </section>
  );
}
