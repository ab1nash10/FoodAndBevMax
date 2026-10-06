import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryLocationType, ItemType, StockTransactionType } from '@prisma/client';
import type { TransferWithRelations } from './transfers.repository';
import { optionalText, toDateOnly, toNumber } from '../common/values';

export interface PreparedTransferLine {
  batchNumber: string | null;
  expiryDate: Date | null;
  itemId: string;
  itemName: string;
  itemType: ItemType;
  remarks?: string;
  sentQty: number;
}

function formatQuantity(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function formatDateOnly(value: Date): string {
  return toDateOnly(value).toISOString().slice(0, 10);
}

export function stockKey(input: {
  batchNumber: string | null;
  businessDate?: Date | null;
  expiryDate: Date | null;
  itemId: string;
}): string {
  return `${input.itemId}|${input.batchNumber ?? ''}|${
    input.expiryDate ? formatDateOnly(input.expiryDate) : ''
  }|${input.businessDate ? formatDateOnly(input.businessDate) : ''}`;
}

export function sourceItemType(sourceType: InventoryLocationType): ItemType {
  return sourceType === InventoryLocationType.KITCHEN ? ItemType.READYMADE : ItemType.MRP;
}

export function dispatchTransactionType(sourceType: InventoryLocationType): StockTransactionType {
  return sourceType === InventoryLocationType.KITCHEN
    ? StockTransactionType.KITCHEN_TRANSFER_OUT
    : StockTransactionType.STORE_TO_RESTAURANT_OUT;
}

export function sourceDisplayName(sourceType: InventoryLocationType): string {
  return sourceType === InventoryLocationType.KITCHEN ? 'kitchen' : 'store';
}

export function stockBalanceKey(
  line: Pick<PreparedTransferLine, 'batchNumber' | 'expiryDate' | 'itemId'>,
  businessDate: Date,
) {
  return {
    batchNumber: line.batchNumber,
    businessDate: line.expiryDate ? null : businessDate,
    expiryDate: line.expiryDate,
    itemId: line.itemId,
  };
}

function lineLabelForStock(
  line: Pick<PreparedTransferLine, 'batchNumber' | 'expiryDate' | 'itemName'>,
  businessDate: Date,
): string {
  if (line.batchNumber) {
    return `Selected batch ${line.batchNumber}`;
  }

  return `Selected item ${line.itemName} for business date ${formatDateOnly(businessDate)}`;
}

export function insufficientStockMessage(
  line: Pick<PreparedTransferLine, 'batchNumber' | 'expiryDate' | 'itemName'>,
  businessDate: Date,
  availableQty: number,
  requestedQty: number,
): string {
  return `${lineLabelForStock(line, businessDate)} has available stock ${formatQuantity(
    availableQty,
  )}. Requested quantity ${formatQuantity(requestedQty)}.`;
}

export function toNullableDate(value: string | undefined): Date | null {
  return value ? toDateOnly(value) : null;
}

export function toNullableText(value: string | undefined): string | null {
  return optionalText(value) ?? null;
}

/**
 * The routes accept either the store or the kitchen transfer permission, so the check that the
 * permission matches the source has to happen here: a kitchen-only grant must not move store stock.
 */
export function assertCanMoveStockFrom(
  sourceType: InventoryLocationType,
  action: 'CREATE' | 'DISPATCH',
  permissions: string[] | undefined,
): void {
  const accepted =
    sourceType === InventoryLocationType.KITCHEN
      ? [`TRANSFER_${action}`, `KITCHEN_TRANSFER_${action}`]
      : [`TRANSFER_${action}`];

  if (!accepted.some((code) => permissions?.includes(code))) {
    throw new ForbiddenException(
      `You do not have permission to transfer from a ${sourceDisplayName(sourceType)}`,
    );
  }
}

export function assertSupportedSource(sourceType: InventoryLocationType): void {
  if (sourceType !== InventoryLocationType.STORE && sourceType !== InventoryLocationType.KITCHEN) {
    throw new BadRequestException('Source must be Store or Kitchen');
  }
}

export function toTransferResponse(transfer: TransferWithRelations) {
  return {
    businessDate: transfer.businessDate,
    createdAt: transfer.createdAt,
    deletedAt: transfer.deletedAt,
    destinationId: transfer.destinationId,
    destinationType: transfer.destinationType,
    hospital: transfer.hospital,
    hospitalId: transfer.hospitalId,
    id: transfer.id,
    lines: transfer.lines.map((line) => ({
      acceptedQty: toNumber(line.acceptedQty),
      batchNumber: line.batchNumber,
      createdAt: line.createdAt,
      expiryDate: line.expiryDate,
      id: line.id,
      item: line.item,
      itemId: line.itemId,
      rejectedQty: toNumber(line.rejectedQty),
      rejectionReason: line.rejectionReason,
      remarks: line.remarks,
      sentQty: toNumber(line.sentQty),
      transferId: line.transferId,
      updatedAt: line.updatedAt,
    })),
    remarks: transfer.remarks,
    sourceId: transfer.sourceId,
    sourceType: transfer.sourceType,
    status: transfer.status,
    transferDate: transfer.transferDate,
    transferNumber: transfer.transferNumber,
    updatedAt: transfer.updatedAt,
  };
}
