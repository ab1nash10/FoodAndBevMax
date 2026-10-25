'use client';

import { useRouter } from 'next/navigation';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useToast } from '@/components/toast-provider';
import { Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { HospitalInput } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { StatusBadge } from '@/components/organization/shared/list-controls';
import { FormShell, SubmitButton } from '@/components/organization/shared/form-controls';
import { LocationMasterFormFields } from '@/components/organization/shared/location-form-fields';
import { applyValidationErrors, organizationSchemas } from '@/components/organization/shared/utils';
import {
  getLocationTitle,
  toHospitalFormDefaults,
  toHospitalInput,
} from '@/components/organization/shared/locations';
import type { HospitalFormValues } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';

export function HospitalLocationsPageClient({ hospitalId }: Readonly<{ hospitalId: string }>) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const locationMasterForm = useForm<HospitalFormValues>({
    defaultValues: toHospitalFormDefaults(),
  });

  const hospitalQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.getHospital(hospitalId);

      return response.data;
    },
    queryKey: queryKeys.hospital(hospitalId),
  });
  useBreadcrumbLabel(
    hospitalId,
    hospitalQuery.data?.hospitalName ?? (hospitalQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    if (hospitalQuery.data) {
      locationMasterForm.reset(toHospitalFormDefaults(hospitalQuery.data));
    }
  }, [hospitalQuery.data, locationMasterForm]);

  const updateLocationMasterMutation = useMutation({
    mutationFn: (body: HospitalInput) => organizationApi.updateHospital(hospitalId, body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Location was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospital(hospitalId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitals() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hospitalOptions() });
      locationMasterForm.reset(toHospitalFormDefaults(response.data));
      showToast({
        recordId: response.data.id,
        title: 'Location updated',
        variant: 'success',
      });
      // Saved: back to the list, as every record panel closes on save.
      router.push('/masters/locations');
    },
  });

  const hospital = hospitalQuery.data;

  useEffect(() => organizationSchemas.warm(), []);

  const handleLocationMasterSubmit = locationMasterForm.handleSubmit(async (values) => {
    const { hospitalSchema } = await organizationSchemas.get();
    const parsed = hospitalSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(locationMasterForm, parsed.error);
      return;
    }

    updateLocationMasterMutation.mutate(toHospitalInput(parsed.data));
  });

  return (
    <FormShell
      backHref="/masters/locations"
      subtitle="Creating a Location will auto-create Main Store and Main Kitchen."
      title={hospital ? `Edit ${getLocationTitle(hospital)}` : 'Edit location'}
    >
      {hospitalQuery.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
        </div>
      ) : hospitalQuery.isError ? (
        <p className="text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(hospitalQuery.error)}
        </p>
      ) : hospital ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void handleLocationMasterSubmit(event);
          }}
        >
          <div className="flex justify-end">
            <StatusBadge isActive={hospital.isActive} />
          </div>
          <LocationMasterFormFields
            disabled={updateLocationMasterMutation.isPending}
            form={locationMasterForm}
          />
          <div className="flex justify-end">
            <SubmitButton
              isPending={updateLocationMasterMutation.isPending}
              label="Update Location"
            />
          </div>
        </form>
      ) : null}
    </FormShell>
  );
}
