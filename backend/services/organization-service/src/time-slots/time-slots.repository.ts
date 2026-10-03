import { Injectable } from '@nestjs/common';
import { Prisma, TimeSlot } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type TimeSlotClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TimeSlotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.TimeSlotCountArgs): Promise<number> {
    return this.prisma.timeSlot.count(args);
  }

  async create(
    data: Prisma.TimeSlotUncheckedCreateInput,
    client: TimeSlotClient,
  ): Promise<TimeSlot> {
    return client.timeSlot.create({ data });
  }

  async findActiveById(id: string, client: TimeSlotClient = this.prisma): Promise<TimeSlot | null> {
    return client.timeSlot.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findByName(
    slotName: string,
    excludeId?: string,
    client: TimeSlotClient = this.prisma,
  ): Promise<TimeSlot | null> {
    return client.timeSlot.findFirst({
      where: {
        slotName: {
          equals: slotName,
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.TimeSlotFindManyArgs): Promise<TimeSlot[]> {
    return this.prisma.timeSlot.findMany(args);
  }

  async hasActiveRestaurantMenus(id: string, client: TimeSlotClient): Promise<boolean> {
    const count = await client.restaurantMenu.count({
      where: {
        deletedAt: null,
        timeSlotIds: {
          has: id,
        },
      },
    });

    return count > 0;
  }

  async update(
    id: string,
    data: Prisma.TimeSlotUpdateInput,
    client: TimeSlotClient,
  ): Promise<TimeSlot> {
    return client.timeSlot.update({
      data,
      where: {
        id,
      },
    });
  }
}
