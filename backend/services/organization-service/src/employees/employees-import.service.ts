import { Injectable } from '@nestjs/common';
import { getAllowedHospitalIds } from '@aahar/auth';
import { EmploymentType, Prisma } from '@prisma/client';
import {
  cellReader,
  cellText,
  changes,
  importAuditEntries,
  importResult,
  importTransactionOptions,
  permissionError,
  repeatTracker,
  validateRow,
  type ImportRowResult,
  type ImportRowsDto,
} from '../common/import';
import { masterHospitalSelect } from '../common/location-masters';
import { PrismaService } from '../common/prisma/prisma.service';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import type { EmployeeWithHospital } from './employees.repository';
import { toEmployeeResponse } from './employees.service';

const labels = {
  department: 'Department',
  designation: 'Designation',
  eligibleForDiscount: 'Eligible for discount',
  employeeCode: 'Employee code',
  employeeName: 'Employee name',
  employmentType: 'Employment type',
  hospitalId: 'Location code',
  isActive: 'Status',
  mobile: 'Mobile',
};

const employmentTypes = {
  onroll: EmploymentType.ON_ROLL,
  outsourced: EmploymentType.OUTSOURCED,
};

type EmployeeFields = Pick<
  Prisma.EmployeeUncheckedCreateInput,
  | 'department'
  | 'designation'
  | 'eligibleForDiscount'
  | 'employeeCode'
  | 'employeeName'
  | 'employmentType'
  | 'hospitalId'
  | 'isActive'
  | 'mobile'
>;

export interface EmployeeImportLookups {
  /** The caller's locations; null or undefined reaches every location. */
  allowedHospitalIds: string[] | null | undefined;
  /** Live employees the caller can see. */
  employees: EmployeeWithHospital[];
  hospitals: Array<{ hospitalCode: string; id: string; isActive: boolean }>;
  /** Every code taken, including deleted employees' and those at locations out of reach. */
  usedCodes: Set<string>;
}

export interface EmployeeImportPlan {
  creates: EmployeeFields[];
  rows: ImportRowResult[];
  updates: Array<{ data: Partial<EmployeeFields>; existing: EmployeeWithHospital }>;
}

/**
 * What each row does. A row updates the employee with its Employee code, or adds one when no
 * employee has it. Name and employment type are required on every row. Location code puts the
 * employee at that location; left blank, a new employee is shared by every location (which only
 * a Super Admin may add or change) and an existing one stays where it is, as does any other
 * blank cell.
 */
export async function planEmployeeImport(
  rows: Array<Record<string, unknown>>,
  lookups: EmployeeImportLookups,
  context: ActorContext,
): Promise<EmployeeImportPlan> {
  const byCode = new Map(lookups.employees.map((employee) => [employee.employeeCode, employee]));
  const byHospitalCode = new Map(
    lookups.hospitals.map((hospital) => [hospital.hospitalCode.toUpperCase(), hospital]),
  );
  const limited = Array.isArray(lookups.allowedHospitalIds);
  const repeatedCode = repeatTracker('Employee code');
  const plan: EmployeeImportPlan = { creates: [], rows: [], updates: [] };

  for (const [index, row] of rows.entries()) {
    const cells = cellReader(row);
    const employeeCode = cells.required('employeeCode', 'Employee code')?.toUpperCase();
    const match = employeeCode ? byCode.get(employeeCode) : undefined;
    const locationCode = cells.upper('locationCode');
    const hospital = locationCode ? byHospitalCode.get(locationCode) : undefined;

    cells.required('employeeName', 'Employee name');

    if (locationCode && !hospital) {
      cells.fail('hospitalId', `No location has code ${locationCode}`);
    } else if (hospital && !hospital.isActive) {
      cells.fail('hospitalId', `Location ${locationCode} is inactive`);
    } else if (hospital && limited && !lookups.allowedHospitalIds?.includes(hospital.id)) {
      cells.fail('hospitalId', `Location ${locationCode} is outside your assigned access`);
    }

    const employmentType = cells.required('employmentType', 'Employment type')
      ? cells.choice('employmentType', 'Employment type', employmentTypes, 'On roll or Outsourced')
      : undefined;
    // Blank: a new employee is shared, an existing one keeps its location.
    const hospitalId = hospital?.id ?? (match ? undefined : null);
    const { dto, errors } = await validateRow(
      CreateEmployeeDto,
      {
        department: cells.text('department'),
        designation: cells.text('designation'),
        eligibleForDiscount: cells.yesNo('eligibleForDiscount', 'Eligible for discount'),
        employeeCode,
        employeeName: cells.text('employeeName'),
        employmentType,
        hospitalId,
        isActive: cells.status('isActive'),
        mobile: cells.text('mobile'),
      },
      labels,
      // The location is found by its code, so the DTO's "must be a UUID" never applies.
      new Set([...cells.failed, 'hospitalId']),
    );

    if (employeeCode && !match && lookups.usedCodes.has(employeeCode)) {
      errors.push(`Employee code ${employeeCode} is already used`);
    }

    // As the form: only a user who reaches every location adds or changes a shared employee.
    if (limited && (match ? match.hospitalId === null : hospitalId === null)) {
      errors.push(
        match
          ? 'Only a Super Admin can change employees shared by every location'
          : 'Fill in Location code: only a Super Admin can add employees shared by every location',
      );
    }

    const data: EmployeeFields = {
      department: dto.department,
      designation: dto.designation,
      eligibleForDiscount: dto.eligibleForDiscount,
      employeeCode: dto.employeeCode,
      employeeName: dto.employeeName,
      employmentType: dto.employmentType,
      hospitalId,
      isActive: dto.isActive,
      mobile: dto.mobile,
    };
    const action = match ? (changes(match, data) ? 'update' : 'skip') : 'create';

    errors.unshift(...cells.errors);
    errors.push(
      ...[
        repeatedCode(employeeCode, index),
        permissionError(
          action,
          context,
          { create: 'EMPLOYEE_CREATE', update: 'EMPLOYEE_UPDATE' },
          'employees',
        ),
      ].filter((message): message is string => message !== null),
    );
    plan.rows.push({ action, errors });

    if (errors.length > 0) {
      continue;
    }

    if (action === 'create') {
      plan.creates.push({
        ...data,
        eligibleForDiscount: data.eligibleForDiscount ?? true,
        isActive: data.isActive ?? true,
      });
    } else if (action === 'update' && match) {
      plan.updates.push({ data, existing: match });
    }
  }

  return plan;
}

