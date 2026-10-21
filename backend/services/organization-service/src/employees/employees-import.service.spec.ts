import { strict as assert } from 'node:assert';
import { EmploymentType } from '@prisma/client';
import { test } from 'vitest';
import type { EmployeeWithHospital } from './employees.repository';
import { planEmployeeImport, type EmployeeImportLookups } from './employees-import.service';

const saket = { hospitalCode: 'SKT', id: 'h-saket', isActive: true };
const vaishali = { hospitalCode: 'VSL', id: 'h-vaishali', isActive: true };
const shared = {
  department: 'Nursing',
  designation: null,
  eligibleForDiscount: true,
  employeeCode: 'EMP001',
  employeeName: 'Asha Rao',
  employmentType: EmploymentType.ON_ROLL,
  hospital: null,
  hospitalId: null,
  id: 'emp-1',
  isActive: true,
  mobile: null,
} as unknown as EmployeeWithHospital;
const lookups = (overrides: Partial<EmployeeImportLookups> = {}): EmployeeImportLookups => ({
  allowedHospitalIds: null,
  employees: [shared],
  hospitals: [saket, vaishali],
  usedCodes: new Set(['EMP001', 'EMP404']),
  ...overrides,
});
const everything = { permissions: ['EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE'] };
const row = (cells: Record<string, string>) => ({
  employeeName: 'Ravi Kumar',
  employmentType: 'On roll',
  ...cells,
});

test('the employee code decides add or update; blank cells keep what an employee has', async () => {
  const plan = await planEmployeeImport(
    [
      row({ employeeCode: 'emp001', employeeName: 'asha rao', designation: 'Staff Nurse' }),
      row({ employeeCode: 'EMP002', eligibleForDiscount: 'No', locationCode: 'skt' }),
      row({ employeeCode: 'EMP003', employmentType: 'outsourced' }),
    ],
    lookups(),
    everything,
  );

  assert.deepEqual(
    plan.rows.map((result) => result.action),
    ['update', 'create', 'create'],
  );
  assert.equal(plan.updates[0]?.data.designation, 'Staff Nurse');
  assert.equal(plan.updates[0]?.data.hospitalId, undefined, 'a blank location keeps it shared');
  assert.equal(plan.creates[0]?.hospitalId, 'h-saket');
  assert.equal(plan.creates[0]?.eligibleForDiscount, false);
  assert.equal(plan.creates[1]?.hospitalId, null, 'a new one with no location is shared');
  assert.equal(plan.creates[1]?.employmentType, EmploymentType.OUTSOURCED);
});

test('codes, locations and types are checked like the form does', async () => {
  const plan = await planEmployeeImport(
    [
      row({ employeeCode: 'EMP404' }),
      row({ employeeCode: 'EMP005', locationCode: 'XYZ', employmentType: 'Contract' }),
      row({ employeeCode: 'EMP006', employeeName: '', mobile: '9'.repeat(21) }),
      row({ employeeCode: 'EMP006' }),
    ],
    lookups(),
    everything,
  );

  assert.deepEqual(
    plan.rows.map((result) => result.errors),
    [
      ['Employee code EMP404 is already used'],
      ['No location has code XYZ', 'Employment type must be On roll or Outsourced'],
      ['Employee name is required', 'Mobile must be shorter than or equal to 20 characters'],
      ['Row 4 has the same Employee code'],
    ],
  );
});

test('a user limited to some locations works only with their own', async () => {
  const plan = await planEmployeeImport(
    [
      row({ employeeCode: 'EMP001' }),
      row({ employeeCode: 'EMP007' }),
      row({ employeeCode: 'EMP008', locationCode: 'VSL' }),
      row({ employeeCode: 'EMP009', locationCode: 'SKT' }),
    ],
    lookups({ allowedHospitalIds: ['h-saket'] }),
    everything,
  );

  assert.deepEqual(
    plan.rows.map((result) => result.errors),
    [
      ['Only a Super Admin can change employees shared by every location'],
      ['Fill in Location code: only a Super Admin can add employees shared by every location'],
      ['Location VSL is outside your assigned access'],
      [],
    ],
  );
});
