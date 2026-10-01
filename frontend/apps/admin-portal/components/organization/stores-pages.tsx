'use client';

import Link from 'next/link';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { SortOrder, Store as StoreRecord, StoreInput } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Store } from 'lucide-react';
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
  listLimit,
  storeSchema,
  useHospitalOptions,
} from './shared';
import type { ActiveFilter, StoreFormValues } from './shared';

export function StoresPageClient() {
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

  const storesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listStores({
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
    queryKey: ['stores', { activeFilter, hospitalFilter, page, search, sortBy, sortOrder }],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      organizationApi.updateStore(id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setStatusUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: ['stores'] });
      void queryClient.invalidateQueries({ queryKey: ['store-options'] });
      showToast({
        title: variables.isActive ? 'Store activated' : 'Store deactivated',
        variant: 'success',
      });
    },
  });

  const items = storesQuery.data?.items ?? [];
  const meta = storesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  function toggleStoreStatus(store: StoreRecord) {
    const nextIsActive = !store.isActive;

    if (nextIsActive && !store.hospital.isActive) {
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

    setStatusUpdatingId(store.id);
    statusMutation.mutate({ id: store.id, isActive: nextIsActive });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild>
            <Link href="/masters/stores/new">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
        }
        eyebrow="Organization"
        icon={Store}
        subtitle="Manage F&B stores linked to locations."
        title="Stores"
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
            <option value="storeName">Name</option>
          </Select>
          <Button onClick={() => void storesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </ToolbarGrid>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[28%] px-4 py-2.5">Store/F&B</th>
                <th className="w-[26%] px-4 py-2.5">Location</th>
                <th className="w-[22%] px-4 py-2.5">Status</th>
                <th className="w-[16%] px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((store) => (
                  <tr className="hover:bg-slate-50" key={store.id}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-950">{store.storeName}</p>
                        <p className="text-xs text-slate-500">{store.storeCode}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getLocationDisplayName(store.hospital)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggleCell
                        disabled={statusMutation.isPending && statusUpdatingId === store.id}
                        isActive={store.isActive}
                        onToggle={() => toggleStoreStatus(store)}
                        showFrozenMessage={!store.hospital.isActive}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(store.updatedAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={4}
                  error={storesQuery.error}
                  isError={storesQuery.isError}
                  isLoading={storesQuery.isLoading}
                  label="stores"
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

export function StoreCreatePageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const form = useForm<StoreFormValues>({
    defaultValues: {
      hospitalId: scopedHospitalId ?? '',
      isActive: true,
      storeName: '',
    },
  });
  const hospitalId = form.watch('hospitalId');
  const storeName = form.watch('storeName');
  const hospitalOptionsQuery = useHospitalOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const canSubmitStore = isUuid(hospitalId) && hasRequiredText(storeName);

  useEffect(() => {
    if (scopedHospitalId && form.getValues('hospitalId') !== scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
    }
  }, [form, scopedHospitalId]);

  const createStoreMutation = useMutation({
    mutationFn: (body: StoreInput) => organizationApi.createStore(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Store was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['stores'] });
      void queryClient.invalidateQueries({ queryKey: ['store-options'] });
      showToast({
        title: 'Store created',
        variant: 'success',
      });
      router.push('/masters/stores');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = storeSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createStoreMutation.mutate({
      hospitalId: parsed.data.hospitalId,
      isActive: parsed.data.isActive,
      storeName: parsed.data.storeName,
    });
  });

  return (
    <FormShell
      backHref="/masters/stores"
      icon={Store}
      subtitle="Create a store for food and beverage inventory flow."
      title="Create Store"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={form.formState.errors.hospitalId?.message}
            label="Location"
            name="store-hospital"
          >
            <Select
              disabled={hospitalOptionsQuery.isLoading || isLocationSelectorLocked}
              id="store-hospital"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={form.formState.errors.storeName?.message}
            label="Store Name"
            name="store-name"
          >
            <Input id="store-name" {...form.register('storeName')} />
          </Field>
          <Field label="Store Code" name="store-code">
            <Input id="store-code" readOnly value="Auto-generated after save" />
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
            disabled={!canSubmitStore}
            isPending={createStoreMutation.isPending}
            label="Create Store"
          />
        </div>
      </form>
    </FormShell>
  );
}
