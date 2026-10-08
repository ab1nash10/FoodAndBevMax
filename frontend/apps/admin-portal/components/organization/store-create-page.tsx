'use client';

import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import type { StoreInput } from '@aahar/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  CheckboxLine,
  FormShell,
  FormWarning,
  SubmitButton,
} from '@/components/organization/shared/form-controls';
import { applyValidationErrors, hasRequiredText } from '@/components/organization/shared/utils';
import { formatLocationOption } from '@/components/organization/shared/locations';
import { storeSchema, isUuid } from '@/components/organization/shared/schemas';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import type { StoreFormValues } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function StoreCreatePageClient() {
  const { isAllLocations, scopedHospitalId } = useLocationContext();
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
    onSuccess(response) {
      const href = recordHref('/masters/stores', {
        name: response.data.storeCode || response.data.storeName,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stores() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.storeOptions() });
      showToast({
        action: { href, label: `View ${response.data.storeName}` },
        title: 'Store created',
        variant: 'success',
      });
      router.push(href);
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
              disabled={hospitalOptionsQuery.isLoading || !isAllLocations}
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
