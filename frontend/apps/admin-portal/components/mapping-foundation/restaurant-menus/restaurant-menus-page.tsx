'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  MenuServeAt,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuDayOfWeek,
  RestaurantMenuInput,
  RestaurantMenuPositionType,
} from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { FoodTypeMarker } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel } from '@/components/ui';
import {
  DetailsModal,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Modal,
  Toggle,
} from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RestaurantMenuFormFields } from '@/components/mapping-foundation/restaurant-menus/restaurant-menu-form-fields';
import {
  dayOfWeekValues,
  formatEnum,
  gstSlabs,
  positionTypeValues,
  serveAtOptions,
  type RestaurantMenuFormValues,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import {
  BooleanBadge,
  QueryState,
  StatusBadge,
} from '@/components/mapping-foundation/shared/components';
import type { ActiveFilter } from '@/components/mapping-foundation/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  listLimit,
  useItemOptions,
} from '@/components/mapping-foundation/shared/utils';
import { rupees, useItemCategoryOptions } from '@/components/master-data/items/shared';
import { queryKeys } from '@/lib/query-keys';
import { SetupNotice, useLocationName } from '@/components/location-empty-states';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Blank stays blank; anything typed must be a whole number of at least `min`. */
function optionalWholeNumber(min: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === '' || (Number.isInteger(Number(value)) && Number(value) >= min), {
      message,
    });
}

const optionalPrice = z
  .string()
  .trim()
  .refine((value) => value === '' || (Number(value) >= 0 && /^\d+(\.\d{1,2})?$/.test(value)), {
    message: 'Enter a price with up to two decimals.',
  });

const restaurantMenuSchema = z
  .object({
    accompaniments: z.string().trim().max(500, 'Keep it under 500 characters.'),
    addOn: z.string().trim().max(255, 'Keep it under 255 characters.'),
    availableFrom: z.string(),
    availableTo: z.string(),
    daysOfWeek: z.array(
      z.custom<RestaurantMenuDayOfWeek>(
        (value) => dayOfWeekValues.includes(value as RestaurantMenuDayOfWeek),
        { message: 'Select valid days.' },
      ),
    ),
    gstPercent: z.string(),
    isActive: z.boolean(),
    isAvailable: z.boolean(),
    isDiscountable: z.boolean(),
    isGstInclusive: z.boolean(),
    itemId: z.string().uuid('Select a food item.'),
    kitchenId: z.string(),
    positionType: z.custom<RestaurantMenuPositionType | ''>(
      (value) => value === '' || positionTypeValues.includes(value as RestaurantMenuPositionType),
      { message: 'Select a position.' },
    ),
    preparationTimeMinutes: optionalWholeNumber(0, 'Enter minutes as a whole number.'),
    price: optionalPrice,
    referenceMenuId: z.string().trim(),
    restaurantId: z.string().uuid('Select a restaurant.'),
    roomPrice: optionalPrice,
    serveAt: z.custom<MenuServeAt>((value) =>
      serveAtOptions.some((option) => option.value === value),
    ),
    serves: optionalWholeNumber(1, 'Enter how many people it serves.'),
  })
  .superRefine((values, context) => {
    if (Boolean(values.availableFrom) !== Boolean(values.availableTo)) {
      context.addIssue({
        code: 'custom',
        message: 'Set both times, or leave both empty for all day.',
        path: [values.availableFrom ? 'availableTo' : 'availableFrom'],
      });
    } else if (values.availableFrom && values.availableFrom === values.availableTo) {
      context.addIssue({
        code: 'custom',
        message: 'Choose a different time from "Available From".',
        path: ['availableTo'],
      });
    }

    if (values.serveAt !== 'ROOM' && !values.price) {
      context.addIssue({ code: 'custom', message: 'Enter the price.', path: ['price'] });
    }

    if (values.serveAt !== 'COUNTER' && !values.roomPrice) {
      context.addIssue({
        code: 'custom',
        message: 'Enter the in-room price.',
        path: ['roomPrice'],
      });
    }

    if (values.positionType !== 'BEFORE_ITEM' && values.positionType !== 'AFTER_ITEM') {
      return;
    }

    if (!uuidPattern.test(values.referenceMenuId)) {
      context.addIssue({
        code: 'custom',
        message: 'Select a menu item for this position.',
        path: ['referenceMenuId'],
      });
    }
  });

type AvailabilityFilter = '' | 'available' | 'unavailable';
type DayFilter = '' | RestaurantMenuDayOfWeek;

