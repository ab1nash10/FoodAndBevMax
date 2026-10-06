import type { GrnWithRelations } from './grns.repository';
import { toDateOnly, toNumber } from '../common/values';

interface PreparedGrnBatch {
  acceptedQty: number;
  batchNumber: string;
  expiryDate: Date;
  manufacturingDate?: Date;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
}

export interface PreparedGrnLine {
  acceptedQty: number;
  batches: PreparedGrnBatch[];
  itemId: string;
  orderedQty?: number;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
}

export function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(3));
}

export function isExpiredForAcceptance(expiryDate: Date): boolean {
  const today = toDateOnly(new Date());

  return toDateOnly(expiryDate) < today;
}

export function toGrnResponse(grn: GrnWithRelations) {
  return {
    createdAt: grn.createdAt,
    deletedAt: grn.deletedAt,
    grnNumber: grn.grnNumber,
    hospital: grn.hospital,
    hospitalId: grn.hospitalId,
    id: grn.id,
    invoiceNumber: grn.invoiceNumber,
    lines: grn.lines.map((line) => ({
      acceptedQty: toNumber(line.acceptedQty),
      batches: line.batches.map((batch) => ({
        acceptedQty: toNumber(batch.acceptedQty),
        batchNumber: batch.batchNumber,
        createdAt: batch.createdAt,
        expiryDate: batch.expiryDate,
        grnLineId: batch.grnLineId,
        id: batch.id,
        itemId: batch.itemId,
        manufacturingDate: batch.manufacturingDate,
        receivedQty: toNumber(batch.receivedQty),
        rejectedQty: toNumber(batch.rejectedQty),
        rejectionReason: batch.rejectionReason,
        updatedAt: batch.updatedAt,
      })),
      createdAt: line.createdAt,
      grnId: line.grnId,
      id: line.id,
      item: line.item,
      itemId: line.itemId,
      orderedQty: line.orderedQty === null ? null : toNumber(line.orderedQty),
      receivedQty: toNumber(line.receivedQty),
      rejectedQty: toNumber(line.rejectedQty),
      rejectionReason: line.rejectionReason,
      remarks: line.remarks,
      updatedAt: line.updatedAt,
    })),
    poNumber: grn.poNumber,
    receivedBy: grn.receivedBy,
    receivedDate: grn.receivedDate,
    remarks: grn.remarks,
    status: grn.status,
    store: grn.store,
    storeId: grn.storeId,
    updatedAt: grn.updatedAt,
    vendorName: grn.vendorName,
  };
}
