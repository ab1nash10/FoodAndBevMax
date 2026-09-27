import { Injectable } from '@nestjs/common';
import { Hospital, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type HospitalClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class HospitalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.HospitalCountArgs): Promise<number> {
    return this.prisma.hospital.count(args);
  }

  async create(data: Prisma.HospitalCreateInput, client: HospitalClient): Promise<Hospital> {
    return client.hospital.create({ data });
  }

  async findActiveById(id: string, client: HospitalClient = this.prisma): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findByBillPrefix(
    billPrefix: string,
    excludeId?: string,
    client: HospitalClient = this.prisma,
  ): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        billPrefix,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByCode(
    hospitalCode: string,
    excludeId?: string,
    client: HospitalClient = this.prisma,
  ): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        hospitalCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.HospitalFindManyArgs): Promise<Hospital[]> {
    return this.prisma.hospital.findMany(args);
  }

  async softDeleteChildren(
    hospitalId: string,
    data: {
      deletedAt: Date;
      updatedBy?: string;
    },
    client: HospitalClient,
  ): Promise<void> {
    await client.counter.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.posDeviceRestaurant.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        posDevice: {
          hospitalId,
        },
      },
    });
    await client.paymentMachine.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.posDevice.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.restaurant.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.store.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.kitchen.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
    await client.location.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        hospitalId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.HospitalUpdateInput,
    client: HospitalClient,
  ): Promise<Hospital> {
    return client.hospital.update({
      data,
      where: {
        id,
      },
    });
  }
}
