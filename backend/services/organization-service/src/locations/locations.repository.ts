import { Injectable } from '@nestjs/common';
import { Hospital, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const locationInclude = {
  hospital: true,
} satisfies Prisma.LocationInclude;

export type LocationWithHospital = Prisma.LocationGetPayload<{ include: typeof locationInclude }>;

type LocationClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.LocationCountArgs): Promise<number> {
    return this.prisma.location.count(args);
  }

  async create(
    data: Prisma.LocationUncheckedCreateInput,
    client: LocationClient,
  ): Promise<LocationWithHospital> {
    return client.location.create({
      data,
      include: locationInclude,
    });
  }

  async findActiveById(
    id: string,
    client: LocationClient = this.prisma,
  ): Promise<LocationWithHospital | null> {
    return client.location.findFirst({
      include: locationInclude,
      where: {
        deletedAt: null,
        id,
        hospital: {
          deletedAt: null,
        },
      },
    });
  }

  async findActiveHospital(id: string, client: LocationClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findMany(args: Prisma.LocationFindManyArgs): Promise<LocationWithHospital[]> {
    return this.prisma.location.findMany({
      ...args,
      include: locationInclude,
    });
  }

  async softDeleteChildren(
    locationId: string,
    data: {
      deletedAt: Date;
      updatedBy?: string;
    },
    client: LocationClient,
  ): Promise<void> {
    await client.counter.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        restaurant: {
          locationId,
        },
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
        locationId,
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
        locationId,
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
        locationId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.LocationUpdateInput,
    client: LocationClient,
  ): Promise<LocationWithHospital> {
    return client.location.update({
      data,
      include: locationInclude,
      where: {
        id,
      },
    });
  }
}
