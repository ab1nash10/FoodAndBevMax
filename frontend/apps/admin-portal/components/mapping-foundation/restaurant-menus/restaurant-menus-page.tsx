'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, RefreshCw, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type {
  ItemType,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuDayOfWeek,
  RestaurantMenuInput,
  RestaurantMenuPositionType,
  SortOrder,
  TimeSlot,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel, Select } from '@/components/ui';
import { DetailsModal, Toggle } from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import { RestaurantMenuFormFields } from '@/components/mapping-foundation/restaurant-menus/restaurant-menu-form-fields';
import {
  dayOfWeekValues,
  formatEnum,
  positionTypeValues,
  type RestaurantMenuFormValues,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import {
  ActiveFilterSelect,
  BooleanBadge,
  HospitalFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusBadge,
  SubmitButton,
} from '@/components/mapping-foundation/shared/components';
import type { ActiveFilter } from '@/components/mapping-foundation/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  listLimit,
  useHospitalOptions,
  useItemOptions,
} from '@/components/mapping-foundation/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { SetupNotice, useLocationName } from '@/components/location-empty-states';

const restaurantMenuSchema = z
  .object({
    daysOfWeek: z.array(
      z.custom<RestaurantMenuDayOfWeek>(
        (value) => dayOfWeekValues.includes(value as RestaurantMenuDayOfWeek),
        {
          message: 'Select valid days.',
        },
      ),
    ),
    isAvailable: z.boolean(),
    itemId: z.string().uuid('Select an item.'),
    positionType: z.custom<RestaurantMenuPositionType | ''>(
      (value) => value === '' || positionTypeValues.includes(value as RestaurantMenuPositionType),
      {
        message: 'Select a position.',
      },
    ),
    referenceMenuId: z.string().trim(),
    restaurantId: z.string().uuid('Select a restaurant.'),
    timeSlotIds: z.array(z.string().uuid('Select valid time slots.')),
  })
  .superRefine((values, context) => {
    if (values.positionType !== 'BEFORE_ITEM' && values.positionType !== 'AFTER_ITEM') {
      return;
    }

    const referenceMenuId = values.referenceMenuId.trim();

    if (!referenceMenuId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a menu item for this position.',
        path: ['referenceMenuId'],
      });
      return;
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        referenceMenuId,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a valid menu item.',
        path: ['referenceMenuId'],
      });
    }
  });

type AvailabilityFilter = '' | 'available' | 'unavailable';

type DayFilter = '' | RestaurantMenuDayOfWeek;

type ItemTypeFilter = '' | ItemType;

