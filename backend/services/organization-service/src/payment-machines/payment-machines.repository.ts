import { Injectable } from '@nestjs/common';
import { Hospital, PosDevice, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const paymentMachineInclude = {
  hospital: true,
  posDevice: true,
} satisfies Prisma.PaymentMachineInclude;

export type PaymentMachineWithRelations = Prisma.PaymentMachineGetPayload<{
  include: typeof paymentMachineInclude;
}>;

type PaymentMachineClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PaymentMachinesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.PaymentMachineCountArgs): Promise<number> {
    return this.prisma.paymentMachine.count(args);
  }

  async create(
    data: Prisma.PaymentMachineUncheckedCreateInput,
    client: PaymentMachineClient,
  ): Promise<PaymentMachineWithRelations> {
    return client.paymentMachine.create({
      data,
      include: paymentMachineInclude,
    });
  }

  async findActiveById(
    id: string,
    client: PaymentMachineClient = this.prisma,
  ): Promise<PaymentMachineWithRelations | null> {
    return client.paymentMachine.findFirst({
      include: paymentMachineInclude,
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
        },
        id,
        posDevice: {
          deletedAt: null,
        },
      },
    });
  }

  async findActiveHospital(id: string, client: PaymentMachineClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActivePosDevice(
    id: string,
    hospitalId: string,
    client: PaymentMachineClient,
  ): Promise<PosDevice | null> {
    return client.posDevice.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
        isActive: true,
      },
    });
  }

  async findDefaultsForPosDevice(
    posDeviceId: string,
    excludeId: string | undefined,
    client: PaymentMachineClient,
  ): Promise<PaymentMachineWithRelations[]> {
    return client.paymentMachine.findMany({
      include: paymentMachineInclude,
      where: {
        deletedAt: null,
        isDefault: true,
        posDeviceId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.PaymentMachineFindManyArgs): Promise<PaymentMachineWithRelations[]> {
    return this.prisma.paymentMachine.findMany({
      ...args,
      include: paymentMachineInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.PaymentMachineUpdateInput,
    client: PaymentMachineClient,
  ): Promise<PaymentMachineWithRelations> {
    return client.paymentMachine.update({
      data,
      include: paymentMachineInclude,
      where: {
        id,
      },
    });
  }
}
