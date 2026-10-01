'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Loader2, Pencil, Plus, RefreshCw, Search, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type {
  Hospital,
  PaymentMachine,
  PaymentMachineInput,
  PosDevice,
  PosDeviceInput,
  PrimaryUpiProvider,
} from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Modal, Toggle } from '@/components/ui-controls';
import { Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// The spec caps a page at 20 records; the grid also offers the other sizes shown in the mockups.
const defaultPageLimit = 20;
const pageLimitOptions = [10, 20, 25, 50];
const primaryUpiValues: PrimaryUpiProvider[] = [
  'PHONEPE',
  'UPI_PAYTM',
  'UPI_SALE',
  'UPI_BHARAT_QR',
  'BHARATPE',
  'GOOGLE_PAY',
  'OTHER',
];
// Spec wording for the Primary UPI dropdown; legacy values keep a readable label.
const primaryUpiLabels: Record<PrimaryUpiProvider, string> = {
  BHARATPE: 'BharatPe',
  GOOGLE_PAY: 'Google Pay',
  OTHER: 'Other',
  PHONEPE: 'PhonePe',
  UPI_BHARAT_QR: 'UPI Bharat QR',
  UPI_PAYTM: 'UPI Paytm',
  UPI_SALE: 'UPI Sale',
};

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength, `Use ${maxLength} characters or fewer.`);

// Mirrors the service-side rules so the pop-up flags bad input before the request goes out.
const numericText = (maxLength: number) =>
  optionalText(maxLength).regex(/^$|^[0-9]+$/, 'Use digits only.');

const alphanumericText = (maxLength: number) =>
  optionalText(maxLength).regex(/^$|^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens only.');

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

const paymentMachineSchema = z.object({
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  name: z.string().trim().min(1, 'Name is required.').max(150),
  pinelabImei: alphanumericText(100),
  pinelabMerchantId: numericText(150),
  pinelabMerchantStorePosCode: numericText(150),
  pinelabSecurityToken: optionalText(500),
  posDeviceId: z.string().uuid('Select a POS device.'),
  primaryUpi: z.custom<PrimaryUpiProvider | ''>(
    (value) => value === '' || primaryUpiValues.includes(value as PrimaryUpiProvider),
    { message: 'Select a valid UPI provider.' },
  ),
  serialNumber: numericText(100),
});

type PosDeviceFormValues = z.infer<typeof posDeviceSchema>;
type PaymentMachineFormValues = z.infer<typeof paymentMachineSchema>;
type ActiveFilter = '' | 'active' | 'inactive';

function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') return true;
  if (value === 'inactive') return false;
  return undefined;
}

function applyValidationErrors<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  error: ZodError,
) {
  form.clearErrors();
  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TValues>, { message: issue.message });
    }
  });
}

function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function formatLocationOption(hospital: Hospital): string {
  const details = [hospital.city, hospital.state, hospital.address].filter(Boolean).join(', ');

  return `${hospital.hospitalCode} - ${hospital.hospitalName}${
    details ? `, ${details}` : ''
  } (${hospital.hospitalCode})`;
}

function formatUpiProvider(value: PrimaryUpiProvider | null | undefined): string {
  if (!value) return 'Not set';

  return primaryUpiLabels[value] ?? value;
}

function formatRestaurants(restaurants: PosDevice['restaurants']): string {
  if (restaurants.length === 0) {
    return 'Not mapped';
  }

  return restaurants.map((restaurant) => restaurant.restaurantName).join(', ');
}