/** "07:00–10:30", or "All day" when the menu has no window of its own. */
function windowText(menu: RestaurantMenu): string {
  return menu.availableFrom && menu.availableTo
    ? `${menu.availableFrom}–${menu.availableTo}`
    : 'All day';
}

const serveAtLabels: Record<MenuServeAt, string> = {
  BOTH: 'Room & counter',
  COUNTER: 'Counter only',
  ROOM: 'Room only',
};

function availabilityFilterToBoolean(value: AvailabilityFilter): boolean | undefined {
  return value === '' ? undefined : value === 'available';
}

function useRestaurantOptions(hospitalId?: string) {
  return useQuery<Restaurant[]>({
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.restaurantOptions(hospitalId ?? 'all'),
  });
}

function emptyRestaurantMenuFormValues(): RestaurantMenuFormValues {
  return {
    accompaniments: '',
    addOn: '',
    availableFrom: '',
    availableTo: '',
    categoryId: '',
    daysOfWeek: [],
    gstPercent: String(gstSlabs[0]),
    isActive: true,
    isAvailable: true,
    isDiscountable: false,
    isGstInclusive: false,
    itemId: '',
    kitchenId: '',
    positionType: 'LAST',
    preparationTimeMinutes: '',
    price: '',
    referenceMenuId: '',
    restaurantId: '',
    roomPrice: '',
    serveAt: 'BOTH',
    serves: '1',
  };
}

const text = (value: number | string | null) => (value === null ? '' : String(value));

function restaurantMenuToFormValues(menu: RestaurantMenu): RestaurantMenuFormValues {
  return {
    accompaniments: text(menu.accompaniments),
    addOn: text(menu.addOn),
    availableFrom: text(menu.availableFrom),
    availableTo: text(menu.availableTo),
    categoryId: menu.item.category?.id ?? '',
    daysOfWeek: menu.daysOfWeek,
    gstPercent: String(menu.gstPercent),
    isActive: menu.isActive,
    isAvailable: menu.isAvailable,
    isDiscountable: menu.isDiscountable,
    isGstInclusive: menu.isGstInclusive,
    itemId: menu.itemId,
    kitchenId: text(menu.kitchenId),
    positionType: '',
    preparationTimeMinutes: text(menu.preparationTimeMinutes),
    price: text(menu.price),
    referenceMenuId: '',
    restaurantId: menu.restaurantId,
    roomPrice: text(menu.roomPrice),
    serveAt: menu.serveAt,
    serves: text(menu.serves),
  };
}

function priceLines(menu: RestaurantMenu): string[] {
  return [
    menu.serveAt !== 'ROOM' && menu.price !== null ? rupees.format(menu.price) : null,
    menu.serveAt !== 'COUNTER' && menu.roomPrice !== null
      ? `${rupees.format(menu.roomPrice)} room`
      : null,
  ].filter((line): line is string => line !== null);
}

