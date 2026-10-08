import { Injectable } from '@nestjs/common';
import { Prisma, TimeSlot } from '@prisma/client';
import { masterHospitalSelect } from '../common/location-masters';
import { PrismaService } from '../common/prisma/prisma.service';

type TimeSlotClient = Prisma.TransactionClient | PrismaService;

const timeSlotInclude = { hospital: masterHospitalSelect } satisfies Prisma.TimeSlotInclude;

export type TimeSlotWithHospital = Prisma.TimeSlotGetPayload<{ include: typeof timeSlotInclude }>;

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
  ): Promise<TimeSlotWithHospital> {
    return client.timeSlot.create({ data, include: timeSlotInclude });
  }

  async findActiveById(
    id: string,
    client: TimeSlotClient = this.prisma,
  ): Promise<TimeSlotWithHospital | null> {
    return client.timeSlot.findFirst({
      include: timeSlotInclude,
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

  async findMany(args: Prisma.TimeSlotFindManyArgs): Promise<TimeSlotWithHospital[]> {
    return this.prisma.timeSlot.findMany({ ...args, include: timeSlotInclude });
  }

  /** Restaurant menus outside `hospitalId` that offer the slot. */
  async countMenusOutside(id: string, hospitalId: string, client: TimeSlotClient): Promise<number> {
    return client.restaurantMenu.count({
      where: { deletedAt: null, hospitalId: { not: hospitalId }, timeSlotIds: { has: id } },
    });
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
  ): Promise<TimeSlotWithHospital> {
    return client.timeSlot.update({
      data,
      include: timeSlotInclude,
      where: {
        id,
      },
    });
  }
}
