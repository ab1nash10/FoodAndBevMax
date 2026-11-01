import { strict as assert } from 'node:assert';
import { EmploymentType } from '@prisma/client';
import { test } from 'vitest';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { EmployeeWithHospital } from './employees.repository';
import {
  EmployeesImportService,
  planEmployeeImport,
  type EmployeeImportLookups,
} from './employees-import.service';

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

test('a row that changes nothing is skipped and needs no permission', async () => {
  const plan = await planEmployeeImport(
    [row({ department: 'Nursing', employeeCode: 'EMP001', employeeName: 'Asha Rao' })],
    lookups(),
    { permissions: [] },
  );

  assert.deepEqual(plan.rows, [{ action: 'skip', errors: [] }]);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.creates, []);
});

test('adding an employee needs the create permission and changing one the update permission', async () => {
  const rows = [
    row({ employeeCode: 'EMP001', mobile: '9999999999' }),
    row({ employeeCode: 'EMP020' }),
  ];

  const plan = await planEmployeeImport(rows, lookups(), { permissions: [] });

  assert.deepEqual(
    plan.rows.map((result) => result.errors),
    [
      ["You can't change employees; this row would change one"],
      ["You can't add employees; this row would add one"],
    ],
  );
  assert.equal(plan.updates.length + plan.creates.length, 0);
});

test('an inactive location and status or yes/no cells that fit no choice are refused', async () => {
  const plan = await planEmployeeImport(
    [
      row({
        eligibleForDiscount: 'perhaps',
        employeeCode: 'EMP021',
        isActive: 'Maybe',
        locationCode: 'old',
      }),
    ],
    lookups({ hospitals: [saket, { hospitalCode: 'OLD', id: 'h-old', isActive: false }] }),
    everything,
  );

  assert.deepEqual(plan.rows[0]?.errors, [
    'Location OLD is inactive',
    'Eligible for discount must be Yes or No',
    'Status must be Active or Inactive',
  ]);
});

test('Status and discount cells set a new employee; blank, they default to active and eligible', async () => {
  const plan = await planEmployeeImport(
    [
      row({ eligibleForDiscount: 'yes', employeeCode: 'EMP022', isActive: 'inactive' }),
      row({ employeeCode: 'EMP023' }),
    ],
    lookups(),
    everything,
  );

  assert.deepEqual(
    plan.creates.map(({ eligibleForDiscount, isActive }) => ({ eligibleForDiscount, isActive })),
    [
      { eligibleForDiscount: true, isActive: false },
      { eligibleForDiscount: true, isActive: true },
    ],
  );
});

// A fake Prisma for the import's reads and writes; `used` stands in for the raw code query.
function importServiceWith(employees: EmployeeWithHospital[], used: string[]) {
  const writes = {
    audits: [] as Array<{ action: string; createdBy?: string; entityId: string }>,
    created: [] as Array<Record<string, unknown>>,
    transactions: 0,
    updates: [] as Array<{ data: Record<string, unknown>; where: { id: string } }>,
  };
  const tx = {
    $queryRaw: () => used.map((code) => ({ code })),
    auditLog: {
      createMany: ({ data }: { data: typeof writes.audits }) => {
        writes.audits.push(...data);
      },
    },
    employee: {
      createManyAndReturn: ({ data }: { data: Array<Record<string, unknown>> }) => {
        writes.created.push(...data);
        return data.map((fields, index) => ({ ...fields, hospital: null, id: `new-${index}` }));
      },
      findMany: () => employees,
      update: (args: (typeof writes.updates)[number]) => {
        writes.updates.push(args);
        // As Prisma does, an undefined field leaves the stored value alone.
        const changed = Object.entries(args.data).filter(([, value]) => value !== undefined);
        return {
          ...employees.find((stored) => stored.id === args.where.id),
          ...Object.fromEntries(changed),
        };
      },
    },
    hospital: { findMany: () => [saket, vaishali] },
  };
  const prisma = {
    ...tx,
    $transaction: <T>(handler: (client: unknown) => T) => {
      writes.transactions += 1;
      return handler(tx);
    },
  };

  return { service: new EmployeesImportService(prisma as unknown as PrismaService), writes };
}

const second = { ...shared, employeeCode: 'EMP002', hospitalId: 'h-saket', id: 'emp-2' };
const importer = { actorId: 'user-1', ...everything };

test('a dry run reports what each row would do and saves nothing', async () => {
  const { service, writes } = importServiceWith([shared], ['EMP001']);

  const result = await service.import(
    {
      dryRun: true,
      rows: [
        row({ employeeCode: 'EMP001', isActive: 'Inactive' }),
        row({ employeeCode: 'EMP030', locationCode: 'SKT' }),
      ],
    },
    importer,
  );

  assert.deepEqual(
    { ...result, rows: undefined },
    { created: 1, imported: false, rows: undefined, skipped: 0, updated: 1 },
  );
  assert.equal(writes.transactions, 0);
  assert.equal(writes.created.length + writes.updates.length + writes.audits.length, 0);
});

test('one bad row and a real import saves nothing at all', async () => {
  const { service, writes } = importServiceWith([shared], ['EMP001']);

  const result = await service.import(
    {
      dryRun: false,
      rows: [row({ employeeCode: 'EMP030' }), row({ employeeCode: 'EMP031', employeeName: '' })],
    },
    importer,
  );

  assert.equal(result?.imported, false);
  assert.deepEqual(result?.rows[1]?.errors, ['Employee name is required']);
  assert.equal(writes.created.length + writes.updates.length + writes.audits.length, 0);
});

test('a real import adds and changes employees and logs each, a status change as one', async () => {
  const { service, writes } = importServiceWith([shared, second], ['EMP001', 'EMP002']);

  const result = await service.import(
    {
      dryRun: false,
      rows: [
        row({ employeeCode: 'EMP001', isActive: 'Inactive' }),
        row({ designation: 'Cook', employeeCode: 'EMP002' }),
        row({ employeeCode: 'EMP030', locationCode: 'SKT' }),
      ],
    },
    importer,
  );

  assert.deepEqual(
    { ...result, rows: undefined },
    { created: 1, imported: true, rows: undefined, skipped: 0, updated: 2 },
  );
  assert.equal(writes.transactions, 1, 'everything in one transaction');
  assert.deepEqual(
    writes.created.map(({ createdBy, employeeCode, hospitalId, isActive, updatedBy }) => ({
      createdBy,
      employeeCode,
      hospitalId,
      isActive,
      updatedBy,
    })),
    [
      {
        createdBy: 'user-1',
        employeeCode: 'EMP030',
        hospitalId: 'h-saket',
        isActive: true,
        updatedBy: 'user-1',
      },
    ],
  );
  assert.deepEqual(
    writes.updates.map(({ data, where }) => [
      where.id,
      data.isActive,
      data.designation,
      data.updatedBy,
    ]),
    [
      ['emp-1', false, undefined, 'user-1'],
      ['emp-2', undefined, 'Cook', 'user-1'],
    ],
  );
  assert.deepEqual(
    writes.audits.map(({ action, createdBy, entityId }) => [action, entityId, createdBy]),
    [
      ['EMPLOYEE_CREATE', 'new-0', 'user-1'],
      ['EMPLOYEE_STATUS_CHANGE', 'emp-1', 'user-1'],
      ['EMPLOYEE_UPDATE', 'emp-2', 'user-1'],
    ],
  );
});
