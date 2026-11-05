import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import {
  assertActiveHospital,
  assertMayChangeShared,
  sharedOrAt,
} from '../common/location-masters';
import { formatMasterCode, getNextSequenceNumber } from '../common/master-code-generator';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { toDateOnly } from '../common/values';
import { assertActiveLegalEntity } from '../legal-entities/legal-entity-guards';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesRepository, type EmployeeWithHospital } from './employees.repository';

type EmployeeClient = Prisma.TransactionClient;

/** A DATE column as the day alone (YYYY-MM-DD), as a date box takes it. */
const dayOf = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
/** A day sent in, kept as undefined (left out) or null (cleared). */
const toDay = (value: string | null | undefined) => (value ? toDateOnly(value) : value);

export function toEmployeeResponse(employee: EmployeeWithHospital) {
  return {
    birthDate: dayOf(employee.birthDate),
    createdAt: employee.createdAt,
    deletedAt: employee.deletedAt,
    department: employee.department,
    designation: employee.designation,
    eligibleForDiscount: employee.eligibleForDiscount,
    employeeCode: employee.employeeCode,
    employeeLevel: employee.employeeLevel,
    employeeName: employee.employeeName,
    employmentType: employee.employmentType,
    gender: employee.gender,
    hospital: employee.hospital,
    hospitalId: employee.hospitalId,
    id: employee.id,
    isActive: employee.isActive,
    joiningDate: dayOf(employee.joiningDate),
    legalEntityId: employee.legalEntityId,
    mobile: employee.mobile,
    officialEmail: employee.officialEmail,
    reportingManager: employee.reportingManager,
    reportingManagerId: employee.reportingManagerId,
    updatedAt: employee.updatedAt,
  };
}

