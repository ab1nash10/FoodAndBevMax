import { Injectable } from '@nestjs/common';
import { InventoryLocationType, Prisma } from '@prisma/client';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { ListStockBalancesQueryDto, StockBalanceStatus } from './dto/list-stock-balances-query.dto';
import { ListStockLedgersQueryDto } from './dto/list-stock-ledgers-query.dto';
import { StockLedgerWithRelations, StockRepository } from './stock.repository';
import { toDate, toDateOnly, toNumber } from '../common/values';
import {
  compareNullableDates,
  getBalanceStatus,
  getKitchenLocationIds,
  getKitchenLocationMap,
  getRestaurantLocationIds,
  getRestaurantLocationMap,
  getStatusWhere,
  getStoreLocationIds,
  getStoreLocationMap,
  getSummaryStatus,
} from './stock.helpers';

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
        orderBy: getOrderBy(query, 'lastUpdatedOn'),
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
        orderBy: getOrderBy(query, 'transactionDateTime'),
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
