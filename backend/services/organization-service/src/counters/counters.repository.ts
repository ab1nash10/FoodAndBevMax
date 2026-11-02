import { Injectable } from '@nestjs/common';
import { CounterShiftStatus, Hospital, Prisma, Restaurant } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { countersWithTill, userNames } from '../pos/shifts';

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

  /** Per counter: whether a till reaches it, and its open shift (who opened it, and when). */
  async shiftsAndTills(counters: CounterWithRelations[]) {
    const [shifts, withTill] = await Promise.all([
      this.prisma.counterShift.findMany({
        select: { counterId: true, id: true, openedAt: true, openedBy: true },
        where: {
          counterId: { in: counters.map((counter) => counter.id) },
          status: CounterShiftStatus.OPEN,
        },
      }),
      countersWithTill(this.prisma, counters),
    ]);
    const names = await userNames(
      this.prisma,
      shifts.map((shift) => shift.openedBy),
    );

    return new Map(
      counters.map((counter) => {
        const shift = shifts.find((entry) => entry.counterId === counter.id);

        return [
          counter.id,
          {
            hasTill: withTill.has(counter.id),
            openShift: shift
              ? {
                  id: shift.id,
                  openedAt: shift.openedAt,
                  openedByName: names.get(shift.openedBy) ?? null,
                }
              : null,
          },
        ];
      }),
    );
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
