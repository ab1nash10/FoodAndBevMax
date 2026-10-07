'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PaymentMachine, PaymentMachineInput, PrimaryUpiProvider } from '@aahar/api-client';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Modal, PasswordInput, Toggle } from '@/components/ui-controls';
import { Field, Input, Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
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
} from '@/components/pos/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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

// Mirrors the service-side rules so the pop-up flags bad input before the request goes out.
const numericText = (maxLength: number) =>
  optionalText(maxLength).regex(/^$|^[0-9]+$/, 'Use digits only.');

const alphanumericText = (maxLength: number) =>
  optionalText(maxLength).regex(/^$|^[A-Za-z0-9-]+$/, 'Use letters, numbers or hyphens only.');

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

type PaymentMachineFormValues = z.infer<typeof paymentMachineSchema>;

function formatUpiProvider(value: PrimaryUpiProvider | null | undefined): string {
  if (!value) return 'Not set';

  return primaryUpiLabels[value] ?? value;
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
    queryKey: queryKeys.paymentMachinePosDeviceOptions(hospitalId),
  });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMachines() });
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
          <PasswordInput
            id="payment-token"
            placeholder={editingMachine ? 'Leave blank to keep existing token' : 'Optional'}
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
        <div className="rounded-control bg-ds-status-pending-bg px-3 py-2 text-sm text-ds-status-pending-fg">
          Pine Labs security token is masked after save. Production should move this value to Key
          Vault or encrypted storage.
        </div>
      </form>
    </Modal>
  );
}

export function PaymentMachinesTab() {
  const { scopedHospitalId } = useLocationContext();
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [editingMachine, setEditingMachine] = useState<PaymentMachine | undefined>();
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
    queryKey: queryKeys.paymentMachines({ activeFilter, limit, page, scopedHospitalId, search }),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMachines() });
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
          search={searchInput}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
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
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((machine) => (
                  <tr className="hover:bg-ds-subtle" key={machine.id}>
                    <td className="px-4 py-3 font-medium text-ds-text dark:text-white">
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
                    <td className="px-4 py-3 text-ds-text-3">
                      {machine.serialNumber ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {machine.pinelabMerchantId ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {machine.pinelabMerchantStorePosCode ?? 'Not set'}
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {machine.posDevice.name} ({machine.posDevice.code})
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
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
