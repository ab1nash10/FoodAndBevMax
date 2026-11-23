'use client';

import { Button } from '@aahar/ui';
import type { Employee, EmployeeInput } from '@aahar/api-client';
import { useEffect, type ChangeEvent } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { Field, FieldError, Input, RequiredMark } from '@/components/ui';
import { CheckboxLine } from '@/components/master-data/shared/components';
import { optionalText } from '@/components/master-data/shared/schemas';
import { EmployeeSearch } from '@/components/master-data/employees/employee-search';
import { MasterLocationSelect } from '@/components/master-location';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import { LegalEntitySelect } from '@/components/organization/shared/legal-entity-select';
import { optionalEmail } from '@/components/organization/shared/schemas';

export const employeeSchema = z.object({
  /** YYYY-MM-DD from the date box; empty when not known. */
  birthDate: z.string(),
  department: optionalText(255),
  designation: optionalText(255),
  eligibleForDiscount: z.boolean(),
  /** Left empty, the server gives the next free EMP code. */
  employeeCode: optionalText(100),
  employeeLevel: optionalText(100),
  employeeName: z.string().trim().min(1, 'Employee name is required.').max(255),
  // Empty until chosen; employees saved before this field existed open with it empty too. (A
  // length check, not !== '', so the form type keeps the empty value.)
  employmentType: z
    .enum(['', 'ON_ROLL', 'OUTSOURCED'])
    .refine((value) => value.length > 0, 'Choose on-role or off-role.'),
  gender: z.enum(['', 'FEMALE', 'MALE']),
  /** Empty shares the employee with every location. */
  hospitalId: z.string(),
  isActive: z.boolean(),
  joiningDate: z.string(),
  /** Starts as the location's entity. */
  legalEntityId: z.string(),
  mobile: optionalText(20),
  officialEmail: optionalEmail,
  /** Kept whole so the form can show who was picked. */
  reportingManager: z
    .object({ employeeCode: z.string(), employeeName: z.string(), id: z.string() })
    .nullable(),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function emptyEmployeeFormValues(hospitalId = ''): EmployeeFormValues {
  return {
    birthDate: '',
    department: '',
    designation: '',
    eligibleForDiscount: true,
    employeeCode: '',
    employeeLevel: '',
    employeeName: '',
    employmentType: '',
    gender: '',
    hospitalId,
    isActive: true,
    joiningDate: '',
    legalEntityId: '',
    mobile: '',
    officialEmail: '',
    reportingManager: null,
  };
}

export function employeeToFormValues(employee: Employee): EmployeeFormValues {
  return {
    birthDate: employee.birthDate ?? '',
    department: employee.department ?? '',
    designation: employee.designation ?? '',
    eligibleForDiscount: employee.eligibleForDiscount,
    employeeCode: employee.employeeCode,
    employeeLevel: employee.employeeLevel ?? '',
    employeeName: employee.employeeName,
    employmentType: employee.employmentType ?? '',
    gender: employee.gender ?? '',
    hospitalId: employee.hospitalId ?? '',
    isActive: employee.isActive,
    joiningDate: employee.joiningDate ?? '',
    legalEntityId: employee.legalEntityId ?? '',
    mobile: employee.mobile ?? '',
    officialEmail: employee.officialEmail ?? '',
    reportingManager: employee.reportingManager,
  };
}

/**
 * Parsed form values as the API takes them. Blanks go as null, so an edit clears them; a blank
 * code is left out, so a new employee gets one made and a saved one keeps theirs.
 */
export function toEmployeeInput(values: EmployeeFormValues): EmployeeInput {
  const blankAsNull = (value: string) => value || null;

  return {
    birthDate: blankAsNull(values.birthDate),
    department: blankAsNull(values.department),
    designation: blankAsNull(values.designation),
    eligibleForDiscount: values.eligibleForDiscount,
    ...(values.employeeCode ? { employeeCode: values.employeeCode } : {}),
    employeeLevel: blankAsNull(values.employeeLevel),
    employeeName: values.employeeName,
    employmentType: values.employmentType || undefined,
    gender: values.gender || null,
    hospitalId: blankAsNull(values.hospitalId),
    isActive: values.isActive,
    joiningDate: blankAsNull(values.joiningDate),
    legalEntityId: blankAsNull(values.legalEntityId),
    mobile: blankAsNull(values.mobile),
    officialEmail: blankAsNull(values.officialEmail),
    reportingManagerId: values.reportingManager?.id ?? null,
  };
}

function RadioGroup({
  error,
  form,
  name,
  options,
  required = false,
  title,
}: Readonly<{
  error?: string;
  form: UseFormReturn<EmployeeFormValues>;
  name: 'employmentType' | 'gender';
  options: ReadonlyArray<readonly [string, string]>;
  required?: boolean;
  title: string;
}>) {
  return (
    <fieldset className="[&>*+*]:mt-2">
      <legend className="text-[13px] font-semibold leading-none text-ds-text-2">
        {title}
        {required ? (
          <>
            <RequiredMark />
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </legend>
      <div className="grid grid-cols-2 gap-3 pt-2">
        {options.map(([value, label]) => (
          <CheckboxLine
            input={
              <input className="h-4 w-4" type="radio" value={value} {...form.register(name)} />
            }
            key={value}
          >
            {label}
          </CheckboxLine>
        ))}
      </div>
      <FieldError>{error}</FieldError>
    </fieldset>
  );
}

/** Search employees by name or code and pick one; the employee being edited is never offered. */
function ReportingManagerField({
  employeeId,
  form,
}: Readonly<{ employeeId?: string; form: UseFormReturn<EmployeeFormValues> }>) {
  const manager = form.watch('reportingManager');
  const hospitalId = form.watch('hospitalId');

  if (manager) {
    return (
      <Field label="Reporting manager" name="employee-manager">
        <div className="flex gap-2">
          <Input
            id="employee-manager"
            readOnly
            value={`${manager.employeeName} (${manager.employeeCode})`}
          />
          <Button
            onClick={() => form.setValue('reportingManager', null, { shouldDirty: true })}
            type="button"
            variant="outline"
          >
            Clear
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <EmployeeSearch
      excludeId={employeeId}
      hospitalId={hospitalId}
      id="employee-manager"
      label="Reporting manager"
      onPick={(match) =>
        form.setValue(
          'reportingManager',
          { employeeCode: match.employeeCode, employeeName: match.employeeName, id: match.id },
          { shouldDirty: true },
        )
      }
    />
  );
}

export function EmployeeFormFields({
  employeeId,
  form,
}: Readonly<{
  /** The employee being edited, so they are not offered as their own manager. */
  employeeId?: string;
  form: UseFormReturn<EmployeeFormValues>;
}>) {
  const errors = form.formState.errors;
  const hospitalId = form.watch('hospitalId');
  const hospitalOptionsQuery = useHospitalOptions();
  // The entity follows the location, as for restaurants and POS devices, unless another is chosen.
  const locationEntityId = (id: string) =>
    hospitalOptionsQuery.data?.find((hospital) => hospital.id === id)?.legalEntityId ?? '';
  const startingEntityId = locationEntityId(hospitalId);

  // Also when the location came from the scope (no change event) or loaded after it was picked.
  useEffect(() => {
    if (
      startingEntityId &&
      !form.getValues('legalEntityId') &&
      !form.getFieldState('legalEntityId').isDirty
    ) {
      form.setValue('legalEntityId', startingEntityId);
    }
  }, [form, startingEntityId]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={errors.employeeName?.message}
          label="Employee name"
          name="employee-name"
          required
        >
          <Input id="employee-name" {...form.register('employeeName')} />
        </Field>
        <Field error={errors.employeeCode?.message} label="Employee code" name="employee-code">
          <Input
            id="employee-code"
            placeholder="Left empty, one is made (EMP0001)"
            {...form.register('employeeCode')}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.officialEmail?.message} label="Official email" name="employee-email">
          <Input id="employee-email" type="email" {...form.register('officialEmail')} />
        </Field>
        <Field error={errors.mobile?.message} label="Mobile" name="employee-mobile">
          <Input id="employee-mobile" inputMode="numeric" {...form.register('mobile')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.birthDate?.message} label="Birth date" name="employee-birth-date">
          <Input id="employee-birth-date" type="date" {...form.register('birthDate')} />
        </Field>
        <Field
          error={errors.joiningDate?.message}
          label="Joining date"
          name="employee-joining-date"
        >
          <Input id="employee-joining-date" type="date" {...form.register('joiningDate')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <RadioGroup
          error={errors.employmentType?.message}
          form={form}
          name="employmentType"
          options={[
            ['ON_ROLL', 'On-Role'],
            ['OUTSOURCED', 'Off-Role'],
          ]}
          required
          title="Employment type"
        />
        <RadioGroup
          error={errors.gender?.message}
          form={form}
          name="gender"
          options={[
            ['MALE', 'Male'],
            ['FEMALE', 'Female'],
          ]}
          title="Gender"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.designation?.message} label="Designation" name="employee-designation">
          <Input id="employee-designation" {...form.register('designation')} />
        </Field>
        <Field error={errors.department?.message} label="Department" name="employee-department">
          <Input id="employee-department" {...form.register('department')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.employeeLevel?.message} label="Employee level" name="employee-level">
          <Input id="employee-level" {...form.register('employeeLevel')} />
        </Field>
        <ReportingManagerField employeeId={employeeId} form={form} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" name="employee-location">
          <MasterLocationSelect
            id="employee-location"
            {...form.register('hospitalId', {
              onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                const entityId = form.getValues('legalEntityId');

                if (!entityId || entityId === locationEntityId(hospitalId)) {
                  form.setValue('legalEntityId', locationEntityId(event.target.value));
                }
              },
            })}
          />
        </Field>
        <Field error={errors.legalEntityId?.message} label="Entity" name="employee-entity">
          <LegalEntitySelect
            id="employee-entity"
            value={form.watch('legalEntityId')}
            {...form.register('legalEntityId')}
          />
        </Field>
      </div>
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
