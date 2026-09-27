'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ChefHat,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Trash2,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type {
  ApiList,
  ApiResponse,
  Hospital,
  Item,
  ItemType,
  Kitchen,
  KitchenItem,
  KitchenItemInput,
  KitchenItemListQuery,
  ListQuery,
  Restaurant,
  RestaurantMenu,
  RestaurantMenuDayOfWeek,
  RestaurantMenuInput,
  RestaurantMenuPositionType,
  SortOrder,
  Store,
  StoreItem,
  StoreItemInput,
  StoreItemListQuery,
  TimeSlot,
  TimeSlotInput,
} from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';

const listLimit = 10;
const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
const dayOfWeekValues = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
const positionTypeValues = ['FIRST', 'LAST', 'BEFORE_ITEM', 'AFTER_ITEM'] as const;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const timeInputSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || timePattern.test(value), 'Use HH:mm format.');

const timeSlotSchema = z
  .object({
    endTime: timeInputSchema,
    isActive: z.boolean(),
    isAlwaysAvailable: z.boolean(),
    slotName: z.string().trim().min(1, 'Slot name is required.').max(100),
    startTime: timeInputSchema,
  })
  .superRefine((values, context) => {
    if (values.isAlwaysAvailable) {
      return;
    }

    if (!values.startTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Start time is required.',
        path: ['startTime'],
      });
    }

    if (!values.endTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time is required.',
        path: ['endTime'],
      });
    }

    if (values.startTime && values.endTime && values.endTime <= values.startTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time.',
        path: ['endTime'],
      });
    }
  });

const mappingSchema = z.object({
  isActive: z.boolean(),
  itemId: z.string().uuid('Select an item.'),
  parentId: z.string().uuid('Select a parent.'),
});

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

type ActiveFilter = '' | 'active' | 'inactive';
type AvailabilityFilter = '' | 'available' | 'unavailable';
type AlwaysAvailableFilter = '' | 'always' | 'scheduled';
type DayFilter = '' | RestaurantMenuDayOfWeek;
type ItemTypeFilter = '' | ItemType;
type TimeSlotFormValues = z.infer<typeof timeSlotSchema>;

interface MappingFormValues {
  isActive: boolean;
  itemId: string;
  parentId: string;
}

interface RestaurantMenuFormValues {
  daysOfWeek: RestaurantMenuDayOfWeek[];
  isAvailable: boolean;
  itemId: string;
  positionType: RestaurantMenuPositionType | '';
  referenceMenuId: string;
  restaurantId: string;
  timeSlotIds: string[];
}

interface PageHeaderProps {
  icon: LucideIcon;
  subtitle: string;
  title: string;
}

interface PaginationControlsProps {
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') {
    return true;
  }

  if (value === 'inactive') {
    return false;
  }

  return undefined;
}

function availabilityFilterToBoolean(value: AvailabilityFilter): boolean | undefined {
  if (value === 'available') {
    return true;
  }

  if (value === 'unavailable') {
    return false;
  }

  return undefined;
}

function alwaysAvailableFilterToBoolean(value: AlwaysAvailableFilter): boolean | undefined {
  if (value === 'always') {
    return true;
  }

  if (value === 'scheduled') {
    return false;
  }

  return undefined;
}

function applyValidationErrors<TFormValues extends FieldValues>(
  form: UseFormReturn<TFormValues>,
  error: ZodError,
) {
  form.clearErrors();

  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TFormValues>, {
        message: issue.message,
      });
    }
  });
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatEnum(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function formatPositionType(value: RestaurantMenuPositionType): string {
  if (value === 'BEFORE_ITEM') {
    return 'Before Item';
  }

  if (value === 'AFTER_ITEM') {
    return 'After Item';
  }

  return formatEnum(value);
}

function timeRange(slot: TimeSlot): string {
  if (slot.isAlwaysAvailable) {
    return 'Always available';
  }

  return `${slot.startTime ?? '--'} - ${slot.endTime ?? '--'}`;
}

function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

function StatusToggleButton({
  isActive,
  isPending,
  onToggle,
}: Readonly<{
  isActive: boolean;
  isPending: boolean;
  onToggle: () => void;
}>) {
  return (
    <Button
      className={
        isActive
          ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
          : 'border-teal-200 text-teal-700 hover:bg-teal-50'
      }
      disabled={isPending}
      onClick={onToggle}
      size="sm"
      type="button"
      variant="outline"
    >
      {isActive ? 'Turn inactive' : 'Turn active'}
    </Button>
  );
}

function BooleanBadge({
  falseLabel,
  trueLabel,
  value,
}: Readonly<{
  falseLabel: string;
  trueLabel: string;
  value: boolean;
}>) {
  return <Badge variant={value ? 'success' : 'neutral'}>{value ? trueLabel : falseLabel}</Badge>;
}

function PageHeader({ icon: Icon, subtitle, title }: PageHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
          Mapping Foundation
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function SearchInput({
  onChange,
  value,
}: Readonly<{
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        type="search"
        value={value}
      />
    </div>
  );
}

function ActiveFilterSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: ActiveFilter) => void;
  value: ActiveFilter;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as ActiveFilter)} value={value}>
      <option value="">All status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </Select>
  );
}

function SortOrderSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: SortOrder) => void;
  value: SortOrder;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as SortOrder)} value={value}>
      <option value="desc">Newest first</option>
      <option value="asc">Oldest first</option>
    </Select>
  );
}

function HospitalFilterSelect({
  disabled = false,
  hospitals,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  hospitals: Hospital[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">All locations</option>
      {hospitals.map((hospital) => (
        <option key={hospital.id} value={hospital.id}>
          {hospital.displayName || hospital.hospitalName}
        </option>
      ))}
    </Select>
  );
}

function QueryState({
  colSpan,
  error,
  isError,
  isLoading,
  label,
}: Readonly<{
  colSpan: number;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  label: string;
}>) {
  if (isLoading) {
    return (
      <>
        {skeletonRows.map((row) => (
          <tr key={row}>
            <td className="px-4 py-4" colSpan={colSpan}>
              <Skeleton className="h-8 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-12 text-center text-sm text-red-600" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto max-w-sm">
          <p className="text-sm font-semibold text-slate-900">No {label} found</p>
          <p className="mt-1 text-sm text-slate-500">Create a record or adjust the filters.</p>
        </div>
      </td>
    </tr>
  );
}

function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {safeTotalPages} - {total} records - {limit} per page
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function CheckboxLine({
  children,
  input,
}: Readonly<{
  children: ReactNode;
  input: ReactNode;
}>) {
  return (
    <label className="flex min-h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
      {input}
      {children}
    </label>
  );
}

function SubmitButton({
  isPending,
  label,
}: Readonly<{
  isPending: boolean;
  label: string;
}>) {
  return (
    <Button className="bg-teal-600 hover:bg-teal-700" disabled={isPending} type="submit">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

function useEntityList<TItem, TQuery extends ListQuery>(
  entityKey: string,
  query: TQuery,
  list: (query: TQuery) => Promise<ApiResponse<ApiList<TItem>>>,
) {
  return useQuery({
    queryFn: async () => {
      const response = await list(query);

      return response.data;
    },
    queryKey: [entityKey, query],
  });
}

function useHospitalOptions() {
  return useQuery<Hospital[]>({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'hospitalName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['mapping-hospital-options'],
  });
}

function useStoreOptions(hospitalId?: string) {
  return useQuery<Store[]>({
    queryFn: async () => {
      const response = await organizationApi.listStores({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'storeName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['store-options', hospitalId ?? 'all'],
  });
}

function useKitchenOptions(hospitalId?: string) {
  return useQuery<Kitchen[]>({
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        hospitalId: hospitalId || undefined,
        isActive: true,
        limit: 100,
        sortBy: 'kitchenName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['kitchen-options', hospitalId ?? 'all'],
  });
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
    queryKey: ['restaurant-options', hospitalId ?? 'all'],
  });
}

function useItemOptions(itemType?: ItemType) {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        isActive: true,
        itemType,
        limit: 100,
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['item-options', itemType ?? 'all'],
  });
}

function useTimeSlotOptions() {
  return useQuery<TimeSlot[]>({
    queryFn: async () => {
      const response = await organizationApi.listTimeSlots({
        isActive: true,
        limit: 100,
        sortBy: 'slotName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['time-slot-options'],
  });
}

function timeSlotToFormValues(slot: TimeSlot): TimeSlotFormValues {
  return {
    endTime: slot.endTime ?? '',
    isActive: slot.isActive,
    isAlwaysAvailable: slot.isAlwaysAvailable,
    slotName: slot.slotName,
    startTime: slot.startTime ?? '',
  };
}

function emptyTimeSlotFormValues(): TimeSlotFormValues {
  return {
    endTime: '',
    isActive: true,
    isAlwaysAvailable: false,
    slotName: '',
    startTime: '',
  };
}

function toTimeSlotPayload(values: TimeSlotFormValues): TimeSlotInput {
  if (values.isAlwaysAvailable) {
    return {
      isActive: values.isActive,
      isAlwaysAvailable: true,
      slotName: values.slotName,
    };
  }

  return {
    endTime: values.endTime,
    isActive: values.isActive,
    isAlwaysAvailable: false,
    slotName: values.slotName,
    startTime: values.startTime,
  };
}

function emptyMappingFormValues(): MappingFormValues {
  return {
    isActive: true,
    itemId: '',
    parentId: '',
  };
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

function TimeSlotFormFields({ form }: Readonly<{ form: UseFormReturn<TimeSlotFormValues> }>) {
  const isAlwaysAvailable = form.watch('isAlwaysAvailable');

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field error={form.formState.errors.slotName?.message} label="Slot Name" name="slot-name">
          <Input id="slot-name" {...form.register('slotName')} />
        </Field>
        <Field
          error={form.formState.errors.startTime?.message}
          label="Start Time"
          name="start-time"
        >
          <Input
            disabled={isAlwaysAvailable}
            id="start-time"
            type="time"
            {...form.register('startTime')}
          />
        </Field>
        <Field error={form.formState.errors.endTime?.message} label="End Time" name="end-time">
          <Input
            disabled={isAlwaysAvailable}
            id="end-time"
            type="time"
            {...form.register('endTime')}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxLine
          input={
            <input className="h-4 w-4" type="checkbox" {...form.register('isAlwaysAvailable')} />
          }
        >
          Always Available
        </CheckboxLine>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </div>
    </>
  );
}

function MappingFormFields({
  form,
  itemLabel,
  items,
  parentLabel,
  parents,
}: Readonly<{
  form: UseFormReturn<MappingFormValues>;
  itemLabel: string;
  items: Item[] | undefined;
  parentLabel: string;
  parents: Array<{ code: string; id: string; name: string }> | undefined;
}>) {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={form.formState.errors.parentId?.message} label={parentLabel} name="parent-id">
          <Select id="parent-id" {...form.register('parentId')}>
            <option value="">Select {parentLabel.toLowerCase()}</option>
            {parents?.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name} ({parent.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field error={form.formState.errors.itemId?.message} label={itemLabel} name="item-id">
          <Select id="item-id" {...form.register('itemId')}>
            <option value="">Select item</option>
            {items?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName} ({item.itemCode})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}

function RestaurantMenuFormFields({
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

  function toggleDay(day: RestaurantMenuDayOfWeek, checked: boolean) {
    form.setValue(
      'daysOfWeek',
      checked ? [...selectedDays, day] : selectedDays.filter((selectedDay) => selectedDay !== day),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  }

  function toggleTimeSlot(timeSlotId: string, checked: boolean) {
    form.setValue(
      'timeSlotIds',
      checked
        ? [...selectedTimeSlotIds, timeSlotId]
        : selectedTimeSlotIds.filter((selectedTimeSlotId) => selectedTimeSlotId !== timeSlotId),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    );
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
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
      <div className="grid gap-5 lg:grid-cols-2">
        <Field
          error={form.formState.errors.timeSlotIds?.message}
          label="Time Slots"
          name="time-slot-ids"
        >
          <div className="grid gap-2 rounded-md border bg-white p-3 shadow-sm sm:grid-cols-2">
            {timeSlots?.length ? (
              timeSlots.map((slot) => (
                <CheckboxLine
                  input={
                    <input
                      checked={selectedTimeSlotIds.includes(slot.id)}
                      className="h-4 w-4"
                      onChange={(event) => toggleTimeSlot(slot.id, event.target.checked)}
                      type="checkbox"
                    />
                  }
                  key={slot.id}
                >
                  {slot.slotName}
                </CheckboxLine>
              ))
            ) : (
              <p className="text-sm text-slate-500">No active time slots found.</p>
            )}
          </div>
        </Field>
        <Field
          error={form.formState.errors.daysOfWeek?.message}
          label="Days Of Week"
          name="days-of-week"
        >
          <div className="grid gap-2 rounded-md border bg-white p-3 shadow-sm sm:grid-cols-2">
            {dayOfWeekValues.map((day) => (
              <CheckboxLine
                input={
                  <input
                    checked={selectedDays.includes(day)}
                    className="h-4 w-4"
                    onChange={(event) => toggleDay(day, event.target.checked)}
                    type="checkbox"
                  />
                }
                key={day}
              >
                {formatEnum(day)}
              </CheckboxLine>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
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

export function TimeSlotsPageClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [alwaysFilter, setAlwaysFilter] = useState<AlwaysAvailableFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<TimeSlotFormValues>({
    defaultValues: emptyTimeSlotFormValues(),
  });

  const slotsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listTimeSlots({
        isActive: activeFilterToBoolean(activeFilter),
        isAlwaysAvailable: alwaysAvailableFilterToBoolean(alwaysFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: [
      'time-slots',
      {
        activeFilter,
        alwaysFilter,
        page,
        search,
        sortBy,
        sortOrder,
      },
    ],
  });

  const saveSlotMutation = useMutation({
    mutationFn: (body: TimeSlotInput) =>
      editingSlot
        ? organizationApi.updateTimeSlot(editingSlot.id, body)
        : organizationApi.createTimeSlot(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingSlot ? 'Time slot was not updated' : 'Time slot was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['time-slots'] });
      void queryClient.invalidateQueries({ queryKey: ['time-slot-options'] });
      showToast({
        title: editingSlot ? 'Time slot updated' : 'Time slot created',
        variant: 'success',
      });
      setEditingSlot(null);
      form.reset(emptyTimeSlotFormValues());
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteTimeSlot(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Time slot was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['time-slots'] });
      void queryClient.invalidateQueries({ queryKey: ['time-slot-options'] });
      showToast({ title: 'Time slot deleted', variant: 'success' });
    },
  });

  const slots = slotsQuery.data?.items ?? [];
  const meta = slotsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = timeSlotSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveSlotMutation.mutate(toTimeSlotPayload(parsed.data));
  });

  function startEditingSlot(slot: TimeSlot) {
    setEditingSlot(slot);
    form.reset(timeSlotToFormValues(slot));
  }

  function cancelEditingSlot() {
    setEditingSlot(null);
    form.reset(emptyTimeSlotFormValues());
  }

  function deleteSlot(slot: TimeSlot) {
    const shouldDelete = window.confirm(`Delete ${slot.slotName}?`);

    if (shouldDelete) {
      deleteSlotMutation.mutate(slot.id);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        icon={CalendarClock}
        subtitle="Manage reusable availability windows for restaurant menu publishing."
        title="Time Slots"
      />

      <Panel className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            {editingSlot ? 'Edit Time Slot' : 'Create Time Slot'}
          </h2>
          <p className="text-sm text-slate-500">
            Seeded slots can be adjusted for local operations.
          </p>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <TimeSlotFormFields form={form} />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingSlot ? (
              <Button onClick={cancelEditingSlot} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveSlotMutation.isPending}
              label={editingSlot ? 'Update Time Slot' : 'Create Time Slot'}
            />
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(0,1fr)_150px_170px_170px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
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
              setAlwaysFilter(event.target.value as AlwaysAvailableFilter);
              setPage(1);
            }}
            value={alwaysFilter}
          >
            <option value="">All availability</option>
            <option value="always">Always available</option>
            <option value="scheduled">Scheduled</option>
          </Select>
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="slotName">Slot name</option>
            <option value="startTime">Start time</option>
            <option value="endTime">End time</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void slotsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[17%] px-4 py-3">Slot Name</th>
                <th className="w-[18%] px-4 py-3">Time Range</th>
                <th className="w-[14%] px-4 py-3">Availability</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="w-[16%] px-4 py-3">Created Date Time</th>
                <th className="w-[16%] px-4 py-3">Updated Date Time</th>
                <th className="w-[18%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {slots.length > 0 ? (
                slots.map((slot) => (
                  <tr className="hover:bg-slate-50" key={slot.id}>
                    <td className="px-4 py-4 font-medium text-slate-950">{slot.slotName}</td>
                    <td className="px-4 py-4 text-slate-600">{timeRange(slot)}</td>
                    <td className="px-4 py-4">
                      <BooleanBadge
                        falseLabel="Scheduled"
                        trueLabel="Always"
                        value={slot.isAlwaysAvailable}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={slot.isActive} />
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(slot.createdAt)}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(slot.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingSlot(slot)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deleteSlotMutation.isPending}
                          onClick={() => deleteSlot(slot)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={7}
                  error={slotsQuery.error}
                  isError={slotsQuery.isError}
                  isLoading={slotsQuery.isLoading}
                  label="time slots"
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

function useInvalidateMappingQueries(entityKey: string, optionKey: string) {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: [entityKey] });
    void queryClient.invalidateQueries({ queryKey: [optionKey] });
  };
}

export function StoreItemsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingMapping, setEditingMapping] = useState<StoreItem | null>(null);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const storesQuery = useStoreOptions(hospitalFilter);
  const itemsQuery = useItemOptions('MRP');
  const invalidateStoreItems = useInvalidateMappingQueries('store-items', 'store-options');
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setStoreFilter('');
    setPage(1);

    if (!editingMapping) {
      form.setValue('parentId', '', { shouldValidate: true });
    }
  }, [editingMapping, form, scopedHospitalId]);

  const mappingsQuery = useEntityList<StoreItem, StoreItemListQuery>(
    'store-items',
    {
      isActive: activeFilterToBoolean(activeFilter),
      hospitalId: hospitalFilter,
      itemId: itemFilter,
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
      storeId: storeFilter,
    },
    (query) => organizationApi.listStoreItems(query),
  );

  const saveMappingMutation = useMutation({
    mutationFn: (body: StoreItemInput) =>
      editingMapping
        ? organizationApi.updateStoreItem(editingMapping.id, body)
        : organizationApi.createStoreItem(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMapping ? 'Store item was not updated' : 'Store item was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateStoreItems();
      showToast({
        title: editingMapping ? 'Store item updated' : 'Store item created',
        variant: 'success',
      });
      setEditingMapping(null);
      form.reset(emptyMappingFormValues());
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteStoreItem(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store item was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateStoreItems();
      showToast({ title: 'Store item deleted', variant: 'success' });
    },
  });

  const toggleMappingStatusMutation = useMutation({
    mutationFn: ({ isActive, mapping }: { isActive: boolean; mapping: StoreItem }) =>
      organizationApi.updateStoreItem(mapping.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateStoreItems();
      showToast({
        title: variables.isActive ? 'Store item mapping activated' : 'Store item mapping inactive',
        variant: 'success',
      });
    },
  });

  const stores =
    storesQuery.data?.map((store) => ({
      code: store.storeCode,
      id: store.id,
      name: store.storeName,
    })) ?? [];
  const mappings = mappingsQuery.data?.items ?? [];
  const meta = mappingsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = mappingSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMappingMutation.mutate({
      isActive: parsed.data.isActive,
      itemId: parsed.data.itemId,
      storeId: parsed.data.parentId,
    });
  });

  function startEditingMapping(mapping: StoreItem) {
    setEditingMapping(mapping);
    form.reset({
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.storeId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
    form.reset(emptyMappingFormValues());
  }

  function deleteMapping(mapping: StoreItem) {
    const shouldDelete = window.confirm(
      `Delete ${mapping.store.storeName} - ${mapping.item.itemName}?`,
    );

    if (shouldDelete) {
      deleteMappingMutation.mutate(mapping.id);
    }
  }

  function toggleMappingStatus(mapping: StoreItem) {
    const nextIsActive = !mapping.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this mapping inactive will prevent this item from being used in new GRNs for this store. Existing stock and history will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMappingStatusMutation.mutate({ isActive: nextIsActive, mapping });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        icon={StoreIcon}
        subtitle="Map MRP items to stores for future sales and stock flows."
        title="Store Items"
      />
      <Panel className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            {editingMapping ? 'Edit Store Item' : 'Create Store Item'}
          </h2>
          <p className="text-sm text-slate-500">Only MRP items are available for store mapping.</p>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <MappingFormFields
            form={form}
            itemLabel="MRP Item"
            items={itemsQuery.data}
            parentLabel="Store"
            parents={stores}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingMapping ? (
              <Button onClick={cancelEditingMapping} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveMappingMutation.isPending}
              label={editingMapping ? 'Update Store Item' : 'Create Store Item'}
            />
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_150px_180px_180px_180px_170px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
          />
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <HospitalFilterSelect
            disabled={Boolean(scopedHospitalId)}
            hospitals={hospitalsQuery.data ?? []}
            onChange={(value) => {
              setHospitalFilter(value);
              setStoreFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            onChange={(event) => {
              setStoreFilter(event.target.value);
              setPage(1);
            }}
            value={storeFilter}
          >
            <option value="">All stores</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
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
            <option value="">All MRP items</option>
            {itemsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName}
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
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void mappingsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[15%] px-4 py-3">Location</th>
                <th className="w-[15%] px-4 py-3">Store</th>
                <th className="w-[16%] px-4 py-3">Item</th>
                <th className="w-[12%] px-4 py-3">Category</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="w-[14%] px-4 py-3">Active / Inactive</th>
                <th className="w-[15%] px-4 py-3">Created Date Time</th>
                <th className="w-[15%] px-4 py-3">Updated Date Time</th>
                <th className="w-[18%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {mappings.length > 0 ? (
                mappings.map((mapping) => (
                  <tr className="hover:bg-slate-50" key={mapping.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {mapping.store.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {mapping.store.hospital.hospitalCode}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{mapping.store.storeName}</p>
                      <p className="text-xs text-slate-500">{mapping.store.storeCode}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{mapping.item.itemName}</p>
                      <p className="text-xs text-slate-500">{mapping.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {mapping.item.category?.categoryName ?? '-'}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={mapping.isActive} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusToggleButton
                        isActive={mapping.isActive}
                        isPending={toggleMappingStatusMutation.isPending}
                        onToggle={() => toggleMappingStatus(mapping)}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(mapping.createdAt)}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(mapping.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deleteMappingMutation.isPending}
                          onClick={() => deleteMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={9}
                  error={mappingsQuery.error}
                  isError={mappingsQuery.isError}
                  isLoading={mappingsQuery.isLoading}
                  label="store item mappings"
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

export function KitchenItemsPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [kitchenFilter, setKitchenFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingMapping, setEditingMapping] = useState<KitchenItem | null>(null);
  const form = useForm<MappingFormValues>({ defaultValues: emptyMappingFormValues() });
  const hospitalsQuery = useHospitalOptions();
  const kitchensQuery = useKitchenOptions(hospitalFilter);
  const itemsQuery = useItemOptions('READYMADE');
  const invalidateKitchenItems = useInvalidateMappingQueries('kitchen-items', 'kitchen-options');
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setKitchenFilter('');
    setPage(1);

    if (!editingMapping) {
      form.setValue('parentId', '', { shouldValidate: true });
    }
  }, [editingMapping, form, scopedHospitalId]);

  const mappingsQuery = useEntityList<KitchenItem, KitchenItemListQuery>(
    'kitchen-items',
    {
      isActive: activeFilterToBoolean(activeFilter),
      hospitalId: hospitalFilter,
      itemId: itemFilter,
      kitchenId: kitchenFilter,
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
    },
    (query) => organizationApi.listKitchenItems(query),
  );

  const saveMappingMutation = useMutation({
    mutationFn: (body: KitchenItemInput) =>
      editingMapping
        ? organizationApi.updateKitchenItem(editingMapping.id, body)
        : organizationApi.createKitchenItem(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMapping ? 'Kitchen item was not updated' : 'Kitchen item was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenItems();
      showToast({
        title: editingMapping ? 'Kitchen item updated' : 'Kitchen item created',
        variant: 'success',
      });
      setEditingMapping(null);
      form.reset(emptyMappingFormValues());
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteKitchenItem(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen item was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateKitchenItems();
      showToast({ title: 'Kitchen item deleted', variant: 'success' });
    },
  });

  const toggleMappingStatusMutation = useMutation({
    mutationFn: ({ isActive, mapping }: { isActive: boolean; mapping: KitchenItem }) =>
      organizationApi.updateKitchenItem(mapping.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateKitchenItems();
      showToast({
        title: variables.isActive
          ? 'Kitchen item mapping activated'
          : 'Kitchen item mapping inactive',
        variant: 'success',
      });
    },
  });

  const kitchens =
    kitchensQuery.data?.map((kitchen) => ({
      code: kitchen.kitchenCode,
      id: kitchen.id,
      name: kitchen.kitchenName,
    })) ?? [];
  const mappings = mappingsQuery.data?.items ?? [];
  const meta = mappingsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = mappingSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMappingMutation.mutate({
      isActive: parsed.data.isActive,
      itemId: parsed.data.itemId,
      kitchenId: parsed.data.parentId,
    });
  });

  function startEditingMapping(mapping: KitchenItem) {
    setEditingMapping(mapping);
    form.reset({
      isActive: mapping.isActive,
      itemId: mapping.itemId,
      parentId: mapping.kitchenId,
    });
  }

  function cancelEditingMapping() {
    setEditingMapping(null);
    form.reset(emptyMappingFormValues());
  }

  function deleteMapping(mapping: KitchenItem) {
    const shouldDelete = window.confirm(
      `Delete ${mapping.kitchen.kitchenName} - ${mapping.item.itemName}?`,
    );

    if (shouldDelete) {
      deleteMappingMutation.mutate(mapping.id);
    }
  }

  function toggleMappingStatus(mapping: KitchenItem) {
    const nextIsActive = !mapping.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this mapping inactive will prevent this item from being used in new kitchen production. Existing stock and history will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleMappingStatusMutation.mutate({ isActive: nextIsActive, mapping });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        icon={ChefHat}
        subtitle="Map readymade items to kitchens for future production handoff."
        title="Kitchen Items"
      />
      <Panel className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            {editingMapping ? 'Edit Kitchen Item' : 'Create Kitchen Item'}
          </h2>
          <p className="text-sm text-slate-500">
            Only readymade items are available for kitchen mapping.
          </p>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <MappingFormFields
            form={form}
            itemLabel="Readymade Item"
            items={itemsQuery.data}
            parentLabel="Kitchen"
            parents={kitchens}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {editingMapping ? (
              <Button onClick={cancelEditingMapping} type="button" variant="outline">
                Cancel
              </Button>
            ) : null}
            <SubmitButton
              isPending={saveMappingMutation.isPending}
              label={editingMapping ? 'Update Kitchen Item' : 'Create Kitchen Item'}
            />
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_150px_180px_180px_180px_170px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
          />
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <HospitalFilterSelect
            disabled={Boolean(scopedHospitalId)}
            hospitals={hospitalsQuery.data ?? []}
            onChange={(value) => {
              setHospitalFilter(value);
              setKitchenFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          />
          <Select
            onChange={(event) => {
              setKitchenFilter(event.target.value);
              setPage(1);
            }}
            value={kitchenFilter}
          >
            <option value="">All kitchens</option>
            {kitchens.map((kitchen) => (
              <option key={kitchen.id} value={kitchen.id}>
                {kitchen.name}
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
            <option value="">All readymade items</option>
            {itemsQuery.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemName}
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
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void mappingsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[15%] px-4 py-3">Location</th>
                <th className="w-[15%] px-4 py-3">Kitchen</th>
                <th className="w-[16%] px-4 py-3">Item</th>
                <th className="w-[12%] px-4 py-3">Category</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="w-[14%] px-4 py-3">Active / Inactive</th>
                <th className="w-[15%] px-4 py-3">Created Date Time</th>
                <th className="w-[15%] px-4 py-3">Updated Date Time</th>
                <th className="w-[18%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {mappings.length > 0 ? (
                mappings.map((mapping) => (
                  <tr className="hover:bg-slate-50" key={mapping.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {mapping.kitchen.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {mapping.kitchen.hospital.hospitalCode}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{mapping.kitchen.kitchenName}</p>
                      <p className="text-xs text-slate-500">{mapping.kitchen.kitchenCode}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{mapping.item.itemName}</p>
                      <p className="text-xs text-slate-500">{mapping.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {mapping.item.category?.categoryName ?? '-'}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={mapping.isActive} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusToggleButton
                        isActive={mapping.isActive}
                        isPending={toggleMappingStatusMutation.isPending}
                        onToggle={() => toggleMappingStatus(mapping)}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(mapping.createdAt)}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(mapping.updatedAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deleteMappingMutation.isPending}
                          onClick={() => deleteMapping(mapping)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={9}
                  error={mappingsQuery.error}
                  isError={mappingsQuery.isError}
                  isLoading={mappingsQuery.isLoading}
                  label="kitchen item mappings"
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

export function RestaurantMenusPageClient() {
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [timeSlotFilter, setTimeSlotFilter] = useState('');
  const [sortBy, setSortBy] = useState('displayOrder');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editingMenu, setEditingMenu] = useState<RestaurantMenu | null>(null);
  const form = useForm<RestaurantMenuFormValues>({
    defaultValues: emptyRestaurantMenuFormValues(),
  });
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter);
  const itemsQuery = useItemOptions();
  const filterItemsQuery = useItemOptions(itemTypeFilter || undefined);
  const timeSlotsQuery = useTimeSlotOptions();
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
    queryKey: ['restaurant-menu-reference-options', selectedRestaurantId],
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
    queryKey: [
      'restaurant-menus',
      {
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
      },
    ],
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
      void queryClient.invalidateQueries({ queryKey: ['restaurant-menus'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-menu-reference-options'] });
      showToast({
        title: editingMenu ? 'Restaurant menu updated' : 'Restaurant menu created',
        variant: 'success',
      });
      setEditingMenu(null);
      form.reset(emptyRestaurantMenuFormValues());
    },
  });

  const deleteMenuMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteRestaurantMenu(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant menu was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['restaurant-menus'] });
      showToast({ title: 'Restaurant menu deleted', variant: 'success' });
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
      void queryClient.invalidateQueries({ queryKey: ['restaurant-menus'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-menu-reference-options'] });
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

  function deleteMenu(menu: RestaurantMenu) {
    const shouldDelete = window.confirm(
      `Delete ${menu.restaurant.restaurantName} - ${menu.item.itemName}?`,
    );

    if (shouldDelete) {
      deleteMenuMutation.mutate(menu.id);
    }
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
    <section className="space-y-6">
      <PageHeader
        icon={Utensils}
        subtitle="Map items to restaurant menus with optional time-slot availability."
        title="Restaurant Menus"
      />
      <Panel className="p-5">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">
            {editingMenu ? 'Edit Restaurant Menu' : 'Create Restaurant Menu'}
          </h2>
          <p className="text-sm text-slate-500">MRP, readymade, and live items can be published.</p>
        </div>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
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
        <div className="grid gap-3 border-b p-4 xl:grid-cols-[minmax(0,1fr)_150px_150px_170px_170px_150px_170px_150px_150px_130px_auto]">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={search}
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[14%] px-4 py-3">Location</th>
                <th className="w-[14%] px-4 py-3">Restaurant</th>
                <th className="w-[15%] px-4 py-3">Item</th>
                <th className="w-[10%] px-4 py-3">Item Type</th>
                <th className="w-[13%] px-4 py-3">Time Slots</th>
                <th className="w-[12%] px-4 py-3">Days</th>
                <th className="w-[10%] px-4 py-3">Available</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="w-[14%] px-4 py-3">Active / Inactive</th>
                <th className="w-[15%] px-4 py-3">Created Date Time</th>
                <th className="w-[15%] px-4 py-3">Updated Date Time</th>
                <th className="w-[18%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {menus.length > 0 ? (
                menus.map((menu) => (
                  <tr className="hover:bg-slate-50" key={menu.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">
                        {menu.restaurant.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {menu.restaurant.hospital.hospitalCode}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{menu.restaurant.restaurantName}</p>
                      <p className="text-xs text-slate-500">{menu.restaurant.restaurantCode}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-950">{menu.item.itemName}</p>
                      <p className="text-xs text-slate-500">{menu.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatEnum(menu.item.itemType)}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {menu.timeSlots.length
                        ? menu.timeSlots.map((timeSlot) => timeSlot.slotName).join(', ')
                        : 'All day'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {menu.daysOfWeek.length
                        ? menu.daysOfWeek.map((day) => formatEnum(day)).join(', ')
                        : 'Every day'}
                    </td>
                    <td className="px-4 py-4">
                      <BooleanBadge
                        falseLabel="Unavailable"
                        trueLabel="Available"
                        value={menu.isAvailable}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={menu.isActive} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusToggleButton
                        isActive={menu.isActive}
                        isPending={toggleMenuStatusMutation.isPending}
                        onToggle={() => toggleMenuStatus(menu)}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(menu.createdAt)}</td>
                    <td className="px-4 py-4 text-slate-600">{formatDate(menu.updatedAt)}</td>
                    <td className="px-4 py-4">
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
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deleteMenuMutation.isPending}
                          onClick={() => deleteMenu(menu)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
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
    </section>
  );
}
