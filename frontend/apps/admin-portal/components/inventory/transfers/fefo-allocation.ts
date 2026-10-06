'use client';

import type { InventoryLocationType, StockBalance, StockBalanceStatus } from '@aahar/api-client';
import { toDateOnlyValue } from '@/components/inventory/shared/utils';

export interface TransferItemGroup {
  batchCount: number;
  businessDate: string | null;
  itemCode: string;
  itemId: string;
  itemName: string;
  key: string;
  nearestExpiryDate: string | null;
  status: StockBalanceStatus;
  stocks: StockBalance[];
  totalAvailableQty: number;
}

interface AllocationPreviewLine {
  allocatedQty: number;
  stock: StockBalance;
}

export interface PreparedTransferLine {
  remarks?: string;
  sentQty: number;
  stock: StockBalance;
}

function compareStockForAllocation(
  left: StockBalance,
  right: StockBalance,
  sourceType: InventoryLocationType,
): number {
  const leftDate = sourceType === 'KITCHEN' ? left.businessDate : left.expiryDate;
  const rightDate = sourceType === 'KITCHEN' ? right.businessDate : right.expiryDate;

  if (!leftDate && !rightDate) {
    return left.updatedAt.localeCompare(right.updatedAt);
  }

  if (!leftDate) {
    return 1;
  }

  if (!rightDate) {
    return -1;
  }

  const dateCompare = new Date(leftDate).getTime() - new Date(rightDate).getTime();

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function getTransferGroupKey(stock: StockBalance, sourceType: InventoryLocationType): string {
  if (sourceType === 'KITCHEN') {
    return `${stock.itemId}:${toDateOnlyValue(stock.businessDate)}`;
  }

  return stock.itemId;
}

function getStockSummaryStatus(stocks: StockBalance[]): StockBalanceStatus {
  const totalAvailableQty = stocks.reduce((total, stock) => total + stock.availableQty, 0);
  const availableStocks = stocks.filter((stock) => stock.availableQty > 0);

  if (totalAvailableQty <= 0) {
    return 'OUT_OF_STOCK';
  }

  if (availableStocks.length > 0 && availableStocks.every((stock) => stock.status === 'EXPIRED')) {
    return 'EXPIRED';
  }

  if (availableStocks.some((stock) => stock.status === 'NEAR_EXPIRY')) {
    return 'NEAR_EXPIRY';
  }

  return 'AVAILABLE';
}

export function buildTransferItemGroups(
  stocks: StockBalance[],
  sourceType: InventoryLocationType,
): TransferItemGroup[] {
  const groups = new Map<string, StockBalance[]>();

  stocks.forEach((stock) => {
    const key = getTransferGroupKey(stock, sourceType);
    groups.set(key, [...(groups.get(key) ?? []), stock]);
  });

  return Array.from(groups.entries())
    .map(([key, groupStocks]) => {
      const sortedStocks = [...groupStocks].sort((left, right) =>
        compareStockForAllocation(left, right, sourceType),
      );
      const firstStock = sortedStocks[0];
      const nearestExpiryDate =
        sourceType === 'KITCHEN'
          ? toDateOnlyValue(firstStock?.businessDate)
          : toDateOnlyValue(firstStock?.expiryDate);

      return {
        batchCount: sortedStocks.length,
        businessDate: sourceType === 'KITCHEN' ? toDateOnlyValue(firstStock?.businessDate) : null,
        itemCode: firstStock?.item.itemCode ?? '',
        itemId: firstStock?.itemId ?? '',
        itemName: firstStock?.item.itemName ?? '',
        key,
        nearestExpiryDate: nearestExpiryDate || null,
        status: getStockSummaryStatus(sortedStocks),
        stocks: sortedStocks,
        totalAvailableQty: Number(
          sortedStocks.reduce((total, stock) => total + stock.availableQty, 0).toFixed(3),
        ),
      };
    })
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
}

export function allocateFefo(
  stocks: StockBalance[],
  requestedQty: number,
  sourceType: InventoryLocationType,
  remainingByStockId?: Map<string, number>,
): AllocationPreviewLine[] {
  let remainingQty = requestedQty;
  const allocations: AllocationPreviewLine[] = [];

  for (const stock of [...stocks].sort((left, right) =>
    compareStockForAllocation(left, right, sourceType),
  )) {
    if (remainingQty <= 0) {
      break;
    }

    const availableQty = remainingByStockId?.get(stock.id) ?? stock.availableQty;

    if (availableQty <= 0) {
      continue;
    }

    const allocatedQty = Math.min(availableQty, remainingQty);

    allocations.push({
      allocatedQty: Number(allocatedQty.toFixed(3)),
      stock,
    });
    remainingQty = Number((remainingQty - allocatedQty).toFixed(3));

    if (remainingByStockId) {
      remainingByStockId.set(stock.id, Number((availableQty - allocatedQty).toFixed(3)));
    }
  }

  return allocations;
}

/** Near-expiry batches (store stock) are flagged on the line, as they go first under FEFO. */
export const fefoWarningDays = 3;