function toEmployeeValidationResponse(employee: Employee) {
  return {
    department: employee.department,
    designation: employee.designation,
    eligibleForDiscount: employee.eligibleForDiscount,
    employeeCode: employee.employeeCode,
    employeeId: employee.id,
    employeeName: employee.employeeName,
    isActive: employee.isActive,
    mobile: employee.mobile,
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly employees: EmployeesRepository,
  ) {}

  async list(query: ListEmployeesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.EmployeeWhereInput = {
      ...(query.hospitalId ? { AND: [sharedOrAt(query.hospitalId)] } : {}),
      deletedAt: null,
      ...(query.eligibleForDiscount !== undefined
        ? { eligibleForDiscount: query.eligibleForDiscount }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { department: { contains: query.search, mode: 'insensitive' } },
              { designation: { contains: query.search, mode: 'insensitive' } },
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { employeeName: { contains: query.search, mode: 'insensitive' } },
              { mobile: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.employees.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.employees.count({ where }),
    ]);

    return {
      items: items.map(toEmployeeResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const employee = await this.findActiveEmployee(id);

    return toEmployeeResponse(employee);
  }

  async validateByCode(employeeCode: string) {
    const employee = await this.employees.findActiveByCode(employeeCode);

    if (!employee) {
      throw new NotFoundException('Employee not found or inactive');
    }

    return toEmployeeValidationResponse(employee);
  }

  async create(dto: CreateEmployeeDto, context: ActorContext) {
    try {
      const created = await this.employees.transaction(async (tx) => {
        const hospitalId = dto.hospitalId ?? null;

        assertMayChangeShared(hospitalId, 'employees');

        if (hospitalId) {
          await assertActiveHospital(tx, hospitalId);
        }

        if (dto.legalEntityId) {
          await assertActiveLegalEntity(tx, dto.legalEntityId);
        }

        if (dto.reportingManagerId) {
          await this.assertReportingManager(undefined, dto.reportingManagerId, tx);
        }

        if (dto.employeeCode) {
          await this.assertUniqueEmployeeCode(dto.employeeCode, undefined, tx);
        }

        const employee = await this.employees.create(
          {
            birthDate: toDay(dto.birthDate),
            createdBy: context.actorId,
            department: dto.department,
            designation: dto.designation,
            eligibleForDiscount: dto.eligibleForDiscount ?? true,
            employeeCode: dto.employeeCode || (await this.nextFreeCode(tx)),
            employeeLevel: dto.employeeLevel,
            employmentType: dto.employmentType,
            gender: dto.gender,
            hospitalId,
            employeeName: dto.employeeName,
            isActive: dto.isActive ?? true,
            joiningDate: toDay(dto.joiningDate),
            legalEntityId: dto.legalEntityId,
            mobile: dto.mobile,
            officialEmail: dto.officialEmail,
            reportingManagerId: dto.reportingManagerId,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'EMPLOYEE_CREATE',
            actorId: context.actorId,
            entityId: employee.id,
            entityName: 'employees',
            ipAddress: context.ipAddress,
            newValue: toEmployeeResponse(employee),
          },
          tx,
        );

        return employee;
      });

      return toEmployeeResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Employee');
    }
  }

  async update(id: string, dto: UpdateEmployeeDto, context: ActorContext) {
    try {
      const updated = await this.employees.transaction(async (tx) => {
        const existing = await this.findActiveEmployee(id, tx);
        const data: Prisma.EmployeeUpdateInput = {};
        const hospitalId = dto.hospitalId === undefined ? existing.hospitalId : dto.hospitalId;

        assertMayChangeShared(existing.hospitalId, 'employees');

        // Nothing else refers to an employee, so one can move between locations freely.
        if (hospitalId !== existing.hospitalId) {
          assertMayChangeShared(hospitalId, 'employees');

          if (hospitalId) {
            await assertActiveHospital(tx, hospitalId);
          }

          data.hospital = hospitalId ? { connect: { id: hospitalId } } : { disconnect: true };
        }

        if (dto.department !== undefined) {
          data.department = dto.department;
        }

        if (dto.designation !== undefined) {
          data.designation = dto.designation;
        }

        if (dto.eligibleForDiscount !== undefined) {
          data.eligibleForDiscount = dto.eligibleForDiscount;
        }

        if (dto.employeeCode !== undefined) {
          await this.assertUniqueEmployeeCode(dto.employeeCode, id, tx);
          data.employeeCode = dto.employeeCode;
        }

        if (dto.employeeName !== undefined) {
          data.employeeName = dto.employeeName;
        }

        if (dto.employmentType !== undefined) {
          data.employmentType = dto.employmentType;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.mobile !== undefined) {
          data.mobile = dto.mobile;
        }

        if (dto.officialEmail !== undefined) {
          data.officialEmail = dto.officialEmail;
        }

        if (dto.gender !== undefined) {
          data.gender = dto.gender;
        }

        if (dto.birthDate !== undefined) {
          data.birthDate = toDay(dto.birthDate);
        }

        if (dto.joiningDate !== undefined) {
          data.joiningDate = toDay(dto.joiningDate);
        }

        if (dto.employeeLevel !== undefined) {
          data.employeeLevel = dto.employeeLevel;
        }

        if (dto.legalEntityId !== undefined && dto.legalEntityId !== existing.legalEntityId) {
          if (dto.legalEntityId) {
            await assertActiveLegalEntity(tx, dto.legalEntityId);
          }

          data.legalEntity = dto.legalEntityId
            ? { connect: { id: dto.legalEntityId } }
            : { disconnect: true };
        }

        if (
          dto.reportingManagerId !== undefined &&
          dto.reportingManagerId !== existing.reportingManagerId
        ) {
          if (dto.reportingManagerId) {
            await this.assertReportingManager(id, dto.reportingManagerId, tx);
          }

          data.reportingManager = dto.reportingManagerId
            ? { connect: { id: dto.reportingManagerId } }
            : { disconnect: true };
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const employee = Object.keys(data).length
          ? await this.employees.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'EMPLOYEE_STATUS_CHANGE'
                : 'EMPLOYEE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'employees',
            ipAddress: context.ipAddress,
            newValue: toEmployeeResponse(employee),
            oldValue: toEmployeeResponse(existing),
          },
          tx,
        );

        return employee;
      });

      return toEmployeeResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Employee');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveEmployee(id);

    assertMayChangeShared(existing.hospitalId, 'employees');

    await this.employees.transaction(async (tx) => {
      await this.employees.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'EMPLOYEE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'employees',
          ipAddress: context.ipAddress,
          oldValue: toEmployeeResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertUniqueEmployeeCode(
    employeeCode: string,
    excludeId: string | undefined,
    client: EmployeeClient,
  ): Promise<void> {
    const employee = await this.employees.findByCode(employeeCode, excludeId, client);

    if (employee) {
      throw new ConflictException('Employee code already exists');
    }
  }

  /** The next EMP code from the sequence, stepping over any typed in by hand. */
  private async nextFreeCode(client: EmployeeClient): Promise<string> {
    for (;;) {
      const code = formatMasterCode(
        'EMP',
        await getNextSequenceNumber(client, 'employee_code_sequence'),
      );

      if (!(await this.employees.findByCode(code, undefined, client))) {
        return code;
      }
    }
  }

  /**
   * The manager must be a current employee, and not the employee or anyone below them: walking
   * up from the manager must never reach the employee.
   */
  private async assertReportingManager(
    employeeId: string | undefined,
    managerId: string,
    client: EmployeeClient,
  ): Promise<void> {
    const loop = 'An employee cannot report to themselves or to someone who reports to them.';

    if (managerId === employeeId) {
      throw new BadRequestException(loop);
    }

    let manager = await this.employees.findActiveById(managerId, client);

    if (!manager) {
      throw new BadRequestException('Choose a reporting manager who is a current employee.');
    }

    // ponytail: one read per level, capped at 100 levels; enough for any real chain of managers.
    for (let depth = 0; employeeId && manager?.reportingManagerId && depth < 100; depth += 1) {
      if (manager.reportingManagerId === employeeId) {
        throw new BadRequestException(loop);
      }

      manager = await this.employees.findActiveById(manager.reportingManagerId, client);
    }
  }

  private async findActiveEmployee(
    id: string,
    client?: EmployeeClient,
  ): Promise<EmployeeWithHospital> {
    const employee = await this.employees.findActiveById(id, client);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }
}
