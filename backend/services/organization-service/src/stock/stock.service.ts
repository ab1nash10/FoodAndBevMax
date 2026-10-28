import { Injectable } from '@nestjs/common';
import { InventoryLocationType, ItemType, Prisma } from '@prisma/client';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import {
  ListStockBalancesQueryDto,
  StockBalanceStatus,
  stockBalanceStatuses,
} from './dto/list-stock-balances-query.dto';
import { ListStockLedgersQueryDto } from './dto/list-stock-ledgers-query.dto';
import {
  LocationLevelsQueryDto,
  StoreLevelsQueryDto,
  StoreMovementsQueryDto,
} from './dto/store-levels-query.dto';
import {
  StockBalanceWithRelations,
  StockLedgerWithRelations,
  StockRepository,
} from './stock.repository';
import { siteClock } from '../restaurant-orders/board-schedule';

/** The window an item's daily issue is averaged over, and the cover that counts as low. */
const ISSUE_WINDOW_DAYS = 28;
const LOW_COVER_DAYS = 3;

/** A store, restaurant or counter as a levels read names it. */
interface LevelLocation {
  code: string;
  hospitalId: string;
  id: string;
  name: string;
}

interface LocationLevel {
  batches: Array<{
    availableQty: number;
    batchNumber: string | null;
    expiryDate: Date | null;
    receivedOn: Date;
  }>;
  coverDays: number | null;
  hospitalId: string;
  issuedLast28Days: number;
  itemCode: string;
  itemId: string;
  itemName: string;
  level: 'LOW' | 'OK' | 'OUT';
  locationCode: string | null;
  locationId: string;
  locationName: string;
  nextExpiryDate: Date | null;
  onHand: number;
}
import { toDate, toDateOnly, toNumber } from '../common/values';
import {
  compareNullableDates,
  getBalanceStatus,
  getCounterLocationIds,
  getCounterLocationMap,
  getKitchenLocationIds,
  getKitchenLocationMap,
  getRestaurantLocationIds,
  getRestaurantLocationMap,
  getStatusWhere,
  getStoreLocationIds,
  getStoreLocationMap,
  getSummaryStatus,
} from './stock.helpers';