const include = { hospital: masterHospitalSelect } satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeesImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import({ dryRun, rows }: ImportRowsDto, context: ActorContext) {
    if (dryRun) {
      return importResult((await this.plan(rows, this.prisma, context)).rows, false);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await this.plan(rows, tx, context);

        // All or nothing: one bad row and nothing is saved.
        if (plan.rows.some((row) => row.errors.length > 0)) {
          return importResult(plan.rows, false);
        }

        await this.write(plan, tx, context);

        return importResult(plan.rows, true);
      }, importTransactionOptions);
    } catch (error) {
      handlePrismaError(error, 'Employee');
    }
  }

  private async plan(
    rows: Array<Record<string, unknown>>,
    client: Prisma.TransactionClient,
    context: ActorContext,
  ) {
    const cell = (row: Record<string, unknown>, field: string) =>
      cellText(row, field).toUpperCase();
    const codes = rows.map((row) => cell(row, 'employeeCode')).filter(Boolean);
    const [employees, hospitals, used] = await Promise.all([
      // Scoped to the caller's locations, as the form's lookups are.
      client.employee.findMany({
        include,
        where: { deletedAt: null, employeeCode: { in: codes } },
      }),
      client.hospital.findMany({
        select: { hospitalCode: true, id: true, isActive: true },
        where: {
          deletedAt: null,
          hospitalCode: { in: rows.map((row) => cell(row, 'locationCode')) },
        },
      }),
      // Raw, so not narrowed by location: a code is unique across every employee ever saved.
      client.$queryRaw<Array<{ code: string }>>`
        SELECT employee_code AS code FROM employees WHERE employee_code = ANY(${codes})
      `,
    ]);

    return planEmployeeImport(
      rows,
      {
        allowedHospitalIds: getAllowedHospitalIds(),
        employees,
        hospitals,
        usedCodes: new Set(used.map((row) => row.code)),
      },
      context,
    );
  }

  private async write(
    plan: EmployeeImportPlan,
    tx: Prisma.TransactionClient,
    context: ActorContext,
  ) {
    const created = await tx.employee.createManyAndReturn({
      data: plan.creates.map((data) => ({
        ...data,
        createdBy: context.actorId,
        updatedBy: context.actorId,
      })),
      include,
    });
    const updated: Array<{ existing: EmployeeWithHospital; employee: EmployeeWithHospital }> = [];

    // Each row changes different fields, so one update per changed employee.
    for (const { data, existing } of plan.updates) {
      updated.push({
        employee: await tx.employee.update({
          data: { ...data, updatedBy: context.actorId },
          include,
          where: { id: existing.id },
        }),
        existing,
      });
    }

    await tx.auditLog.createMany({
      data: importAuditEntries(
        [
          ...created.map((employee) => ({
            action: 'EMPLOYEE_CREATE',
            entityId: employee.id,
            entityName: 'employees',
            newValue: toEmployeeResponse(employee),
          })),
          ...updated.map(({ employee, existing }) => ({
            action:
              existing.isActive === employee.isActive
                ? 'EMPLOYEE_UPDATE'
                : 'EMPLOYEE_STATUS_CHANGE',
            entityId: employee.id,
            entityName: 'employees',
            newValue: toEmployeeResponse(employee),
            oldValue: toEmployeeResponse(existing),
          })),
        ],
        context,
      ),
    });
  }
}
