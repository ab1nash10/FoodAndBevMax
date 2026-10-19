import { Injectable } from '@nestjs/common';
import { Kitchen, Prisma, Restaurant, Store } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const stockLedgerInclude = {
  hospital: {
    select: {
      hospitalCode: true,
      hospitalName: true,
      id: true,
      isActive: true,
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
} satisfies Prisma.StockLedgerInclude;

export const stockBalanceInclude = {
  hospital: {
    select: {
      hospitalCode: true,
      hospitalName: true,
      id: true,
      isActive: true,
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
} satisfies Prisma.StockBalanceInclude;

export type StockLedgerWithRelations = Prisma.StockLedgerGetPayload<{
  include: typeof stockLedgerInclude;
}>;
export type StockBalanceWithRelations = Prisma.StockBalanceGetPayload<{
  include: typeof stockBalanceInclude;
}>;

@Injectable()
export class StockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countBalances(args: Prisma.StockBalanceCountArgs): Promise<number> {
    return this.prisma.stockBalance.count(args);
  }

  async countLedgers(args: Prisma.StockLedgerCountArgs): Promise<number> {
    return this.prisma.stockLedger.count(args);
  }

  async findBalances(args: Prisma.StockBalanceFindManyArgs): Promise<StockBalanceWithRelations[]> {
    return this.prisma.stockBalance.findMany({
      ...args,
      include: stockBalanceInclude,
    });
  }

  async findLedgers(args: Prisma.StockLedgerFindManyArgs): Promise<StockLedgerWithRelations[]> {
    return this.prisma.stockLedger.findMany({
      ...args,
      include: stockLedgerInclude,
    });
  }

  async findStoreIdsBySearch(search: string): Promise<string[]> {
    const stores = await this.prisma.store.findMany({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        OR: [
          { storeCode: { contains: search, mode: 'insensitive' } },
          { storeName: { contains: search, mode: 'insensitive' } },
        ],
      },
    });

    return stores.map((store) => store.id);
  }

  async findRestaurantIdsBySearch(search: string): Promise<string[]> {
    const restaurants = await this.prisma.restaurant.findMany({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        OR: [
          { restaurantCode: { contains: search, mode: 'insensitive' } },
          { restaurantName: { contains: search, mode: 'insensitive' } },
        ],
      },
    });

    return restaurants.map((restaurant) => restaurant.id);
  }

  async findKitchenIdsBySearch(search: string): Promise<string[]> {
    const kitchens = await this.prisma.kitchen.findMany({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        OR: [
          { kitchenCode: { contains: search, mode: 'insensitive' } },
          { kitchenName: { contains: search, mode: 'insensitive' } },
        ],
      },
    });

    return kitchens.map((kitchen) => kitchen.id);
  }

  async findKitchensByIds(ids: string[]): Promise<Kitchen[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.kitchen.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }

  async findRestaurantsByIds(ids: string[]): Promise<Restaurant[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.restaurant.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }

  /** Each store's own category for its items, keyed "storeId:itemId". */
  async findStoreItemCategories(
    pairs: Array<{ itemId: string; storeId: string }>,
  ): Promise<Map<string, string | null>> {
    if (pairs.length === 0) {
      return new Map();
    }

    const mappings = await this.prisma.storeItem.findMany({
      select: { category: { select: { categoryName: true } }, itemId: true, storeId: true },
      where: { deletedAt: null, OR: pairs },
    });

    // An item may be mapped to a store under more than one category; show them all.
    const names = new Map<string, Set<string>>();

    for (const mapping of mappings) {
      const key = `${mapping.storeId}:${mapping.itemId}`;
      const set = names.get(key) ?? new Set<string>();

      if (mapping.category) {
        set.add(mapping.category.categoryName);
      }

      names.set(key, set);
    }

    return new Map(
      [...names].map(([key, set]) => [key, set.size ? [...set].sort().join(', ') : null]),
    );
  }

  async findStoresByIds(ids: string[]): Promise<Store[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.store.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }
}
