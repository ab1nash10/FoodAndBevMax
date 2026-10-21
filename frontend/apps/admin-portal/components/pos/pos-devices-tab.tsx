'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Utensils } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PosDevice, PosDeviceInput } from '@aahar/api-client';
import { RowAction, tableStyles } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Modal, Toggle } from '@/components/ui-controls';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { OrderKeyButton } from '@/components/order-key-button';
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
  useHospitalOptions,
  useRestaurantOptions,
} from '@/components/pos/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { StatusToggleCell } from '@/components/organization/shared/list-controls';
import { useLegalEntityNames } from '@/components/organization/shared/hooks';
import {
  LegalEntityCell,
  LegalEntitySelect,
} from '@/components/organization/shared/legal-entity-select';

const deviceText = (maxLength: number) =>
  optionalText(maxLength).regex(
    /^$|^[A-Za-z0-9][A-Za-z0-9 ._-]*$/,
    'Use letters, numbers, spaces, dots, hyphens or underscores only.',
  );

// The API's host name rule (RFC 1123, create-pos-device.dto.ts): dot-separated parts of letters,
// digits and hyphens, 1-63 characters each, no hyphen at either end; 253 in all. Empty is allowed.
const hostNameText = optionalText(253).regex(
  /^$|^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/,
  'Enter a valid host name: letters, numbers and hyphens, with dots between parts (e.g. MAX-LKO-POS-01).',
);

