import { Injectable } from '@nestjs/common';
import { Hospital, Kitchen, Location, Prisma, Store } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const restaurantInclude = {
  hospital: true,
  kitchen: true,
  location: true,
  restaurantKitchens: {
    include: {
      kitchen: true,
    },
    where: {
      deletedAt: null,
      isActive: true,
    },
  },
  store: true,
} satisfies Prisma.RestaurantInclude;

export type RestaurantWithRelations = Prisma.RestaurantGetPayload<{
  include: typeof restaurantInclude;
}>;

type RestaurantClient = Prisma.TransactionClient | PrismaService;

interface RestaurantCodeSequenceRow {
  nextValue: bigint;
}

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.RestaurantCountArgs): Promise<number> {
    return this.prisma.restaurant.count(args);
  }

  async create(
    data: Prisma.RestaurantUncheckedCreateInput,
    client: RestaurantClient,
  ): Promise<RestaurantWithRelations> {
    return client.restaurant.create({
      data,
      include: restaurantInclude,
    });
  }

  async findActiveById(
    id: string,
    client: RestaurantClient = this.prisma,
  ): Promise<RestaurantWithRelations | null> {
    return client.restaurant.findFirst({
      include: restaurantInclude,
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
        },
        id,
      },
    });
  }

  async findActiveHospital(id: string, client: RestaurantClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveKitchen(
    id: string,
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<Kitchen | null> {
    return client.kitchen.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findActiveKitchens(
    ids: string[],
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<Kitchen[]> {
    return client.kitchen.findMany({
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

  async findActiveLocation(
    id: string,
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<Location | null> {
    return client.location.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findActiveStore(
    id: string,
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<Store | null> {
    return client.store.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findByCodeWithinHospital(
    hospitalId: string,
    restaurantCode: string,
    excludeId?: string,
    client: RestaurantClient = this.prisma,
  ): Promise<RestaurantWithRelations | null> {
    return client.restaurant.findFirst({
      include: restaurantInclude,
      where: {
        hospitalId,
        restaurantCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByCode(
    restaurantCode: string,
    excludeId?: string,
    client: RestaurantClient = this.prisma,
  ): Promise<RestaurantWithRelations | null> {
    return client.restaurant.findFirst({
      include: restaurantInclude,
      where: {
        restaurantCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async getNextRestaurantCodeSequenceValue(client: RestaurantClient): Promise<number> {
    const rows = await client.$queryRaw<RestaurantCodeSequenceRow[]>`
      SELECT nextval('restaurant_code_sequence')::bigint AS "nextValue"
    `;
    const nextValue = rows[0]?.nextValue;

    return typeof nextValue === 'bigint' ? Number(nextValue) : Number(nextValue ?? 0);
  }

  async findMany(args: Prisma.RestaurantFindManyArgs): Promise<RestaurantWithRelations[]> {
    return this.prisma.restaurant.findMany({
      ...args,
      include: restaurantInclude,
    });
  }

  async softDeleteCounters(
    restaurantId: string,
    data: {
      deletedAt: Date;
      updatedBy?: string;
    },
    client: RestaurantClient,
  ): Promise<void> {
    await client.restaurantKitchen.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        restaurantId,
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
        restaurantId,
      },
    });
    await client.counter.updateMany({
      data: {
        deletedAt: data.deletedAt,
        isActive: false,
        updatedBy: data.updatedBy,
      },
      where: {
        deletedAt: null,
        restaurantId,
      },
    });
  }

  async syncKitchens(
    restaurantId: string,
    kitchenIds: string[],
    actorId: string | undefined,
    client: RestaurantClient,
  ): Promise<void> {
    const selectedIds = new Set(kitchenIds);
    const existingMappings = await client.restaurantKitchen.findMany({
      where: {
        restaurantId,
      },
    });
    const existingIds = new Set(existingMappings.map((mapping) => mapping.kitchenId));
    const deletedAt = new Date();

    // Two bulk statements rather than one update per existing mapping.
    const keptIds = existingMappings
      .filter((mapping) => selectedIds.has(mapping.kitchenId))
      .map((mapping) => mapping.id);
    const droppedIds = existingMappings
      .filter((mapping) => !selectedIds.has(mapping.kitchenId))
      .map((mapping) => mapping.id);

    if (keptIds.length > 0) {
      await client.restaurantKitchen.updateMany({
        data: {
          deletedAt: null,
          isActive: true,
          updatedBy: actorId,
        },
        where: { id: { in: keptIds } },
      });
    }

    if (droppedIds.length > 0) {
      await client.restaurantKitchen.updateMany({
        data: {
          deletedAt,
          isActive: false,
          updatedBy: actorId,
        },
        where: { id: { in: droppedIds } },
      });
    }

    const newMappings = kitchenIds
      .filter((kitchenId) => !existingIds.has(kitchenId))
      .map((kitchenId) => ({
        createdBy: actorId,
        kitchenId,
        restaurantId,
        updatedBy: actorId,
      }));

    if (newMappings.length > 0) {
      await client.restaurantKitchen.createMany({
        data: newMappings,
      });
    }
  }

  async update(
    id: string,
    data: Prisma.RestaurantUpdateInput,
    client: RestaurantClient,
  ): Promise<RestaurantWithRelations> {
    return client.restaurant.update({
      data,
      include: restaurantInclude,
      where: {
        id,
      },
    });
  }
}
