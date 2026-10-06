'use client';

import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import type { HospitalInput } from '@aahar/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { FormShell, SubmitButton } from '@/components/organization/shared/form-controls';
import { LocationMasterFormFields } from '@/components/organization/shared/location-form-fields';
import { applyValidationErrors } from '@/components/organization/shared/utils';
import {
  toHospitalFormDefaults,
  toHospitalInput,
} from '@/components/organization/shared/locations';
import { hospitalSchema } from '@/components/organization/shared/schemas';
import type { HospitalFormValues } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function HospitalCreatePageClient() {
  const form = useForm<HospitalFormValues>({
    defaultValues: toHospitalFormDefaults(),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const createHospitalMutation = useMutation({
    mutationFn: (body: HospitalInput) => organizationApi.createHospital(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/locations', {
        name: response.data.hospitalCode || response.data.hospitalName,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitals() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalOptions() });
      showToast({
        action: { href, label: `View ${response.data.hospitalName}` },
        description: 'Main Store and Main Kitchen were created automatically.',
        title: 'Location created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = hospitalSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createHospitalMutation.mutate(toHospitalInput(parsed.data));
  });

  return (
    <FormShell
      backHref="/masters/locations"
      icon={MapPin}
      subtitle="Creating a Location will auto-create Main Store and Main Kitchen."
      title="Add Location"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <LocationMasterFormFields disabled={createHospitalMutation.isPending} form={form} />
        <div className="flex justify-end">
          <SubmitButton isPending={createHospitalMutation.isPending} label="Save Location" />
        </div>
      </form>
    </FormShell>
  );
}
