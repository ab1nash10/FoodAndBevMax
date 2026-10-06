import type { ItemSummary, ItemType } from './catalog';
import type { ListQuery } from './http';
import type { HospitalSummary, Store } from './organization';

export type GrnStatus =
  | 'ACCEPTED'
  | 'CANCELLED'
  | 'DRAFT'
  | 'PARTIALLY_ACCEPTED'
  | 'POSTED_TO_STOCK'
  | 'REJECTED'
  | 'UNDER_VERIFICATION';

export type InventoryLocationType = 'COUNTER' | 'KITCHEN' | 'RESTAURANT' | 'STORE';

export type StockReferenceType =
  'GRN' | 'KITCHEN_PRODUCTION' | 'TRANSFER' | 'TRANSFER_ACKNOWLEDGEMENT';

export type StockTransactionType =
  | 'GRN_IN'
  | 'KITCHEN_PRODUCTION_IN'
  | 'KITCHEN_TRANSFER_OUT'
  | 'RESTAURANT_TRANSFER_IN'
  | 'RESTAURANT_RECEIVE_IN'
  | 'STORE_TO_RESTAURANT_OUT'
  | 'TRANSFER_REJECTED_RETURN_IN';

export type StockBalanceStatus =
  'AVAILABLE' | 'EXPIRED' | 'LOW_STOCK' | 'NEAR_EXPIRY' | 'OUT_OF_STOCK';

export type TransferStatus = 'ACKNOWLEDGED' | 'CANCELLED' | 'DRAFT' | 'PENDING_ACKNOWLEDGEMENT';

export type TransferAcknowledgementStatus = 'ACCEPTED_FULL' | 'ACCEPTED_PARTIAL' | 'REJECTED_FULL';

export interface GrnBatch {
  acceptedQty: number;
  batchNumber: string;
  createdAt: string;
  expiryDate: string;
  grnLineId: string;
  id: string;
  itemId: string;
  manufacturingDate: string | null;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason: string | null;
  updatedAt: string;
}

export interface GrnLine {
  acceptedQty: number;
  batches: GrnBatch[];
  createdAt: string;
  grnId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  orderedQty: number | null;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  updatedAt: string;
}

export interface Grn {
  createdAt: string;
  deletedAt: string | null;
  grnNumber: string;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  invoiceNumber: string | null;
  lines: GrnLine[];
  poNumber: string | null;
  receivedBy: string;
  receivedDate: string;
  remarks: string | null;
  status: GrnStatus;
  store: Pick<Store, 'hospitalId' | 'id' | 'isActive' | 'storeCode' | 'storeName'>;
  storeId: string;
  updatedAt: string;
  vendorName: string | null;
}

export interface GrnBatchInput {
  acceptedQty: number;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
}

export interface GrnLineInput {
  acceptedQty: number;
  batches: GrnBatchInput[];
  itemId: string;
  orderedQty?: number;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
}

export interface GrnInput {
  hospitalId: string;
  invoiceNumber?: string;
  items: GrnLineInput[];
  poNumber?: string;
  receivedBy: string;
  receivedDate: string;
  remarks?: string;
  storeId: string;
  vendorName?: string;
}

export interface GrnListQuery extends ListQuery {
  fromDate?: string;
  hospitalId?: string;
  status?: GrnStatus;
  storeId?: string;
  toDate?: string;
}

export interface StockLocationSummary {
  code: string | null;
  id: string;
  name: string;
  type: InventoryLocationType;
}

export interface StockBalance {
  availableQty: number;
  batchNumber: string | null;
  businessDate: string | null;
  createdAt: string;
  deletedAt: string | null;
  expiryDate: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  itemType: ItemType;
  lastUpdatedOn: string;
  location: StockLocationSummary;
  locationId: string;
  locationType: InventoryLocationType;
  reservedQty: number;
  status: StockBalanceStatus;
  updatedAt: string;
}

export interface StoreStockBatchSummary {
  availableQty: number;
  batchNumber: string | null;
  expiryDate: string | null;
  reservedQty: number;
  status: StockBalanceStatus;
  stockBalanceId: string;
}

export interface StoreStockSummary {
  batchCount: number;
  batches: StoreStockBatchSummary[];
  categoryName: string | null;
  hospitalId: string;
  itemCode: string;
  itemId: string;
  itemName: string;
  itemType: ItemType;
  lastUpdatedOn: string;
  nearestExpiryDate: string | null;
  status: StockBalanceStatus;
  storeCode: string | null;
  storeId: string;
  storeName: string;
  totalAvailableQty: number;
  totalReservedQty: number;
}

