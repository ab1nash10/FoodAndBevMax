import { Injectable } from '@nestjs/common';
import { Hospital, Prisma, Restaurant } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const counterInclude = {
  hospital: true,
  restaurant: true,
} satisfies Prisma.CounterInclude;

export type CounterWithRelations = Prisma.CounterGetPayload<{ include: typeof counterInclude }>;

type CounterClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CountersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.CounterCountArgs): Promise<number> {
    return this.prisma.counter.count(args);
  }

  async create(
    data: Prisma.CounterUncheckedCreateInput,
    client: CounterClient,
  ): Promise<CounterWithRelations> {
    return client.counter.create({
      data,
      include: counterInclude,
    });
  }

  async findActiveById(
    id: string,
    client: CounterClient = this.prisma,
  ): Promise<CounterWithRelations | null> {
    return client.counter.findFirst({
      include: counterInclude,
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
        },
        id,
        restaurant: {
          deletedAt: null,
        },
      },
    });
  }

  async findActiveHospital(id: string, client: CounterClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveRestaurant(
    id: string,
    hospitalId: string,
    client: CounterClient,
  ): Promise<Restaurant | null> {
    return client.restaurant.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findByCodeWithinRestaurant(
    restaurantId: string,
    counterCode: string,
    excludeId?: string,
    client: CounterClient = this.prisma,
  ): Promise<CounterWithRelations | null> {
    return client.counter.findFirst({
      include: counterInclude,
      where: {
        counterCode,
        restaurantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.CounterFindManyArgs): Promise<CounterWithRelations[]> {
    return this.prisma.counter.findMany({
      ...args,
      include: counterInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.CounterUpdateInput,
    client: CounterClient,
  ): Promise<CounterWithRelations> {
    return client.counter.update({
      data,
      include: counterInclude,
      where: {
        id,
      },
    });
  }
}
