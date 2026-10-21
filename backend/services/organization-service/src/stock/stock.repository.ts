import { Injectable } from '@nestjs/common';
import {
  Counter,
  InventoryLocationType,
  Kitchen,
  Prisma,
  Restaurant,
  StockReferenceType,
  Store,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** The record a ledger row came from, as a person finds it: its number and its page. */
export interface ReferenceDocument {
  id: string;
  number: string;
  type: 'GRN' | 'KITCHEN_PRODUCTION' | 'ORDER' | 'TRANSFER';
}

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

  async findCountersByIds(ids: string[]): Promise<Counter[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.prisma.counter.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
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

  /**
   * The document behind each ledger row, by reference id: one query per kind on the page. An
   * acknowledgement is shown as its transfer (that is the record a person opens), and a bill
   * by its bill number (its order number until it has one).
   */
  async findReferenceDocuments(
    ledgers: Array<{ referenceId: string | null; referenceType: StockReferenceType | null }>,
  ): Promise<Map<string, ReferenceDocument>> {
    const idsOf = (type: StockReferenceType) => [
      ...new Set(
        ledgers.flatMap((ledger) =>
          ledger.referenceType === type && ledger.referenceId ? [ledger.referenceId] : [],
        ),
      ),
    ];
    // No query for a kind the page has none of.
    const lookUp = <T>(type: StockReferenceType, find: (ids: string[]) => Promise<T[]>) => {
      const ids = idsOf(type);

      return ids.length ? find(ids) : Promise.resolve([]);
    };
    const [grns, productions, transfers, acknowledgements, orders] = await Promise.all([
      lookUp(StockReferenceType.GRN, (ids) =>
        this.prisma.grn.findMany({
          select: { grnNumber: true, id: true },
          where: { id: { in: ids } },
        }),
      ),
      lookUp(StockReferenceType.KITCHEN_PRODUCTION, (ids) =>
        this.prisma.kitchenProduction.findMany({
          select: { id: true, productionNumber: true },
          where: { id: { in: ids } },
        }),
      ),
      lookUp(StockReferenceType.TRANSFER, (ids) =>
        this.prisma.transfer.findMany({
          select: { id: true, transferNumber: true },
          where: { id: { in: ids } },
        }),
      ),
      lookUp(StockReferenceType.TRANSFER_ACKNOWLEDGEMENT, (ids) =>
        this.prisma.transferAcknowledgement.findMany({
          select: { id: true, transfer: { select: { id: true, transferNumber: true } } },
          where: { id: { in: ids } },
        }),
      ),
      lookUp(StockReferenceType.ORDER, (ids) =>
        this.prisma.restaurantOrder.findMany({
          select: { billNumber: true, id: true, orderNumber: true },
          where: { id: { in: ids } },
        }),
      ),
    ]);

    return new Map<string, ReferenceDocument>([
      ...grns.map((grn) => [grn.id, { id: grn.id, number: grn.grnNumber, type: 'GRN' }] as const),
      ...productions.map(
        (production) =>
          [
            production.id,
            { id: production.id, number: production.productionNumber, type: 'KITCHEN_PRODUCTION' },
          ] as const,
      ),
      ...transfers.map(
        (transfer) =>
          [
            transfer.id,
            { id: transfer.id, number: transfer.transferNumber, type: 'TRANSFER' },
          ] as const,
      ),
      ...acknowledgements.map(
        (acknowledgement) =>
          [
            acknowledgement.id,
            {
              id: acknowledgement.transfer.id,
              number: acknowledgement.transfer.transferNumber,
              type: 'TRANSFER',
            },
          ] as const,
      ),
      ...orders.map(
        (order) =>
          [
            order.id,
            { id: order.id, number: order.billNumber ?? order.orderNumber, type: 'ORDER' },
          ] as const,
      ),
    ]);
  }

  /** The live stores a levels or movements read covers (hospital-scoped like every read). */
  async findActiveStores(where: Prisma.StoreWhereInput) {
    return this.prisma.store.findMany({
      orderBy: { storeName: 'asc' },
      select: { hospitalId: true, id: true, storeCode: true, storeName: true },
      where: { ...where, deletedAt: null, isActive: true },
    });
  }

  /** The live restaurants a levels read covers. */
  async findActiveRestaurants(where: Prisma.RestaurantWhereInput) {
    return this.prisma.restaurant.findMany({
      orderBy: { restaurantName: 'asc' },
      select: { hospitalId: true, id: true, restaurantCode: true, restaurantName: true },
      where: { ...where, deletedAt: null, isActive: true },
    });
  }

  /** The live counters a levels read covers. */
  async findActiveCounters(where: Prisma.CounterWhereInput) {
    return this.prisma.counter.findMany({
      orderBy: { counterName: 'asc' },
      select: { counterCode: true, counterName: true, hospitalId: true, id: true },
      where: { ...where, deletedAt: null, isActive: true },
    });
  }

  /** What each item gave out of each location of this type since `since`. */
  async sumIssuedByLocationItem(
    locationType: InventoryLocationType,
    locationIds: string[],
    since: Date,
  ) {
    if (locationIds.length === 0) {
      return [];
    }

    return this.prisma.stockLedger.groupBy({
      _sum: { qtyOut: true },
      by: ['locationId', 'itemId'],
      where: {
        deletedAt: null,
        locationId: { in: locationIds },
        locationType,
        transactionDateTime: { gte: since },
      },
    });
  }

  /** In and out per business date at the stores, for one item or all. */
  async sumStoreMovementsByDay(storeIds: string[], since: Date, itemId?: string) {
    if (storeIds.length === 0) {
      return [];
    }

    return this.prisma.stockLedger.groupBy({
      _sum: { qtyIn: true, qtyOut: true },
      by: ['businessDate'],
      orderBy: { businessDate: 'asc' },
      where: {
        businessDate: { gte: since },
        deletedAt: null,
        ...(itemId ? { itemId } : {}),
        locationId: { in: storeIds },
        locationType: InventoryLocationType.STORE,
      },
    });
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
