'use client';

import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Field, Input } from '@/components/ui';
import { CheckboxLine } from '@/components/master-data/shared/components';
import { optionalText } from '@/components/master-data/shared/schemas';

export const employeeSchema = z.object({
  department: optionalText(255),
  designation: optionalText(255),
  eligibleForDiscount: z.boolean(),
  employeeCode: z.string().trim().min(1, 'Employee code is required.').max(100),
  employeeName: z.string().trim().min(1, 'Employee name is required.').max(255),
  isActive: z.boolean(),
  mobile: optionalText(20),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function emptyEmployeeFormValues(): EmployeeFormValues {
  return {
    department: '',
    designation: '',
    eligibleForDiscount: true,
    employeeCode: '',
    employeeName: '',
    isActive: true,
    mobile: '',
  };
}

export function EmployeeFormFields({
  form,
}: Readonly<{ form: UseFormReturn<EmployeeFormValues> }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.employeeCode?.message}
          label="Employee Code"
          name="employee-code"
        >
          <Input id="employee-code" {...form.register('employeeCode')} />
        </Field>
        <Field
          error={form.formState.errors.employeeName?.message}
          label="Employee Name"
          name="employee-name"
        >
          <Input id="employee-name" {...form.register('employeeName')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.department?.message}
          label="Department"
          name="employee-department"
        >
          <Input id="employee-department" {...form.register('department')} />
        </Field>
        <Field
          error={form.formState.errors.designation?.message}
          label="Designation"
          name="employee-designation"
        >
          <Input id="employee-designation" {...form.register('designation')} />
        </Field>
      </div>
      <Field error={form.formState.errors.mobile?.message} label="Mobile" name="employee-mobile">
        <Input id="employee-mobile" inputMode="numeric" {...form.register('mobile')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxLine
          input={
            <input className="h-4 w-4" type="checkbox" {...form.register('eligibleForDiscount')} />
          }
        >
          Eligible For Discount
        </CheckboxLine>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </div>
    </>
  );
}
