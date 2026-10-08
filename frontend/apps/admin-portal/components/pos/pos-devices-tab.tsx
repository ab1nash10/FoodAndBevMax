'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PosDevice, PosDeviceInput } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Modal, Toggle } from '@/components/ui-controls';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { RestaurantAccessibilityModal } from '@/components/pos/restaurant-accessibility-modal';
import {
  FilterBar,
  PaginationControls,
  TableState,
  ToggleField,
} from '@/components/pos/shared/components';
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

const deviceText = (maxLength: number) =>
  optionalText(maxLength).regex(
    /^$|^[A-Za-z0-9][A-Za-z0-9 ._-]*$/,
    'Use letters, numbers, spaces, dots, hyphens or underscores only.',
  );

const posDeviceSchema = z.object({
  code: deviceText(50).min(1, 'Code is required.'),
  entity: optionalText(150),
  hospitalId: z.string().uuid('Select a location.'),
  hostName: deviceText(150),
  isActive: z.boolean(),
  isInvoicePrintEnabled: z.boolean(),
  isKotPrintEnabled: z.boolean(),
  name: deviceText(150).min(1, 'Name is required.'),
  restaurantIds: z.array(z.string().uuid()).default([]),
});

type PosDeviceFormValues = z.infer<typeof posDeviceSchema>;

function formatRestaurants(restaurants: PosDevice['restaurants']): string {
  if (restaurants.length === 0) {
    return 'Not mapped';
  }

  return restaurants.map((restaurant) => restaurant.restaurantName).join(', ');
}

const posDeviceFormId = 'pos-device-form';

