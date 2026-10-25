'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { UseFormReturn } from 'react-hook-form';
import type {
  Item,
  ItemCategory,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuPositionType,
} from '@aahar/api-client';
import { Field, Input, Select } from '@/components/ui';
import {
  dayOfWeekValues,
  formatEnum,
  gstSlabs,
  positionTypeValues,
  serveAtOptions,
  type RestaurantMenuFormValues,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import { fetchAllPages } from '@/components/csv-import-export';
import { useAuth } from '@/components/auth-provider';
import { slotHours } from '@/components/master-data/time-slots/shared';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { Textarea } from '@/components/organization/shared/form-controls';
import { MultiSelectDropdown, Toggle } from '@/components/ui-controls';

type BooleanField = 'isActive' | 'isAvailable' | 'isDiscountable' | 'isFeatured' | 'isGstInclusive';

function formatPositionType(value: RestaurantMenuPositionType): string {
  if (value === 'BEFORE_ITEM') {
    return 'Before Item';
  }

  if (value === 'AFTER_ITEM') {
    return 'After Item';
  }

  return formatEnum(value);
}

/** One way a restaurant can sell an item: a store or kitchen mapping at its location. */
interface MenuSource {
  categoryId: string;
  categoryName: string;
  itemCode: string;
  itemId: string;
  itemName: string;
  key: string;
  /** The kitchen that makes it (prepared) or the store that stocks it (packaged). */
  kitchenId: string | null;
  storeId: string | null;
  /** The kitchen's or the store's name. */
  sourceName: string;
}

const sourceKey = (
  itemId: string,
  kitchenId: string | null,
  storeId: string | null,
  categoryId: string,
) => `${itemId}|${kitchenId ? `k:${kitchenId}` : `s:${storeId ?? ''}`}|${categoryId}`;

/** Sorted by item, then category, then store or kitchen. */
function distinct(sources: MenuSource[]): MenuSource[] {
  return [...new Map(sources.map((source) => [source.key, source])).values()].sort(
    (left, right) =>
      left.itemName.localeCompare(right.itemName) ||
      left.categoryName.localeCompare(right.categoryName) ||
      left.sourceName.localeCompare(right.sourceName),
  );
}

/**
 * What a restaurant can sell, straight from Item Mapping: every active store mapping
 * (packaged) and kitchen mapping (prepared) at its location, each with its own category and
 * kitchen. Under the mapping pages' cache keys, so a new mapping shows up as soon as it's saved.
 */
function useMenuSources(hospitalId: string | undefined) {
  const query = (page: number) => ({ hospitalId, isActive: true, limit: 100, page });
  const stores = useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () =>
      (await fetchAllPages((page) => organizationApi.listStoreItems(query(page)))).flatMap(
        (mapping): MenuSource[] =>
          mapping.category
            ? [
                {
                  categoryId: mapping.category.id,
                  categoryName: mapping.category.categoryName,
                  itemCode: mapping.item.itemCode,
                  itemId: mapping.itemId,
                  itemName: mapping.item.itemName,
                  key: sourceKey(mapping.itemId, null, mapping.storeId, mapping.category.id),
                  kitchenId: null,
                  sourceName: mapping.store.storeName,
                  storeId: mapping.storeId,
                },
              ]
            : [],
      ),
    queryKey: ['store-items', 'menu-source', hospitalId],
  });
  const kitchens = useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () =>
      (await fetchAllPages((page) => organizationApi.listKitchenItems(query(page)))).flatMap(
        (mapping): MenuSource[] =>
          mapping.category
            ? [
                {
                  categoryId: mapping.category.id,
                  categoryName: mapping.category.categoryName,
                  itemCode: mapping.item.itemCode,
                  itemId: mapping.itemId,
                  itemName: mapping.item.itemName,
                  key: sourceKey(mapping.itemId, mapping.kitchenId, null, mapping.category.id),
                  kitchenId: mapping.kitchenId,
                  sourceName: mapping.kitchen.kitchenName,
                  storeId: null,
                },
              ]
            : [],
      ),
    queryKey: ['kitchen-items', 'menu-source', hospitalId],
  });
  const packaged = distinct(stores.data ?? []);
  const prepared = distinct(kitchens.data ?? []);

  return {
    all: [...prepared, ...packaged],
    isLoading: stores.isLoading || kitchens.isLoading,
    packaged,
    prepared,
  };
}

