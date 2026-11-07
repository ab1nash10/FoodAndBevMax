import { strict as assert } from 'node:assert';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { hospitalScopeStorage } from '@aahar/auth';
import { EmploymentType, Gender, Prisma } from '@prisma/client';
import { test } from 'vitest';
import type { AuditLogService } from '../common/audit/audit-log.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

type StoredEmployee = {
  birthDate: Date | null;
  createdAt: Date;
  createdBy?: string;
  deletedAt: Date | null;
  department: string | null;
  designation: string | null;
  eligibleForDiscount: boolean;
  employeeCode: string;
  employeeLevel: string | null;
  employeeName: string;
  employmentType: EmploymentType | null;
  gender: Gender | null;
  hospitalId: string | null;
  id: string;
  isActive: boolean;
  joiningDate: Date | null;
  legalEntityId: string | null;
  mobile: string | null;
  officialEmail: string | null;
  reportingManagerId: string | null;
  updatedAt: Date;
  updatedBy?: string;
};

type AuditEntry = {
  action: string;
  actorId?: string;
  entityId: string;
  newValue?: Record<string, unknown>;
  oldValue?: Record<string, unknown>;
};

type Link = { connect?: { id: string }; disconnect?: true };
type EmployeeUpdate = Partial<StoredEmployee> & {
  hospital?: Link;
  legalEntity?: Link;
  reportingManager?: Link;
};

// The where shapes the repository sends: equality, null, and { not: id }.
const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) =>
    value !== null && typeof value === 'object' && 'not' in value
      ? row[key] !== value.not
      : row[key] === value,
  );

// A fake Prisma under the real repository: employees in memory, hospitals as id → isActive.
function serviceWith(world: {
  /** What saving a new employee throws, as the database would. */
  createError?: Error;
  employees?: StoredEmployee[];
  /** Entities as id → isActive. */
  entities?: Record<string, boolean>;
  hospitals?: Record<string, boolean>;
}) {
  let sequence = 0;
  const employees = world.employees ?? [];
  const hospitals = world.hospitals ?? {};
  const audits: AuditEntry[] = [];
  const queries = { count: [] as unknown[], findMany: [] as unknown[], updates: [] as unknown[] };
  const withHospital = (employee: StoredEmployee) => ({
    ...employee,
    hospital: employee.hospitalId
      ? {
          hospitalCode: employee.hospitalId.toUpperCase(),
          hospitalName: employee.hospitalId,
          id: employee.hospitalId,
          isActive: hospitals[employee.hospitalId] ?? false,
        }
      : null,
    reportingManager: managerOf(employee),
  });
  const managerOf = (employee: StoredEmployee) => {
    const manager = employees.find((stored) => stored.id === employee.reportingManagerId);
    return manager
      ? { employeeCode: manager.employeeCode, employeeName: manager.employeeName, id: manager.id }
      : null;
  };
  const tx = {
    $queryRawUnsafe: () => [{ nextValue: BigInt(++sequence) }],
    employee: {
      count: (args: unknown) => {
        queries.count.push(args);
        return employees.length;
      },
      create: ({ data }: { data: Omit<StoredEmployee, 'createdAt' | 'deletedAt' | 'id'> }) => {
        if (world.createError) {
          throw world.createError;
        }
        const employee = {
          ...data,
          createdAt: now,
          deletedAt: null,
          id: `emp-${employees.length + 1}`,
          updatedAt: now,
        };
        employees.push(employee);
        return withHospital(employee);
      },
      findFirst: ({ where }: { where: Record<string, unknown> }) => {
        const found = employees.find((employee) => matches(employee, where));
        return found ? withHospital(found) : null;
      },
      findMany: (args: unknown) => {
        queries.findMany.push(args);
        return employees.map(withHospital);
      },
      update: ({ data, where }: { data: EmployeeUpdate; where: { id: string } }) => {
        queries.updates.push(data);
        const employee = employees.find((stored) => stored.id === where.id)!;
        const { hospital, legalEntity, reportingManager, ...fields } = data;
        Object.assign(employee, fields);
        if (hospital) employee.hospitalId = hospital.connect?.id ?? null;
        if (legalEntity) employee.legalEntityId = legalEntity.connect?.id ?? null;
        if (reportingManager) employee.reportingManagerId = reportingManager.connect?.id ?? null;
        return withHospital(employee);
      },
    },
    hospital: {
      findFirst: ({ where }: { where: { id: string } }) =>
        where.id in hospitals ? { isActive: hospitals[where.id] } : null,
    },
    legalEntity: {
      findFirst: ({ where }: { where: { id: string } }) =>
        world.entities?.[where.id] ? { id: where.id } : null,
    },
  };
  const prisma = { ...tx, $transaction: <T>(handler: (client: unknown) => T) => handler(tx) };
  const service = new EmployeesService(
    {
      record: (entry: AuditEntry) => {
        audits.push(entry);
        return Promise.resolve();
      },
    } as unknown as AuditLogService,
    new EmployeesRepository(prisma as unknown as PrismaService),
  );

  return { audits, employees, queries, service };
}

