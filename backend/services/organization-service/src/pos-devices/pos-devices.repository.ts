import { Injectable } from '@nestjs/common';
import { Hospital, Prisma, Restaurant } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const posDeviceInclude = {
  hospital: true,
  restaurants: {
    include: {
      restaurant: true,
    },
    where: {
      deletedAt: null,
      isActive: true,
    },
  },
} satisfies Prisma.PosDeviceInclude;

export type PosDeviceWithRelations = Prisma.PosDeviceGetPayload<{
  include: typeof posDeviceInclude;
}>;

type PosDeviceClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PosDevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.PosDeviceCountArgs): Promise<number> {
    return this.prisma.posDevice.count(args);
  }

  async create(
    data: Prisma.PosDeviceUncheckedCreateInput,
    client: PosDeviceClient,
  ): Promise<PosDeviceWithRelations> {
    return client.posDevice.create({
      data,
      include: posDeviceInclude,
    });
  }

  async findActiveById(
    id: string,
    client: PosDeviceClient = this.prisma,
  ): Promise<PosDeviceWithRelations | null> {
    return client.posDevice.findFirst({
      include: posDeviceInclude,
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
        },
        id,
      },
    });
  }

  async findActiveHospital(id: string, client: PosDeviceClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveRestaurants(
    ids: string[],
    hospitalId: string,
    client: PosDeviceClient,
  ): Promise<Restaurant[]> {
    return client.restaurant.findMany({
      where: {
        deletedAt: null,
        hospitalId,
        id: {
          in: ids,
        },
        isActive: true,
      },
    });
  }

  async findByHostName(
    hostName: string,
    excludeId?: string,
    client: PosDeviceClient = this.prisma,
  ): Promise<PosDeviceWithRelations | null> {
    return client.posDevice.findFirst({
      include: posDeviceInclude,
      where: {
        deletedAt: null,
        hostName: {
          equals: hostName,
          mode: 'insensitive',
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByCodeWithinHospital(
    hospitalId: string,
    code: string,
    excludeId?: string,
    client: PosDeviceClient = this.prisma,
  ): Promise<PosDeviceWithRelations | null> {
    return client.posDevice.findFirst({
      include: posDeviceInclude,
      where: {
        code,
        hospitalId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.PosDeviceFindManyArgs): Promise<PosDeviceWithRelations[]> {
    return this.prisma.posDevice.findMany({
      ...args,
      include: posDeviceInclude,
    });
  }

  async softDeleteChildren(
    posDeviceId: string,
    data: {
      deletedAt: Date;
      updatedBy?: string;
    },
    client: PosDeviceClient,
  ): Promise<void> {
    await client.posDeviceRestaurant.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        posDeviceId,
      },
    });
    await client.paymentMachine.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        isDefault: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        posDeviceId,
      },
    });
  }

  async syncRestaurants(
    posDeviceId: string,
    restaurantIds: string[],
    actorId: string | undefined,
    client: PosDeviceClient,
  ): Promise<void> {
    const selectedIds = new Set(restaurantIds);
    const existingMappings = await client.posDeviceRestaurant.findMany({
      where: {
        posDeviceId,
      },
    });
    const existingIds = new Set(existingMappings.map((mapping) => mapping.restaurantId));
    const deletedAt = new Date();

    await Promise.all(
      existingMappings.map((mapping) => {
        if (selectedIds.has(mapping.restaurantId)) {
          if (mapping.deletedAt || !mapping.isActive) {
            return client.posDeviceRestaurant.update({
              data: {
                deletedAt: null,
                isActive: true,
                updatedBy: actorId,
              },
              where: {
                id: mapping.id,
              },
            });
          }

          return Promise.resolve();
        }

        if (!mapping.deletedAt || mapping.isActive) {
          return client.posDeviceRestaurant.update({
            data: {
              deletedAt,
              isActive: false,
              updatedBy: actorId,
            },
            where: {
              id: mapping.id,
            },
          });
        }

        return Promise.resolve();
      }),
    );

    await Promise.all(
      [...selectedIds]
        .filter((restaurantId) => !existingIds.has(restaurantId))
        .map((restaurantId) =>
          client.posDeviceRestaurant.create({
            data: {
              createdBy: actorId,
              isActive: true,
              posDeviceId,
              restaurantId,
              updatedBy: actorId,
            },
          }),
        ),
    );
  }

  async update(
    id: string,
    data: Prisma.PosDeviceUpdateInput,
    client: PosDeviceClient,
  ): Promise<PosDeviceWithRelations> {
    return client.posDevice.update({
      data,
      include: posDeviceInclude,
      where: {
        id,
      },
    });
  }
}
