'use client';

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
import { useKitchens } from '@/components/inventory/shared/utils';
import { Textarea } from '@/components/organization/shared/form-controls';
import { MultiSelectDropdown, Toggle } from '@/components/ui-controls';

type BooleanField = 'isActive' | 'isAvailable' | 'isDiscountable' | 'isGstInclusive';

function formatPositionType(value: RestaurantMenuPositionType): string {
  if (value === 'BEFORE_ITEM') {
    return 'Before Item';
  }

  if (value === 'AFTER_ITEM') {
    return 'After Item';
  }

  return formatEnum(value);
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

export function RestaurantMenuFormFields({
  categories,
  form,
  isEditing,
  items,
  referenceMenus,
  restaurants,
}: Readonly<{
  categories: ItemCategory[] | undefined;
  form: UseFormReturn<RestaurantMenuFormValues>;
  isEditing: boolean;
  items: Item[] | undefined;
  referenceMenus: RestaurantMenu[] | undefined;
  restaurants: Restaurant[] | undefined;
}>) {
  const { errors } = form.formState;
  const values = form.watch();
  const shouldShowReferenceMenu =
    values.positionType === 'BEFORE_ITEM' || values.positionType === 'AFTER_ITEM';
  // Any active kitchen at the restaurant's location can prepare its menu.
  const kitchensQuery = useKitchens(
    restaurants?.find((restaurant) => restaurant.id === values.restaurantId)?.hospitalId,
  );
  const kitchens = kitchensQuery.data ?? [];
  const categoryItems = (items ?? []).filter(
    (item) => !values.categoryId || item.categoryId === values.categoryId,
  );

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
      <Field error={errors.restaurantId?.message} label="Restaurant" name="restaurant-id">
        <Select
          id="restaurant-id"
          onChange={(event) => {
            set('restaurantId', event.target.value);
            set('kitchenId', '');
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
      <Field error={errors.kitchenId?.message} label="Kitchen" name="kitchen-id">
        <Select disabled={!values.restaurantId} id="kitchen-id" {...form.register('kitchenId')}>
          <option value="">
            {!values.restaurantId
              ? 'Choose a restaurant first'
              : kitchensQuery.isLoading
                ? 'Loading kitchens…'
                : kitchens.length
                  ? 'Select kitchen'
                  : 'This location has no kitchen'}
          </option>
          {kitchens.map((kitchen) => (
            <option key={kitchen.id} value={kitchen.id}>
              {kitchen.kitchenName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Food Category" name="category-id">
        <Select
          id="category-id"
          onChange={(event) => {
            set('categoryId', event.target.value);
            set('itemId', '');
          }}
          value={values.categoryId}
        >
          <option value="">All categories</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.categoryName}
            </option>
          ))}
        </Select>
      </Field>
      <Field error={errors.itemId?.message} label="Food Item" name="menu-item-id">
        <Select
          id="menu-item-id"
          onChange={(event) => {
            const item = items?.find((option) => option.id === event.target.value);

            set('itemId', event.target.value);

            // Start from the item's own preparation time; the menu can change it.
            if (item?.preparationTimeMinutes != null && !values.preparationTimeMinutes) {
              set('preparationTimeMinutes', String(item.preparationTimeMinutes));
            }
          }}
          value={values.itemId}
        >
          <option value="">Select item</option>
          {categoryItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.itemName} ({item.itemCode})
            </option>
          ))}
        </Select>
      </Field>
      <Field error={errors.addOn?.message} label="Add-On" name="add-on">
        <Input id="add-on" {...form.register('addOn')} />
      </Field>

      <div className="grid gap-3.5 py-1">
        {switchLine('Available?', 'isAvailable')}
        {switchLine('Active', 'isActive')}
        {switchLine('Discountable?', 'isDiscountable')}
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
          {isEditing ? <option value="">Keep current position</option> : null}
          {positionTypeValues.map((positionType) => (
            <option key={positionType} value={positionType}>
              {formatPositionType(positionType)}
            </option>
          ))}
        </Select>
      </Field>
      {shouldShowReferenceMenu ? (
        <Field
          error={errors.referenceMenuId?.message}
          label="Reference Item"
          name="reference-menu-id"
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
        <Field error={errors.price?.message} label="Price" name="price">
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
        <Field error={errors.roomPrice?.message} label="In-Room Price" name="room-price">
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