const now = new Date('2026-10-01T00:00:00Z');
const actor = { actorId: 'user-1', ipAddress: '127.0.0.1' };
const employee = (id: string, overrides: Partial<StoredEmployee> = {}): StoredEmployee => ({
  birthDate: null,
  createdAt: now,
  deletedAt: null,
  department: 'Nursing',
  designation: null,
  eligibleForDiscount: true,
  employeeCode: id.toUpperCase(),
  employeeLevel: null,
  employeeName: id,
  employmentType: EmploymentType.ON_ROLL,
  gender: null,
  hospitalId: 'saket',
  id,
  isActive: true,
  joiningDate: null,
  legalEntityId: null,
  mobile: null,
  officialEmail: null,
  reportingManagerId: null,
  updatedAt: now,
  ...overrides,
});
const newEmployee = {
  employeeCode: 'EMP100',
  employeeName: 'Ravi Kumar',
  employmentType: EmploymentType.OUTSOURCED,
};
// A user limited to some locations, as the hospital scope guard sets one up.
const limitedTo = <T>(ids: string[], work: () => Promise<T>) =>
  hospitalScopeStorage.run({ allowedHospitalIds: ids }, work);
const refused = (type: new (...args: never[]) => Error, message: string) => (error: unknown) =>
  error instanceof type && error.message === message;

test('the list filters live employees by location, status, discount and search, then pages', async () => {
  const { queries, service } = serviceWith({ employees: [employee('e1', { createdBy: 'x' })] });

  const result = await service.list({
    eligibleForDiscount: false,
    hospitalId: 'saket',
    isActive: true,
    limit: 10,
    page: 3,
    search: 'nur',
    sortBy: 'employeeName',
    sortOrder: 'asc',
  });

  const args = queries.findMany[0] as {
    orderBy: unknown;
    skip: number;
    take: number;
    where: unknown;
  };
  const where = {
    // The location filter sits under AND so the search's OR doesn't replace it.
    AND: [{ OR: [{ hospitalId: null }, { hospitalId: 'saket' }] }],
    deletedAt: null,
    eligibleForDiscount: false,
    isActive: true,
    OR: ['department', 'designation', 'employeeCode', 'employeeName', 'mobile'].map((field) => ({
      [field]: { contains: 'nur', mode: 'insensitive' },
    })),
  };
  assert.deepEqual(args.where, where);
  assert.deepEqual(args.orderBy, [{ employeeName: 'asc' }, { id: 'asc' }]);
  assert.equal(args.skip, 20);
  assert.equal(args.take, 10);
  assert.deepEqual(queries.count[0], { where }, 'the total counts the same rows');
  assert.deepEqual(result.meta, { limit: 10, page: 3, total: 1, totalPages: 1 });
  assert.equal(result.items[0]?.employeeCode, 'E1');
  assert.equal('createdBy' in (result.items[0] ?? {}), false, 'audit columns stay out');
});

test('with no filters the list shows every live employee, newest first, 20 a page', async () => {
  const { queries, service } = serviceWith({});

  await service.list({});

  const args = queries.findMany[0] as Record<string, unknown>;
  assert.deepEqual(args.where, { deletedAt: null });
  assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(args.skip, 0);
  assert.equal(args.take, 20);
});

test('an employee is read with their location; a deleted or unknown one is not found', async () => {
  const { service } = serviceWith({
    employees: [employee('e1'), employee('gone', { deletedAt: now })],
    hospitals: { saket: true },
  });

  const found = await service.getById('e1');
  assert.equal(found.hospital?.hospitalCode, 'SAKET');
  assert.equal(found.employmentType, EmploymentType.ON_ROLL);

  for (const id of ['gone', 'nobody']) {
    await assert.rejects(service.getById(id), refused(NotFoundException, 'Employee not found'));
  }
});