function SectionDivider({ children }: Readonly<{ children: string }>) {
  return (
    <div className="flex items-center gap-3 text-sm text-ds-muted">
      <span className="h-px flex-1 bg-ds-border" />
      {children}
      <span className="h-px flex-1 bg-ds-border" />
    </div>
  );
}

/**
 * Fills the item's on-sale hours from a named time slot (Breakfast, Lunch…), so they are picked,
 * not typed. It shows the slot the current hours match; hand-typed hours read "Custom hours".
 * Only for roles that may view time slots (others type the hours as before).
 */
function TimeSlotPicker({
  form,
  hospitalId,
}: Readonly<{ form: UseFormReturn<RestaurantMenuFormValues>; hospitalId: string | undefined }>) {
  const { hasPermission } = useAuth();
  const canView = hasPermission('TIME_SLOT_VIEW');
  const slotsQuery = useQuery({
    enabled: canView,
    queryFn: async () =>
      (
        await organizationApi.listTimeSlots({
          hospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'startTime',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.timeSlots('picker', hospitalId ?? ''),
  });
  const from = form.watch('availableFrom') ?? '';
  const to = form.watch('availableTo') ?? '';
  const slots = slotsQuery.data ?? [];

  if (!canView || slots.length === 0) return null;

  const matching = slots.find((slot) =>
    slot.isAlwaysAvailable ? !from && !to : slot.startTime === from && slot.endTime === to,
  );

  return (
    <Field label="Time slot" name="menu-time-slot">
      <Select
        id="menu-time-slot"
        onChange={(event) => {
          const slot = slots.find((entry) => entry.id === event.target.value);
          if (!slot) return;
          const options = { shouldDirty: true, shouldValidate: true };
          form.setValue(
            'availableFrom',
            slot.isAlwaysAvailable ? '' : (slot.startTime ?? ''),
            options,
          );
          form.setValue('availableTo', slot.isAlwaysAvailable ? '' : (slot.endTime ?? ''), options);
        }}
        value={matching?.id ?? ''}
      >
        <option disabled value="">
          {from || to ? 'Custom hours' : 'Pick a time slot'}
        </option>
        {slots.map((slot) => (
          <option key={slot.id} value={slot.id}>
            {slot.slotName} · {slotHours(slot)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function RestaurantMenuFormFields({
  categories,
  form,
  isEditing,
  items,
  menuItemCode,
  referenceMenus,
  restaurants,
}: Readonly<{
  categories: ItemCategory[] | undefined;
  form: UseFormReturn<RestaurantMenuFormValues>;
  isEditing: boolean;
  items: Item[] | undefined;
  /** The menu item's code when editing; a new one is generated on save. */
  menuItemCode?: string;
  referenceMenus: RestaurantMenu[] | undefined;
  restaurants: Restaurant[] | undefined;
}>) {
  const { errors } = form.formState;
  const values = form.watch();
  const shouldShowReferenceMenu =
    values.positionType === 'BEFORE_ITEM' || values.positionType === 'AFTER_ITEM';
  const hospitalId = restaurants?.find(
    (restaurant) => restaurant.id === values.restaurantId,
  )?.hospitalId;
  const sources = useMenuSources(hospitalId);
  const currentKey =
    values.itemId && values.categoryId
      ? sourceKey(
          values.itemId,
          values.kitchenId || null,
          values.storeId || null,
          values.categoryId,
        )
      : '';
  const current = sources.all.find((source) => source.key === currentKey);
  // An older menu entry whose item, kitchen or category no longer matches a mapping here stays
  // shown as it is, so opening it to change a price doesn't lose it.
  const keepsLegacy = Boolean(currentKey) && !sources.isLoading && !current;
  // The restaurant may list an item once per category (the page passes its other entries).
  const onMenu = new Set(
    (referenceMenus ?? [])
      .filter((menu) => menu.restaurantId === values.restaurantId)
      .map((menu) => `${menu.itemId}|${menu.categoryId ?? ''}`),
  );
  const categoryName = categories?.find(
    (category) => category.id === values.categoryId,
  )?.categoryName;

  function set<TName extends keyof RestaurantMenuFormValues>(
    name: TName,
    value: RestaurantMenuFormValues[TName],
  ) {
    form.setValue(name, value as never, { shouldDirty: true, shouldValidate: true });
  }

  function switchLine(label: string, name: BooleanField) {
    return (
      <label
        className="flex w-fit cursor-pointer items-center gap-3 text-sm font-semibold text-ds-text-2"
        key={name}
      >
        <Toggle ariaLabel={label} checked={values[name]} onChange={(next) => set(name, next)} />
        {label}
      </label>
    );
  }

  return (
    <div className="grid gap-4">
      <Field error={errors.restaurantId?.message} label="Restaurant" name="restaurant-id" required>
        <Select
          id="restaurant-id"
          onChange={(event) => {
            set('restaurantId', event.target.value);
            // Another restaurant may be at another location, with other mapped items.
            set('itemId', '');
            set('kitchenId', '');
            set('storeId', '');
            set('categoryId', '');
            set('referenceMenuId', '');
          }}
          value={values.restaurantId}
        >
          <option value="">Select restaurant</option>
          {restaurants?.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.restaurantName} (
              {restaurant.hospital?.hospitalName ?? restaurant.restaurantCode})
            </option>
          ))}
        </Select>
      </Field>
      <Field
        error={errors.itemId?.message ?? errors.categoryId?.message ?? errors.kitchenId?.message}
        label="Food Item"
        name="menu-item-id"
        required
      >
        <Select
          disabled={!values.restaurantId}
          id="menu-item-id"
          onChange={(event) => {
            const source = sources.all.find((option) => option.key === event.target.value);
            const item = items?.find((option) => option.id === source?.itemId);

            // The mapping decides the item, where it comes from and its category together.
            set('itemId', source?.itemId ?? '');
            set('kitchenId', source?.kitchenId ?? '');
            set('storeId', source?.storeId ?? '');
            set('categoryId', source?.categoryId ?? '');

            // Start from the item's own preparation time; the menu can change it.
            if (item?.preparationTimeMinutes != null && !values.preparationTimeMinutes) {
              set('preparationTimeMinutes', String(item.preparationTimeMinutes));
            }
          }}
          value={currentKey}
        >
          <option value="">
            {!values.restaurantId
              ? 'Choose a restaurant first'
              : sources.isLoading
                ? 'Loading mapped items…'
                : sources.all.length
                  ? 'Select a mapped item'
                  : 'No items mapped at this location'}
          </option>
          {keepsLegacy ? (
            <option value={currentKey}>
              {items?.find((item) => item.id === values.itemId)?.itemName ?? 'Current item'} -{' '}
              {categoryName ?? 'no category'} (not mapped like this here)
            </option>
          ) : null}
          {(
            [
              ['Prepared (from a kitchen)', sources.prepared],
              ['Packaged (from a store)', sources.packaged],
            ] as const
          ).map(([label, group]) =>
            group.length ? (
              <optgroup key={label} label={label}>
                {group.map((source) => {
                  const taken =
                    source.key !== currentKey &&
                    onMenu.has(`${source.itemId}|${source.categoryId}`);

                  return (
                    <option disabled={taken} key={source.key} value={source.key}>
                      {source.itemName} - {source.categoryName} · {source.sourceName}
                      {taken ? ' (already on menu)' : ''}
                    </option>
                  );
                })}
              </optgroup>
            ) : null,
          )}
        </Select>
        {values.restaurantId && !sources.isLoading && sources.all.length === 0 ? (
          <p className="mt-1.5 text-xs text-ds-muted">
            Only items mapped to a store or kitchen at this restaurant&apos;s location can go on its
            menu.{' '}
            <Link
              className="font-semibold text-ds-link hover:underline"
              href="/masters/item-mapping"
            >
              Map items
            </Link>
          </p>
        ) : null}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store / Kitchen" name="source-id">
          <Input
            disabled
            id="source-id"
            readOnly
            value={
              !values.itemId
                ? 'From the mapping'
                : current
                  ? `${current.sourceName} (${current.kitchenId ? 'kitchen' : 'store'})`
                  : values.kitchenId || values.storeId
                    ? 'As saved before'
                    : 'Not set'
            }
          />
        </Field>
        <Field label="Food Category" name="category-id">
          <Input
            disabled
            id="category-id"
            readOnly
            value={values.itemId ? (categoryName ?? '—') : 'From the mapping'}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-ds-muted">
        Store or kitchen and category come from the item&apos;s mapping. To change them, pick
        another mapping above or change it in{' '}
        <Link className="font-semibold text-ds-link hover:underline" href="/masters/item-mapping">
          Item Mapping
        </Link>
        .
      </p>
      <Field label="Menu item code" name="menu-item-code">
        <Input
          disabled
          id="menu-item-code"
          readOnly
          value={menuItemCode ?? 'Auto-generated after save'}
        />
      </Field>
      <Field error={errors.addOn?.message} label="Add-On" name="add-on">
        <Input id="add-on" {...form.register('addOn')} />
      </Field>
      <Field error={errors.subCode?.message} label="Sub-Code" name="sub-code">
        <Input id="sub-code" {...form.register('subCode')} />
      </Field>

      <div className="grid gap-3.5 py-1">
        {switchLine('Available?', 'isAvailable')}
        {switchLine('Active', 'isActive')}
        {switchLine('Discountable?', 'isDiscountable')}
        {switchLine('Featured on the kiosk?', 'isFeatured')}
      </div>

      <Field
        error={errors.preparationTimeMinutes?.message}
        label="Preparation Time (In Minutes)"
        name="preparation-time"
      >
        <Input
          id="preparation-time"
          inputMode="numeric"
          min={0}
          type="number"
          {...form.register('preparationTimeMinutes')}
        />
      </Field>
      <Field error={errors.serves?.message} label="Serves (No. of People)" name="serves">
        <Input id="serves" inputMode="numeric" min={1} type="number" {...form.register('serves')} />
      </Field>
      <Field error={errors.accompaniments?.message} label="Accompaniments" name="accompaniments">
        <Textarea id="accompaniments" {...form.register('accompaniments')} />
      </Field>

      <SectionDivider>Availability</SectionDivider>
      <TimeSlotPicker form={form} hospitalId={hospitalId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.availableFrom?.message} label="Available From" name="available-from">
          <Input id="available-from" type="time" {...form.register('availableFrom')} />
        </Field>
        <Field error={errors.availableTo?.message} label="Available To" name="available-to">
          <Input id="available-to" type="time" {...form.register('availableTo')} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-ds-muted">
        Leave both empty to sell it all day. A "to" time earlier than "from" runs past midnight.
      </p>
      <Field error={errors.daysOfWeek?.message} label="Days Of Week" name="days-of-week">
        <MultiSelectDropdown
          id="days-of-week"
          onChange={(daysOfWeek) => set('daysOfWeek', daysOfWeek)}
          options={dayOfWeekValues.map((day) => ({ label: formatEnum(day), value: day }))}
          placeholder="Every day"
          value={values.daysOfWeek}
        />
      </Field>
      {/* A new menu item always goes last; only an edit can move it. */}
      {isEditing ? (
        <Field error={errors.positionType?.message} label="Position In Menu" name="position-type">
          <Select
            id="position-type"
            onChange={(event) => {
              const positionType = event.target.value as RestaurantMenuPositionType | '';

              set('positionType', positionType);

              if (positionType !== 'BEFORE_ITEM' && positionType !== 'AFTER_ITEM') {
                set('referenceMenuId', '');
              }
            }}
            value={values.positionType}
          >
            <option value="">Keep current position</option>
            {positionTypeValues.map((positionType) => (
              <option key={positionType} value={positionType}>
                {formatPositionType(positionType)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {isEditing && shouldShowReferenceMenu ? (
        <Field
          error={errors.referenceMenuId?.message}
          label="Reference Item"
          name="reference-menu-id"
          required
        >
          <Select id="reference-menu-id" {...form.register('referenceMenuId')}>
            <option value="">Select menu item</option>
            {referenceMenus?.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.item.itemName} ({menu.item.itemCode})
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SectionDivider>Pricing</SectionDivider>
      <Field error={errors.gstPercent?.message} label="GST Slab" name="gst-percent">
        <Select id="gst-percent" {...form.register('gstPercent')}>
          {gstSlabs.map((slab) => (
            <option key={slab} value={String(slab)}>
              {slab}%
            </option>
          ))}
        </Select>
      </Field>
      {switchLine('GST Inclusive?', 'isGstInclusive')}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-ds-text-2">Serve At</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {serveAtOptions.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ds-text-2"
              key={option.value}
            >
              <input
                checked={values.serveAt === option.value}
                className="h-4 w-4 accent-ds-primary"
                name="serve-at"
                onChange={() => set('serveAt', option.value)}
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {values.serveAt !== 'ROOM' ? (
        <Field error={errors.price?.message} label="Price" name="price" required>
          <Input
            id="price"
            inputMode="decimal"
            min={0}
            step="0.01"
            type="number"
            {...form.register('price')}
          />
        </Field>
      ) : null}
      {values.serveAt !== 'COUNTER' ? (
        <Field error={errors.roomPrice?.message} label="In-Room Price" name="room-price" required>
          <Input
            id="room-price"
            inputMode="decimal"
            min={0}
            step="0.01"
            type="number"
            {...form.register('roomPrice')}
          />
        </Field>
      ) : null}
    </div>
  );
}