const posDeviceSchema = z.object({
  code: deviceText(50).min(1, 'Code is required.'),
  hospitalId: z.string().uuid('Select a location.'),
  /** Empty: not linked to an entity. */
  legalEntityId: z.string(),
  hostName: hostNameText,
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
    // Field rules (the host name's) run when a field is left, then as it is corrected; the
    // whole form is still checked on Submit.
    mode: 'onTouched',
    defaultValues: {
      code: '',
      hospitalId: '',
      legalEntityId: '',
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
  const hospitals = hospitalsQuery.data;
  // A device bills under its location's entity unless another one is chosen.
  const locationEntityId = (hospitalId: string) =>
    hospitals?.find((hospital) => hospital.id === hospitalId)?.legalEntityId ?? '';

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
        hospitalId: editingDevice.hospitalId,
        legalEntityId: editingDevice.legalEntityId ?? locationEntityId(editingDevice.hospitalId),
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
        hospitalId: scopedHospitalId ?? '',
        legalEntityId: locationEntityId(scopedHospitalId ?? ''),
        hostName: '',
        isActive: true,
        isInvoicePrintEnabled: false,
        isKotPrintEnabled: false,
        name: '',
        restaurantIds: [],
      });
    }
    // hospitals: the location's entity is known once the locations have loaded.
  }, [editingDevice, form, hospitals, open, scopedHospitalId]);

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
      hospitalId: parsed.data.hospitalId,
      legalEntityId: parsed.data.legalEntityId || null,
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
      side
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
        <Field error={form.formState.errors.name?.message} label="Name" name="pos-name" required>
          <Input id="pos-name" {...form.register('name')} />
        </Field>
        <Field error={form.formState.errors.code?.message} label="Code" name="pos-code" required>
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
          required
        >
          <Select
            disabled={hospitalsQuery.isLoading || !isAllLocations}
            id="pos-location"
            {...form.register('hospitalId', {
              // Restaurants belong to one location, and the service rejects any that are not
              // in the selected one, so a change of location clears the picks.
              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                form.setValue('restaurantIds', []);
                // The entity follows the location, unless another one was chosen.
                const entityId = form.getValues('legalEntityId');

                if (!entityId || entityId === locationEntityId(selectedHospitalId)) {
                  form.setValue('legalEntityId', locationEntityId(event.target.value));
                }
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
                      className="h-4 w-4 accent-ds-primary"
                      onChange={() => toggleRestaurant(restaurant.id)}
                      type="checkbox"
                    />
                    {restaurant.restaurantName}
                  </label>
                ))
              : null}
          </div>
        </Field>
        <Field
          error={form.formState.errors.legalEntityId?.message}
          label="Entity"
          name="pos-entity"
        >
          <LegalEntitySelect
            id="pos-entity"
            value={form.watch('legalEntityId')}
            {...form.register('legalEntityId')}
          />
        </Field>
        <Field error={form.formState.errors.hostName?.message} label="Host Name" name="pos-host">
          <Input
            id="pos-host"
            placeholder="Optional"
            {...form.register('hostName', {
              validate: (value) => {
                const result = hostNameText.safeParse(value);

                return (
                  result.success || (result.error.issues[0]?.message ?? 'Enter a valid host name.')
                );
              },
            })}
          />
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
  const entityNamesQuery = useLegalEntityNames();
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

  const openEditForm = (device: PosDevice) => {
    setEditingDevice(device);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={openCreateForm} type="button">
          <Plus className="h-4 w-4" />
          New POS device
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
          onClear={() => {
            setSearch('');
            setActiveFilter('');
            setPage(1);
          }}
          onRefresh={() => void query.refetch()}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          search={searchInput}
          searchLabel="Search POS devices"
          searchPlaceholder="Code, name, hostname or restaurant"
        />
        <div className="overflow-x-auto">
          <table className={cn(tableStyles.table, 'min-w-250 table-fixed')}>
            <thead className={cn(tableStyles.head, 'whitespace-nowrap')}>
              <tr>
                <th className={cn(tableStyles.th, 'w-[15%]')}>Name</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Location</th>
                <th className={cn(tableStyles.th, 'w-[14%]')}>Restaurants</th>
                <th className={cn(tableStyles.th, 'w-[13%]')}>Entity</th>
                <th className={cn(tableStyles.th, 'w-[11%]')}>Hostname</th>
                <th className={cn(tableStyles.th, 'w-[12%]')}>Status</th>
                <th className={cn(tableStyles.th, 'w-[8%]')}>KOT print</th>
                <th className={cn(tableStyles.th, 'w-[9%]')}>Invoice print</th>
                <th className={cn(tableStyles.th, 'w-36')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((device) => (
                  <tr
                    className={tableStyles.row}
                    key={device.id}
                    onClick={() => openEditForm(device)}
                  >
                    {/* The code under the name, as the Locations list shows its codes. */}
                    <td className={tableStyles.td}>
                      <p className={cn('truncate', tableStyles.title)}>{device.name}</p>
                      <p className={cn('truncate', tableStyles.code)}>{device.code}</p>
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {device.hospital.hospitalName}
                    </td>
                    <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                      {formatRestaurants(device.restaurants)}
                    </td>
                    <td className={tableStyles.td}>
                      <LegalEntityCell
                        entity={
                          device.legalEntityId
                            ? entityNamesQuery.data?.get(device.legalEntityId)
                            : undefined
                        }
                      />
                    </td>
                    <td
                      className={cn(
                        tableStyles.td,
                        device.hostName && tableStyles.code,
                        'truncate text-ds-text-2',
                      )}
                    >
                      {device.hostName ?? 'Not set'}
                    </td>
                    {/* The switches have their own clicks: they do not open the device. */}
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <StatusToggleCell
                        disabled={flagMutation.isPending}
                        isActive={device.isActive}
                        onToggle={() =>
                          flagMutation.mutate({
                            body: { isActive: !device.isActive },
                            id: device.id,
                          })
                        }
                      />
                    </td>
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <Toggle
                        ariaLabel={`KOT print for ${device.name}`}
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
                    <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                      <Toggle
                        ariaLabel={`Invoice print for ${device.name}`}
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
                    {/* The order key's confirm and pop-up must not open the device either. */}
                    <td
                      className={cn(tableStyles.td, 'pr-3')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="flex items-center justify-end gap-0.5">
                        <RowAction
                          icon={Utensils}
                          label={`Map restaurants to ${device.name}`}
                          onClick={() => setAccessibilityDevice(device)}
                        />
                        <RowAction
                          icon={Pencil}
                          label={`Edit ${device.name}`}
                          onClick={() => openEditForm(device)}
                        />
                        <OrderKeyButton
                          issue={async () =>
                            (await organizationApi.issuePosDeviceKey(device.id)).data.apiKey
                          }
                          name={device.name}
                          usage="lets this POS send orders to the kitchen screen and TV board"
                        />
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <TableState
                  colSpan={9}
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
