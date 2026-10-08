'use client';

import Link from 'next/link';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel, Select } from '@/components/ui';
import { DetailsModal, Toggle } from '@/components/ui-controls';
import { IfCanOpen } from '@/components/record-link';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import {
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
  useUrlSearchParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import type { Restaurant, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Eye, Pencil, Plus, QrCode, RefreshCw, Utensils } from 'lucide-react';
import { useState } from 'react';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  ToolbarGrid,
} from '@/components/organization/shared/list-controls';
import {
  activeFilterToBoolean,
  formatDate,
  listLimit,
  nullableText,
} from '@/components/organization/shared/utils';
import {
  formatRestaurantLocationDisplay,
  freezeServicesMessage,
} from '@/components/organization/shared/locations';
import {
  getRestaurantOptionBadges,
  isRestaurantOnline,
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

function RestaurantOnlineSwitch({
  disabled,
  isOnline,
  onToggle,
}: Readonly<{
  disabled: boolean;
  isOnline: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      aria-checked={isOnline}
      aria-label={isOnline ? 'Set restaurant offline' : 'Set restaurant online'}
      className={cn(
        'inline-flex h-7 w-12 items-center rounded-full border p-1 transition focus:outline-hidden focus:ring-2 focus:ring-ds-primary/20 disabled:cursor-not-allowed disabled:opacity-60',
        isOnline ? 'border-ds-primary bg-ds-primary' : 'border-ds-input bg-ds-input',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'h-5 w-5 rounded-full bg-white shadow-xs transition',
          isOnline ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
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
  const [viewingRestaurant, setViewingRestaurant] = useState<Restaurant | null>(null);
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
    mutationFn: ({ id, nextIsOnline }: { id: string; nextIsOnline: boolean }) =>
      organizationApi.updateRestaurant(id, {
        isOnlineOrdersEnabled: nextIsOnline,
        onlineOrders: nextIsOnline,
        onlineOrderingEnabled: nextIsOnline,
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Online status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setOnlineUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      showToast({
        title: variables.nextIsOnline ? 'Restaurant is online' : 'Restaurant is offline',
        variant: 'success',
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateRestaurant(id, { isActive }),
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
      nextIsOnline: !isRestaurantOnline(restaurant),
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
        <ToolbarGrid>
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
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void restaurantsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </ToolbarGrid>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-3 text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[36%] px-4 py-2">Restaurant</th>
                <th className="w-[14%] px-4 py-2">Online</th>
                <th className="w-[30%] px-4 py-2">Status / Options</th>
                <th className="w-[20%] px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((restaurant) => {
                  const isOnline = isRestaurantOnline(restaurant);
                  const optionBadges = getRestaurantOptionBadges(restaurant);
                  const isOnlineUpdating = onlineUpdatingId === restaurant.id;

                  return (
                    <tr className="group" key={restaurant.id}>
                      <td className="rounded-l-xl border-y border-l border-ds-border bg-white p-4 shadow-xs shadow-ds-text/5 transition group-hover:border-ds-teal-border group-hover:bg-ds-teal-soft/30 dark:shadow-black/20">
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
                              {restaurant.restaurantCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border-y border-ds-border bg-white p-4 shadow-xs shadow-ds-text/5 transition group-hover:border-ds-teal-border group-hover:bg-ds-teal-soft/30 dark:shadow-black/20">
                        <div className="flex flex-col gap-2">
                          <RestaurantOnlineSwitch
                            disabled={isOnlineUpdating}
                            isOnline={isOnline}
                            onToggle={() => handleOnlineToggle(restaurant)}
                          />
                          <span className="text-xs font-medium text-ds-muted">
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="border-y border-ds-border bg-white p-4 shadow-xs shadow-ds-text/5 transition group-hover:border-ds-teal-border group-hover:bg-ds-teal-soft/30 dark:shadow-black/20">
                        <div className="flex flex-wrap items-center gap-2">
                          <Toggle
                            ariaLabel={`${restaurant.restaurantName} active`}
                            checked={restaurant.isActive}
                            disabled={statusMutation.isPending}
                            onChange={() => toggleRestaurantStatus(restaurant)}
                          />
                          {optionBadges.map((badge) => (
                            <Badge key={badge.label} variant={badge.variant}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-ds-muted">
                          Updated {formatDate(restaurant.updatedAt)}
                        </p>
                      </td>
                      <td className="rounded-r-xl border-y border-r border-ds-border bg-white p-4 shadow-xs shadow-ds-text/5 transition group-hover:border-ds-teal-border group-hover:bg-ds-teal-soft/30 dark:shadow-black/20">
                        <div className="flex flex-wrap justify-end gap-2">
                          <IfCanOpen href={`/masters/restaurants/${restaurant.id}/edit`}>
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/masters/restaurants/${restaurant.id}/edit`}
                                {...prefetchOnIntent(() =>
                                  queryClient.prefetchQuery(restaurantDetailQuery(restaurant.id)),
                                )}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Link>
                            </Button>
                          </IfCanOpen>
                          <Button
                            onClick={() => setViewingRestaurant(restaurant)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                          <Button
                            onClick={() =>
                              showToast({
                                title: 'QR printing will be available in QR module.',
                                variant: 'info',
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <QrCode className="h-4 w-4" />
                            Print QR
                          </Button>
                          <Button
                            onClick={() =>
                              showToast({
                                title:
                                  'Customer Orders Activity will be available in Restaurant Operations.',
                                variant: 'info',
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Activity className="h-4 w-4" />
                            Activity
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={4}
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
      <DetailsModal
        onClose={() => setViewingRestaurant(null)}
        rows={
          viewingRestaurant && [
            [
              'Restaurant',
              `${viewingRestaurant.restaurantName} (${viewingRestaurant.restaurantCode})`,
            ],
            ['Location', formatRestaurantLocationDisplay(viewingRestaurant.hospital)],
            ['Legal Name', nullableText(viewingRestaurant.legalName)],
            ['Address', nullableText(viewingRestaurant.address)],
            ['Mobile', nullableText(viewingRestaurant.mobile)],
            ['Email', nullableText(viewingRestaurant.email)],
            ['GST Number', nullableText(viewingRestaurant.gstNumber)],
            ['FSSAI Number', nullableText(viewingRestaurant.fssaiNumber)],
            ['Kitchen', nullableText(viewingRestaurant.kitchen?.kitchenName)],
            ['Store', nullableText(viewingRestaurant.store?.storeName)],
            ['Online', isRestaurantOnline(viewingRestaurant) ? 'Online' : 'Offline'],
            [
              'Status / Options',
              <span className="flex flex-wrap gap-2" key="options">
                {getRestaurantOptionBadges(viewingRestaurant).map((badge) => (
                  <Badge key={badge.label} variant={badge.variant}>
                    {badge.label}
                  </Badge>
                ))}
              </span>,
            ],
            ['Created', formatDate(viewingRestaurant.createdAt)],
            ['Updated', formatDate(viewingRestaurant.updatedAt)],
          ]
        }
        title="Restaurant"
      />
    </section>
  );
}