function PosDeviceForm({
  editingDevice,
  onClose,
  open,
}: Readonly<{
  editingDevice?: PosDevice;
  onClose: () => void;
  open: boolean;
}>) {
  const form = useForm<PosDeviceFormValues>({
    defaultValues: {
      code: '',
      entity: '',
      hospitalId: '',
      hostName: '',
      isActive: true,
      isInvoicePrintEnabled: false,
      isKotPrintEnabled: false,
      name: '',
      restaurantIds: [],
    },
  });
  const hospitalsQuery = useHospitalOptions();
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isActive = form.watch('isActive');
  const isKotPrintEnabled = form.watch('isKotPrintEnabled');
  const isInvoicePrintEnabled = form.watch('isInvoicePrintEnabled');
  const selectedHospitalId = form.watch('hospitalId');
  const selectedRestaurantIds = form.watch('restaurantIds');
  // Same query as the Restaurant's Accessibility pop-up, so both list the same restaurants.
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId || undefined);

  const toggleRestaurant = (restaurantId: string) => {
    form.setValue(
      'restaurantIds',
      selectedRestaurantIds.includes(restaurantId)
        ? selectedRestaurantIds.filter((id) => id !== restaurantId)
        : [...selectedRestaurantIds, restaurantId],
    );
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editingDevice) {
      form.reset({
        code: editingDevice.code,
        entity: editingDevice.entity ?? '',
        hospitalId: editingDevice.hospitalId,
        hostName: editingDevice.hostName ?? '',
        isActive: editingDevice.isActive,
        isInvoicePrintEnabled: editingDevice.isInvoicePrintEnabled,
        isKotPrintEnabled: editingDevice.isKotPrintEnabled,
        name: editingDevice.name,
        restaurantIds: editingDevice.restaurantIds,
      });
    } else {
      form.reset({
        code: '',
        entity: '',
        hospitalId: scopedHospitalId ?? '',
        hostName: '',
        isActive: true,
        isInvoicePrintEnabled: false,
        isKotPrintEnabled: false,
        name: '',
        restaurantIds: [],
      });
    }
  }, [editingDevice, form, open, scopedHospitalId]);

  const mutation = useMutation({
    mutationFn: (body: PosDeviceInput) =>
      editingDevice
        ? organizationApi.updatePosDevice(editingDevice.id, body)
        : organizationApi.createPosDevice(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingDevice ? 'POS device was not updated' : 'POS device was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.posDevices() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMachinePosDeviceOptions() });
      showToast({
        title: editingDevice ? 'POS device updated' : 'POS device created',
        variant: 'success',
      });
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = posDeviceSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    // Send the mapping only when it was edited here. The saved mapping can still hold a
    // restaurant deactivated since, which the service rejects, so re-sending it untouched failed
    // every edit of the device; it would also undo a change made meanwhile in the Restaurant's
    // Accessibility pop-up. An edited mapping keeps only restaurants the picker can show.
    const picked = parsed.data.restaurantIds;
    const mappingUnchanged =
      editingDevice !== undefined &&
      editingDevice.hospitalId === parsed.data.hospitalId &&
      picked.length === editingDevice.restaurantIds.length &&
      picked.every((id) => editingDevice.restaurantIds.includes(id));
    const restaurantIds = mappingUnchanged
      ? undefined
      : picked.filter((id) => restaurantsQuery.data?.some((restaurant) => restaurant.id === id));

    mutation.mutate({
      code: parsed.data.code,
      entity: optionalValue(parsed.data.entity),
      hospitalId: parsed.data.hospitalId,
      hostName: parsed.data.hostName.trim(),
      isActive: parsed.data.isActive,
      isInvoicePrintEnabled: parsed.data.isInvoicePrintEnabled,
      isKotPrintEnabled: parsed.data.isKotPrintEnabled,
      name: parsed.data.name,
      restaurantIds,
    });
  });

  return (
    <Modal
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={mutation.isPending} form={posDeviceFormId} type="submit">
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
      title={editingDevice ? 'Edit Pos Device' : 'New Pos Device'}
    >
      <form
        className="grid gap-4"
        id={posDeviceFormId}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <Field error={form.formState.errors.name?.message} label="Name" name="pos-name">
          <Input id="pos-name" {...form.register('name')} />
        </Field>
        <Field error={form.formState.errors.code?.message} label="Code" name="pos-code">
          <Input id="pos-code" {...form.register('code')} />
        </Field>
        <ToggleField
          label="Active"
          onChange={(checked) => form.setValue('isActive', checked)}
          value={isActive}
        />
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="pos-location"
        >
          <Select
            disabled={hospitalsQuery.isLoading || !isAllLocations}
            id="pos-location"
            {...form.register('hospitalId', {
              // Restaurants belong to one location, and the service rejects any that are not
              // in the selected one, so a change of location clears the picks.
              onChange: () => form.setValue('restaurantIds', []),
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
        <Field label="Restaurants" name="pos-restaurants">
          <div
            aria-label="Restaurants"
            className="grid max-h-56 gap-2 overflow-y-auto"
            role="group"
          >
            {!selectedHospitalId ? (
              <p className="text-sm text-ds-muted">Select a location to choose its restaurants.</p>
            ) : null}
            {selectedHospitalId && restaurantsQuery.isLoading ? (
              <Skeleton className="h-11" />
            ) : null}
            {selectedHospitalId && restaurantsQuery.isError ? (
              <p className="text-sm text-ds-status-bad-fg">
                {getApiErrorMessage(restaurantsQuery.error)}
              </p>
            ) : null}
            {selectedHospitalId &&
            !restaurantsQuery.isLoading &&
            restaurantsQuery.data?.length === 0 ? (
              <p className="text-sm text-ds-muted">
                No active restaurants found for this location.
              </p>
            ) : null}
            {selectedHospitalId
              ? restaurantsQuery.data?.map((restaurant) => (
                  <label
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-ds-text-2 shadow-xs"
                    key={restaurant.id}
                  >
                    <input
                      checked={selectedRestaurantIds.includes(restaurant.id)}
                      className="h-4 w-4 accent-teal-600"
                      onChange={() => toggleRestaurant(restaurant.id)}
                      type="checkbox"
                    />
                    {restaurant.restaurantName}
                  </label>
                ))
              : null}
          </div>
        </Field>
        <Field error={form.formState.errors.entity?.message} label="Entity" name="pos-entity">
          <Input id="pos-entity" placeholder="Optional" {...form.register('entity')} />
        </Field>
        <Field error={form.formState.errors.hostName?.message} label="Host Name" name="pos-host">
          <Input id="pos-host" placeholder="Optional" {...form.register('hostName')} />
        </Field>
        <ToggleField
          label="KOT Print"
          onChange={(checked) => form.setValue('isKotPrintEnabled', checked)}
          value={isKotPrintEnabled}
        />
        <ToggleField
          label="Invoice Print"
          onChange={(checked) => form.setValue('isInvoicePrintEnabled', checked)}
          value={isInvoicePrintEnabled}
        />
      </form>
    </Modal>
  );
}

export function PosDevicesTab() {
  const { scopedHospitalId } = useLocationContext();
  const [accessibilityDevice, setAccessibilityDevice] = useState<PosDevice | undefined>();
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [editingDevice, setEditingDevice] = useState<PosDevice | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [limit, setLimit] = useState(defaultPageLimit);
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listPosDevices({
          hospitalId: scopedHospitalId,
          isActive: activeFilterToBoolean(activeFilter),
          limit,
          page,
          search,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: queryKeys.posDevices({ activeFilter, limit, page, scopedHospitalId, search }),
  });
  const items = query.data?.items ?? [];
  const meta = query.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  // Grid toggles for Status, KOT Print and Invoice Print write straight through to the record.
  const flagMutation = useMutation({
    mutationFn: ({ body, id }: { body: Partial<PosDeviceInput>; id: string }) =>
      organizationApi.updatePosDevice(id, body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'POS device was not updated',
        variant: 'error',
      });
      void query.refetch();
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.posDevices() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMachinePosDeviceOptions() });
    },
  });

  const openCreateForm = () => {
    setEditingDevice(undefined);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingDevice(undefined);
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={openCreateForm} type="button">
          <Plus className="h-4 w-4" />
          New Pos Device
        </Button>
      </div>
      <PosDeviceForm editingDevice={editingDevice} onClose={closeForm} open={isFormOpen} />
      <RestaurantAccessibilityModal
        device={accessibilityDevice}
        onClose={() => setAccessibilityDevice(undefined)}
      />
      <Panel>
        <FilterBar
          activeFilter={activeFilter}
          onActiveFilterChange={(value) => {
            setActiveFilter(value);
            setPage(1);
          }}
          onRefresh={() => void query.refetch()}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          search={searchInput}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[16%] px-4 py-2.5">Name</th>
                <th className="w-[12%] px-4 py-2.5">Code</th>
                <th className="w-[14%] px-4 py-2.5">Location</th>
                <th className="w-[16%] px-4 py-2.5">Restaurants</th>
                <th className="w-[12%] px-4 py-2.5">Entity</th>
                <th className="w-[12%] px-4 py-2.5">Hostname</th>
                <th className="w-[8%] px-4 py-2.5">Status</th>
                <th className="w-[8%] px-4 py-2.5">KOT Print</th>
                <th className="w-[8%] px-4 py-2.5">Invoice Print</th>
                <th className="w-[112px] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((device) => (
                  <tr className="hover:bg-ds-subtle" key={device.id}>
                    <td className="px-4 py-3 font-medium text-ds-text dark:text-white">
                      {device.name}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{device.code}</td>
                    <td className="px-4 py-3 text-ds-text-3">{device.hospital.hospitalName}</td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {formatRestaurants(device.restaurants)}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{device.entity ?? 'Not set'}</td>
                    <td className="px-4 py-3 text-ds-text-3">{device.hostName ?? 'Not set'}</td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={device.isActive}
                        disabled={flagMutation.isPending}
                        onChange={(checked) =>
                          flagMutation.mutate({ body: { isActive: checked }, id: device.id })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={device.isKotPrintEnabled}
                        disabled={flagMutation.isPending}
                        onChange={(checked) =>
                          flagMutation.mutate({
                            body: { isKotPrintEnabled: checked },
                            id: device.id,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={device.isInvoicePrintEnabled}
                        disabled={flagMutation.isPending}
                        onChange={(checked) =>
                          flagMutation.mutate({
                            body: { isInvoicePrintEnabled: checked },
                            id: device.id,
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          aria-label={`Manage restaurant accessibility for ${device.name}`}
                          className="text-ds-teal-text hover:text-ds-teal-text"
                          onClick={() => setAccessibilityDevice(device)}
                          size="sm"
                          title="Restaurant accessibility"
                          type="button"
                          variant="ghost"
                        >
                          <Store className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Edit ${device.name}`}
                          onClick={() => {
                            setEditingDevice(device);
                            setIsFormOpen(true);
                          }}
                          size="sm"
                          title="Edit POS device"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <TableState
                  colSpan={10}
                  error={query.error}
                  isError={query.isError}
                  isLoading={query.isLoading}
                  label="POS devices"
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