test('a code validates only for a live, active employee', async () => {
  const { service } = serviceWith({
    employees: [
      employee('e1', { designation: 'Staff Nurse', mobile: '9999999999' }),
      employee('off', { isActive: false }),
      employee('gone', { deletedAt: now }),
    ],
  });

  assert.deepEqual(await service.validateByCode('E1'), {
    department: 'Nursing',
    designation: 'Staff Nurse',
    eligibleForDiscount: true,
    employeeCode: 'E1',
    employeeId: 'e1',
    employeeName: 'e1',
    isActive: true,
    mobile: '9999999999',
  });

  for (const code of ['OFF', 'GONE', 'NOBODY']) {
    await assert.rejects(
      service.validateByCode(code),
      refused(NotFoundException, 'Employee not found or inactive'),
    );
  }
});

test('a new employee with no location is shared, active and eligible for discount by default', async () => {
  const { audits, employees, service } = serviceWith({});

  const created = await service.create(newEmployee, actor);

  assert.equal(created?.hospitalId, null);
  assert.equal(created?.isActive, true);
  assert.equal(created?.eligibleForDiscount, true);
  assert.equal(created?.employmentType, EmploymentType.OUTSOURCED);
  assert.equal(employees[0]?.createdBy, 'user-1');
  assert.equal(employees[0]?.updatedBy, 'user-1');
  assert.deepEqual(
    audits.map(({ action, actorId, entityId }) => ({ action, actorId, entityId })),
    [{ action: 'EMPLOYEE_CREATE', actorId: 'user-1', entityId: created?.id }],
  );
  assert.deepEqual(audits[0]?.newValue, created);
});

test('a new employee keeps the status, discount and location given', async () => {
  const { service } = serviceWith({ hospitals: { saket: true } });

  const created = await service.create(
    { ...newEmployee, eligibleForDiscount: false, hospitalId: 'saket', isActive: false },
    actor,
  );

  assert.equal(created?.hospitalId, 'saket');
  assert.equal(created?.isActive, false);
  assert.equal(created?.eligibleForDiscount, false);
});

test('a new employee needs a live location and a code no employee ever had', async () => {
  const { audits, employees, service } = serviceWith({
    // A deleted employee's code stays taken.
    employees: [employee('gone', { deletedAt: now, employeeCode: 'EMP100' })],
    hospitals: { closed: false, saket: true },
  });

  for (const hospitalId of ['closed', 'nowhere']) {
    await assert.rejects(
      service.create({ ...newEmployee, employeeCode: 'EMP200', hospitalId }, actor),
      refused(BadRequestException, 'Location not found or inactive'),
    );
  }
  await assert.rejects(
    service.create({ ...newEmployee, hospitalId: 'saket' }, actor),
    refused(ConflictException, 'Employee code already exists'),
  );
  assert.equal(employees.length, 1, 'nothing saved');
  assert.equal(audits.length, 0);
});

test('a user limited to some locations adds employees only at a location, not shared ones', async () => {
  const { employees, service } = serviceWith({ hospitals: { saket: true } });

  await limitedTo(['saket'], async () => {
    await assert.rejects(
      service.create(newEmployee, actor),
      refused(
        ForbiddenException,
        'Only a Super Admin can change employees shared by every location',
      ),
    );
    await service.create({ ...newEmployee, hospitalId: 'saket' }, actor);
  });

  assert.deepEqual(
    employees.map((stored) => stored.hospitalId),
    ['saket'],
  );
});

test('a new employee left without a code gets the next free EMP code', async () => {
  const { employees, service } = serviceWith({
    // Typed in by hand earlier, so the generator steps past it.
    employees: [employee('typed', { employeeCode: 'EMP0001' })],
  });

  const first = await service.create({ ...newEmployee, employeeCode: undefined }, actor);
  const second = await service.create({ ...newEmployee, employeeCode: undefined }, actor);

  assert.equal(first?.employeeCode, 'EMP0002');
  assert.equal(second?.employeeCode, 'EMP0003');
  assert.equal(employees.length, 3);
});

