'use client';

import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import type { KitchenInput } from '@aahar/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react';
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
import { kitchenSchema, isUuid } from '@/components/organization/shared/schemas';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import type { KitchenFormValues } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function KitchenCreatePageClient() {
  const { isAllLocations, scopedHospitalId } = useLocationContext();
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
    onSuccess(response) {
      const href = recordHref('/masters/kitchens', {
        name: response.data.kitchenCode || response.data.kitchenName,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchens() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.kitchenOptions() });
      showToast({
        action: { href, label: `View ${response.data.kitchenName}` },
        title: 'Kitchen created',
        variant: 'success',
      });
      router.push(href);
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
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            error={form.formState.errors.hospitalId?.message}
            label="Location"
            name="kitchen-hospital"
          >
            <Select
              disabled={hospitalOptionsQuery.isLoading || !isAllLocations}
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
        <div className="grid gap-4 sm:grid-cols-2">
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
