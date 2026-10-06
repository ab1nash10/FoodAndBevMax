'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { EmployeeInput } from '@aahar/api-client';
import { useToast } from '@/components/toast-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import { invalidateEmployeeQueries } from '@/lib/query-invalidation';
import {
  EmployeeFormFields,
  employeeSchema,
  emptyEmployeeFormValues,
  type EmployeeFormValues,
} from '@/components/master-data/employees/shared';
import { FormShell, SubmitButton } from '@/components/master-data/shared/components';
import { applyValidationErrors, optionalValue } from '@/components/master-data/shared/utils';

export function EmployeeCreatePageClient() {
  const form = useForm<EmployeeFormValues>({
    defaultValues: emptyEmployeeFormValues(),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createEmployeeMutation = useMutation({
    mutationFn: (body: EmployeeInput) => organizationApi.createEmployee(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Employee was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/employees', { name: response.data.employeeCode });
      invalidateEmployeeQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.employeeName}` },
        title: 'Employee created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  // Only the fields this reads, so typing elsewhere in the form does not re-render the page.
  const [employeeCode, employeeName] = form.watch(['employeeCode', 'employeeName']);
  const formValues = { employeeCode, employeeName };
  const canSubmit =
    Boolean(formValues.employeeCode?.trim()) && Boolean(formValues.employeeName?.trim());

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = employeeSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createEmployeeMutation.mutate({
      department: optionalValue(parsed.data.department),
      designation: optionalValue(parsed.data.designation),
      eligibleForDiscount: parsed.data.eligibleForDiscount,
      employeeCode: parsed.data.employeeCode,
      employeeName: parsed.data.employeeName,
      isActive: parsed.data.isActive,
      mobile: optionalValue(parsed.data.mobile),
    });
  });

  return (
    <FormShell
      backHref="/masters/employees"
      icon={UsersRound}
      subtitle="Create an employee record for future staff discount checks."
      title="Create Employee"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <EmployeeFormFields form={form} />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createEmployeeMutation.isPending}
            label="Create Employee"
          />
        </div>
      </form>
    </FormShell>
  );
}
