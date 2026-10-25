'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Counter, CounterInput } from '@aahar/api-client';
import { useAuth } from '@/components/auth-provider';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { confirmStatusChange, useConfirm } from '@/components/confirm-provider';
import { RecordAvatar, RowAction, tableStyles } from '@/components/design-system';
import { FilterField, FiltersMenu, ListToolbar, RefreshButton } from '@/components/list-toolbar';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { FilterSearch, Modal } from '@/components/ui-controls';
import { Field, Input, Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { PaginationControls, TableState, ToggleField } from '@/components/pos/shared/components';
import type { ActiveFilter } from '@/components/pos/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  defaultPageLimit,
  formatLocationOption,
  optionalText,
  optionalValue,
  useHospitalOptions,
  useRestaurantOptions,
} from '@/components/pos/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import {
  ActiveFilterSelect,
  StatusToggleCell,
} from '@/components/organization/shared/list-controls';

// Mirrors create-counter.dto.ts: code 50 and name 150 characters, device ids 100.
const counterSchema = z.object({
  counterCode: optionalText(50).min(1, 'Code is required.'),
  counterName: optionalText(150).min(1, 'Name is required.'),
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  paymentDeviceId: optionalText(100),
  pineLabsDeviceId: optionalText(100),
  /** Empty: no POS device. */
  posDeviceId: optionalText(100),
  restaurantId: z.string().uuid('Select a restaurant.'),
});

type CounterFormValues = z.infer<typeof counterSchema>;

const emptyCounter: CounterFormValues = {
  counterCode: '',
  counterName: '',
  hospitalId: '',
  isActive: true,
  paymentDeviceId: '',
  pineLabsDeviceId: '',
  posDeviceId: '',
  restaurantId: '',
};

