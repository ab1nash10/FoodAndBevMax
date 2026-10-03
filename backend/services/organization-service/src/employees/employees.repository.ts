import { Injectable } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type EmployeeClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.EmployeeCountArgs): Promise<number> {
    return this.prisma.employee.count(args);
  }

  async create(
    data: Prisma.EmployeeUncheckedCreateInput,
    client: EmployeeClient,
  ): Promise<Employee> {
    return client.employee.create({ data });
  }

  async findActiveByCode(
    employeeCode: string,
    client: EmployeeClient = this.prisma,
  ): Promise<Employee | null> {
    return client.employee.findFirst({
      where: {
        deletedAt: null,
        employeeCode,
        isActive: true,
      },
    });
  }

  async findActiveById(id: string, client: EmployeeClient = this.prisma): Promise<Employee | null> {
    return client.employee.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findByCode(
    employeeCode: string,
    excludeId?: string,
    client: EmployeeClient = this.prisma,
  ): Promise<Employee | null> {
    return client.employee.findFirst({
      where: {
        employeeCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.EmployeeFindManyArgs): Promise<Employee[]> {
    return this.prisma.employee.findMany(args);
  }

  async update(
    id: string,
    data: Prisma.EmployeeUpdateInput,
    client: EmployeeClient,
  ): Promise<Employee> {
    return client.employee.update({
      data,
      where: {
        id,
      },
    });
  }
}