test('a new employee keeps their email, gender, dates, level, entity and manager', async () => {
  const { service } = serviceWith({
    employees: [employee('boss')],
    entities: { 'max-smart': true },
    hospitals: { saket: true },
  });

  const created = await service.create(
    {
      ...newEmployee,
      birthDate: '1990-04-12',
      employeeLevel: 'L2',
      gender: Gender.FEMALE,
      hospitalId: 'saket',
      joiningDate: '2024-01-15',
      legalEntityId: 'max-smart',
      officialEmail: 'ravi.kumar@maxhealthcare.com',
      reportingManagerId: 'boss',
    },
    actor,
  );

  assert.deepEqual(
    {
      birthDate: created?.birthDate,
      employeeLevel: created?.employeeLevel,
      gender: created?.gender,
      joiningDate: created?.joiningDate,
      legalEntityId: created?.legalEntityId,
      officialEmail: created?.officialEmail,
      reportingManager: created?.reportingManager,
    },
    {
      // Dates come back as the day alone, as the date boxes take them.
      birthDate: '1990-04-12',
      employeeLevel: 'L2',
      gender: Gender.FEMALE,
      joiningDate: '2024-01-15',
      legalEntityId: 'max-smart',
      officialEmail: 'ravi.kumar@maxhealthcare.com',
      reportingManager: { employeeCode: 'BOSS', employeeName: 'boss', id: 'boss' },
    },
  );
});

test('the entity must be active and the manager a current employee', async () => {
  const { employees, service } = serviceWith({
    employees: [employee('gone', { deletedAt: now })],
    entities: { closed: false },
  });

  await assert.rejects(
    service.create({ ...newEmployee, legalEntityId: 'closed' }, actor),
    refused(BadRequestException, 'Choose an active entity'),
  );
  for (const reportingManagerId of ['gone', 'nobody']) {
    await assert.rejects(
      service.create({ ...newEmployee, reportingManagerId }, actor),
      refused(BadRequestException, 'Choose a reporting manager who is a current employee.'),
    );
  }
  assert.equal(employees.length, 1, 'nothing saved');
});

test('nobody reports to themselves or to someone below them; a manager can be cleared', async () => {
  const { employees, service } = serviceWith({
    employees: [
      employee('head'),
      employee('lead', { reportingManagerId: 'head' }),
      employee('staff', { reportingManagerId: 'lead' }),
    ],
  });
  const loop = refused(
    BadRequestException,
    'An employee cannot report to themselves or to someone who reports to them.',
  );

  await assert.rejects(service.update('head', { reportingManagerId: 'head' }, actor), loop);
  await assert.rejects(service.update('head', { reportingManagerId: 'staff' }, actor), loop);

  await service.update('staff', { reportingManagerId: 'head' }, actor);
  await service.update('lead', { reportingManagerId: null }, actor);
  assert.deepEqual(
    employees.map((stored) => stored.reportingManagerId),
    [null, null, 'head'],
  );
});

test('a duplicate code the database catches is a conflict; other failures pass through', async () => {
  const duplicate = new Prisma.PrismaClientKnownRequestError('unique', {
    clientVersion: 'test',
    code: 'P2002',
  });
  await assert.rejects(
    serviceWith({ createError: duplicate }).service.create(newEmployee, actor),
    refused(ConflictException, 'Employee already exists'),
  );

  const broken = new Error('connection lost');
  await assert.rejects(
    serviceWith({ createError: broken }).service.create(newEmployee, actor),
    (error) => error === broken,
  );
});

test('an update changes only the fields given and logs old and new values', async () => {
  const { audits, queries, service } = serviceWith({ employees: [employee('e1')] });

  const updated = await service.update(
    'e1',
    {
      department: 'Kitchen',
      designation: 'Cook',
      eligibleForDiscount: false,
      employeeName: 'Ravi K',
      employmentType: EmploymentType.OUTSOURCED,
      mobile: '9876543210',
    },
    actor,
  );

  assert.deepEqual(queries.updates[0], {
    department: 'Kitchen',
    designation: 'Cook',
    eligibleForDiscount: false,
    employeeName: 'Ravi K',
    employmentType: EmploymentType.OUTSOURCED,
    mobile: '9876543210',
    updatedBy: 'user-1',
  });
  assert.equal(updated?.employeeCode, 'E1', 'untouched fields stay');
  assert.equal(audits[0]?.action, 'EMPLOYEE_UPDATE');
  assert.equal(audits[0]?.oldValue?.department, 'Nursing');
  assert.equal(audits[0]?.newValue?.department, 'Kitchen');
});

