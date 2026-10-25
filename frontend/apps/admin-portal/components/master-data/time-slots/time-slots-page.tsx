'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { SortOrder, TimeSlot } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import {
  AppPageHeader,
  RecordAvatar,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Panel } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen } from '@/components/record-link';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { invalidateTimeSlotQueries } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import {
  emptyTimeSlot,
  slotHours,
  timeSlotInput,
  timeSlotSchema,
  timeSlotToFormValues,
  TimeSlotFormFields,
  type TimeSlotFormValues,
} from '@/components/master-data/time-slots/shared';
import {
  ActiveFilterSelect,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  listLimit,
} from '@/components/master-data/shared/utils';
import { cn } from '@/lib/utils';

/**
 * Time slots: named windows of the day (Breakfast 7–10:30, Lunch 12–3) that a restaurant menu
 * item can be put on, so its on-sale hours are picked rather than typed each time.
 */
export function TimeSlotsPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('startTime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editing, setEditing] = useState<TimeSlot | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const { availableLocations, scopedHospitalId } = useLocationContext();
  const confirm = useConfirm();
  const form = useForm<TimeSlotFormValues>({ defaultValues: emptyTimeSlot });
  const canEdit = hasPermission('TIME_SLOT_UPDATE');

  const listQuery = {
    hospitalId: scopedHospitalId,
    isActive: activeFilterToBoolean(activeFilter),
    limit: listLimit,
    page,
    search,
    sortBy,
    sortOrder,
  };
  const slotsQuery = useQuery({
    queryFn: async () => (await organizationApi.listTimeSlots(listQuery)).data,
    queryKey: queryKeys.timeSlots(listQuery),
  });
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listTimeSlots({
            hospitalId: scopedHospitalId,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      const [all, active, inactive] = await Promise.all([count(), count(true), count(false)]);

      return { active, all, inactive };
    },
    queryKey: queryKeys.timeSlots('stats', scopedHospitalId ?? ''),
  });

  const saveMutation = useMutation({
    mutationFn: (values: TimeSlotFormValues) =>
      organizationApi.updateTimeSlot(editing!.id, timeSlotInput(values)),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Time slot was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateTimeSlotQueries(queryClient);
      showToast({ recordId: response.data.id, title: 'Time slot updated', variant: 'success' });
      setEditing(null);
    },
  });

  const statusMutation = useMutation({
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
      invalidateTimeSlotQueries(queryClient);
      showToast({
        recordId: variables.slot.id,
        title: variables.isActive ? 'Time slot activated' : 'Time slot deactivated',
        variant: 'success',
      });
    },
  });

  const slots = slotsQuery.data?.items ?? [];
  const meta = slotsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const stats = statsQuery.data;
  const hasFilters = Boolean(searchInput || activeFilter);
  const locationName = (id: string | null) =>
    id === null
      ? 'Every location'
      : (availableLocations.find((location) => location.id === id)?.displayName ?? 'A location');

  function startEditing(slot: TimeSlot) {
    setEditing(slot);
    form.reset(timeSlotToFormValues(slot));
  }

  async function toggleStatus(slot: TimeSlot) {
    const isActive = !slot.isActive;
    const confirmed = await confirmStatusChange(confirm, {
      activate: isActive,
      effect: 'It can’t be picked for menu items. Items already on it keep their hours.',
      name: slot.slotName,
    });

    if (confirmed) statusMutation.mutate({ isActive, slot });
  }

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = timeSlotSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMutation.mutate(parsed.data);
  });

  function showStatus(status: ActiveFilter) {
    setActiveFilter(status);
    setPage(1);
  }

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          <IfCanOpen href="/masters/time-slots/new">
            <Button asChild>
              <Link href="/masters/time-slots/new">
                <Plus className="h-4 w-4" />
                New time slot
              </Link>
            </Button>
          </IfCanOpen>
        }
        count={stats?.all}
        description="Named windows of the day that menu items are sold in, picked on each menu item."
        title="Time Slots"
      />

      <StatStrip
        label="Time slots at a glance"
        stats={[
          {
            active: !activeFilter,
            label: 'All slots',
            onSelect: () => showStatus(''),
            share: stats?.all ? 1 : undefined,
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active',
            label: 'Active',
            onSelect: () => showStatus('active'),
            share: stats?.all ? stats.active / stats.all : undefined,
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: activeFilter === 'inactive',
            label: 'Inactive',
            onSelect: () => showStatus('inactive'),
            share: stats?.all ? stats.inactive / stats.all : undefined,
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />

      <Modal
        side
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setEditing(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} form="time-slot-form" type="submit">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        }
        leading={editing ? <RecordAvatar name={editing.slotName} /> : undefined}
        meta={
          editing ? (
            <span className="rounded-md bg-ds-subtle px-2 py-0.5 text-[11.5px] text-ds-text-3">
              {slotHours(editing)}
            </span>
          ) : undefined
        }
        onClose={() => setEditing(null)}
        open={editing !== null}
        title={editing ? `Edit ${editing.slotName}` : 'Edit time slot'}
      >
        <form
          className="grid gap-4"
          id="time-slot-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <TimeSlotFormFields form={form} />
        </form>
      </Modal>

      <Panel aria-label="Time slot list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search time slots"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Slot name"
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
            options={[
              { label: 'Start time', value: 'startTime' },
              { label: 'Slot name', value: 'slotName' },
              { label: 'Created date', value: 'createdAt' },
              { label: 'Status', value: 'isActive' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void slotsQuery.refetch()} />
          <ClearFiltersButton
            active={hasFilters}
            onClear={() => {
              setSearch('');
              setActiveFilter('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-[720px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[32%]')}>Slot</th>
                <th className={cn(tableStyles.th, 'w-[26%]')}>Hours</th>
                <th className={cn(tableStyles.th, 'w-[20%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[15%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[7%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.length > 0 ? (
                slots.map((slot) => (
                  <tr
                    className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                    data-record-id={slot.id}
                    key={slot.id}
                    onClick={canEdit ? () => startEditing(slot) : undefined}
                  >
                    <td className={cn(tableStyles.td, tableStyles.title)}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={slot.slotName} />
                        <span className="truncate">{slot.slotName}</span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2 tabular-nums')}>
                      {slotHours(slot)}
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-muted')}>
                      {locationName(slot.hospitalId)}
                    </td>
                    {/* Its own click: switching the status does not open the slot. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <span className="flex items-center gap-2">
                        <Toggle
                          ariaLabel={`${slot.slotName} active`}
                          checked={slot.isActive}
                          disabled={statusMutation.isPending || !canEdit}
                          onChange={() => void toggleStatus(slot)}
                        />
                        <span
                          className={cn(
                            'text-xs font-bold',
                            slot.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                          )}
                        >
                          {slot.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      <span className="flex justify-end">
                        {canEdit ? (
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${slot.slotName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditing(slot);
                            }}
                          />
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={5}
                  error={slotsQuery.error}
                  hint="Add Breakfast, Lunch, Dinner or any window your restaurants sell in."
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