export function RestaurantMenusPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const locationName = useLocationName();
  const formId = useId();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  // null: the form is closed; 'new': creating; a menu: editing it.
  const [formMenu, setFormMenu] = useState<'new' | RestaurantMenu | null>(null);
  const [viewingMenu, setViewingMenu] = useState<RestaurantMenu | null>(null);
  const editingMenu = formMenu === 'new' ? null : formMenu;
  const form = useForm<RestaurantMenuFormValues>({
    defaultValues: emptyRestaurantMenuFormValues(),
  });
  const restaurantsQuery = useRestaurantOptions(scopedHospitalId);
  const itemsQuery = useItemOptions();
  const categoriesQuery = useItemCategoryOptions();
  const selectedRestaurantId = form.watch('restaurantId');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const canCreate = hasPermission('RESTAURANT_MENU_CREATE');
  const canEdit = hasPermission('RESTAURANT_MENU_UPDATE');

  // A different location in the top bar is a different set of restaurants.
  useEffect(() => {
    setRestaurantFilter('');
    setPage(1);
  }, [scopedHospitalId, setPage]);

  const referenceMenusQuery = useQuery<RestaurantMenu[]>({
    enabled: Boolean(selectedRestaurantId) && formMenu !== null,
    queryFn: async () => {
      const response = await organizationApi.listRestaurantMenus({
        limit: 100,
        restaurantId: selectedRestaurantId,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.restaurantMenuReferenceOptions(selectedRestaurantId),
  });

  const menusQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurantMenus({
        dayOfWeek: dayFilter || undefined,
        hospitalId: scopedHospitalId || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        isAvailable: availabilityFilterToBoolean(availabilityFilter),
        limit: listLimit,
        page,
        restaurantId: restaurantFilter,
        search,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      });

      return response.data;
    },
    queryKey: queryKeys.restaurantMenus({
      activeFilter,
      availabilityFilter,
      dayFilter,
      hospitalFilter: scopedHospitalId ?? '',
      page,
      restaurantFilter,
      search,
    }),
  });

  function invalidateMenus() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenus() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenuReferenceOptions() });
  }

  const saveMenuMutation = useMutation({
    mutationFn: (body: RestaurantMenuInput) =>
      editingMenu
        ? organizationApi.updateRestaurantMenu(editingMenu.id, body)
        : organizationApi.createRestaurantMenu(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMenu ? 'Menu item was not updated' : 'Menu item was not added',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateMenus();
      showToast({
        title: editingMenu ? 'Menu item updated' : 'Menu item added',
        variant: 'success',
      });
      closeForm();
    },
  });

  const toggleMenuStatusMutation = useMutation({
    mutationFn: ({ isActive, menu }: { isActive: boolean; menu: RestaurantMenu }) =>
      organizationApi.updateRestaurantMenu(menu.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Menu item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateMenus();
      showToast({
        title: variables.isActive ? 'Menu item activated' : 'Menu item marked inactive',
        variant: 'success',
      });
    },
  });

  const menus = menusQuery.data?.items ?? [];
  const referenceMenus =
    referenceMenusQuery.data?.filter((menu) => menu.id !== editingMenu?.id) ?? [];
  const meta = menusQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = restaurantMenuSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    const data = parsed.data;
    const numberOrNull = (value: string) => (value === '' ? null : Number(value));
    const body: RestaurantMenuInput = {
      accompaniments: data.accompaniments || null,
      addOn: data.addOn || null,
      availableFrom: data.availableFrom || null,
      availableTo: data.availableTo || null,
      daysOfWeek: data.daysOfWeek,
      gstPercent: Number(data.gstPercent),
      isActive: data.isActive,
      isAvailable: data.isAvailable,
      isDiscountable: data.isDiscountable,
      isGstInclusive: data.isGstInclusive,
      itemId: data.itemId,
      kitchenId: data.kitchenId || null,
      preparationTimeMinutes: numberOrNull(data.preparationTimeMinutes),
      // A price the item is not served at is cleared, so it can't linger unseen.
      price: data.serveAt === 'ROOM' ? null : numberOrNull(data.price),
      restaurantId: data.restaurantId,
      roomPrice: data.serveAt === 'COUNTER' ? null : numberOrNull(data.roomPrice),
      serveAt: data.serveAt,
      serves: numberOrNull(data.serves),
    };

    if (data.positionType) {
      body.positionType = data.positionType;
    }

    if (data.referenceMenuId) {
      body.referenceMenuId = data.referenceMenuId;
    }

    saveMenuMutation.mutate(body);
  });

  function openForm(menu: 'new' | RestaurantMenu) {
    form.reset(menu === 'new' ? emptyRestaurantMenuFormValues() : restaurantMenuToFormValues(menu));
    setViewingMenu(null);
    setFormMenu(menu);
  }

  function closeForm() {
    setFormMenu(null);
    form.reset(emptyRestaurantMenuFormValues());
  }

  // Available is the day-to-day switch (sold out, kitchen down), so it needs no confirmation.
  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ isAvailable, menu }: { isAvailable: boolean; menu: RestaurantMenu }) =>
      organizationApi.updateRestaurantMenu(menu.id, { isAvailable }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Menu item availability was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateMenus();
      showToast({
        title: variables.isAvailable ? 'Menu item available' : 'Menu item unavailable',
        variant: 'success',
      });
    },
  });

  function toggleMenuStatus(menu: RestaurantMenu) {
    const nextIsActive = !menu.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this menu item inactive will hide it from the restaurant menu and POS. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMenuStatusMutation.mutate({ isActive: nextIsActive, menu });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">
            Restaurant Menus
          </h1>
          <p className="text-[13.5px] text-ds-muted">
            What each restaurant sells, from which kitchen, when, and at what price.
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => openForm('new')} type="button">
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
            New menu item
          </Button>
        ) : null}
      </div>

      {restaurantsQuery.data?.length === 0 ? (
        <SetupNotice href="/masters/restaurants/new" linkLabel="Create a restaurant">
          {locationName ? `${locationName} has no restaurant yet` : 'There is no restaurant yet'},
          so there is no menu to add items to.
        </SetupNotice>
      ) : null}

      <Panel aria-label="Menu items" className="overflow-hidden" role="region">
        <FilterBar>
          <FilterSearch
            label="Search menu items"
            onChange={(value) => changeFilter(() => setSearch(value))}
            placeholder="Item or restaurant"
            value={searchInput}
          />
          <FilterSelect
            label="Restaurant"
            onChange={(value) => changeFilter(() => setRestaurantFilter(value))}
            value={restaurantFilter}
          >
            <option value="">All</option>
            {restaurantsQuery.data?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Day"
            onChange={(value) => changeFilter(() => setDayFilter(value as DayFilter))}
            value={dayFilter}
          >
            <option value="">Any</option>
            {dayOfWeekValues.map((day) => (
              <option key={day} value={day}>
                {formatEnum(day)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label="Available"
            onChange={(value) =>
              changeFilter(() => setAvailabilityFilter(value as AvailabilityFilter))
            }
            value={availabilityFilter}
          >
            <option value="">All</option>
            <option value="available">Yes</option>
            <option value="unavailable">No</option>
          </FilterSelect>
          <FilterSelect
            label="Status"
            onChange={(value) => changeFilter(() => setActiveFilter(value as ActiveFilter))}
            value={activeFilter}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FilterSelect>
        </FilterBar>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-[13px]">
            <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
              <tr>
                <th className="w-[22%] px-4 py-2.5 font-semibold">Item</th>
                <th className="w-[18%] px-3 py-2.5 font-semibold">Restaurant</th>
                <th className="w-[12%] px-3 py-2.5 font-semibold">Kitchen</th>
                <th className="w-[12%] px-3 py-2.5 font-semibold">Price</th>
                <th className="w-[13%] px-3 py-2.5 font-semibold">Available</th>
                <th className="w-[12%] px-3 py-2.5 font-semibold">Status</th>
                <th className="w-[11%] px-3 py-2.5 pr-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {menus.length > 0 ? (
                menus.map((menu) => {
                  const prices = priceLines(menu);

                  return (
                    <tr className="border-b border-ds-divider" key={menu.id}>
                      <td className="px-4 py-1.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <FoodTypeMarker type={menu.item.type} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[13.5px] font-bold text-ds-text">
                              {menu.item.itemName}
                            </span>
                            <span className="truncate text-[11.5px] text-ds-muted">
                              {menu.item.itemCode} · {windowText(menu)}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="block truncate font-semibold text-ds-text-2">
                          {menu.restaurant.restaurantName}
                        </span>
                        <span className="block truncate text-[11.5px] text-ds-muted">
                          {menu.restaurant.hospital.hospitalName}
                        </span>
                      </td>
                      <td className="truncate px-3 py-1.5 text-[12.5px] text-ds-text-2">
                        {menu.kitchen?.kitchenName ?? '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {prices.length ? (
                          prices.map((line) => (
                            <span
                              className="block truncate font-bold tabular-nums text-ds-text"
                              key={line}
                            >
                              {line}
                            </span>
                          ))
                        ) : (
                          <span className="text-ds-muted">—</span>
                        )}
                        <span className="block truncate text-[11.5px] text-ds-muted">
                          {serveAtLabels[menu.serveAt]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <Toggle
                            ariaLabel={`${menu.item.itemName} in ${menu.restaurant.restaurantName} available`}
                            checked={menu.isAvailable}
                            disabled={toggleAvailabilityMutation.isPending || !canEdit}
                            onChange={() =>
                              toggleAvailabilityMutation.mutate({
                                isAvailable: !menu.isAvailable,
                                menu,
                              })
                            }
                          />
                          <span
                            className={cn(
                              'text-xs font-bold',
                              menu.isAvailable ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {menu.isAvailable ? 'Available' : 'Unavailable'}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <Toggle
                            ariaLabel={`${menu.item.itemName} in ${menu.restaurant.restaurantName} active`}
                            checked={menu.isActive}
                            disabled={toggleMenuStatusMutation.isPending || !canEdit}
                            onChange={() => toggleMenuStatus(menu)}
                          />
                          <span
                            className={cn(
                              'text-xs font-bold',
                              menu.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {menu.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 pr-4">
                        <span className="flex justify-end gap-2">
                          <Button
                            aria-label={`View ${menu.item.itemName}`}
                            className="h-9 w-9"
                            onClick={() => setViewingMenu(menu)}
                            size="icon"
                            title="View"
                            type="button"
                            variant="outline"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit ? (
                            <Button
                              aria-label={`Edit ${menu.item.itemName}`}
                              className="h-9 w-9"
                              onClick={() => openForm(menu)}
                              size="icon"
                              title="Edit"
                              type="button"
                              variant="outline"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={7}
                  error={menusQuery.error}
                  isError={menusQuery.isError}
                  isLoading={menusQuery.isLoading}
                  label="menu items"
                />
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-ds-muted">
          <span>
            Showing{' '}
            <strong className="font-bold text-ds-text">
              {firstRow}–{lastRow}
            </strong>{' '}
            of {meta.total} menu {meta.total === 1 ? 'item' : 'items'}
          </span>
          <span className="flex items-center gap-1.5">
            <Button
              aria-label="Previous page"
              className="h-[30px] w-[30px]"
              disabled={meta.page <= 1}
              onClick={() => setPage(meta.page - 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            </Button>
            <Button
              aria-label="Next page"
              className="h-[30px] w-[30px]"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage(meta.page + 1)}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
            </Button>
          </span>
        </div>
      </Panel>

      <Modal
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={closeForm} type="button" variant="outline">
              Cancel
            </Button>
            {/* In the pop-up's footer, outside the form, so it names the form it submits. */}
            <Button disabled={saveMenuMutation.isPending} form={formId} type="submit">
              {saveMenuMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingMenu ? 'Save changes' : 'Add to menu'}
            </Button>
          </div>
        }
        onClose={closeForm}
        open={formMenu !== null}
        title={editingMenu ? 'Edit Menu Item' : 'New Menu Item'}
      >
        <form
          id={formId}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          {itemsQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/items/new" linkLabel="Create an item">
              There are no active items to put on a menu yet.
            </SetupNotice>
          ) : null}
          <RestaurantMenuFormFields
            categories={categoriesQuery.data}
            form={form}
            isEditing={Boolean(editingMenu)}
            items={itemsQuery.data}
            referenceMenus={referenceMenus}
            restaurants={restaurantsQuery.data}
          />
        </form>
      </Modal>

      <DetailsModal
        onClose={() => setViewingMenu(null)}
        rows={
          viewingMenu && [
            ['Item', `${viewingMenu.item.itemName} (${viewingMenu.item.itemCode})`],
            ['Category', viewingMenu.item.category?.categoryName ?? '—'],
            [
              'Restaurant',
              `${viewingMenu.restaurant.restaurantName} · ${viewingMenu.restaurant.hospital.hospitalName}`,
            ],
            ['Kitchen', viewingMenu.kitchen?.kitchenName ?? '—'],
            ['Add-On', viewingMenu.addOn ?? '—'],
            ['Accompaniments', viewingMenu.accompaniments ?? '—'],
            [
              'Preparation',
              viewingMenu.preparationTimeMinutes === null
                ? '—'
                : `${viewingMenu.preparationTimeMinutes} min`,
            ],
            ['Serves', viewingMenu.serves ?? '—'],
            ['Serve At', serveAtLabels[viewingMenu.serveAt]],
            ['Price', viewingMenu.price === null ? '—' : rupees.format(viewingMenu.price)],
            [
              'In-Room Price',
              viewingMenu.roomPrice === null ? '—' : rupees.format(viewingMenu.roomPrice),
            ],
            [
              'GST',
              `${viewingMenu.gstPercent}%${viewingMenu.isGstInclusive ? ', inclusive' : ', extra'}`,
            ],
            ['Available Time', windowText(viewingMenu)],
            [
              'Days',
              viewingMenu.daysOfWeek.length
                ? viewingMenu.daysOfWeek.map((day) => formatEnum(day)).join(', ')
                : 'Every day',
            ],
            [
              'Available',
              <BooleanBadge
                falseLabel="Unavailable"
                key="available"
                trueLabel="Available"
                value={viewingMenu.isAvailable}
              />,
            ],
            ['Discountable', viewingMenu.isDiscountable ? 'Yes' : 'No'],
            ['Status', <StatusBadge isActive={viewingMenu.isActive} key="status" />],
            ['Updated', formatDate(viewingMenu.updatedAt)],
          ]
        }
        title="Menu Item"
      />
    </section>
  );
}
