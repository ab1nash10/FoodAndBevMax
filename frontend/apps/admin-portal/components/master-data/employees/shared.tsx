'use client';

import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Field, FieldError, Input, RequiredMark } from '@/components/ui';
import { CheckboxLine } from '@/components/master-data/shared/components';
import { optionalText } from '@/components/master-data/shared/schemas';
import { MasterLocationSelect } from '@/components/master-location';

export const employeeSchema = z.object({
  department: optionalText(255),
  designation: optionalText(255),
  eligibleForDiscount: z.boolean(),
  employeeCode: z.string().trim().min(1, 'Employee code is required.').max(100),
  employeeName: z.string().trim().min(1, 'Employee name is required.').max(255),
  // Empty until chosen; employees saved before this field existed open with it empty too. (A
  // length check, not !== '', so the form type keeps the empty value.)
  employmentType: z
    .enum(['', 'ON_ROLL', 'OUTSOURCED'])
    .refine((value) => value.length > 0, 'Choose on roll or outsourced.'),
  /** Empty shares the employee with every location. */
  hospitalId: z.string(),
  isActive: z.boolean(),
  mobile: optionalText(20),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function emptyEmployeeFormValues(hospitalId = ''): EmployeeFormValues {
  return {
    department: '',
    designation: '',
    eligibleForDiscount: true,
    employeeCode: '',
    employeeName: '',
    employmentType: '',
    hospitalId,
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
          required
        >
          <Input id="employee-code" {...form.register('employeeCode')} />
        </Field>
        <Field
          error={form.formState.errors.employeeName?.message}
          label="Employee Name"
          name="employee-name"
          required
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={form.formState.errors.mobile?.message} label="Mobile" name="employee-mobile">
          <Input id="employee-mobile" inputMode="numeric" {...form.register('mobile')} />
        </Field>
        <Field label="Location" name="employee-location">
          <MasterLocationSelect id="employee-location" {...form.register('hospitalId')} />
        </Field>
      </div>
      <fieldset className="[&>*+*]:mt-2">
        <legend className="text-[13px] font-semibold leading-none text-ds-text-2">
          Employment Type
          <RequiredMark />
          <span className="sr-only"> (required)</span>
        </legend>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          {(
            [
              ['ON_ROLL', 'On roll'],
              ['OUTSOURCED', 'Outsourced'],
            ] as const
          ).map(([value, label]) => (
            <CheckboxLine
              input={
                <input
                  className="h-4 w-4"
                  type="radio"
                  value={value}
                  {...form.register('employmentType')}
                />
              }
              key={value}
            >
              {label}
            </CheckboxLine>
          ))}
        </div>
        <FieldError>{form.formState.errors.employmentType?.message}</FieldError>
      </fieldset>
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
