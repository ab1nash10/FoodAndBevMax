'use client';

import Link from 'next/link';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { Kitchen, KitchenInput, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ActiveFilterSelect,
  CheckboxLine,
  FormShell,
  FormWarning,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SortOrderSelect,
  StatusToggleCell,
  SubmitButton,
  ToolbarGrid,
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  formatLocationOption,
  freezeServicesMessage,
  getLocationDisplayName,
  hasRequiredText,
  inactiveLocationMessage,
  isUuid,
  kitchenSchema,
  listLimit,
  useHospitalOptions,
} from './shared';
import type { ActiveFilter, KitchenFormValues } from './shared';

export function KitchensPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [hospitalFilter, setHospitalFilter] = useState(scopedHospitalId ?? '');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const hospitalOptionsQuery = useHospitalOptions();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setPage(1);
  }, [scopedHospitalId]);

  const kitchensQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listKitchens({
        hospitalId: hospitalFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: ['kitchens', { activeFilter, hospitalFilter, page, search, sortBy, sortOrder }],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateKitchen(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: ['kitchens'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-options'] });
      showToast({
        title: variables.isActive ? 'Kitchen activated' : 'Kitchen deactivated',
        variant: 'success',
      });
    },
  });

  const items = kitchensQuery.data?.items ?? [];
  const meta = kitchensQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  function toggleKitchenStatus(kitchen: Kitchen) {
    const nextIsActive = !kitchen.isActive;

    if (nextIsActive && !kitchen.hospital.isActive) {
      showToast({
        description: inactiveLocationMessage,
        title: 'Location is inactive',
        variant: 'info',
      });
      return;
    }

    if (!nextIsActive && !window.confirm(freezeServicesMessage)) {
      return;
    }

    setStatusUpdatingId(kitchen.id);
    statusMutation.mutate({ id: kitchen.id, isActive: nextIsActive });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button asChild className="bg-teal-600 hover:bg-teal-700">
            <Link href="/masters/kitchens/new">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
        }
        eyebrow="Organization"
        icon={ChefHat}
        subtitle="Manage production kitchens for location food service."
        title="Kitchens"
      />
      <Panel>
        <ToolbarGrid>
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
            disabled={hospitalOptionsQuery.isLoading || Boolean(scopedHospitalId)}
            onChange={(event) => {
              setHospitalFilter(event.target.value);
              setPage(1);
            }}
            value={hospitalFilter}
          >
            <option value="">All locations</option>
            {hospitalOptionsQuery.data?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="kitchenName">Name</option>
          </Select>
        </ToolbarGrid>
        <div className="flex justify-end border-b px-4 py-3">
          <Button onClick={() => void kitchensQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[28%] px-4 py-3">Kitchen</th>
                <th className="w-[26%] px-4 py-3">Location</th>
                <th className="w-[22%] px-4 py-3">Status</th>
                <th className="w-[16%] px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((kitchen) => (
                  <tr className="hover:bg-slate-50" key={kitchen.id}>
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-slate-950">{kitchen.kitchenName}</p>
                        <p className="text-xs text-slate-500">{kitchen.kitchenCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getLocationDisplayName(kitchen.hospital)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === kitchen.id}
                        isActive={kitchen.isActive}
                        onToggle={() => toggleKitchenStatus(kitchen)}
                        showFrozenMessage={!kitchen.hospital.isActive}
                      />
                    </td>
                    <td className="px-4 py-4 text-slate-500">{formatDate(kitchen.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={4}
                  error={kitchensQuery.error}
                  isError={kitchensQuery.isError}
                  isLoading={kitchensQuery.isLoading}
                  label="kitchens"
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

export function KitchenCreatePageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const form = useForm<KitchenFormValues>({
    defaultValues: {
      hospitalId: scopedHospitalId ?? '',
      isActive: true,
      kitchenName: '',
    },
  });
  const hospitalId = form.watch('hospitalId');
  const kitchenName = form.watch('kitchenName');
  const hospitalOptionsQuery = useHospitalOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const canSubmitKitchen = isUuid(hospitalId) && hasRequiredText(kitchenName);

  useEffect(() => {
    if (scopedHospitalId && form.getValues('hospitalId') !== scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
    }
  }, [form, scopedHospitalId]);

  const createKitchenMutation = useMutation({
    mutationFn: (body: KitchenInput) => organizationApi.createKitchen(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Kitchen was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['kitchens'] });
      void queryClient.invalidateQueries({ queryKey: ['kitchen-options'] });
      showToast({
        title: 'Kitchen created',
        variant: 'success',
      });
      router.push('/masters/kitchens');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = kitchenSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createKitchenMutation.mutate({
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      kitchenName: parsed.data.kitchenName,
    });
  });

  return (
    <FormShell
      backHref="/masters/kitchens"
      icon={ChefHat}
      subtitle="Create a kitchen for location food production."
      title="Create Kitchen"
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            error={form.formState.errors.hospitalId?.message}
            label="Location"
            name="kitchen-hospital"
          >
            <Select
              disabled={hospitalOptionsQuery.isLoading || isLocationSelectorLocked}
              id="kitchen-hospital"
              {...form.register('hospitalId')}
            >
              <option value="">Select location</option>
              {hospitalOptionsQuery.data?.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {formatLocationOption(hospital)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            error={form.formState.errors.kitchenName?.message}
            label="Kitchen Name"
            name="kitchen-name"
          >
            <Input id="kitchen-name" {...form.register('kitchenName')} />
          </Field>
          <Field label="Kitchen Code" name="kitchen-code">
            <Input id="kitchen-code" readOnly value="Auto-generated after save" />
          </Field>
        </div>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
        <FormWarning
          isVisible={hospitalOptionsQuery.isError}
          message={getApiErrorMessage(hospitalOptionsQuery.error)}
        />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmitKitchen}
            isPending={createKitchenMutation.isPending}
            label="Create Kitchen"
          />
        </div>
      </form>
    </FormShell>
  );
}
