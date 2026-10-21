'use client';

import type { EmploymentType, StaffDiscountInput } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Skeleton } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { applyValidationErrors } from '@/components/organization/shared/utils';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const employmentTypeLabels: Record<EmploymentType, string> = {
  ON_ROLL: 'On-roll employees',
  OUTSOURCED: 'Outsourced staff',
};
const employmentTypes = Object.keys(employmentTypeLabels) as EmploymentType[];

const percentSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter a percentage with up to 2 decimals.')
  .transform(Number)
  .refine((value) => value <= 100, 'Use 100% or less.');

// One flat field per employee type, so a validation error lands on its own input.
const staffDiscountSchema = z.object({
  ON_ROLL: percentSchema,
  OUTSOURCED: percentSchema,
  staffDiscountApplicable: z.boolean(),
});

type StaffDiscountFormValues = Record<EmploymentType, string> & {
  staffDiscountApplicable: boolean;
};

/**
 * A restaurant's staff discount: whether it gives one, and the % per employee type. The POS
 * takes it off discountable menu items for eligible employees looked up by Employee ID.
 */
export function StaffDiscountPanel({
  onClose,
  restaurant,
}: Readonly<{
  onClose: () => void;
  /** The restaurant being set; null keeps the panel closed. */
  restaurant: { id: string; restaurantName: string } | null;
}>) {
  const formId = useId();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('RESTAURANT_UPDATE');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const form = useForm<StaffDiscountFormValues>({
    defaultValues: { ON_ROLL: '0', OUTSOURCED: '0', staffDiscountApplicable: false },
  });
  const isApplicable = form.watch('staffDiscountApplicable');

  const settingsQuery = useQuery({
    enabled: Boolean(restaurant),
    queryFn: async () => (await organizationApi.getStaffDiscounts(restaurant!.id)).data,
    queryKey: queryKeys.staffDiscounts(restaurant?.id),
  });

  useEffect(() => {
    const settings = settingsQuery.data;

    if (!settings) {
      return;
    }

    const rateOf = (type: EmploymentType) =>
      String(settings.rates.find((rate) => rate.employmentType === type)?.discountPercent ?? 0);

    form.reset({
      ON_ROLL: rateOf('ON_ROLL'),
      OUTSOURCED: rateOf('OUTSOURCED'),
      staffDiscountApplicable: settings.staffDiscountApplicable,
    });
  }, [form, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (body: StaffDiscountInput) =>
      organizationApi.setStaffDiscounts(restaurant!.id, body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Staff discount was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      // The restaurant's own detail is left alone: refetching it would reset an open edit form.
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffDiscounts() });
      showToast({
        title: `Staff discount saved for ${response.data.restaurantName}`,
        variant: 'success',
      });
      onClose();
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = staffDiscountSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveMutation.mutate({
      rates: employmentTypes.map((employmentType) => ({
        discountPercent: parsed.data[employmentType],
        employmentType,
      })),
      staffDiscountApplicable: parsed.data.staffDiscountApplicable,
    });
  });

  return (
    <Modal
      description={restaurant?.restaurantName}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit ? (
            <Button
              disabled={saveMutation.isPending || !settingsQuery.data}
              form={formId}
              type="submit"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open={restaurant !== null}
      side
      title="Staff discount"
    >
      {settingsQuery.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-control" />
          <Skeleton className="h-32" />
        </div>
      ) : settingsQuery.isError ? (
        <p className="text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(settingsQuery.error)}
        </p>
      ) : (
        <form
          className="grid gap-5"
          id={formId}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <Toggle
            checked={isApplicable}
            disabled={!canEdit}
            label="Give staff discount at this restaurant"
            onChange={(checked) =>
              form.setValue('staffDiscountApplicable', checked, { shouldDirty: true })
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {employmentTypes.map((type) => (
              <Field
                error={form.formState.errors[type]?.message}
                key={type}
                label={employmentTypeLabels[type]}
                name={`${formId}-${type}`}
              >
                <div className="relative">
                  <Input
                    className="pr-8"
                    disabled={!canEdit || !isApplicable}
                    id={`${formId}-${type}`}
                    inputMode="decimal"
                    {...form.register(type)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ds-muted">
                    %
                  </span>
                </div>
              </Field>
            ))}
          </div>
          <p className="text-sm text-ds-muted">
            Applies to menu items marked discountable, for employees marked eligible in the
            Employees master.
          </p>
        </form>
      )}
    </Modal>
  );
}
