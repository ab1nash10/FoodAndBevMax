import { strict as assert } from 'node:assert';
import type { Employee } from '@aahar/api-client';
import { test } from 'vitest';
import {
  emptyEmployeeFormValues,
  employeeSchema,
  employeeToFormValues,
  toEmployeeInput,
} from './shared';

const employee = {
  ...emptyEmployeeFormValues('h1'),
  employeeCode: ' E100 ',
  employeeName: ' Asha Rao ',
  employmentType: 'ON_ROLL' as const,
};
const messages = (values: object) =>
  employeeSchema.safeParse(values).error?.issues.map((issue) => [issue.path[0], issue.message]) ??
  [];

test('a new employee starts blank, active and eligible for staff discount', () => {
  assert.deepEqual(emptyEmployeeFormValues(), {
    birthDate: '',
    department: '',
    designation: '',
    eligibleForDiscount: true,
    employeeCode: '',
    employeeLevel: '',
    employeeName: '',
    employmentType: '',
    gender: '',
    hospitalId: '',
    isActive: true,
    joiningDate: '',
    legalEntityId: '',
    mobile: '',
    officialEmail: '',
    reportingManager: null,
  });
});

test('name and on-role / off-role are required, the code is not; text is trimmed', () => {
  assert.deepEqual(employeeSchema.parse(employee), {
    ...employee,
    employeeCode: 'E100',
    employeeName: 'Asha Rao',
  });
  assert.deepEqual(messages(emptyEmployeeFormValues()), [
    ['employeeName', 'Employee name is required.'],
    ['employmentType', 'Choose on-role or off-role.'],
  ]);
  assert.deepEqual(messages({ ...employee, mobile: '9'.repeat(21) }), [
    ['mobile', 'Use 20 characters or fewer.'],
  ]);
  assert.deepEqual(messages({ ...employee, officialEmail: 'asha@' }), [
    ['officialEmail', 'Enter a valid email address.'],
  ]);
});

test('the API gets blanks as null, no code when left empty, and the manager by id', () => {
  const values = employeeSchema.parse({
    ...employee,
    birthDate: '1990-04-12',
    employeeCode: '  ',
    gender: 'FEMALE',
    legalEntityId: 'entity-1',
    officialEmail: ' asha@maxhealthcare.com ',
    reportingManager: { employeeCode: 'E1', employeeName: 'Boss', id: 'boss' },
  });

  assert.deepEqual(toEmployeeInput(values), {
    birthDate: '1990-04-12',
    department: null,
    designation: null,
    eligibleForDiscount: true,
    employeeLevel: null,
    employeeName: 'Asha Rao',
    employmentType: 'ON_ROLL',
    gender: 'FEMALE',
    hospitalId: 'h1',
    isActive: true,
    joiningDate: null,
    legalEntityId: 'entity-1',
    mobile: null,
    officialEmail: 'asha@maxhealthcare.com',
    reportingManagerId: 'boss',
  });
  assert.equal(toEmployeeInput({ ...values, employeeCode: 'E100' }).employeeCode, 'E100');
});

test('a saved employee opens with their details, blanks for what they lack', () => {
  const saved = {
    birthDate: '1990-04-12',
    department: null,
    designation: 'Cook',
    eligibleForDiscount: false,
    employeeCode: 'E100',
    employeeLevel: null,
    employeeName: 'Asha Rao',
    employmentType: null,
    gender: 'FEMALE',
    hospitalId: null,
    id: 'e100',
    isActive: true,
    joiningDate: null,
    legalEntityId: null,
    mobile: null,
    officialEmail: null,
    reportingManager: { employeeCode: 'E1', employeeName: 'Boss', id: 'boss' },
    reportingManagerId: 'boss',
  } as unknown as Employee;

  assert.deepEqual(employeeToFormValues(saved), {
    birthDate: '1990-04-12',
    department: '',
    designation: 'Cook',
    eligibleForDiscount: false,
    employeeCode: 'E100',
    employeeLevel: '',
    employeeName: 'Asha Rao',
    employmentType: '',
    gender: 'FEMALE',
    hospitalId: '',
    isActive: true,
    joiningDate: '',
    legalEntityId: '',
    mobile: '',
    officialEmail: '',
    reportingManager: { employeeCode: 'E1', employeeName: 'Boss', id: 'boss' },
  });
});
