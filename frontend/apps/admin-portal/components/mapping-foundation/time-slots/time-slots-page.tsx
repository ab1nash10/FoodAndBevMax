'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Eye, Pencil, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import type { SortOrder, TimeSlot, TimeSlotInput } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { DetailsModal, Toggle } from '@/components/ui-controls';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import {
  ActiveFilterSelect,
  BooleanBadge,
  CheckboxLine,
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
} from '@/components/mapping-foundation/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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

type AlwaysAvailableFilter = '' | 'always' | 'scheduled';

type TimeSlotFormValues = z.infer<typeof timeSlotSchema>;

function alwaysAvailableFilterToBoolean(value: AlwaysAvailableFilter): boolean | undefined {
  if (value === 'always') {
    return true;
  }

  if (value === 'scheduled') {
    return false;
  }

  return undefined;
}

function timeRange(slot: TimeSlot): string {
  if (slot.isAlwaysAvailable) {
    return 'Always available';
  }

  return `${slot.startTime ?? '--'} - ${slot.endTime ?? '--'}`;
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

function TimeSlotFormFields({ form }: Readonly<{ form: UseFormReturn<TimeSlotFormValues> }>) {
  const isAlwaysAvailable = form.watch('isAlwaysAvailable');

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
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

export function TimeSlotsPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [alwaysFilter, setAlwaysFilter] = useState<AlwaysAvailableFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);
  const [viewingSlot, setViewingSlot] = useState<TimeSlot | null>(null);
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
    queryKey: queryKeys.timeSlots({
      activeFilter,
      alwaysFilter,
      page,
      search,
      sortBy,
      sortOrder,
    }),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeSlots() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeSlotOptions() });
      showToast({
        title: editingSlot ? 'Time slot updated' : 'Time slot created',
        variant: 'success',
      });
      setEditingSlot(null);
      form.reset(emptyTimeSlotFormValues());
    },
  });

  const toggleSlotStatusMutation = useMutation({
    mutationFn: ({ isActive, slot }: { isActive: boolean; slot: TimeSlot }) =>
      organizationApi.updateTimeSlot(slot.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Time slot status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeSlots() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.timeSlotOptions() });
      showToast({
        title: variables.isActive ? 'Time slot activated' : 'Time slot marked inactive',
        variant: 'success',
      });
    },
  });

  function toggleSlotStatus(slot: TimeSlot) {
    const nextIsActive = !slot.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this time slot inactive will stop it from being used for new restaurant menus. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleSlotStatusMutation.mutate({ isActive: nextIsActive, slot });
  }

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

  return (
    <section className="space-y-5">
      <PageHeader
        icon={CalendarClock}
        subtitle="Manage reusable availability windows for restaurant menu publishing."
        title="Time Slots"
      />

      <Panel className="p-4">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-normal text-ds-text">
            {editingSlot ? 'Edit Time Slot' : 'Create Time Slot'}
          </h2>
          <p className="text-sm text-ds-muted">
            Seeded slots can be adjusted for local operations.
          </p>
        </div>
        <form
          className="grid gap-4"
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
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[17%] px-4 py-2.5">Slot Name</th>
                <th className="w-[18%] px-4 py-2.5">Time Range</th>
                <th className="w-[14%] px-4 py-2.5">Availability</th>
                <th className="w-[10%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[16%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {slots.length > 0 ? (
                slots.map((slot) => (
                  <tr className="hover:bg-ds-subtle" key={slot.id}>
                    <td className="px-4 py-3 font-medium text-ds-text">{slot.slotName}</td>
                    <td className="px-4 py-3 text-ds-text-3">{timeRange(slot)}</td>
                    <td className="px-4 py-3">
                      <BooleanBadge
                        falseLabel="Scheduled"
                        trueLabel="Always"
                        value={slot.isAlwaysAvailable}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <StatusBadge isActive={slot.isActive} />
                        <Toggle
                          ariaLabel={`${slot.slotName} active`}
                          checked={slot.isActive}
                          disabled={toggleSlotStatusMutation.isPending}
                          onChange={() => toggleSlotStatus(slot)}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(slot.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(slot.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
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
                          onClick={() => setViewingSlot(slot)}
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
                  colSpan={7}
                  error={slotsQuery.error}
                  isError={slotsQuery.isError}
                  isLoading={slotsQuery.isLoading}
                  atLocation={false}
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
      <DetailsModal
        onClose={() => setViewingSlot(null)}
        rows={
          viewingSlot && [
            ['Slot Name', viewingSlot.slotName],
            ['Time Range', timeRange(viewingSlot)],
            [
              'Availability',
              <BooleanBadge
                falseLabel="Scheduled"
                key="availability"
                trueLabel="Always"
                value={viewingSlot.isAlwaysAvailable}
              />,
            ],
            ['Status', <StatusBadge isActive={viewingSlot.isActive} key="status" />],
            ['Created', formatDate(viewingSlot.createdAt)],
            ['Updated', formatDate(viewingSlot.updatedAt)],
          ]
        }
        title="Time Slot"
      />
    </section>
  );
}
