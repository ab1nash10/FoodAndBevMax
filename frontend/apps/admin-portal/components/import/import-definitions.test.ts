import type { Employee } from '@aahar/api-client';
import { expect, test } from 'vitest';
import { employeeExportColumns, employeeImport } from './import-definitions';

test('the employee export has the import’s columns, so an exported file imports back', () => {
  expect(employeeExportColumns.map((column) => column.header)).toEqual(
    employeeImport.columns.map((column) => column.header),
  );

  const employee = {
    birthDate: '1990-04-12',
    department: 'Nursing',
    designation: null,
    eligibleForDiscount: false,
    employeeCode: 'EMP020',
    employeeLevel: 'L2',
    employeeName: 'Ravi Kumar',
    employmentType: 'OUTSOURCED',
    gender: 'FEMALE',
    hospital: { hospitalCode: 'SKT' },
    isActive: true,
    joiningDate: null,
    mobile: '9876543210',
    officialEmail: 'ravi@maxhealthcare.com',
    reportingManager: { employeeCode: 'EMP010' },
  } as unknown as Employee;

  expect(
    Object.fromEntries(
      employeeExportColumns.map((column) => [column.header, column.value(employee)]),
    ),
  ).toEqual({
    'Birth date': '1990-04-12',
    Department: 'Nursing',
    Designation: null,
    'Eligible for discount': 'No',
    'Employee code': 'EMP020',
    'Employee level': 'L2',
    'Employee name': 'Ravi Kumar',
    'Employment type': 'Off-Role',
    Gender: 'Female',
    'Joining date': null,
    'Location code': 'SKT',
    Mobile: '9876543210',
    'Official email': 'ravi@maxhealthcare.com',
    'Reporting manager code': 'EMP010',
    Status: 'Active',
  });
});
