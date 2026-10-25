'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { invalidateTimeSlotQueries } from '@/lib/query-invalidation';
import {
  emptyTimeSlot,
  everyLocation,
  timeSlotInput,
  timeSlotSchema,
  TimeSlotFormFields,
  type TimeSlotFormValues,
} from '@/components/master-data/time-slots/shared';
import { FormShell, SubmitButton } from '@/components/master-data/shared/components';
import { applyValidationErrors } from '@/components/master-data/shared/utils';

export function TimeSlotCreatePageClient() {
  const { availableLocations, canSelectAllLocations, scopedHospitalId } = useLocationContext();
  const form = useForm<TimeSlotFormValues>({
    // The location in the header, or every location for a user who reaches them all; a user
    // with one location starts on it (they may not share a slot with every location).
    defaultValues: {
      ...emptyTimeSlot,
      hospitalId:
        scopedHospitalId ??
        (canSelectAllLocations ? everyLocation : (availableLocations[0]?.id ?? everyLocation)),
    },
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createMutation = useMutation({
    mutationFn: (values: TimeSlotFormValues) =>
      organizationApi.createTimeSlot(timeSlotInput(values)),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Time slot was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateTimeSlotQueries(queryClient);
      showToast({ recordId: response.data.id, title: 'Time slot created', variant: 'success' });
      router.push('/masters/time-slots');
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = timeSlotSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createMutation.mutate(parsed.data);
  });

  const slotName = form.watch('slotName');

  return (
    <FormShell
      backHref="/masters/time-slots"
      icon={Clock3}
      subtitle="A window of the day that menu items can be sold in."
      title="Create Time Slot"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <TimeSlotFormFields form={form} />
        <div className="flex justify-end">
          <SubmitButton
            disabledReason={slotName.trim() ? undefined : 'Slot name is required.'}
            isPending={createMutation.isPending}
            label="Create Time Slot"
          />
        </div>
      </form>
    </FormShell>
  );
}
