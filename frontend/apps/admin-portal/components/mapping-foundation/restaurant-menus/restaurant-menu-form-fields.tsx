'use client';

import type { UseFormReturn } from 'react-hook-form';
import type {
  Item,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuPositionType,
  TimeSlot,
} from '@aahar/api-client';
import { Field, Select, Skeleton } from '@/components/ui';
import {
  dayOfWeekValues,
  formatEnum,
  positionTypeValues,
  type RestaurantMenuFormValues,
} from '@/components/mapping-foundation/restaurant-menus/shared';
import { CheckboxLine } from '@/components/mapping-foundation/shared/components';
import { MultiSelectDropdown } from '@/components/ui-controls';

function formatPositionType(value: RestaurantMenuPositionType): string {
  if (value === 'BEFORE_ITEM') {
    return 'Before Item';
  }

  if (value === 'AFTER_ITEM') {
    return 'After Item';
  }

  return formatEnum(value);
}

export function RestaurantMenuFormFields({
  form,
  isEditing,
  items,
  referenceMenus,
  restaurants,
  timeSlots,
}: Readonly<{
  form: UseFormReturn<RestaurantMenuFormValues>;
  isEditing: boolean;
  items: Item[] | undefined;
  referenceMenus: RestaurantMenu[] | undefined;
  restaurants: Restaurant[] | undefined;
  timeSlots: TimeSlot[] | undefined;
}>) {
  const selectedDays = form.watch('daysOfWeek');
  const selectedPositionType = form.watch('positionType');
  const selectedTimeSlotIds = form.watch('timeSlotIds');
  const shouldShowReferenceMenu =
    selectedPositionType === 'BEFORE_ITEM' || selectedPositionType === 'AFTER_ITEM';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.restaurantId?.message}
          label="Restaurant"
          name="restaurant-id"
        >
          <Select id="restaurant-id" {...form.register('restaurantId')}>
            <option value="">Select restaurant</option>
            {restaurants?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName} ({restaurant.restaurantCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field error={form.formState.errors.itemId?.message} label="Item" name="menu-item-id">
          <Select id="menu-item-id" {...form.register('itemId')}>
            <option value="">Select item</option>
            {items?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName} ({item.itemCode}) - {formatEnum(item.itemType)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          error={form.formState.errors.timeSlotIds?.message}
          label="Time Slots"
          name="time-slot-ids"
        >
          {timeSlots ? (
            <MultiSelectDropdown
              emptyText="No active time slots found."
              id="time-slot-ids"
              onChange={(timeSlotIds) =>
                form.setValue('timeSlotIds', timeSlotIds, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              options={(timeSlots ?? []).map((slot) => ({ label: slot.slotName, value: slot.id }))}
              placeholder="All day"
              value={selectedTimeSlotIds}
            />
          ) : (
            <Skeleton aria-label="Loading time slots" className="h-10 w-full" />
          )}
        </Field>
        <Field
          error={form.formState.errors.daysOfWeek?.message}
          label="Days Of Week"
          name="days-of-week"
        >
          <MultiSelectDropdown
            id="days-of-week"
            onChange={(daysOfWeek) =>
              form.setValue('daysOfWeek', daysOfWeek, { shouldDirty: true, shouldValidate: true })
            }
            options={dayOfWeekValues.map((day) => ({ label: formatEnum(day), value: day }))}
            placeholder="Every day"
            value={selectedDays}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.positionType?.message}
          label="Position Type"
          name="position-type"
        >
          <Select
            id="position-type"
            onChange={(event) => {
              const positionType = event.target.value as RestaurantMenuPositionType | '';

              form.setValue('positionType', positionType, {
                shouldDirty: true,
                shouldValidate: true,
              });

              if (positionType !== 'BEFORE_ITEM' && positionType !== 'AFTER_ITEM') {
                form.setValue('referenceMenuId', '', {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }
            }}
            value={selectedPositionType}
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
            error={form.formState.errors.referenceMenuId?.message}
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
      </div>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isAvailable')} />}
      >
        Available
      </CheckboxLine>
    </>
  );
}
