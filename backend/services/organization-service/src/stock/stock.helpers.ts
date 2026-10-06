import type { Prisma } from '@prisma/client';
import { InventoryLocationType } from '@prisma/client';
import type { StockBalanceStatus } from './dto/list-stock-balances-query.dto';
import type { StockBalanceWithRelations, StockRepository } from './stock.repository';
import { toDateOnly, toNumber } from '../common/values';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

export function getBalanceStatus(balance: StockBalanceWithRelations): StockBalanceStatus {
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

export function getSummaryStatus(
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

export function compareNullableDates(left: Date | null, right: Date | null): number {
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

export function getStatusWhere(
  status: StockBalanceStatus | undefined,
): Prisma.StockBalanceWhereInput {
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

export function getStoreLocationMap(
  stores: Awaited<ReturnType<StockRepository['findStoresByIds']>>,
) {
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

export function getRestaurantLocationMap(
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

export function getKitchenLocationMap(
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

export function getStoreLocationIds<
  T extends { locationId: string; locationType: InventoryLocationType },
>(rows: T[]) {
  return [
    ...new Set(
      rows
        .filter((row) => row.locationType === InventoryLocationType.STORE)
        .map((row) => row.locationId),
    ),
  ];
}

export function getRestaurantLocationIds<
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

export function getKitchenLocationIds<
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