/** Same query (and key) as the Payment Machines tab's POS device picker, so they share a cache. */
function usePosDeviceOptions(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () =>
      (
        await organizationApi.listPosDevices({
          hospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'name',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: queryKeys.paymentMachinePosDeviceOptions(hospitalId),
  });
}

const counterFormId = 'counter-form';

function CounterForm({
  editingCounter,
  onClose,
  open,
}: Readonly<{
  editingCounter?: Counter;
  onClose: () => void;
  open: boolean;
}>) {
  const form = useForm<CounterFormValues>({ mode: 'onTouched', defaultValues: emptyCounter });
  const hospitalsQuery = useHospitalOptions();
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isActive = form.watch('isActive');
  const selectedHospitalId = form.watch('hospitalId');
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId || undefined);
  const posDevicesQuery = usePosDeviceOptions(selectedHospitalId || undefined);
  // The pickers list active records only; an edit keeps showing what the counter has saved.
  const savedRestaurant =
    editingCounter?.hospitalId === selectedHospitalId &&
    restaurantsQuery.data &&
    !restaurantsQuery.data.some((restaurant) => restaurant.id === editingCounter.restaurantId)
      ? editingCounter.restaurant
      : undefined;
  const savedPosDeviceId =
    editingCounter?.posDeviceId &&
    editingCounter.hospitalId === selectedHospitalId &&
    posDevicesQuery.data &&
    !posDevicesQuery.data.some((device) => device.id === editingCounter.posDeviceId)
      ? editingCounter.posDeviceId
      : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    form.reset(
      editingCounter
        ? {
            counterCode: editingCounter.counterCode,
            counterName: editingCounter.counterName,
            hospitalId: editingCounter.hospitalId,
            isActive: editingCounter.isActive,
            paymentDeviceId: editingCounter.paymentDeviceId ?? '',
            pineLabsDeviceId: editingCounter.pineLabsDeviceId ?? '',
            posDeviceId: editingCounter.posDeviceId ?? '',
            restaurantId: editingCounter.restaurantId,
          }
        : { ...emptyCounter, hospitalId: scopedHospitalId ?? '' },
    );
  }, [editingCounter, form, open, scopedHospitalId]);

  const mutation = useMutation({
    mutationFn: (body: CounterInput) =>
      editingCounter
        ? organizationApi.updateCounter(editingCounter.id, body)
        : organizationApi.createCounter(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingCounter ? 'Counter was not updated' : 'Counter was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.counters() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locationNames() });
      // The Point of Sale's counter picker.
      void queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() });
      showToast({
        recordId: response.data.id,
        title: editingCounter ? 'Counter updated' : 'Counter created',
        variant: 'success',
      });
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = counterSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    // An edit sends a blank optional field as empty, which clears the saved value.
    const clearable = (value: string) => (editingCounter ? value : optionalValue(value));

    mutation.mutate({
      counterCode: parsed.data.counterCode,
      counterName: parsed.data.counterName,
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      paymentDeviceId: clearable(parsed.data.paymentDeviceId),
      pineLabsDeviceId: clearable(parsed.data.pineLabsDeviceId),
      posDeviceId: clearable(parsed.data.posDeviceId),
      restaurantId: parsed.data.restaurantId,
    });
  });

  return (
    <Modal
      side
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={mutation.isPending} form={counterFormId} type="submit">
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Submit
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={editingCounter ? 'Edit Counter' : 'New Counter'}
    >
      <form
        className="grid gap-4"
        id={counterFormId}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        {/* Named counterName / counterCode, the inputs Title Case the name and upper-case the code. */}
        <Field
          error={form.formState.errors.counterName?.message}
          label="Name"
          name="counter-name"
          required
        >
          <Input id="counter-name" {...form.register('counterName')} />
        </Field>
        <Field
          error={form.formState.errors.counterCode?.message}
          label="Code"
          name="counter-code"
          required
        >
          <Input id="counter-code" {...form.register('counterCode')} />
        </Field>
        <ToggleField
          label="Active"
          onChange={(checked) => form.setValue('isActive', checked)}
          value={isActive}
        />
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="counter-location"
          required
        >
          <Select
            disabled={hospitalsQuery.isLoading || !isAllLocations}
            id="counter-location"
            {...form.register('hospitalId', {
              // The restaurant and POS device belong to the location, so a new one clears them.
              onChange: () => {
                form.setValue('restaurantId', '');
                form.setValue('posDeviceId', '');
              },
            })}
          >
            <option value="">Select location</option>
            {hospitalsQuery.data?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.restaurantId?.message}
          label="Restaurant"
          name="counter-restaurant"
          required
        >
          <Select
            disabled={!selectedHospitalId || restaurantsQuery.isLoading}
            id="counter-restaurant"
            // Controlled, so the saved pick shows once the options arrive.
            value={form.watch('restaurantId')}
            {...form.register('restaurantId')}
          >
            <option value="">
              {selectedHospitalId ? 'Select restaurant' : 'Select a location first'}
            </option>
            {savedRestaurant ? (
              <option value={savedRestaurant.id}>{savedRestaurant.restaurantName}</option>
            ) : null}
            {restaurantsQuery.data?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.posDeviceId?.message}
          label="POS Device"
          name="counter-pos-device"
        >
          <Select
            disabled={!selectedHospitalId || posDevicesQuery.isLoading}
            id="counter-pos-device"
            value={form.watch('posDeviceId')}
            {...form.register('posDeviceId')}
          >
            <option value="">None</option>
            {savedPosDeviceId ? <option value={savedPosDeviceId}>{savedPosDeviceId}</option> : null}
            {posDevicesQuery.data?.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.paymentDeviceId?.message}
          label="Payment Device Id"
          name="counter-payment-device"
        >
          <Input
            id="counter-payment-device"
            placeholder="Optional"
            {...form.register('paymentDeviceId')}
          />
        </Field>
        <Field
          error={form.formState.errors.pineLabsDeviceId?.message}
          label="Pine Labs Device Id"
          name="counter-pine-labs-device"
        >
          <Input
            id="counter-pine-labs-device"
            placeholder="Optional"
            {...form.register('pineLabsDeviceId')}
          />
        </Field>
      </form>
    </Modal>
  );
}