function availabilityFilterToBoolean(value: AvailabilityFilter): boolean | undefined {
  if (value === 'available') {
    return true;
  }

  if (value === 'unavailable') {
    return false;
  }

  return undefined;
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

function useTimeSlotOptions(hospitalId?: string) {
  return useQuery<TimeSlot[]>({
    queryFn: async () => {
      const response = await organizationApi.listTimeSlots({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'slotName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: queryKeys.timeSlotOptions(hospitalId || 'all'),
  });
}

function emptyRestaurantMenuFormValues(): RestaurantMenuFormValues {
  return {
    daysOfWeek: [],
    isAvailable: true,
    itemId: '',
    positionType: 'LAST',
    referenceMenuId: '',
    restaurantId: '',
    timeSlotIds: [],
  };
}

function restaurantMenuToFormValues(menu: RestaurantMenu): RestaurantMenuFormValues {
  return {
    daysOfWeek: menu.daysOfWeek,
    isAvailable: menu.isAvailable,
    itemId: menu.itemId,
    positionType: '',
    referenceMenuId: '',
    restaurantId: menu.restaurantId,
    timeSlotIds: menu.timeSlotIds,
  };
}

export function RestaurantMenusPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const locationName = useLocationName();
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [timeSlotFilter, setTimeSlotFilter] = useState('');
  const [sortBy, setSortBy] = useState('displayOrder');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editingMenu, setEditingMenu] = useState<RestaurantMenu | null>(null);
  const [viewingMenu, setViewingMenu] = useState<RestaurantMenu | null>(null);
  const form = useForm<RestaurantMenuFormValues>({
    defaultValues: emptyRestaurantMenuFormValues(),
  });
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter);
  const itemsQuery = useItemOptions(undefined, hospitalFilter);
  const filterItemsQuery = useItemOptions(itemTypeFilter || undefined, hospitalFilter);
  const timeSlotsQuery = useTimeSlotOptions(hospitalFilter);
  const selectedRestaurantId = form.watch('restaurantId');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setRestaurantFilter('');
    setPage(1);

    if (!editingMenu) {
      form.setValue('restaurantId', '', { shouldValidate: true });
    }
  }, [editingMenu, form, scopedHospitalId]);

  const referenceMenusQuery = useQuery<RestaurantMenu[]>({
    enabled: Boolean(selectedRestaurantId),
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
        hospitalId: hospitalFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        isAvailable: availabilityFilterToBoolean(availabilityFilter),
        itemId: itemFilter,
        itemType: itemTypeFilter || undefined,
        limit: listLimit,
        page,
        restaurantId: restaurantFilter,
        search,
        sortBy,
        sortOrder,
        timeSlotId: timeSlotFilter,
      });

      return response.data;
    },
    queryKey: queryKeys.restaurantMenus({
      availabilityFilter,
      activeFilter,
      dayFilter,
      hospitalFilter,
      itemFilter,
      itemTypeFilter,
      page,
      restaurantFilter,
      search,
      sortBy,
      sortOrder,
      timeSlotFilter,
    }),
  });

  const saveMenuMutation = useMutation({
    mutationFn: (body: RestaurantMenuInput) =>
      editingMenu
        ? organizationApi.updateRestaurantMenu(editingMenu.id, body)
        : organizationApi.createRestaurantMenu(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMenu ? 'Restaurant menu was not updated' : 'Restaurant menu was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenus() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenuReferenceOptions() });
      showToast({
        title: editingMenu ? 'Restaurant menu updated' : 'Restaurant menu created',
        variant: 'success',
      });
      setEditingMenu(null);
      form.reset(emptyRestaurantMenuFormValues());
    },
  });

  const toggleMenuStatusMutation = useMutation({
    mutationFn: ({ isActive, menu }: { isActive: boolean; menu: RestaurantMenu }) =>
      organizationApi.updateRestaurantMenu(menu.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant menu status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenus() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantMenuReferenceOptions() });
      showToast({
        title: variables.isActive
          ? 'Restaurant menu mapping activated'
          : 'Restaurant menu mapping inactive',
        variant: 'success',
      });
    },
  });

  const menus = menusQuery.data?.items ?? [];
  const referenceMenus =
    referenceMenusQuery.data?.filter((menu) => menu.id !== editingMenu?.id) ?? [];
  const meta = menusQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = restaurantMenuSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    const body: RestaurantMenuInput = {
      daysOfWeek: parsed.data.daysOfWeek,
      isAvailable: parsed.data.isAvailable,
      itemId: parsed.data.itemId,
      restaurantId: parsed.data.restaurantId,
      timeSlotIds: parsed.data.timeSlotIds,
    };

    if (parsed.data.positionType) {
      body.positionType = parsed.data.positionType;
    }

    if (parsed.data.referenceMenuId.trim()) {
      body.referenceMenuId = parsed.data.referenceMenuId.trim();
    }

    saveMenuMutation.mutate(body);
  });

  function startEditingMenu(menu: RestaurantMenu) {
    setEditingMenu(menu);
    form.reset(restaurantMenuToFormValues(menu));
  }

  function cancelEditingMenu() {
    setEditingMenu(null);
    form.reset(emptyRestaurantMenuFormValues());
  }

  function toggleMenuStatus(menu: RestaurantMenu) {
    const nextIsActive = !menu.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this menu mapping inactive will hide this item from future restaurant menus and POS. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMenuStatusMutation.mutate({ isActive: nextIsActive, menu });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        icon={Utensils}
        subtitle="Map items to restaurant menus with optional time-slot availability."
        title="Restaurant Menus"
      />
      <Panel className="p-4">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-ds-text">
            {editingMenu ? 'Edit Restaurant Menu' : 'Create Restaurant Menu'}
          </h2>
          <p className="text-sm text-ds-muted">MRP, readymade, and live items can be published.</p>
        </div>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          {restaurantsQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/restaurants/new" linkLabel="Create a restaurant">
              {locationName
                ? `${locationName} has no restaurant yet`
                : 'There is no restaurant yet'}
              , so there is no menu to add items to.
            </SetupNotice>
          ) : null}
          {itemsQuery.data?.length === 0 ? (
            <SetupNotice href="/masters/items/new" linkLabel="Create an item">
              There are no active items to put on a menu yet.
            </SetupNotice>
          ) : null}
          <RestaurantMenuFormFields
            form={form}
            isEditing={Boolean(editingMenu)}
            items={itemsQuery.data}
            referenceMenus={referenceMenus}
            restaurants={restaurantsQuery.data}
            timeSlots={timeSlotsQuery.data}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingMenu ? (
              <Button onClick={cancelEditingMenu} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveMenuMutation.isPending}
              label={editingMenu ? 'Update Restaurant Menu' : 'Create Restaurant Menu'}
            />
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-3 border-b border-ds-divider p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:[&>*:first-child]:col-span-2 [&>button]:justify-self-start">
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
              setAvailabilityFilter(event.target.value as AvailabilityFilter);
              setPage(1);
            }}
            value={availabilityFilter}
          >
            <option value="">All availability</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </Select>
          <HospitalFilterSelect
            disabled={Boolean(scopedHospitalId)}
            hospitals={hospitalsQuery.data ?? []}
            onChange={(value) => {
              setHospitalFilter(value);
              setRestaurantFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            onChange={(event) => {
              setRestaurantFilter(event.target.value);
              setPage(1);
            }}
            value={restaurantFilter}
          >
            <option value="">All restaurants</option>
            {restaurantsQuery.data?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setItemTypeFilter(event.target.value as ItemTypeFilter);
              setItemFilter('');
              setPage(1);
            }}
            value={itemTypeFilter}
          >
            <option value="">All item types</option>
            {['MRP', 'READYMADE', 'LIVE'].map((itemType) => (
              <option key={itemType} value={itemType}>
                {formatEnum(itemType)}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setItemFilter(event.target.value);
              setPage(1);
            }}
            value={itemFilter}
          >
            <option value="">All items</option>
            {filterItemsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setTimeSlotFilter(event.target.value);
              setPage(1);
            }}
            value={timeSlotFilter}
          >
            <option value="">All time slots</option>
            {timeSlotsQuery.data?.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.slotName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setDayFilter(event.target.value as DayFilter);
              setPage(1);
            }}
            value={dayFilter}
          >
            <option value="">All days</option>
            {dayOfWeekValues.map((day) => (
              <option key={day} value={day}>
                {formatEnum(day)}
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
            <option value="displayOrder">Display order</option>
            <option value="createdAt">Created date</option>
            <option value="isActive">Status</option>
            <option value="isAvailable">Availability</option>
            <option value="updatedAt">Updated date</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void menusQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[14%] px-4 py-2.5">Location</th>
                <th className="w-[14%] px-4 py-2.5">Restaurant</th>
                <th className="w-[15%] px-4 py-2.5">Item</th>
                <th className="w-[10%] px-4 py-2.5">Item Type</th>
                <th className="w-[13%] px-4 py-2.5">Time Slots</th>
                <th className="w-[12%] px-4 py-2.5">Days</th>
                <th className="w-[10%] px-4 py-2.5">Available</th>
                <th className="w-[10%] px-4 py-2.5">Status</th>
                <th className="w-[14%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[15%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {menus.length > 0 ? (
                menus.map((menu) => (
                  <tr className="hover:bg-ds-subtle" key={menu.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ds-text">
                        {menu.restaurant.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-ds-muted">
                        {menu.restaurant.hospital.hospitalCode}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={locationHref(
                          'RESTAURANT',
                          menu.restaurant.restaurantCode || menu.restaurant.restaurantName,
                        )}
                      >
                        {menu.restaurant.restaurantName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{menu.restaurant.restaurantCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: menu.item.id })}
                      >
                        {menu.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{menu.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{formatEnum(menu.item.itemType)}</td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {menu.timeSlots.length
                        ? menu.timeSlots.map((timeSlot) => timeSlot.slotName).join(', ')
                        : 'All day'}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {menu.daysOfWeek.length
                        ? menu.daysOfWeek.map((day) => formatEnum(day)).join(', ')
                        : 'Every day'}
                    </td>
                    <td className="px-4 py-3">
                      <BooleanBadge
                        falseLabel="Unavailable"
                        trueLabel="Available"
                        value={menu.isAvailable}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={menu.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        ariaLabel={`${menu.item.itemName} in ${menu.restaurant.restaurantName} active`}
                        checked={menu.isActive}
                        disabled={toggleMenuStatusMutation.isPending}
                        onChange={() => toggleMenuStatus(menu)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(menu.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(menu.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingMenu(menu)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => setViewingMenu(menu)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={12}
                  error={menusQuery.error}
                  isError={menusQuery.isError}
                  isLoading={menusQuery.isLoading}
                  label="restaurant menu mappings"
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
        onClose={() => setViewingMenu(null)}
        rows={
          viewingMenu && [
            [
              'Location',
              `${viewingMenu.restaurant.hospital.hospitalName} (${viewingMenu.restaurant.hospital.hospitalCode})`,
            ],
            [
              'Restaurant',
              `${viewingMenu.restaurant.restaurantName} (${viewingMenu.restaurant.restaurantCode})`,
            ],
            ['Item', `${viewingMenu.item.itemName} (${viewingMenu.item.itemCode})`],
            ['Item Type', formatEnum(viewingMenu.item.itemType)],
            [
              'Time Slots',
              viewingMenu.timeSlots.length
                ? viewingMenu.timeSlots.map((timeSlot) => timeSlot.slotName).join(', ')
                : 'All day',
            ],
            [
              'Days',
              viewingMenu.daysOfWeek.length
                ? viewingMenu.daysOfWeek.map((day) => formatEnum(day)).join(', ')
                : 'Every day',
            ],
            ['Display Order', viewingMenu.displayOrder],
            [
              'Available',
              <BooleanBadge
                falseLabel="Unavailable"
                key="available"
                trueLabel="Available"
                value={viewingMenu.isAvailable}
              />,
            ],
            ['Status', <StatusBadge isActive={viewingMenu.isActive} key="status" />],
            ['Created', formatDate(viewingMenu.createdAt)],
            ['Updated', formatDate(viewingMenu.updatedAt)],
          ]
        }
        title="Restaurant Menu"
      />
    </section>
  );
}
