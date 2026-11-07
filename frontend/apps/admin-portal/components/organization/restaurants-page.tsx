'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/components/auth-provider';
import { RecordAvatar, RowAction, StatStrip, tableStyles } from '@/components/design-system';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
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
import {
  Activity,
  BadgePercent,
  Download,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Utensils,
  X,
} from 'lucide-react';
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

  return <RecordAvatar name={restaurant.restaurantName} />;
}

export function RestaurantsPageClient() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();
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
  const [qrRestaurant, setQrRestaurant] = useState<Restaurant | null>(null);
  const [qrOrigin, setQrOrigin] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrDialogRef = useRef<HTMLDialogElement>(null);

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
  const qrLinkQuery = useQuery({
    enabled: Boolean(qrRestaurant),
    queryFn: async () => {
      if (!qrRestaurant) return null;
      return (await organizationApi.getRestaurantBoardLink(qrRestaurant.id)).data.boardToken;
    },
    queryKey: queryKeys.restaurantBoardLink(qrRestaurant?.id ?? ''),
    staleTime: 0,
  });
  const kioskUrl =
    qrRestaurant && qrOrigin && qrLinkQuery.data
      ? `${qrOrigin}${withBasePath(`/kiosk/${qrRestaurant.id}?token=${qrLinkQuery.data}`)}`
      : null;

  useEffect(() => {
    const dialog = qrDialogRef.current;

    if (!dialog) return;
    if (qrRestaurant && !dialog.open) dialog.showModal();
    if (!qrRestaurant && dialog.open) dialog.close();
  }, [qrRestaurant]);

  useEffect(() => {
    if (!qrRestaurant) {
      setQrOrigin(null);
      return undefined;
    }

    let active = true;
    setQrOrigin(null);
    setQrError(null);
    void fetch(withBasePath('/api/qr-origin'), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not determine a phone-reachable site address.');
        return (await response.json()) as { origin: string };
      })
      .then(({ origin }) => {
        if (active) setQrOrigin(origin);
      })
      .catch(() => {
        if (active) setQrError('Could not determine a phone-reachable site address.');
      });

    return () => {
      active = false;
    };
  }, [qrRestaurant?.id]);

  useEffect(() => {
    let active = true;
    setQrImage(null);

    if (!kioskUrl)
      return () => {
        active = false;
      };

    void QRCode.toDataURL(kioskUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 512,
    })
      .then((image) => {
        if (active) setQrImage(image);
      })
      .catch(() => {
        if (active) setQrError('Could not generate the restaurant QR code.');
      });

    return () => {
      active = false;
    };
  }, [kioskUrl]);

  function printQr() {
    if (!qrRestaurant || !qrImage) return;
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      showToast({
        description: 'Allow pop-ups for this site, then try printing again.',
        title: 'Print window was blocked',
        variant: 'error',
      });
      return;
    }

    printWindow.opener = null;
    const printDocument = printWindow.document;
    const style = printDocument.createElement('style');
    style.textContent =
      'body{align-items:center;display:flex;flex-direction:column;font-family:Arial,sans-serif;justify-content:center;min-height:90vh;text-align:center}img{height:72mm;width:72mm}h1{font-size:24pt;margin:12px 0 4px}p{font-size:12pt}';
    const heading = printDocument.createElement('h1');
    heading.textContent = qrRestaurant.restaurantName;
    const image = printDocument.createElement('img');
    image.alt = `QR code for ${qrRestaurant.restaurantName} menu and ordering`;
    image.src = qrImage;
    const instructions = printDocument.createElement('p');
    instructions.textContent = 'Scan to view the menu and place an order';
    printDocument.title = `${qrRestaurant.restaurantName} menu QR`;
    printDocument.body.replaceChildren(style, heading, image, instructions);
    void image.decode().then(() => {
      printWindow.focus();
      printWindow.print();
    });
  }

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
        recordId: variables.id,
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
        recordId: variables.id,
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

  async function toggleRestaurantStatus(restaurant: Restaurant) {
    const nextIsActive = !restaurant.isActive;
    const confirmed = await confirmStatusChange(confirm, {
      activate: nextIsActive,
      effect: freezeServicesMessage,
      name: restaurant.restaurantName,
    });

    if (!confirmed) {
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

  const handleOnlineToggle = async (restaurant: Restaurant) => {
    const nextIsOnline = !allowsOnlineOrdering(restaurant);
    const confirmed = await confirm(
      nextIsOnline
        ? {
            confirmLabel: 'Turn on',
            description: 'Customers can place online orders straight away.',
            title: `Turn on online ordering for ${restaurant.restaurantName}?`,
          }
        : {
            confirmLabel: 'Turn off',
            description: 'Customers can’t place online orders until it is turned on again.',
            title: `Turn off online ordering for ${restaurant.restaurantName}?`,
            tone: 'danger',
          },
    );

    if (!confirmed) return;
    setOnlineUpdatingId(restaurant.id);
    onlineToggleMutation.mutate({ id: restaurant.id, nextIsOnline });
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
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            tone: 'ok',
            share: stats?.all ? stats.active / stats.all : undefined,
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive · offline',
            onSelect: () => showStatus('inactive'),
            tone: 'pending',
            share: stats?.all ? stats.inactive / stats.all : undefined,
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
          <table className={cn(tableStyles.table, 'phone-cards min-w-215 table-fixed')}>
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
                      data-record-id={restaurant.id}
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
                            onChange={() => void handleOnlineToggle(restaurant)}
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
                            onChange={() => void toggleRestaurantStatus(restaurant)}
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
                          {hasPermission('RESTAURANT_UPDATE') ? (
                            <RowAction
                              icon={QrCode}
                              label={`Menu and ordering QR for ${restaurant.restaurantName}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setQrImage(null);
                                setQrError(null);
                                setQrRestaurant(restaurant);
                              }}
                            />
                          ) : null}
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
      <dialog
        aria-labelledby="restaurant-menu-qr-title"
        className="m-auto max-h-[90dvh] w-[min(92vw,28rem)] max-w-none overflow-y-auto rounded-md border border-ds-border bg-ds-surface p-0 text-ds-text shadow-xl backdrop:bg-black/55"
        onClose={() => setQrRestaurant(null)}
        ref={qrDialogRef}
      >
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold" id="restaurant-menu-qr-title">
                {qrRestaurant?.restaurantName ?? 'Restaurant menu QR'}
              </h2>
              <p className="mt-1 text-sm text-ds-muted">
                Scan to view the current menu and place an order. Payment is completed at the mapped
                POS counter.
              </p>
            </div>
            <Button
              aria-label="Close restaurant QR"
              onClick={() => qrDialogRef.current?.close()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid min-h-64 place-items-center rounded-md border border-ds-border bg-white p-4">
            {qrImage ? (
              <Image
                alt={`QR code for ${qrRestaurant?.restaurantName ?? 'restaurant'} menu and ordering`}
                className="h-64 w-64 max-w-full object-contain"
                height={512}
                src={qrImage}
                unoptimized
                width={512}
              />
            ) : qrError ? (
              <p className="text-sm text-ds-danger">{qrError}</p>
            ) : qrLinkQuery.isError ? (
              <p className="text-sm text-ds-danger">{getApiErrorMessage(qrLinkQuery.error)}</p>
            ) : (
              <p className="text-sm text-ds-muted">Preparing restaurant QR…</p>
            )}
          </div>
          {qrImage ? (
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" onClick={printQr} type="button">
                <Printer aria-hidden="true" className="h-4 w-4" />
                Print QR
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  const link = document.createElement('a');
                  link.download = `restaurant-${qrRestaurant?.id}-menu-qr.png`;
                  link.href = qrImage;
                  link.click();
                }}
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download PNG
              </Button>
            </div>
          ) : null}
        </div>
      </dialog>
    </section>
  );
}