export function CountersTab() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('COUNTER_CREATE');
  const canEdit = hasPermission('COUNTER_UPDATE');
  const { scopedHospitalId } = useLocationContext();
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [editingCounter, setEditingCounter] = useState<Counter | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [limit, setLimit] = useState(defaultPageLimit);
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter || undefined);
  // Names for the POS device column, known once a location is chosen.
  const posDevicesQuery = usePosDeviceOptions(hospitalFilter || undefined);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setRestaurantFilter('');
  }, [scopedHospitalId]);

  const query = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listCounters({
          hospitalId: hospitalFilter || undefined,
          isActive: activeFilterToBoolean(activeFilter),
          limit,
          page,
          restaurantId: restaurantFilter || undefined,
          search,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: queryKeys.counters({
      activeFilter,
      hospitalFilter,
      limit,
      page,
      restaurantFilter,
      search,
    }),
  });
  const items = query.data?.items ?? [];
  const meta = query.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateCounter(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Counter was not updated',
        variant: 'error',
      });
      void query.refetch();
    },
    onSuccess(_response, variables) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.counters() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.locationNames() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.posCounters() });
      showToast({
        recordId: variables.id,
        title: variables.isActive ? 'Counter activated' : 'Counter deactivated',
        variant: 'success',
      });
    },
  });

  async function toggleCounterStatus(counter: Counter) {
    const isActive = !counter.isActive;
    const confirmed = await confirmStatusChange(confirm, {
      activate: isActive,
      name: counter.counterName,
    });

    if (confirmed) statusMutation.mutate({ id: counter.id, isActive });
  }

  const openCreateForm = () => {
    setEditingCounter(undefined);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingCounter(undefined);
    setIsFormOpen(false);
  };

  const openEditForm = (counter: Counter) => {
    if (!canEdit) {
      return;
    }

    setEditingCounter(counter);
    setIsFormOpen(true);
  };

  const filterCount = [
    activeFilter,
    hospitalFilter !== (scopedHospitalId ?? ''),
    restaurantFilter,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {canCreate ? (
        <div className="flex justify-end">
          <Button onClick={openCreateForm} type="button">
            <Plus className="h-4 w-4" />
            New counter
          </Button>
        </div>
      ) : null}
      <CounterForm editingCounter={editingCounter} onClose={closeForm} open={isFormOpen} />
      <Panel>
        <ListToolbar>
          <FilterSearch
            label="Search counters"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Counter name, code or restaurant"
            value={searchInput}
          />
          <FiltersMenu activeCount={filterCount}>
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
            </FilterField>
            <FilterField label="Location">
              <Select
                disabled={hospitalsQuery.isLoading || Boolean(scopedHospitalId)}
                onChange={(event) => {
                  setHospitalFilter(event.target.value);
                  setRestaurantFilter('');
                  setPage(1);
                }}
                value={hospitalFilter}
              >
                <option value="">All locations</option>
                {hospitalsQuery.data?.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {formatLocationOption(hospital)}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Restaurant">
              <Select
                disabled={!hospitalFilter || restaurantsQuery.isLoading}
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
            </FilterField>
          </FiltersMenu>
          <RefreshButton onClick={() => void query.refetch()} />
          <ClearFiltersButton
            active={Boolean(searchInput || filterCount)}
            onClear={() => {
              setSearch('');
              setActiveFilter('');
              setHospitalFilter(scopedHospitalId ?? '');
              setRestaurantFilter('');
              setPage(1);
            }}
          />
        </ListToolbar>
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'phone-cards min-w-200 table-fixed')}>
            <thead className={cn(tableStyles.head, 'whitespace-nowrap')}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[22%]')}>Name</th>
                <th className={cn(tableStyles.th, 'w-[18%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[18%]')}>Restaurant</th>
                <th className={cn(tableStyles.th, 'w-[16%]')}>POS device</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((counter) => (
                  <tr
                    className={tableStyles.row}
                    data-record-id={counter.id}
                    key={counter.id}
                    onClick={() => openEditForm(counter)}
                  >
                    <td className={tableStyles.td}>
                      <span className="flex min-w-0 items-center gap-3">
                        <RecordAvatar name={counter.counterName} />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className={cn('truncate', tableStyles.title)}>
                            {counter.counterName}
                          </span>
                          <span className={cn('truncate', tableStyles.code)}>
                            {counter.counterCode}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                      {counter.hospital.hospitalName}
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                      {counter.restaurant.restaurantName}
                    </td>
                    <td className={cn(tableStyles.td, 'truncate text-ds-text-2')}>
                      {counter.posDeviceId
                        ? (posDevicesQuery.data?.find((device) => device.id === counter.posDeviceId)
                            ?.name ?? 'Linked')
                        : 'Not set'}
                    </td>
                    {/* The switch has its own click: it does not open the counter. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <StatusToggleCell
                        disabled={!canEdit || statusMutation.isPending}
                        isActive={counter.isActive}
                        onToggle={() => void toggleCounterStatus(counter)}
                      />
                    </td>
                    <td className={cn(tableStyles.td, 'pr-3')}>
                      {canEdit ? (
                        <span className="flex justify-end">
                          <RowAction
                            icon={Pencil}
                            label={`Edit ${counter.counterName}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditForm(counter);
                            }}
                          />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <TableState
                  colSpan={6}
                  error={query.error}
                  isError={query.isError}
                  isLoading={query.isLoading}
                  label="counters"
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </div>
  );
}
