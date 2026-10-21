import { Injectable } from '@nestjs/common';
import { Item, Prisma, Restaurant } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const restaurantMenuInclude = {
  // The mapping's own category (chosen on it; the item's other mappings are independent).
  category: {
    select: {
      categoryName: true,
      id: true,
      isActive: true,
    },
  },
  kitchen: {
    select: {
      id: true,
      isActive: true,
      kitchenCode: true,
      kitchenName: true,
    },
  },
  store: {
    select: {
      id: true,
      isActive: true,
      storeCode: true,
      storeName: true,
    },
  },
  item: {
    select: {
      id: true,
      isActive: true,
      itemCode: true,
      itemName: true,
      itemType: true,
      type: true,
    },
  },
  restaurant: {
    select: {
      hospital: {
        select: {
          hospitalCode: true,
          hospitalName: true,
          id: true,
          isActive: true,
        },
      },
      id: true,
      isActive: true,
      restaurantCode: true,
      restaurantName: true,
    },
  },
} satisfies Prisma.RestaurantMenuInclude;

export type RestaurantMenuWithRelations = Prisma.RestaurantMenuGetPayload<{
  include: typeof restaurantMenuInclude;
}>;

type RestaurantMenuClient = Prisma.TransactionClient | PrismaService;

/** What a menu item sells: an item, under a category, from a kitchen or a store. */
export interface MenuSource {
  categoryId: string | null;
  hospitalId: string;
  itemId: string;
  kitchenId: string | null;
  storeId: string | null;
}

@Injectable()
export class RestaurantMenusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.RestaurantMenuCountArgs): Promise<number> {
    return this.prisma.restaurantMenu.count(args);
  }

  async create(
    data: Prisma.RestaurantMenuUncheckedCreateInput,
    client: RestaurantMenuClient,
  ): Promise<RestaurantMenuWithRelations> {
    return client.restaurantMenu.create({
      data,
      include: restaurantMenuInclude,
    });
  }

  async findActiveById(
    id: string,
    client: RestaurantMenuClient = this.prisma,
  ): Promise<RestaurantMenuWithRelations | null> {
    return client.restaurantMenu.findFirst({
      include: restaurantMenuInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  /**
   * Whether a live, active mapping at the location gives exactly this: the item in that kitchen,
   * or in that store, under that category.
   */
  async matchesMapping(
    { categoryId, hospitalId, itemId, kitchenId, storeId }: MenuSource,
    client: RestaurantMenuClient,
  ): Promise<boolean> {
    const live = { deletedAt: null, hospitalId, isActive: true };
    const where = { categoryId, deletedAt: null, isActive: true, itemId };
    const mapping = kitchenId
      ? await client.kitchenItem.findFirst({
          select: { id: true },
          where: { ...where, kitchen: { ...live, id: kitchenId } },
        })
      : storeId
        ? await client.storeItem.findFirst({
            select: { id: true },
            where: { ...where, store: { ...live, id: storeId } },
          })
        : null;

    return Boolean(mapping);
  }

  async findActiveItem(id: string, client: RestaurantMenuClient): Promise<Item | null> {
    return client.item.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  /** A live menu entry for the item at the restaurant under the same category. */
  async findActiveMapping(
    restaurantId: string,
    itemId: string,
    categoryId: string | null,
    excludeId?: string,
    client: RestaurantMenuClient = this.prisma,
  ): Promise<RestaurantMenuWithRelations | null> {
    return client.restaurantMenu.findFirst({
      include: restaurantMenuInclude,
      where: {
        categoryId,
        deletedAt: null,
        itemId,
        restaurantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findActiveReferenceMenu(
    id: string,
    restaurantId: string,
    client: RestaurantMenuClient,
  ): Promise<RestaurantMenuWithRelations | null> {
    return client.restaurantMenu.findFirst({
      include: restaurantMenuInclude,
      where: {
        deletedAt: null,
        id,
        restaurantId,
      },
    });
  }

  async findActiveRestaurant(id: string, client: RestaurantMenuClient): Promise<Restaurant | null> {
    return client.restaurant.findFirst({
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
          isActive: true,
        },
        id,
      },
    });
  }

  async getMaxDisplayOrder(restaurantId: string, client: RestaurantMenuClient): Promise<number> {
    const result = await client.restaurantMenu.aggregate({
      _max: {
        displayOrder: true,
      },
      where: {
        deletedAt: null,
        restaurantId,
      },
    });

    return result._max.displayOrder ?? 0;
  }

  async incrementDisplayOrders(
    restaurantId: string,
    fromDisplayOrder: number,
    excludeId: string | undefined,
    client: RestaurantMenuClient,
  ): Promise<void> {
    await client.restaurantMenu.updateMany({
      data: {
        displayOrder: {
          increment: 1,
        },
      },
      where: {
        deletedAt: null,
        displayOrder: {
          gte: fromDisplayOrder,
        },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        restaurantId,
      },
    });
  }

  async findMany(args: Prisma.RestaurantMenuFindManyArgs): Promise<RestaurantMenuWithRelations[]> {
    return this.prisma.restaurantMenu.findMany({
      ...args,
      include: restaurantMenuInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.RestaurantMenuUpdateInput,
    client: RestaurantMenuClient,
  ): Promise<RestaurantMenuWithRelations> {
    return client.restaurantMenu.update({
      data,
      include: restaurantMenuInclude,
      where: {
        id,
      },
    });
  }
}