function TableState({
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
        {['one', 'two', 'three', 'four'].map((row) => (
          <tr key={row}>
            <td className="px-4 py-3" colSpan={colSpan}>
              <Skeleton className="h-9 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-12 text-center text-sm font-medium text-red-600" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <p className="text-sm font-semibold text-slate-950 dark:text-white">No {label} found</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Add a record or adjust the filters.
        </p>
      </td>
    </tr>
  );
}

function PaginationControls({
  limit,
  onLimitChange,
  onPageChange,
  page,
  total,
  totalPages,
}: Readonly<{
  limit: number;
  onLimitChange: (limit: number) => void;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}>) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {safeTotalPages} · {total} records
      </span>
      <div className="flex items-center gap-2">
        <Select
          aria-label="Records per page"
          className="h-9 w-20"
          onChange={(event) => onLimitChange(Number(event.target.value))}
          value={limit}
        >
          {pageLimitOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
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

function FilterBar({
  activeFilter,
  onActiveFilterChange,
  onRefresh,
  onSearchChange,
  search,
}: Readonly<{
  activeFilter: ActiveFilter;
  onActiveFilterChange: (value: ActiveFilter) => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  search: string;
}>) {
  return (
    <div className="grid gap-3 border-b p-4 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_160px_auto]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          type="search"
          value={search}
        />
      </div>
      <Select
        onChange={(event) => onActiveFilterChange(event.target.value as ActiveFilter)}
        value={activeFilter}
      >
        <option value="">All status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      <Button onClick={onRefresh} type="button" variant="outline">
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
    </div>
  );
}

function useHospitalOptions() {
  return useQuery({
    queryFn: async () =>
      (
        await organizationApi.listHospitals({
          isActive: true,
          limit: 100,
          sortBy: 'hospitalName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: ['pos-location-options'],
  });
}

function useRestaurantOptions(hospitalId?: string) {
  return useQuery({
    enabled: Boolean(hospitalId),
    queryFn: async () =>
      (
        await organizationApi.listRestaurants({
          hospitalId,
          isActive: true,
          limit: 100,
          sortBy: 'restaurantName',
          sortOrder: 'asc',
        })
      ).data.items,
    queryKey: ['pos-restaurant-options', hospitalId],
  });
}

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
    queryKey: ['payment-machine-pos-device-options', hospitalId],
  });
}

function ToggleField({
  description,
  label,
  onChange,
  value,
}: Readonly<{
  description?: string;
  label: string;
  onChange: (checked: boolean) => void;
  value: boolean;
}>) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        {description ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      <Toggle checked={value} onChange={onChange} />
    </div>
  );
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
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
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
      void queryClient.invalidateQueries({ queryKey: ['pos-devices'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-machine-pos-device-options'] });
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
            disabled={hospitalsQuery.isLoading || isLocationSelectorLocked}
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
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select a location to choose its restaurants.
              </p>
            ) : null}
            {selectedHospitalId && restaurantsQuery.isLoading ? (
              <Skeleton className="h-11" />
            ) : null}
            {selectedHospitalId && restaurantsQuery.isError ? (
              <p className="text-sm text-red-600 dark:text-red-400">
                {getApiErrorMessage(restaurantsQuery.error)}
              </p>
            ) : null}
            {selectedHospitalId &&
            !restaurantsQuery.isLoading &&
            restaurantsQuery.data?.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No active restaurants found for this location.
              </p>
            ) : null}
            {selectedHospitalId
              ? restaurantsQuery.data?.map((restaurant) => (
                  <label
                    className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
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

function RestaurantAccessibilityModal({
  device,
  onClose,
}: Readonly<{
  device?: PosDevice;
  onClose: () => void;
}>) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const restaurantsQuery = useRestaurantOptions(device?.hospitalId);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setSelectedIds(device?.restaurantIds ?? []);
  }, [device]);

  const mutation = useMutation({
    mutationFn: (restaurantIds: string[]) => {
      if (!device) {
        throw new Error('No POS device selected.');
      }

      return organizationApi.updatePosDevice(device.id, { restaurantIds });
    },
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant accessibility was not updated',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['pos-devices'] });
      showToast({ title: 'Restaurant accessibility updated', variant: 'success' });
      onClose();
    },
  });

  const toggleRestaurant = (restaurantId: string) => {
    setSelectedIds((current) =>
      current.includes(restaurantId)
        ? current.filter((id) => id !== restaurantId)
        : [...current, restaurantId],
    );
  };

  return (
    <Modal
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || !device}
            onClick={() => mutation.mutate(selectedIds)}
            type="button"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(device)}
      title={"Restaurant's Accessibility - " + (device?.code ?? '')}
    >
      <div className="grid gap-2">
        {restaurantsQuery.isLoading ? <Skeleton className="h-11" /> : null}
        {!restaurantsQuery.isLoading && restaurantsQuery.data?.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No active restaurants found for this location.
          </p>
        ) : null}
        {restaurantsQuery.data?.map((restaurant) => (
          <label
            className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
            key={restaurant.id}
          >
            <input
              checked={selectedIds.includes(restaurant.id)}
              className="h-4 w-4 accent-teal-600"
              onChange={() => toggleRestaurant(restaurant.id)}
              type="checkbox"
            />
            {restaurant.restaurantName}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function PosDevicesTab() {
  const { scopedHospitalId } = useLocationContext();
  const [accessibilityDevice, setAccessibilityDevice] = useState<PosDevice | undefined>();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [editingDevice, setEditingDevice] = useState<PosDevice | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [limit, setLimit] = useState(defaultPageLimit);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
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
    queryKey: ['pos-devices', { activeFilter, limit, page, scopedHospitalId, search }],
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
      void queryClient.invalidateQueries({ queryKey: ['pos-devices'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-machine-pos-device-options'] });
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
          search={search}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
              {items.length > 0 ? (
                items.map((device) => (
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-900" key={device.id}>
                    <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">
                      {device.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{device.code}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {device.hospital.hospitalName}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatRestaurants(device.restaurants)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {device.entity ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {device.hostName ?? 'Not set'}
                    </td>
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
                          className="text-teal-700 hover:text-teal-800"
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

const paymentMachineFormId = 'payment-machine-form';

function PaymentMachineForm({
  editingMachine,
  onClose,
  open,
}: Readonly<{
  editingMachine?: PaymentMachine;
  onClose: () => void;
  open: boolean;
}>) {
  const form = useForm<PaymentMachineFormValues>({
    defaultValues: {
      hospitalId: '',
      isActive: true,
      isDefault: false,
      name: '',
      pinelabImei: '',
      pinelabMerchantId: '',
      pinelabMerchantStorePosCode: '',
      pinelabSecurityToken: '',
      posDeviceId: '',
      primaryUpi: '',
      serialNumber: '',
    },
  });
  const selectedHospitalId = form.watch('hospitalId');
  const isActive = form.watch('isActive');
  const isDefault = form.watch('isDefault');
  const hospitalsQuery = useHospitalOptions();
  const posDevicesQuery = usePosDeviceOptions(selectedHospitalId);
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editingMachine) {
      form.reset({
        hospitalId: editingMachine.hospitalId,
        isActive: editingMachine.isActive,
        isDefault: editingMachine.isDefault,
        name: editingMachine.name,
        pinelabImei: editingMachine.pinelabImei ?? '',
        pinelabMerchantId: editingMachine.pinelabMerchantId ?? '',
        pinelabMerchantStorePosCode: editingMachine.pinelabMerchantStorePosCode ?? '',
        pinelabSecurityToken: '',
        posDeviceId: editingMachine.posDeviceId,
        primaryUpi: editingMachine.primaryUpi ?? '',
        serialNumber: editingMachine.serialNumber ?? '',
      });
    } else {
      form.reset({
        hospitalId: scopedHospitalId ?? '',
        isActive: true,
        isDefault: false,
        name: '',
        pinelabImei: '',
        pinelabMerchantId: '',
        pinelabMerchantStorePosCode: '',
        pinelabSecurityToken: '',
        posDeviceId: '',
        primaryUpi: '',
        serialNumber: '',
      });
    }
  }, [editingMachine, form, open, scopedHospitalId]);

  const mutation = useMutation({
    mutationFn: (body: PaymentMachineInput) =>
      editingMachine
        ? organizationApi.updatePaymentMachine(editingMachine.id, body)
        : organizationApi.createPaymentMachine(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingMachine
          ? 'Payment machine was not updated'
          : 'Payment machine was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['payment-machines'] });
      showToast({
        title: editingMachine ? 'Payment machine updated' : 'Payment machine created',
        variant: 'success',
      });
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = paymentMachineSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    const body: PaymentMachineInput = {
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      isDefault: parsed.data.isDefault,
      name: parsed.data.name,
      pinelabImei: optionalValue(parsed.data.pinelabImei),
      pinelabMerchantId: optionalValue(parsed.data.pinelabMerchantId),
      pinelabMerchantStorePosCode: optionalValue(parsed.data.pinelabMerchantStorePosCode),
      pinelabSecurityToken: optionalValue(parsed.data.pinelabSecurityToken),
      posDeviceId: parsed.data.posDeviceId,
      primaryUpi: parsed.data.primaryUpi || undefined,
      serialNumber: optionalValue(parsed.data.serialNumber),
    };

    mutation.mutate(body);
  });

  return (
    <Modal
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={mutation.isPending} form={paymentMachineFormId} type="submit">
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
      title={editingMachine ? 'Edit Payment Machine' : 'New Payment Machine'}
    >
      <form
        className="grid gap-4"
        id={paymentMachineFormId}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="payment-location"
        >
          <Select
            disabled={hospitalsQuery.isLoading || isLocationSelectorLocked}
            id="payment-location"
            {...form.register('hospitalId')}
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
          error={form.formState.errors.posDeviceId?.message}
          label="POS Device"
          name="payment-pos-device"
        >
          <Select
            disabled={!selectedHospitalId || posDevicesQuery.isLoading}
            id="payment-pos-device"
            {...form.register('posDeviceId')}
          >
            <option value="">Select POS device</option>
            {posDevicesQuery.data?.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} ({device.code})
              </option>
            ))}
          </Select>
        </Field>
        <ToggleField
          label="Status"
          onChange={(checked) => form.setValue('isActive', checked)}
          value={isActive}
        />
        <Field error={form.formState.errors.name?.message} label="Name" name="payment-name">
          <Input id="payment-name" {...form.register('name')} />
        </Field>
        <Field
          error={form.formState.errors.serialNumber?.message}
          label="Serial Number"
          name="payment-serial"
        >
          <Input
            id="payment-serial"
            inputMode="numeric"
            placeholder="Optional"
            {...form.register('serialNumber')}
          />
        </Field>
        <Field
          error={form.formState.errors.pinelabMerchantId?.message}
          label="Pinelab Merchant Id"
          name="payment-merchant"
        >
          <Input
            id="payment-merchant"
            inputMode="numeric"
            placeholder="Optional"
            {...form.register('pinelabMerchantId')}
          />
        </Field>
        <Field
          error={form.formState.errors.pinelabSecurityToken?.message}
          label="Pinelab Security Token"
          name="payment-token"
        >
          <Input
            id="payment-token"
            placeholder={editingMachine ? 'Leave blank to keep existing token' : 'Optional'}
            type="password"
            {...form.register('pinelabSecurityToken')}
          />
        </Field>
        <Field
          error={form.formState.errors.pinelabImei?.message}
          label="Pinelab IMEI"
          name="payment-imei"
        >
          <Input id="payment-imei" placeholder="Optional" {...form.register('pinelabImei')} />
        </Field>
        <Field
          error={form.formState.errors.pinelabMerchantStorePosCode?.message}
          label="Pinelab Merchant Store POS Code"
          name="payment-store-pos-code"
        >
          <Input
            id="payment-store-pos-code"
            inputMode="numeric"
            placeholder="Optional"
            {...form.register('pinelabMerchantStorePosCode')}
          />
        </Field>
        <Field
          error={form.formState.errors.primaryUpi?.message}
          label="Primary UPI"
          name="payment-primary-upi"
        >
          <Select id="payment-primary-upi" {...form.register('primaryUpi')}>
            <option value="">Select provider</option>
            {primaryUpiValues.map((provider) => (
              <option key={provider} value={provider}>
                {formatUpiProvider(provider)}
              </option>
            ))}
          </Select>
        </Field>
        <ToggleField
          description="Only one machine per POS device can be the default. Turning this on clears the current default."
          label="Default"
          onChange={(checked) => form.setValue('isDefault', checked)}
          value={isDefault}
        />
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Pine Labs security token is masked after save. Production should move this value to Key
          Vault or encrypted storage.
        </div>
      </form>
    </Modal>
  );
}

function PaymentMachinesTab() {
  const { scopedHospitalId } = useLocationContext();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [editingMachine, setEditingMachine] = useState<PaymentMachine | undefined>();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [limit, setLimit] = useState(defaultPageLimit);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({
    queryFn: async () =>
      (
        await organizationApi.listPaymentMachines({
          hospitalId: scopedHospitalId,
          isActive: activeFilterToBoolean(activeFilter),
          limit,
          page,
          search,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      ).data,
    queryKey: ['payment-machines', { activeFilter, limit, page, scopedHospitalId, search }],
  });
  const items = query.data?.items ?? [];
  const meta = query.data?.meta ?? { limit, page, total: 0, totalPages: 1 };
  // Status and Primary toggle straight from the grid; the service demotes the previous default.
  const flagMutation = useMutation({
    mutationFn: ({ body, id }: { body: Partial<PaymentMachineInput>; id: string }) =>
      organizationApi.updatePaymentMachine(id, body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Payment machine was not updated',
        variant: 'error',
      });
      void query.refetch();
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['payment-machines'] });
    },
  });

  const openCreateForm = () => {
    setEditingMachine(undefined);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingMachine(undefined);
    setIsFormOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={openCreateForm} type="button">
          <Plus className="h-4 w-4" />
          New Payment Machine
        </Button>
      </div>
      <PaymentMachineForm editingMachine={editingMachine} onClose={closeForm} open={isFormOpen} />
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
          search={search}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-[15%] px-4 py-2.5">Name</th>
                <th className="w-[8%] px-4 py-2.5">Active</th>
                <th className="w-[8%] px-4 py-2.5">Primary</th>
                <th className="w-[13%] px-4 py-2.5">Serial Number</th>
                <th className="w-[11%] px-4 py-2.5">Merchant ID</th>
                <th className="w-[13%] px-4 py-2.5">Store POS Code</th>
                <th className="w-[15%] px-4 py-2.5">POS Device</th>
                <th className="w-[11%] px-4 py-2.5">Primary UPI</th>
                <th className="w-[120px] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
              {items.length > 0 ? (
                items.map((machine) => (
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-900" key={machine.id}>
                    <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">
                      {machine.name}
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={machine.isActive}
                        disabled={flagMutation.isPending}
                        onChange={(checked) =>
                          flagMutation.mutate({ body: { isActive: checked }, id: machine.id })
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={machine.isDefault}
                        disabled={flagMutation.isPending}
                        onChange={(checked) =>
                          flagMutation.mutate({ body: { isDefault: checked }, id: machine.id })
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {machine.serialNumber ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {machine.pinelabMerchantId ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {machine.pinelabMerchantStorePosCode ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {machine.posDevice.name} ({machine.posDevice.code})
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatUpiProvider(machine.primaryUpi)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          aria-label={`Edit ${machine.name}`}
                          onClick={() => {
                            setEditingMachine(machine);
                            setIsFormOpen(true);
                          }}
                          size="sm"
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
                  colSpan={9}
                  error={query.error}
                  isError={query.isError}
                  isLoading={query.isLoading}
                  label="payment machines"
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

export function PosMasterPageClient() {
  const [activeTab, setActiveTab] = useState<'devices' | 'payments'>('devices');
  const tabs = useMemo(
    () => [
      { id: 'devices' as const, label: 'POS Devices' },
      { id: 'payments' as const, label: 'Payment Machines' },
    ],
    [],
  );

  return (
    <section className="space-y-5">
      <AppPageHeader
        description="Configure POS devices and payment machines for hospital food operations."
        eyebrow="Masters"
        icon={CreditCard}
        title="POS"
      />
      <Panel className="p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-teal-50 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-teal-950 dark:hover:text-teal-200',
                activeTab === tab.id &&
                  'bg-teal-50 text-teal-800 shadow-sm dark:bg-teal-950 dark:text-teal-200',
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Panel>
      {activeTab === 'devices' ? <PosDevicesTab /> : <PaymentMachinesTab />}
    </section>
  );
}