export interface StockLedger {
  balanceAfter: number;
  batchNumber: string | null;
  businessDate: string;
  createdAt: string;
  deletedAt: string | null;
  expiryDate: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  item: ItemSummary;
  itemId: string;
  itemType: ItemType;
  location: StockLocationSummary;
  locationId: string;
  locationType: InventoryLocationType;
  qtyIn: number;
  qtyOut: number;
  referenceId: string | null;
  referenceType: StockReferenceType | null;
  remarks: string | null;
  transactionDateTime: string;
  transactionType: StockTransactionType;
  updatedAt: string;
}

export interface StockBalanceListQuery extends ListQuery {
  batchNumber?: string;
  businessDate?: string;
  expiryDate?: string;
  hospitalId?: string;
  itemId?: string;
  itemType?: ItemType;
  locationId?: string;
  locationType?: InventoryLocationType;
  status?: StockBalanceStatus;
}

export interface StockLedgerListQuery extends ListQuery {
  batchNumber?: string;
  businessDate?: string;
  expiryDate?: string;
  fromDate?: string;
  hospitalId?: string;
  itemId?: string;
  itemType?: ItemType;
  locationId?: string;
  locationType?: InventoryLocationType;
  referenceType?: StockReferenceType;
  toDate?: string;
  transactionType?: StockTransactionType;
}

export interface TransferLine {
  acceptedQty: number;
  batchNumber: string | null;
  createdAt: string;
  expiryDate: string | null;
  id: string;
  item: ItemSummary;
  itemId: string;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  sentQty: number;
  transferId: string;
  updatedAt: string;
}

export interface Transfer {
  businessDate: string;
  createdAt: string;
  deletedAt: string | null;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  lines: TransferLine[];
  remarks: string | null;
  sourceId: string;
  sourceType: InventoryLocationType;
  status: TransferStatus;
  transferDate: string;
  transferNumber: string;
  updatedAt: string;
}

export interface TransferLineInput {
  batchNumber?: string;
  expiryDate?: string;
  itemId: string;
  remarks?: string;
  sentQty: number;
}

export interface TransferInput {
  businessDate?: string;
  destinationId: string;
  destinationType: InventoryLocationType;
  hospitalId: string;
  items: TransferLineInput[];
  remarks?: string;
  sourceId: string;
  sourceType: InventoryLocationType;
  transferDate: string;
}

export interface TransferListQuery extends ListQuery {
  destinationId?: string;
  destinationType?: InventoryLocationType;
  fromDate?: string;
  hospitalId?: string;
  sourceId?: string;
  sourceType?: InventoryLocationType;
  status?: TransferStatus;
  toDate?: string;
}

export interface TransferAcknowledgementLine {
  acceptedQty: number;
  batchNumber: string | null;
  createdAt: string;
  expiryDate: string | null;
  id: string;
  item: ItemSummary;
  itemId: string;
  rejectedQty: number;
  rejectionReason: string | null;
  remarks: string | null;
  sentQty: number;
  transferLineId: string;
  updatedAt: string;
}

export interface TransferAcknowledgement {
  acknowledgementDate: string;
  createdAt: string;
  deletedAt: string | null;
  hospital: HospitalSummary;
  hospitalId: string;
  id: string;
  lines: TransferAcknowledgementLine[];
  remarks: string | null;
  status: TransferAcknowledgementStatus;
  transfer: Pick<
    Transfer,
    | 'businessDate'
    | 'destinationId'
    | 'destinationType'
    | 'id'
    | 'sourceId'
    | 'sourceType'
    | 'status'
    | 'transferDate'
    | 'transferNumber'
  >;
  transferId: string;
  updatedAt: string;
}

export interface TransferAcknowledgementLineInput {
  acceptedQty: number;
  batchNumber?: string;
  expiryDate?: string;
  itemId?: string;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
  sentQty?: number;
  transferLineId: string;
}

export interface TransferAcknowledgementInput {
  items: TransferAcknowledgementLineInput[];
  remarks?: string;
  transferId: string;
}

export interface TransferAcknowledgementListQuery extends ListQuery {
  fromDate?: string;
  hospitalId?: string;
  status?: TransferAcknowledgementStatus;
  toDate?: string;
  transferId?: string;
}