/** Per state, how many store-item groups hold at least one batch in it. */
function summaryStatusCounts(balances: StockBalanceWithRelations[]): Record<string, number> {
  const states = new Map<string, Set<StockBalanceStatus>>();

  for (const balance of balances) {
    const key = `${balance.locationId}:${balance.itemId}`;
    states.set(key, (states.get(key) ?? new Set()).add(getBalanceStatus(balance)));
  }

  const counts: Record<string, number> = {};
  for (const set of states.values()) {
    for (const state of set) counts[state] = (counts[state] ?? 0) + 1;
  }

  return counts;
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

    const [items, total, stateCounts] = await Promise.all([
      this.stock.findBalances({
        orderBy: getOrderBy(query, 'lastUpdatedOn'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.stock.countBalances({ where }),
      // Every state's tab at once: the other filters, whichever tab is open.
      query.statusCounts
        ? Promise.all(
            stockBalanceStatuses.map((status) =>
              this.stock.countBalances({ where: { ...where, AND: [getStatusWhere(status)] } }),
            ),
          )
        : undefined,
    ]);
    const stores = await this.stock.findStoresByIds(getStoreLocationIds(items));
    const restaurants = await this.stock.findRestaurantsByIds(getRestaurantLocationIds(items));
    const kitchens = await this.stock.findKitchensByIds(getKitchenLocationIds(items));
    const counters = await this.stock.findCountersByIds(getCounterLocationIds(items));
    const storeLocationMap = getStoreLocationMap(stores);
    const restaurantLocationMap = getRestaurantLocationMap(restaurants);
    const kitchenLocationMap = getKitchenLocationMap(kitchens);
    const counterLocationMap = getCounterLocationMap(counters);

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
          kitchenLocationMap.get(item.locationId) ??
          counterLocationMap.get(item.locationId) ?? {
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
      meta: {
        ...getPageMeta(page, limit, total),
        ...(stateCounts
          ? {
              statusCounts: Object.fromEntries(
                stockBalanceStatuses.map((status, index) => [status, stateCounts[index]!]),
              ),
            }
          : {}),
      },
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
    // The category each store gave the item on its own mapping.
    const storeCategories = await this.stock.findStoreItemCategories(
      balances.map((balance) => ({ itemId: balance.itemId, storeId: balance.locationId })),
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
        itemType: string | null;
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
        categoryName: storeCategories.get(key) ?? null,
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
    // Each tab lists an item when one of its batches is in that state: count them from one load
    // (this one, unless a tab narrowed it).
    const statusCounts = query.statusCounts
      ? summaryStatusCounts(
          query.status ? await this.stock.findBalances({ where: { ...where, AND: [] } }) : balances,
        )
      : undefined;

    return {
      items: summaries.slice((page - 1) * limit, page * limit),
      meta: { ...getPageMeta(page, limit, total), ...(statusCounts ? { statusCounts } : {}) },
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

    const [items, total, byReferenceType] = await Promise.all([
      this.stock.findLedgers({
        orderBy: getOrderBy(query, 'transactionDateTime'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.stock.countLedgers({ where }),
      // Every reference type's tab at once: the other filters, whichever tab is open.
      query.referenceTypeCounts
        ? this.stock.countLedgersByReferenceType({ ...where, referenceType: undefined })
        : undefined,
    ]);
    const stores = await this.stock.findStoresByIds(getStoreLocationIds(items));
    const restaurants = await this.stock.findRestaurantsByIds(getRestaurantLocationIds(items));
    const kitchens = await this.stock.findKitchensByIds(getKitchenLocationIds(items));
    const counters = await this.stock.findCountersByIds(getCounterLocationIds(items));
    const storeLocationMap = getStoreLocationMap(stores);
    const restaurantLocationMap = getRestaurantLocationMap(restaurants);
    const kitchenLocationMap = getKitchenLocationMap(kitchens);
    const counterLocationMap = getCounterLocationMap(counters);
    const documents = await this.stock.findReferenceDocuments(items);

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
          kitchenLocationMap.get(item.locationId) ??
          counterLocationMap.get(item.locationId) ?? {
            code: null,
            id: item.locationId,
            name: item.locationId,
            type: item.locationType,
          },
        locationId: item.locationId,
        locationType: item.locationType,
        qtyIn: toNumber(item.qtyIn),
        qtyOut: toNumber(item.qtyOut),
        // The GRN, transfer, production or bill behind the row, by its number.
        referenceDocument: item.referenceId ? (documents.get(item.referenceId) ?? null) : null,
        referenceId: item.referenceId,
        referenceType: item.referenceType,
        remarks: item.remarks,
        transactionDateTime: item.transactionDateTime,
        transactionType: item.transactionType,
        updatedAt: item.updatedAt,
      })),
      meta: {
        ...getPageMeta(page, limit, total),
        ...(byReferenceType
          ? {
              referenceTypeCounts: Object.fromEntries(
                // A ledger line without a reference type is under no tab.
                byReferenceType.flatMap((row) =>
                  row.referenceType ? [[row.referenceType, row._count._all] as const] : [],
                ),
              ),
            }
          : {}),
      },
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

  async listCounterBalances(query: ListStockBalancesQueryDto) {
    return this.listBalances({
      ...query,
      locationType: InventoryLocationType.COUNTER,
    });
  }

  async listCounterLedgers(query: ListStockLedgersQueryDto) {
    return this.listLedgers({
      ...query,
      locationType: InventoryLocationType.COUNTER,
    });
  }

  /** Each store item's days of cover (see listLevels), named by its store. */
  async listStoreLevels(query: StoreLevelsQueryDto) {
    const stores = await this.stock.findActiveStores({
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.storeId ? { id: query.storeId } : {}),
    });
    const levels = await this.listLevels(
      InventoryLocationType.STORE,
      stores.map((store) => ({
        code: store.storeCode,
        hospitalId: store.hospitalId,
        id: store.id,
        name: store.storeName,
      })),
    );

    return {
      ...levels,
      items: levels.items.map(({ locationCode, locationId, locationName, ...item }) => ({
        ...item,
        storeCode: locationCode,
        storeId: locationId,
        storeName: locationName,
      })),
    };
  }

  /** Each restaurant's store items against their days of cover, for sending more in time. */
  async listRestaurantLevels(query: LocationLevelsQueryDto) {
    const restaurants = await this.stock.findActiveRestaurants({
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.locationId ? { id: query.locationId } : {}),
    });

    return this.listLevels(
      InventoryLocationType.RESTAURANT,
      restaurants.map((restaurant) => ({
        code: restaurant.restaurantCode,
        hospitalId: restaurant.hospitalId,
        id: restaurant.id,
        name: restaurant.restaurantName,
      })),
    );
  }

  /** Each counter's store items against their days of cover, for sending more in time. */
  async listCounterLevels(query: LocationLevelsQueryDto) {
    const counters = await this.stock.findActiveCounters({
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.locationId ? { id: query.locationId } : {}),
    });

    return this.listLevels(
      InventoryLocationType.COUNTER,
      counters.map((counter) => ({
        code: counter.counterCode,
        hospitalId: counter.hospitalId,
        id: counter.id,
        name: counter.counterName,
      })),
    );
  }

  /**
   * Each item at these locations against how fast it goes: on hand, what it gave out over the
   * last four weeks (and so a day's average), how many days that lasts, and its batches by
   * expiry. LOW is under three days of cover; an item that gave nothing out has no cover figure.
   */
  private async listLevels(locationType: InventoryLocationType, locations: LevelLocation[]) {
    const locationIds = locations.map((location) => location.id);
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const since = new Date(Date.now() - ISSUE_WINDOW_DAYS * 86_400_000);
    // ponytail: no paging; a location holds a few hundred items at most.
    const [balances, issued] = await Promise.all([
      locationIds.length
        ? this.stock.findBalances({
            orderBy: [{ expiryDate: 'asc' }],
            where: {
              deletedAt: null,
              // Past the store, only what a store can send more of: kitchen-made items are
              // made fresh for the day, not topped up.
              ...(locationType === InventoryLocationType.STORE
                ? {}
                : { itemType: { not: ItemType.READYMADE } }),
              locationId: { in: locationIds },
              locationType,
            },
          })
        : Promise.resolve([]),
      this.stock.sumIssuedByLocationItem(locationType, locationIds, since),
    ]);
    const issuedByKey = new Map(
      issued.map((row) => [`${row.locationId}:${row.itemId}`, toNumber(row._sum.qtyOut ?? 0)]),
    );
    const levels = new Map<string, LocationLevel>();

    for (const balance of balances) {
      const key = `${balance.locationId}:${balance.itemId}`;
      const location = locationById.get(balance.locationId);
      const availableQty = toNumber(balance.availableQty);
      const level = levels.get(key) ?? {
        batches: [],
        coverDays: null,
        hospitalId: balance.hospitalId,
        issuedLast28Days: issuedByKey.get(key) ?? 0,
        itemCode: balance.item.itemCode,
        itemId: balance.itemId,
        itemName: balance.item.itemName,
        level: 'OK' as const,
        locationCode: location?.code ?? null,
        locationId: balance.locationId,
        locationName: location?.name ?? balance.locationId,
        nextExpiryDate: null,
        onHand: 0,
      };

      level.onHand += availableQty;

      if (availableQty > 0) {
        level.batches.push({
          availableQty,
          batchNumber: balance.batchNumber,
          expiryDate: balance.expiryDate,
          receivedOn: balance.createdAt,
        });
        level.nextExpiryDate ??= balance.expiryDate;
      }

      levels.set(key, level);
    }

    const items = [...levels.values()].map((level) => {
      const onHand = Number(level.onHand.toFixed(3));
      const dailyIssue = level.issuedLast28Days / ISSUE_WINDOW_DAYS;
      const coverDays = dailyIssue > 0 ? Number((onHand / dailyIssue).toFixed(1)) : null;

      return {
        ...level,
        averageDailyIssue: Number(dailyIssue.toFixed(3)),
        coverDays,
        level:
          onHand <= 0
            ? ('OUT' as const)
            : coverDays !== null && coverDays < LOW_COVER_DAYS
              ? ('LOW' as const)
              : ('OK' as const),
        onHand,
      };
    });
    const rank = { LOW: 1, OK: 2, OUT: 0 };

    // What needs action first: out, then running low (shortest cover first), then the rest.
    items.sort(
      (left, right) =>
        rank[left.level] - rank[right.level] ||
        (left.coverDays ?? Infinity) - (right.coverDays ?? Infinity) ||
        left.itemName.localeCompare(right.itemName),
    );

    return { items, lowCoverDays: LOW_COVER_DAYS, windowDays: ISSUE_WINDOW_DAYS };
  }

  /** Received and sent out per day at the stores (one item, or all), every day of the window. */
  async listStoreMovements(query: StoreMovementsQueryDto) {
    const days = query.days ?? 14;
    const stores = await this.stock.findActiveStores({
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.storeId ? { id: query.storeId } : {}),
    });
    // The site's (India's) today, not the server's.
    const today = toDateOnly(siteClock(new Date()).date);
    const since = new Date(today.getTime() - (days - 1) * 86_400_000);
    const rows = await this.stock.sumStoreMovementsByDay(
      stores.map((store) => store.id),
      since,
      query.itemId,
    );
    const byDay = new Map(rows.map((row) => [row.businessDate.toISOString().slice(0, 10), row]));

    return {
      days: Array.from({ length: days }, (_, index) => {
        const date = new Date(since.getTime() + index * 86_400_000).toISOString().slice(0, 10);
        const row = byDay.get(date);

        return {
          date,
          qtyIn: toNumber(row?._sum.qtyIn ?? 0),
          qtyOut: toNumber(row?._sum.qtyOut ?? 0),
        };
      }),
    };
  }
}
