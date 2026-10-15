'use client';

import Link from 'next/link';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useToast } from '@/components/toast-provider';
import { Panel, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import type { HospitalInput } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { PageHeader, StatusBadge } from '@/components/organization/shared/list-controls';
import { SubmitButton } from '@/components/organization/shared/form-controls';
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
        title: 'Location updated',
        variant: 'success',
      });
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
    <section className="space-y-5">
      <Button asChild variant="ghost">
        <Link href="/masters/locations">
          <ArrowLeft className="h-4 w-4" />
          Back to Locations
        </Link>
      </Button>
      <PageHeader
        eyebrow="Location Master"
        icon={MapPin}
        subtitle="View and update operating location details."
        title={hospital ? getLocationTitle(hospital) : 'Location'}
      />

      <Panel className="p-4" id="details">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">
              Add/Update Location
            </h2>
            <p className="text-sm text-ds-muted">
              Creating a Location will auto-create Main Store and Main Kitchen.
            </p>
          </div>
          {hospital ? <StatusBadge isActive={hospital.isActive} /> : null}
        </div>
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
      </Panel>
    </section>
  );
}
