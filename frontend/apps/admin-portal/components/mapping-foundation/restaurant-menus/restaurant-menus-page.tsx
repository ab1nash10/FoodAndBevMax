'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
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
import {
  AppPageHeader,
  FoodTypeMarker,
  ListPager,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { CsvImportExport, fetchAllPages } from '@/components/csv-import-export';
import { ImportButton } from '@/components/import/import-dialog';
import { menuImport } from '@/components/import/import-definitions';
import { FilterField, FiltersMenu, ListToolbar } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { FilterSearch, Modal } from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { useUndoable } from '@/lib/use-undoable';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RestaurantMenuFormFields } from '@/components/mapping-foundation/restaurant-menus/restaurant-menu-form-fields';
import { menuColumns } from '@/components/mapping-foundation/restaurant-menus/restaurant-menus-csv';
import {
  dayOfWeekValues,
  formatEnum,
  gstSlabs,
  positionTypeValues,
  serveAtOptions,
  type RestaurantMenuFormValues,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import { QueryState, RowSwitch } from '@/components/mapping-foundation/shared/components';
import type { ActiveFilter } from '@/components/mapping-foundation/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
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
    // This menu item's own category; the item's other menus and mappings keep theirs.
    categoryId: z.string().uuid('Select a category.'),
    itemId: z.string().uuid('Select a food item.'),
    kitchenId: z.string(),
    storeId: z.string(),
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
    ? `${menu.availableFrom} – ${menu.availableTo}`
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
    storeId: '',
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
    categoryId: menu.categoryId ?? '',
    daysOfWeek: menu.daysOfWeek,
    gstPercent: String(menu.gstPercent),
    isActive: menu.isActive,
    isAvailable: menu.isAvailable,
    isDiscountable: menu.isDiscountable,
    isGstInclusive: menu.isGstInclusive,
    itemId: menu.itemId,
    kitchenId: text(menu.kitchenId),
    storeId: text(menu.storeId),
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

/** Each price it is sold at, labelled; null where a needed price is missing. */
function priceLines(menu: RestaurantMenu): Array<{ label: string; value: number | null }> {
  return [
    ...(menu.serveAt === 'ROOM' ? [] : [{ label: 'Counter', value: menu.price }]),
    ...(menu.serveAt === 'COUNTER' ? [] : [{ label: 'Room', value: menu.roomPrice }]),
  ];
}

/** "Every day", or the days in week order as "Mon, Wed, Fri". */
function daysText(menu: RestaurantMenu): string {
  if (menu.daysOfWeek.length === 0 || menu.daysOfWeek.length === dayOfWeekValues.length) {
    return 'Every day';
  }

  return dayOfWeekValues
    .filter((day) => menu.daysOfWeek.includes(day))
    .map((day) => formatEnum(day).slice(0, 3))
    .join(', ');
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

  // The strip's counts at this location: under the list's own key, so every save refreshes them.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (query: { isActive?: boolean; isAvailable?: boolean }) =>
        (
          await organizationApi.listRestaurantMenus({
            ...query,
            hospitalId: scopedHospitalId || undefined,
            limit: 0,
          })
        ).data.meta.total;
      const [all, available, unavailable, inactive] = await Promise.all([
        count({}),
        count({ isAvailable: true }),
        count({ isAvailable: false }),
        count({ isActive: false }),
      ]);

      return { all, available, inactive, unavailable };
    },
    queryKey: queryKeys.restaurantMenus('stats', scopedHospitalId ?? ''),
  });
  const stats = statsQuery.data;

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
      // Marking inactive already had its Undo toast.
      if (variables.isActive) showToast({ title: 'Menu item activated', variant: 'success' });
    },
  });
  const undoable = useUndoable();

  // A menu item marked inactive shows so at once, while its Undo toast runs.
  const menus = (menusQuery.data?.items ?? []).map((menu) =>
    undoable.isChanged(menu.id) ? { ...menu, isActive: false } : menu,
  );
  const referenceMenus =
    referenceMenusQuery.data?.filter((menu) => menu.id !== editingMenu?.id) ?? [];
  const meta = menusQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };

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
      categoryId: data.categoryId,
      daysOfWeek: data.daysOfWeek,
      gstPercent: Number(data.gstPercent),
      isActive: data.isActive,
      isAvailable: data.isAvailable,
      isDiscountable: data.isDiscountable,
      isGstInclusive: data.isGstInclusive,
      itemId: data.itemId,
      kitchenId: data.kitchenId || null,
      storeId: data.storeId || null,
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
    // Switching it back on while the Undo toast runs is the same as Undo.
    if (undoable.undo(menu.id)) return;

    if (menu.isActive) {
      undoable.schedule({
        commit: () => toggleMenuStatusMutation.mutateAsync({ isActive: false, menu }),
        description: 'It’s hidden from the restaurant menu and POS. Existing records stay visible.',
        id: menu.id,
        title: `${menu.item.itemName} marked inactive`,
      });
      return;
    }

    toggleMenuStatusMutation.mutate({ isActive: true, menu });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const hasFilters = Boolean(
    searchInput || restaurantFilter || dayFilter || availabilityFilter || activeFilter,
  );

  /** A stat's filter alone: availability or the inactive status, the other cleared. */
  function showOnly(availability: AvailabilityFilter, status: ActiveFilter) {
    changeFilter(() => {
      setAvailabilityFilter(availability);
      setActiveFilter(status);
    });
  }

  function clearFilters() {
    setSearch('');
    setRestaurantFilter('');
    setDayFilter('');
    setAvailabilityFilter('');
    setActiveFilter('');
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <CsvImportExport
              columns={menuColumns}
              exportRows={() =>
                fetchAllPages((exportPage) =>
                  organizationApi.listRestaurantMenus({
                    dayOfWeek: dayFilter || undefined,
                    hospitalId: scopedHospitalId || undefined,
                    isActive: activeFilterToBoolean(activeFilter),
                    isAvailable: availabilityFilterToBoolean(availabilityFilter),
                    limit: 100,
                    page: exportPage,
                    restaurantId: restaurantFilter,
                    search,
                    sortBy: 'displayOrder',
                    sortOrder: 'asc',
                  }),
                )
              }
              filename="restaurant-menus"
              noun="menu items"
              onImported={invalidateMenus}
            />
            <ImportButton definition={menuImport} />
            {canCreate ? (
              <Button onClick={() => openForm('new')} type="button">
                <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
                New menu item
              </Button>
            ) : null}
          </div>
        }
        count={stats?.all}
        description="What each restaurant sells, from which store or kitchen, when, and at what price."
        title="Restaurant Menus"
      />

      <StatStrip
        label="Menu items at a glance"
        stats={[
          {
            active: !availabilityFilter && !activeFilter,
            label: 'Menu items',
            onSelect: () => showOnly('', ''),
            value: stats?.all ?? '–',
          },
          {
            active: availabilityFilter === 'available',
            label: 'Available now',
            onSelect: () => showOnly('available', ''),
            tone: 'ok',
            value: stats?.available ?? '–',
          },
          {
            active: availabilityFilter === 'unavailable',
            label: 'Not available',
            onSelect: () => showOnly('unavailable', ''),
            tone: 'bad',
            value: stats?.unavailable ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showOnly('', 'inactive'),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />

      {restaurantsQuery.data?.length === 0 ? (
        <SetupNotice href="/masters/restaurants/new" linkLabel="Create a restaurant">
          {locationName ? `${locationName} has no restaurant yet` : 'There is no restaurant yet'},
          so there is no menu to add items to.
        </SetupNotice>
      ) : null}

      <Panel aria-label="Menu items" className="overflow-hidden" role="region">
        <ListToolbar>
          <FilterSearch
            label="Search menu items"
            onChange={(value) => changeFilter(() => setSearch(value))}
            placeholder="Item, menu code or restaurant"
            value={searchInput}
          />
          <FiltersMenu
            activeCount={
              [restaurantFilter, dayFilter, availabilityFilter, activeFilter].filter(Boolean).length
            }
          >
            <FilterField label="Status">
              <Select
                onChange={(event) =>
                  changeFilter(() => setActiveFilter(event.target.value as ActiveFilter))
                }
                value={activeFilter}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </FilterField>
            <FilterField label="Restaurant">
              <Select
                onChange={(event) => changeFilter(() => setRestaurantFilter(event.target.value))}
                value={restaurantFilter}
              >
                <option value="">All</option>
                {restaurantsQuery.data?.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Day">
              <Select
                onChange={(event) =>
                  changeFilter(() => setDayFilter(event.target.value as DayFilter))
                }
                value={dayFilter}
              >
                <option value="">Any</option>
                {dayOfWeekValues.map((day) => (
                  <option key={day} value={day}>
                    {formatEnum(day)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Available">
              <Select
                onChange={(event) =>
                  changeFilter(() =>
                    setAvailabilityFilter(event.target.value as AvailabilityFilter),
                  )
                }
                value={availabilityFilter}
              >
                <option value="">All</option>
                <option value="available">Yes</option>
                <option value="unavailable">No</option>
              </Select>
            </FilterField>
          </FiltersMenu>
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>

        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-[960px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[20%]')}>Item</th>
                <th className={cn(tableStyles.th, 'w-[16%]')}>Restaurant</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Store / Kitchen</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Serving time</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Price</th>
                <th
                  className={cn(tableStyles.th, 'w-[12%]')}
                  title="Can it be ordered right now? Switch off when it is sold out for the day."
                >
                  <span className="cursor-help border-b border-dotted border-ds-muted">
                    Available now
                  </span>
                </th>
                <th
                  className={cn(tableStyles.th, 'w-[11%]')}
                  title="Is it on this restaurant's menu at all? Inactive items are hidden from the menu and POS."
                >
                  <span className="cursor-help border-b border-dotted border-ds-muted">Status</span>
                </th>
                <th className={cn(tableStyles.th, 'w-[5%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {menus.length > 0 ? (
                menus.map((menu) => {
                  const prices = priceLines(menu);

                  return (
                    <tr
                      className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                      key={menu.id}
                      onClick={canEdit ? () => openForm(menu) : undefined}
                    >
                      <td className={tableStyles.td}>
                        <span className="flex min-w-0 items-center gap-3">
                          <FoodTypeMarker type={menu.item.type} />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className={cn('truncate', tableStyles.title)}>
                              {menu.item.itemName}
                            </span>
                            <span className="truncate text-[12px] text-ds-muted">
                              {menu.category ? `${menu.category.categoryName} · ` : ''}
                              <span className={tableStyles.code}>{menu.menuItemCode}</span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className={tableStyles.td}>
                        <span className="block truncate font-medium text-ds-text-2">
                          {menu.restaurant.restaurantName}
                        </span>
                        <span className="block truncate text-[12px] text-ds-muted">
                          {menu.restaurant.hospital.hospitalName}
                        </span>
                      </td>
                      <td className={tableStyles.td}>
                        {menu.kitchen || menu.store ? (
                          <>
                            <span className="block truncate text-ds-text-2">
                              {menu.kitchen?.kitchenName ?? menu.store?.storeName}
                            </span>
                            <span className="block text-[12px] text-ds-muted">
                              {menu.kitchen ? 'Kitchen' : 'Store'}
                            </span>
                          </>
                        ) : (
                          <span className="text-ds-muted">Not set</span>
                        )}
                      </td>
                      <td className={tableStyles.td}>
                        <span
                          className={cn(
                            'block truncate text-[13px] text-ds-text-2',
                            tableStyles.num,
                          )}
                        >
                          {windowText(menu)}
                        </span>
                        <span className="block truncate text-[12px] text-ds-muted">
                          {daysText(menu)}
                        </span>
                      </td>
                      <td className={tableStyles.td} title={serveAtLabels[menu.serveAt]}>
                        {prices.map((line) => (
                          <span
                            className="flex items-baseline justify-between gap-2"
                            key={line.label}
                          >
                            <span className="text-[12px] text-ds-muted">{line.label}</span>
                            {line.value === null ? (
                              <span className="text-[12px] font-semibold text-ds-status-pending-fg">
                                Price not set
                              </span>
                            ) : (
                              <span className={cn('font-medium text-ds-text', tableStyles.num)}>
                                {rupees.format(line.value)}
                              </span>
                            )}
                          </span>
                        ))}
                      </td>
                      {/* The switches have their own clicks: they do not open the menu item. */}
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                        <RowSwitch
                          ariaLabel={`${menu.item.itemName} in ${menu.restaurant.restaurantName} available`}
                          checked={menu.isAvailable}
                          disabled={toggleAvailabilityMutation.isPending || !canEdit}
                          offLabel="Unavailable"
                          onChange={() =>
                            toggleAvailabilityMutation.mutate({
                              isAvailable: !menu.isAvailable,
                              menu,
                            })
                          }
                          onLabel="Available"
                        />
                      </td>
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                        <RowSwitch
                          ariaLabel={`${menu.item.itemName} in ${menu.restaurant.restaurantName} active`}
                          checked={menu.isActive}
                          disabled={toggleMenuStatusMutation.isPending || !canEdit}
                          offLabel="Inactive"
                          onChange={() => toggleMenuStatus(menu)}
                          onLabel="Active"
                        />
                      </td>
                      <td className={cn(tableStyles.td, 'pr-3')}>
                        <span className="flex justify-end">
                          {canEdit ? (
                            <RowAction
                              icon={Pencil}
                              label={`Edit ${menu.item.itemName}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openForm(menu);
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
                  colSpan={8}
                  error={menusQuery.error}
                  isError={menusQuery.isError}
                  isLoading={menusQuery.isLoading}
                  label="menu items"
                />
              )}
            </tbody>
          </table>
        </div>
        <ListPager
          limit={meta.limit}
          noun="menu item"
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>

      <Modal
        side
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
            menuItemCode={editingMenu?.menuItemCode}
            referenceMenus={referenceMenus}
            restaurants={restaurantsQuery.data}
          />
        </form>
      </Modal>
    </section>
  );
}
