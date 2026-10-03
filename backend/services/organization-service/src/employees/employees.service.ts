import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeeSortField, ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesRepository } from './employees.repository';

type EmployeeClient = Prisma.TransactionClient;

function toEmployeeResponse(employee: Employee) {
  return {
    createdAt: employee.createdAt,
    deletedAt: employee.deletedAt,
    department: employee.department,
    designation: employee.designation,
    eligibleForDiscount: employee.eligibleForDiscount,
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    id: employee.id,
    isActive: employee.isActive,
    mobile: employee.mobile,
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

function getEmployeeOrderBy(query: ListEmployeesQueryDto): Prisma.EmployeeOrderByWithRelationInput {
  const sortBy: EmployeeSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
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
        orderBy: getEmployeeOrderBy(query),
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
        await this.assertUniqueEmployeeCode(dto.employeeCode, undefined, tx);

        const employee = await this.employees.create(
          {
            createdBy: context.actorId,
            department: dto.department,
            designation: dto.designation,
            eligibleForDiscount: dto.eligibleForDiscount ?? true,
            employeeCode: dto.employeeCode,
            employeeName: dto.employeeName,
            isActive: dto.isActive ?? true,
            mobile: dto.mobile,
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
      this.handlePrismaError(error, 'Employee');
    }
  }

  async update(id: string, dto: UpdateEmployeeDto, context: ActorContext) {
    try {
      const updated = await this.employees.transaction(async (tx) => {
        const existing = await this.findActiveEmployee(id, tx);
        const data: Prisma.EmployeeUpdateInput = {};

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

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.mobile !== undefined) {
          data.mobile = dto.mobile;
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
      this.handlePrismaError(error, 'Employee');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveEmployee(id);

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

  private async findActiveEmployee(id: string, client?: EmployeeClient): Promise<Employee> {
    const employee = await this.employees.findActiveById(id, client);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