test('an update with nothing to change writes nothing but is still logged', async () => {
  const { audits, queries, service } = serviceWith({ employees: [employee('e1')] });

  const updated = await service.update('e1', {}, actor);

  assert.equal(queries.updates.length, 0);
  assert.equal(updated?.id, 'e1');
  assert.equal(audits[0]?.action, 'EMPLOYEE_UPDATE');
  assert.deepEqual(audits[0]?.newValue, audits[0]?.oldValue);
});

test('switching an employee on or off is logged as a status change', async () => {
  const { audits, service } = serviceWith({ employees: [employee('e1')] });

  await service.update('e1', { isActive: false }, actor);
  await service.update('e1', { isActive: false }, actor);
  await service.update('e1', { isActive: true }, actor);

  assert.deepEqual(
    audits.map((entry) => entry.action),
    ['EMPLOYEE_STATUS_CHANGE', 'EMPLOYEE_UPDATE', 'EMPLOYEE_STATUS_CHANGE'],
  );
});

test("an employee may keep their own code but not take another employee's", async () => {
  const { service } = serviceWith({ employees: [employee('e1'), employee('e2')] });

  await service.update('e1', { employeeCode: 'E1' }, actor);
  await assert.rejects(
    service.update('e1', { employeeCode: 'E2' }, actor),
    refused(ConflictException, 'Employee code already exists'),
  );
});

test('an employee moves between live locations or becomes shared', async () => {
  const { queries, service } = serviceWith({
    employees: [employee('e1')],
    hospitals: { closed: false, saket: true, vaishali: true },
  });

  assert.equal(
    (await service.update('e1', { hospitalId: 'vaishali' }, actor))?.hospitalId,
    'vaishali',
  );
  assert.deepEqual((queries.updates[0] as EmployeeUpdate).hospital, {
    connect: { id: 'vaishali' },
  });

  assert.equal((await service.update('e1', { hospitalId: null }, actor))?.hospitalId, null);
  assert.deepEqual((queries.updates[1] as EmployeeUpdate).hospital, { disconnect: true });

  await assert.rejects(
    service.update('e1', { hospitalId: 'closed' }, actor),
    refused(BadRequestException, 'Location not found or inactive'),
  );

  // Leaving the location out keeps it: no hospital change is written.
  await service.update('e1', { mobile: '1' }, actor);
  assert.equal('hospital' in (queries.updates[2] as EmployeeUpdate), false);
});

test('a user limited to some locations cannot change a shared employee or make one shared', async () => {
  const { employees, service } = serviceWith({
    employees: [employee('shared', { hospitalId: null }), employee('local')],
    hospitals: { saket: true, vaishali: true },
  });
  const sharedOnly = refused(
    ForbiddenException,
    'Only a Super Admin can change employees shared by every location',
  );

  await limitedTo(['saket', 'vaishali'], async () => {
    await assert.rejects(service.update('shared', { mobile: '1' }, actor), sharedOnly);
    await assert.rejects(service.update('local', { hospitalId: null }, actor), sharedOnly);
    await assert.rejects(service.remove('shared', actor), sharedOnly);

    // Between their own locations is fine.
    await service.update('local', { hospitalId: 'vaishali' }, actor);
  });

  assert.deepEqual(
    employees.map((stored) => [stored.hospitalId, stored.deletedAt]),
    [
      [null, null],
      ['vaishali', null],
    ],
  );
});

test('an unknown or deleted employee cannot be changed or removed', async () => {
  const { service } = serviceWith({ employees: [employee('gone', { deletedAt: now })] });

  for (const id of ['gone', 'nobody']) {
    await assert.rejects(
      service.update(id, { mobile: '1' }, actor),
      refused(NotFoundException, 'Employee not found'),
    );
    await assert.rejects(
      service.remove(id, actor),
      refused(NotFoundException, 'Employee not found'),
    );
  }
});

test('removing an employee deletes them softly, switches them off and logs it', async () => {
  const { audits, employees, service } = serviceWith({ employees: [employee('e1')] });

  assert.deepEqual(await service.remove('e1', actor), { id: 'e1' });

  assert.ok(employees[0]?.deletedAt instanceof Date);
  assert.equal(employees[0]?.isActive, false);
  assert.equal(employees[0]?.updatedBy, 'user-1');
  assert.equal(audits[0]?.action, 'EMPLOYEE_DELETE');
  assert.equal(audits[0]?.oldValue?.isActive, true, 'the log keeps the employee as they were');
  await assert.rejects(service.getById('e1'), NotFoundException);
  await assert.rejects(service.validateByCode('E1'), NotFoundException);
});
