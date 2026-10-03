import { Injectable } from '@nestjs/common';
import { InventoryLocationType, Prisma } from '@prisma/client';
import { getPageMeta, getPagination } from '../common/pagination';
import {
  ListStockBalancesQueryDto,
  StockBalanceSortField,
  StockBalanceStatus,
} from './dto/list-stock-balances-query.dto';
import { ListStockLedgersQueryDto, StockLedgerSortField } from './dto/list-stock-ledgers-query.dto';
import {
  StockBalanceWithRelations,
  StockLedgerWithRelations,
  StockRepository,
} from './stock.repository';

function toDate(value: string): Date {
  return new Date(value);
}

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);

  date.setHours(0, 0, 0, 0);

  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

function toNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

function getLedgerOrderBy(
  query: ListStockLedgersQueryDto,
): Prisma.StockLedgerOrderByWithRelationInput {
  const sortBy: StockLedgerSortField = query.sortBy ?? 'transactionDateTime';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

function getBalanceOrderBy(
  query: ListStockBalancesQueryDto,
): Prisma.StockBalanceOrderByWithRelationInput {
  const sortBy: StockBalanceSortField = query.sortBy ?? 'lastUpdatedOn';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

function getBalanceStatus(balance: StockBalanceWithRelations): StockBalanceStatus {
  const availableQty = toNumber(balance.availableQty);
  const today = toDateOnly(new Date());
  const nearExpiryCutoff = addDays(today, 30);

  if (availableQty <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (balance.expiryDate && toDateOnly(balance.expiryDate) < today) {
    return 'EXPIRED';
  }

  if (
    balance.expiryDate &&
    toDateOnly(balance.expiryDate) >= today &&
    toDateOnly(balance.expiryDate) <= nearExpiryCutoff
  ) {
    return 'NEAR_EXPIRY';
  }

  if (balance.locationType === InventoryLocationType.KITCHEN && availableQty <= 10) {
    return 'LOW_STOCK';
  }

  return 'AVAILABLE';
}

function getSummaryStatus(
  batches: Array<{ availableQty: number; status: StockBalanceStatus }>,
): StockBalanceStatus {
  const availableBatches = batches.filter((batch) => batch.availableQty > 0);
  const totalAvailableQty = batches.reduce((total, batch) => total + batch.availableQty, 0);

  if (totalAvailableQty <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (
    availableBatches.length > 0 &&
    availableBatches.every((batch) => batch.status === 'EXPIRED')
  ) {
    return 'EXPIRED';
  }

  if (availableBatches.some((batch) => batch.status === 'NEAR_EXPIRY')) {
    return 'NEAR_EXPIRY';
  }

  return 'AVAILABLE';
}

function compareNullableDates(left: Date | null, right: Date | null): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.getTime() - right.getTime();
}

function getStatusWhere(status: StockBalanceStatus | undefined): Prisma.StockBalanceWhereInput {
  if (!status) {
    return {};
  }

  const today = toDateOnly(new Date());
  const nearExpiryCutoff = addDays(today, 30);

  if (status === 'OUT_OF_STOCK') {
    return {
      availableQty: {
        lte: 0,
      },
    };
  }

  if (status === 'EXPIRED') {
    return {
      availableQty: {
        gt: 0,
      },
      expiryDate: {
        lt: today,
      },
    };
  }

  if (status === 'NEAR_EXPIRY') {
    return {
      availableQty: {
        gt: 0,
      },
      expiryDate: {
        gte: today,
        lte: nearExpiryCutoff,
      },
    };
  }

  if (status === 'LOW_STOCK') {
    return {
      availableQty: {
        gt: 0,
        lte: 10,
      },
      locationType: InventoryLocationType.KITCHEN,
    };
  }

  return {
    availableQty: {
      gt: 0,
    },
    OR: [
      {
        expiryDate: null,
      },
      {
        expiryDate: {
          gt: nearExpiryCutoff,
        },
      },
    ],
  };
}

function getStoreLocationMap(stores: Awaited<ReturnType<StockRepository['findStoresByIds']>>) {
  return new Map(
    stores.map((store) => [
      store.id,
      {
        code: store.storeCode,
        id: store.id,
        name: store.storeName,
        type: InventoryLocationType.STORE,
      },
    ]),
  );
}

function getRestaurantLocationMap(
  restaurants: Awaited<ReturnType<StockRepository['findRestaurantsByIds']>>,
) {
  return new Map(
    restaurants.map((restaurant) => [
      restaurant.id,
      {
        code: restaurant.restaurantCode,
        id: restaurant.id,
        name: restaurant.restaurantName,
        type: InventoryLocationType.RESTAURANT,
      },
    ]),
  );
}

function getKitchenLocationMap(
  kitchens: Awaited<ReturnType<StockRepository['findKitchensByIds']>>,
) {
  return new Map(
    kitchens.map((kitchen) => [
      kitchen.id,
      {
        code: kitchen.kitchenCode,
        id: kitchen.id,
        name: kitchen.kitchenName,
        type: InventoryLocationType.KITCHEN,
      },
    ]),
  );
}

function getStoreLocationIds<T extends { locationId: string; locationType: InventoryLocationType }>(
  rows: T[],
) {
  return [
    ...new Set(
      rows
        .filter((row) => row.locationType === InventoryLocationType.STORE)
        .map((row) => row.locationId),
    ),
  ];
}

function getRestaurantLocationIds<
  T extends { locationId: string; locationType: InventoryLocationType },
>(rows: T[]) {
  return [
    ...new Set(
      rows
        .filter((row) => row.locationType === InventoryLocationType.RESTAURANT)
        .map((row) => row.locationId),
    ),
  ];
}

function getKitchenLocationIds<
  T extends { locationId: string; locationType: InventoryLocationType },
>(rows: T[]) {
  return [
    ...new Set(
      rows
        .filter((row) => row.locationType === InventoryLocationType.KITCHEN)
        .map((row) => row.locationId),
    ),
  ];
}

@Injectable()
export class StockService {
  constructor(private readonly stock: StockRepository) {}

  async listBalances(query: ListStockBalancesQueryDto) {
    const { limit, page } = getPagination(query);
    const storeIdsForSearch = query.search
      ? await this.stock.findStoreIdsBySearch(query.search)
      : [];
    const restaurantIdsForSearch = query.search
      ? await this.stock.findRestaurantIdsBySearch(query.search)
      : [];
    const kitchenIdsForSearch = query.search
      ? await this.stock.findKitchenIdsBySearch(query.search)
      : [];
    const where: Prisma.StockBalanceWhereInput = {
      // In AND so the status filter's OR survives the search OR below; spread, the search replaced it.
      AND: [getStatusWhere(query.status)],
      deletedAt: null,
      ...(query.batchNumber
        ? { batchNumber: { contains: query.batchNumber, mode: 'insensitive' } }
        : {}),
      ...(query.businessDate ? { businessDate: toDateOnly(query.businessDate) } : {}),
      ...(query.expiryDate ? { expiryDate: toDateOnly(query.expiryDate) } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.locationType ? { locationType: query.locationType } : {}),
      ...(query.search
        ? {
            OR: [
              { batchNumber: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              ...(storeIdsForSearch.length ? [{ locationId: { in: storeIdsForSearch } }] : []),
              ...(restaurantIdsForSearch.length
                ? [{ locationId: { in: restaurantIdsForSearch } }]
                : []),
              ...(kitchenIdsForSearch.length ? [{ locationId: { in: kitchenIdsForSearch } }] : []),
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.stock.findBalances({
        orderBy: getBalanceOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.stock.countBalances({ where }),
    ]);
    const stores = await this.stock.findStoresByIds(getStoreLocationIds(items));
    const restaurants = await this.stock.findRestaurantsByIds(getRestaurantLocationIds(items));
    const kitchens = await this.stock.findKitchensByIds(getKitchenLocationIds(items));
    const storeLocationMap = getStoreLocationMap(stores);
    const restaurantLocationMap = getRestaurantLocationMap(restaurants);
    const kitchenLocationMap = getKitchenLocationMap(kitchens);

    return {
      items: items.map((item) => ({
        availableQty: toNumber(item.availableQty),
        batchNumber: item.batchNumber,
        businessDate: item.businessDate,
        createdAt: item.createdAt,
        deletedAt: item.deletedAt,
        expiryDate: item.expiryDate,
        hospital: item.hospital,
        hospitalId: item.hospitalId,
        id: item.id,
        item: item.item,
        itemId: item.itemId,
        itemType: item.itemType,
        lastUpdatedOn: item.lastUpdatedOn,
        location: storeLocationMap.get(item.locationId) ??
          restaurantLocationMap.get(item.locationId) ??
          kitchenLocationMap.get(item.locationId) ?? {
            code: null,
            id: item.locationId,
            name: item.locationId,
            type: item.locationType,
          },
        locationId: item.locationId,
        locationType: item.locationType,
        reservedQty: toNumber(item.reservedQty),
        status: getBalanceStatus(item),
        updatedAt: item.updatedAt,
      })),
      meta: getPageMeta(page, limit, total),
    };
  }

  async listStoreSummaries(query: ListStockBalancesQueryDto) {
    const { limit, page } = getPagination(query);
    const storeIdsForSearch = query.search
      ? await this.stock.findStoreIdsBySearch(query.search)
      : [];
    const where: Prisma.StockBalanceWhereInput = {
      AND: [getStatusWhere(query.status)],
      deletedAt: null,
      ...(query.batchNumber
        ? { batchNumber: { contains: query.batchNumber, mode: 'insensitive' } }
        : {}),
      ...(query.expiryDate ? { expiryDate: toDateOnly(query.expiryDate) } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      locationType: InventoryLocationType.STORE,
      ...(query.search
        ? {
            OR: [
              { batchNumber: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              ...(storeIdsForSearch.length ? [{ locationId: { in: storeIdsForSearch } }] : []),
            ],
          }
        : {}),
    };

    const balances = await this.stock.findBalances({
      orderBy: [
        {
          locationId: 'asc',
        },
        {
          item: {
            itemName: 'asc',
          },
        },
        {
          expiryDate: 'asc',
        },
      ],
      where,
    });
    const storeLocationMap = getStoreLocationMap(
      await this.stock.findStoresByIds(getStoreLocationIds(balances)),
    );
    const groupMap = new Map<
      string,
      {
        batches: Array<{
          availableQty: number;
          batchNumber: string | null;
          expiryDate: Date | null;
          reservedQty: number;
          status: StockBalanceStatus;
          stockBalanceId: string;
        }>;
        categoryName: string | null;
        hospitalId: string;
        itemCode: string;
        itemId: string;
        itemName: string;
        itemType: string;
        lastUpdatedOn: Date;
        nearestExpiryDate: Date | null;
        storeCode: string | null;
        storeId: string;
        storeName: string;
        totalAvailableQty: number;
        totalReservedQty: number;
      }
    >();

    for (const balance of balances) {
      const location = storeLocationMap.get(balance.locationId) ?? {
        code: null,
        id: balance.locationId,
        name: balance.locationId,
        type: InventoryLocationType.STORE,
      };
      const key = `${balance.locationId}:${balance.itemId}`;
      const availableQty = toNumber(balance.availableQty);
      const reservedQty = toNumber(balance.reservedQty);
      const status = getBalanceStatus(balance);
      const existing = groupMap.get(key) ?? {
        batches: [],
        categoryName: balance.item.category?.categoryName ?? null,
        hospitalId: balance.hospitalId,
        itemCode: balance.item.itemCode,
        itemId: balance.itemId,
        itemName: balance.item.itemName,
        itemType: balance.item.itemType,
        lastUpdatedOn: balance.lastUpdatedOn,
        nearestExpiryDate: null,
        storeCode: location.code,
        storeId: balance.locationId,
        storeName: location.name,
        totalAvailableQty: 0,
        totalReservedQty: 0,
      };

      existing.totalAvailableQty += availableQty;
      existing.totalReservedQty += reservedQty;
      existing.lastUpdatedOn =
        balance.lastUpdatedOn > existing.lastUpdatedOn
          ? balance.lastUpdatedOn
          : existing.lastUpdatedOn;

      if (
        availableQty > 0 &&
        balance.expiryDate &&
        compareNullableDates(balance.expiryDate, existing.nearestExpiryDate) < 0
      ) {
        existing.nearestExpiryDate = balance.expiryDate;
      }

      existing.batches.push({
        availableQty,
        batchNumber: balance.batchNumber,
        expiryDate: balance.expiryDate,
        reservedQty,
        status,
        stockBalanceId: balance.id,
      });
      groupMap.set(key, existing);
    }

    const summaries = Array.from(groupMap.values()).map((summary) => ({
      ...summary,
      batchCount: summary.batches.length,
      status: getSummaryStatus(summary.batches),
      totalAvailableQty: Number(summary.totalAvailableQty.toFixed(3)),
      totalReservedQty: Number(summary.totalReservedQty.toFixed(3)),
    }));
    const direction = query.sortOrder === 'asc' ? 1 : -1;

    summaries.sort((left, right) => {
      if (query.sortBy === 'availableQty') {
        return (left.totalAvailableQty - right.totalAvailableQty) * direction;
      }

      if (query.sortBy === 'expiryDate') {
        return compareNullableDates(left.nearestExpiryDate, right.nearestExpiryDate) * direction;
      }

      const updatedCompare =
        (left.lastUpdatedOn.getTime() - right.lastUpdatedOn.getTime()) * direction;

      if (updatedCompare !== 0) {
        return updatedCompare;
      }

      return `${left.storeName} ${left.itemName}`.localeCompare(
        `${right.storeName} ${right.itemName}`,
      );
    });

    const total = summaries.length;

    return {
      items: summaries.slice((page - 1) * limit, page * limit),
      meta: getPageMeta(page, limit, total),
    };
  }

  async listLedgers(query: ListStockLedgersQueryDto) {
    const { limit, page } = getPagination(query);
    const storeIdsForSearch = query.search
      ? await this.stock.findStoreIdsBySearch(query.search)
      : [];
    const restaurantIdsForSearch = query.search
      ? await this.stock.findRestaurantIdsBySearch(query.search)
      : [];
    const kitchenIdsForSearch = query.search
      ? await this.stock.findKitchenIdsBySearch(query.search)
      : [];
    const where: Prisma.StockLedgerWhereInput = {
      deletedAt: null,
      ...(query.batchNumber
        ? { batchNumber: { contains: query.batchNumber, mode: 'insensitive' } }
        : {}),
      ...(query.businessDate ? { businessDate: toDateOnly(query.businessDate) } : {}),
      ...(query.expiryDate ? { expiryDate: toDateOnly(query.expiryDate) } : {}),
      ...(query.fromDate || query.toDate
        ? {
            transactionDateTime: {
              ...(query.fromDate ? { gte: toDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: toDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.locationType ? { locationType: query.locationType } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(query.transactionType ? { transactionType: query.transactionType } : {}),
      ...(query.search
        ? {
            OR: [
              { batchNumber: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              ...(storeIdsForSearch.length ? [{ locationId: { in: storeIdsForSearch } }] : []),
              ...(restaurantIdsForSearch.length
                ? [{ locationId: { in: restaurantIdsForSearch } }]
                : []),
              ...(kitchenIdsForSearch.length ? [{ locationId: { in: kitchenIdsForSearch } }] : []),
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.stock.findLedgers({
        orderBy: getLedgerOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.stock.countLedgers({ where }),
    ]);
    const stores = await this.stock.findStoresByIds(getStoreLocationIds(items));
    const restaurants = await this.stock.findRestaurantsByIds(getRestaurantLocationIds(items));
    const kitchens = await this.stock.findKitchensByIds(getKitchenLocationIds(items));
    const storeLocationMap = getStoreLocationMap(stores);
    const restaurantLocationMap = getRestaurantLocationMap(restaurants);
    const kitchenLocationMap = getKitchenLocationMap(kitchens);

    return {
      items: items.map((item: StockLedgerWithRelations) => ({
        balanceAfter: toNumber(item.balanceAfter),
        batchNumber: item.batchNumber,
        businessDate: item.businessDate,
        createdAt: item.createdAt,
        deletedAt: item.deletedAt,
        expiryDate: item.expiryDate,
        hospital: item.hospital,
        hospitalId: item.hospitalId,
        id: item.id,
        item: item.item,
        itemId: item.itemId,
        itemType: item.itemType,
        location: storeLocationMap.get(item.locationId) ??
          restaurantLocationMap.get(item.locationId) ??
          kitchenLocationMap.get(item.locationId) ?? {
            code: null,
            id: item.locationId,
            name: item.locationId,
            type: item.locationType,
          },
        locationId: item.locationId,
        locationType: item.locationType,
        qtyIn: toNumber(item.qtyIn),
        qtyOut: toNumber(item.qtyOut),
        referenceId: item.referenceId,
        referenceType: item.referenceType,
        remarks: item.remarks,
        transactionDateTime: item.transactionDateTime,
        transactionType: item.transactionType,
        updatedAt: item.updatedAt,
      })),
      meta: getPageMeta(page, limit, total),
    };
  }

  async listRestaurantBalances(query: ListStockBalancesQueryDto) {
    return this.listBalances({
      ...query,
      locationType: InventoryLocationType.RESTAURANT,
    });
  }

  async listRestaurantLedgers(query: ListStockLedgersQueryDto) {
    return this.listLedgers({
      ...query,
      locationType: InventoryLocationType.RESTAURANT,
    });
  }

  async listKitchenBalances(query: ListStockBalancesQueryDto) {
    return this.listBalances({
      ...query,
      locationType: InventoryLocationType.KITCHEN,
    });
  }

  async listKitchenLedgers(query: ListStockLedgersQueryDto) {
    return this.listLedgers({
      ...query,
      locationType: InventoryLocationType.KITCHEN,
    });
  }
}
