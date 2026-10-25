'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type {
  DayOfWeek,
  EmployeeDiscount,
  EmployeeDiscountInput,
  EmploymentType,
} from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { useConfirm } from '@/components/confirm-provider';
import {
  AppPageHeader,
  RecordAvatar,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { slotHours } from '@/components/master-data/time-slots/shared';
import {
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/master-data/shared/components';
import { listLimit } from '@/components/master-data/shared/utils';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Label, Panel, Select } from '@/components/ui';
import { Modal, SegmentedControl } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const days: Array<{ label: string; value: DayOfWeek }> = [
  { label: 'Mon', value: 'MONDAY' },
  { label: 'Tue', value: 'TUESDAY' },
  { label: 'Wed', value: 'WEDNESDAY' },
  { label: 'Thu', value: 'THURSDAY' },
  { label: 'Fri', value: 'FRIDAY' },
  { label: 'Sat', value: 'SATURDAY' },
  { label: 'Sun', value: 'SUNDAY' },
];

type Level = '' | EmploymentType;

const levelLabels: Record<Level, string> = {
  '': 'All',
  ON_ROLL: 'On roll',
  OUTSOURCED: 'Outsourced',
};

/** "Everyday", "Mon – Fri", or "Mon, Wed, Sat". */
function serveDays(selected: readonly DayOfWeek[]): string {
  if (selected.length === 0 || selected.length === 7) return 'Everyday';
  const picked = days.filter((day) => selected.includes(day.value));
  const weekdays = days.slice(0, 5).every((day) => selected.includes(day.value));

  return weekdays && selected.length === 5
    ? 'Mon – Fri'
    : picked.map((day) => day.label).join(', ');
}

interface FormValues {
  daysOfWeek: DayOfWeek[];
  discountPercent: string;
  employmentType: Level;
  endTime: string;
  name: string;
  restaurantId: string;
  specialTimings: boolean;
  startTime: string;
}

const emptyForm: FormValues = {
  daysOfWeek: [],
  discountPercent: '',
  employmentType: '',
  endTime: '',
  name: '',
  restaurantId: '',
  specialTimings: false,
  startTime: '',
};

function formFrom(discount: EmployeeDiscount): FormValues {
  return {
    daysOfWeek: discount.daysOfWeek,
    discountPercent: String(discount.discountPercent),
    employmentType: discount.employmentType ?? '',
    endTime: discount.endTime ?? '',
    name: discount.name,
    restaurantId: discount.restaurantId,
    specialTimings: Boolean(discount.startTime && discount.endTime),
    startTime: discount.startTime ?? '',
  };
}

/** Why the form cannot be saved yet, first problem first; empty when it can. */
function formProblems(values: FormValues): string[] {
  const percent = Number(values.discountPercent);

  return [
    !values.name.trim() && 'Give the discount a name.',
    !values.restaurantId && 'Choose the restaurant.',
    !(percent > 0 && percent <= 100) && 'Enter a discount above 0 and up to 100%.',
    !/^\d+(\.\d{1,2})?$/.test(values.discountPercent.trim()) &&
      values.discountPercent.trim() &&
      'Use up to 2 decimals for the discount.',
    values.specialTimings &&
      (!values.startTime || !values.endTime) &&
      'Enter both times for special timings, or switch them off.',
    values.specialTimings &&
      values.startTime &&
      values.startTime === values.endTime &&
      'The end time must differ from the start.',
  ].filter((problem): problem is string => Boolean(problem));
}

function toInput(values: FormValues): EmployeeDiscountInput {
  return {
    daysOfWeek: values.daysOfWeek.length === 7 ? [] : values.daysOfWeek,
    discountPercent: Number(values.discountPercent),
    employmentType: values.employmentType || null,
    endTime: values.specialTimings ? values.endTime : null,
    name: values.name.trim(),
    restaurantId: values.restaurantId,
    startTime: values.specialTimings ? values.startTime : null,
  };
}

/**
 * Employee Discounts: a restaurant's discount rules for staff. At the till, an eligible employee
 * (Employee ID or registered mobile) gets the best live rule for their level, on its serve days
 * and inside its special timings; archived rules never apply.
 */
export function EmployeeDiscountsPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [restaurantFilter, setRestaurantFilter] = useUrlParam('restaurant');
  const [view, setView] = useUrlParam<'archived' | 'live'>('view', 'live', ['archived', 'live']);
  const [editing, setEditing] = useState<EmployeeDiscount | 'new' | null>(null);
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canCreate = hasPermission('EMPLOYEE_DISCOUNT_CREATE');
  const canEdit = hasPermission('EMPLOYEE_DISCOUNT_UPDATE');

  const restaurantsQuery = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listRestaurants({
          hospitalId: scopedHospitalId,
          limit: 100,
          sortBy: 'restaurantName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.restaurants('discount-options', scopedHospitalId ?? ''),
  });
  const restaurants = restaurantsQuery.data ?? [];

  const listQuery = {
    archived: view === 'archived',
    hospitalId: scopedHospitalId,
    limit: listLimit,
    page,
    restaurantId: restaurantFilter || undefined,
    search,
  };
  const discountsQuery = useQuery({
    queryFn: async () => (await organizationApi.listEmployeeDiscounts(listQuery)).data,
    queryKey: queryKeys.employeeDiscounts(listQuery),
  });
  const countsQuery = useQuery({
    queryFn: async () => {
      const count = async (archived: boolean) =>
        (
          await organizationApi.listEmployeeDiscounts({
            archived,
            hospitalId: scopedHospitalId,
            limit: 0,
            restaurantId: restaurantFilter || undefined,
          })
        ).data.meta.total;
      const [live, archived] = await Promise.all([count(false), count(true)]);

      return { archived, live };
    },
    queryKey: queryKeys.employeeDiscounts('counts', scopedHospitalId ?? '', restaurantFilter),
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.employeeDiscounts() });

  const saveMutation = useMutation({
    mutationFn: (input: EmployeeDiscountInput) =>
      editing && editing !== 'new'
        ? organizationApi.updateEmployeeDiscount(editing.id, input)
        : organizationApi.createEmployeeDiscount(input),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Discount was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      refresh();
      showToast({
        recordId: response.data.id,
        title: editing === 'new' ? 'Discount created' : 'Discount saved',
        variant: 'success',
      });
      setEditing(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ archived, discount }: { archived: boolean; discount: EmployeeDiscount }) =>
      organizationApi.updateEmployeeDiscount(discount.id, { archived }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Discount was not changed',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      refresh();
      showToast({
        title: variables.archived
          ? `${variables.discount.name} archived`
          : `${variables.discount.name} restored`,
        variant: 'success',
      });
    },
  });

  function open(discount: EmployeeDiscount | 'new') {
    setEditing(discount);
    setValues(
      discount === 'new'
        ? { ...emptyForm, restaurantId: restaurantFilter || '' }
        : formFrom(discount),
    );
    setSubmitted(false);
  }

  async function toggleArchive(discount: EmployeeDiscount) {
    const archived = !discount.archivedAt;
    const confirmed = await confirm(
      archived
        ? {
            confirmLabel: 'Archive',
            description: 'It stops applying at the till straight away. You can restore it later.',
            title: `Archive ${discount.name}?`,
            tone: 'danger',
          }
        : {
            confirmLabel: 'Restore',
            description: 'It applies at the till again straight away.',
            title: `Restore ${discount.name}?`,
          },
    );

    if (confirmed) archiveMutation.mutate({ archived, discount });
  }

  const problems = formProblems(values);
  const discounts = discountsQuery.data?.items ?? [];
  const meta = discountsQuery.data?.meta ?? { limit: listLimit, page, total: 0, totalPages: 1 };
  const counts = countsQuery.data;
  const total = counts ? counts.live + counts.archived : undefined;
  const set = (patch: Partial<FormValues>) => setValues((current) => ({ ...current, ...patch }));

  return (
    <section className="space-y-4">
      <AppPageHeader
        action={
          canCreate ? (
            <Button onClick={() => open('new')} type="button">
              <Plus className="h-4 w-4" />
              New discount
            </Button>
          ) : null
        }
        count={counts?.live}
        description="Discounts for staff only, per restaurant. At the till, an eligible employee gets the best rule that applies now."
        title="Employee Discounts"
      />

      <StatStrip
        label="Employee discounts at a glance"
        stats={[
          {
            active: view === 'live',
            label: 'Live rules',
            onSelect: () => {
              setView('live');
              setPage(1);
            },
            share: total ? (counts?.live ?? 0) / total : undefined,
            tone: 'ok',
            value: counts?.live ?? '–',
          },
          {
            active: view === 'archived',
            label: 'Archived',
            onSelect: () => {
              setView('archived');
              setPage(1);
            },
            share: total ? (counts?.archived ?? 0) / total : undefined,
            tone: 'pending',
            value: counts?.archived ?? '–',
          },
        ]}
      />

      <Modal
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setEditing(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => {
                setSubmitted(true);
                if (problems.length === 0) saveMutation.mutate(toInput(values));
              }}
              type="button"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing === 'new' ? 'Create discount' : 'Save changes'}
            </Button>
          </div>
        }
        leading={editing && editing !== 'new' ? <RecordAvatar name={editing.name} /> : undefined}
        onClose={() => setEditing(null)}
        open={editing !== null}
        side
        title={editing === 'new' ? 'New employee discount' : `Edit ${editing?.name ?? ''}`}
      >
        <div className="grid gap-4">
          <Field label="Name" name="discount-name" required>
            <Input
              id="discount-name"
              maxLength={100}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="e.g. Staff lunch 30%"
              value={values.name}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Restaurant" name="discount-restaurant" required>
              <Select
                id="discount-restaurant"
                onChange={(event) => set({ restaurantId: event.target.value })}
                value={values.restaurantId}
              >
                <option disabled value="">
                  Choose a restaurant
                </option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Discount" name="discount-percent" required>
              <div className="relative">
                <Input
                  className="pr-8"
                  id="discount-percent"
                  inputMode="decimal"
                  onChange={(event) => set({ discountPercent: event.target.value })}
                  placeholder="30"
                  value={values.discountPercent}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ds-muted">
                  %
                </span>
              </div>
            </Field>
          </div>
          <div className="grid gap-2">
            <Label>Employee level</Label>
            <SegmentedControl<Level>
              label="Employee level"
              onChange={(employmentType) => set({ employmentType })}
              options={[
                { label: 'All', value: '' },
                { label: 'On roll', value: 'ON_ROLL' },
                { label: 'Outsourced', value: 'OUTSOURCED' },
              ]}
              value={values.employmentType}
            />
          </div>
          <div className="grid gap-2">
            <Label>Serve days</Label>
            <div aria-label="Serve days" className="flex flex-wrap gap-1.5" role="group">
              <button
                aria-pressed={values.daysOfWeek.length === 0}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-[13px] font-semibold transition',
                  values.daysOfWeek.length === 0
                    ? 'border-ds-primary bg-ds-primary-soft text-ds-link'
                    : 'border-ds-border text-ds-text-2 hover:bg-ds-subtle',
                )}
                onClick={() => set({ daysOfWeek: [] })}
                type="button"
              >
                Everyday
              </button>
              {days.map((day) => {
                const on = values.daysOfWeek.includes(day.value);

                return (
                  <button
                    aria-pressed={on}
                    className={cn(
                      'h-9 min-w-11 rounded-full border px-3 text-[13px] font-semibold transition',
                      on
                        ? 'border-ds-primary bg-ds-primary-soft text-ds-link'
                        : 'border-ds-border text-ds-text-2 hover:bg-ds-subtle',
                    )}
                    key={day.value}
                    onClick={() =>
                      set({
                        daysOfWeek: on
                          ? values.daysOfWeek.filter((value) => value !== day.value)
                          : days
                              .map((entry) => entry.value)
                              .filter(
                                (value) => value === day.value || values.daysOfWeek.includes(value),
                              ),
                      })
                    }
                    type="button"
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium text-ds-text-2">
            <input
              checked={values.specialTimings}
              className="h-4 w-4"
              onChange={(event) => set({ specialTimings: event.target.checked })}
              type="checkbox"
            />
            Special timings (only between these times)
          </label>
          {values.specialTimings ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" name="discount-from" required>
                <Input
                  id="discount-from"
                  onChange={(event) => set({ startTime: event.target.value })}
                  type="time"
                  value={values.startTime}
                />
              </Field>
              <Field label="To" name="discount-to" required>
                <Input
                  id="discount-to"
                  onChange={(event) => set({ endTime: event.target.value })}
                  type="time"
                  value={values.endTime}
                />
              </Field>
            </div>
          ) : null}
          {submitted && problems.length > 0 ? (
            <ul className="space-y-0.5 text-sm text-ds-status-bad-fg" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ds-muted">
            Applies to menu items marked discountable, for employees marked eligible in Employees,
            at restaurants with staff discount switched on. If two rules apply, the higher one wins.
          </p>
        </div>
      </Modal>

      <Panel aria-label="Employee discount list" className="overflow-hidden" role="region">
        <ListToolbar>
          <SearchInput
            label="Search discounts"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Discount or restaurant name"
            value={searchInput}
          />
          <FiltersMenu activeCount={restaurantFilter ? 1 : 0}>
            <FilterField label="Restaurant">
              <Select
                onChange={(event) => {
                  setRestaurantFilter(event.target.value);
                  setPage(1);
                }}
                value={restaurantFilter}
              >
                <option value="">All restaurants</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.restaurantName}
                  </option>
                ))}
              </Select>
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void discountsQuery.refetch()} />
          <ClearFiltersButton
            active={Boolean(searchInput || restaurantFilter)}
            onClear={() => {
              setSearch('');
              setRestaurantFilter('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-[900px] table-fixed')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[20%]')}>Name</th>
                <th className={cn(tableStyles.th, 'w-[17%]')}>Restaurant</th>
                <th className={cn(tableStyles.th, 'w-[9%] text-right')}>Discount</th>
                <th className={cn(tableStyles.th, 'w-[10%]')}>Special timings</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Serve days</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Timings</th>
                <th className={cn(tableStyles.th, 'w-[10%]')}>Employee level</th>
                <th className={cn(tableStyles.th, 'w-[7%]')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {discounts.length > 0 ? (
                discounts.map((discount) => {
                  const timed = Boolean(discount.startTime && discount.endTime);

                  return (
                    <tr
                      className={cn(tableStyles.row, !canEdit && 'cursor-default')}
                      data-record-id={discount.id}
                      key={discount.id}
                      onClick={canEdit ? () => open(discount) : undefined}
                    >
                      <td className={cn(tableStyles.td, tableStyles.title)}>
                        <span className="flex min-w-0 items-center gap-3">
                          <RecordAvatar name={discount.name} />
                          <span className="truncate">{discount.name}</span>
                        </span>
                      </td>
                      <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                        {discount.restaurant.restaurantName}
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          tableStyles.num,
                          'text-right font-semibold text-ds-text',
                        )}
                      >
                        {discount.discountPercent}%
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {timed ? 'Yes' : 'No'}
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {serveDays(discount.daysOfWeek)}
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2 tabular-nums')}>
                        {timed
                          ? slotHours({
                              endTime: discount.endTime,
                              isAlwaysAvailable: false,
                              startTime: discount.startTime,
                            })
                          : '—'}
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {levelLabels[discount.employmentType ?? '']}
                      </td>
                      <td
                        className={cn(tableStyles.td, 'pr-3')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {canEdit ? (
                          <span className="flex justify-end gap-0.5">
                            <RowAction
                              icon={Pencil}
                              label={`Edit ${discount.name}`}
                              onClick={() => open(discount)}
                            />
                            <RowAction
                              icon={discount.archivedAt ? ArchiveRestore : Archive}
                              label={`${discount.archivedAt ? 'Restore' : 'Archive'} ${discount.name}`}
                              onClick={() => void toggleArchive(discount)}
                            />
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={8}
                  error={discountsQuery.error}
                  hint={
                    view === 'archived'
                      ? 'Archived discounts show here.'
                      : 'Add a discount for a restaurant’s staff: a percentage, who it is for, and when.'
                  }
                  isError={discountsQuery.isError}
                  isLoading={discountsQuery.isLoading}
                  label="employee discounts"
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
