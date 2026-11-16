import { createApiClient, type ApiClientOptions, type ApiList, type ApiResponse } from './http';

/** PENDING until the store accepts or rejects every row; then VERIFIED, and stock has moved. */
export type GrnEntryStatus = 'PENDING' | 'VERIFIED';

/**
 * One row of a GRN the ERP sent (one batch of one item), in the ERP's own field names, with the
 * store's answer once verified. Item name and HSN come from the Item master when the ERP left
 * them out.
 */
export interface GrnEntryRow {
  'Discount/Extra Charges': number | null;
  'HSN No': string | null;
  MRP: number | null;
  'Tax Rate': string | null;
  'Total Value': number | null;
  UOM: string | null;
  'Unit Rate': number | null;
  accepted_qty: number | null;
  batch: string;
  /** When the goods moved (ISO). */
  date: string;
  /** YYYY-MM-DD. */
  expiry_date: string;
  /** 0 = goods in, 1 = return to vendor. */
  flag: 0 | 1;
  grn_No: string;
  issued_by: string | null;
  item_name: string | null;
  /** The location's code. */
  location: string;
  part_item_code: string;
  purchase_order: string | null;
  rejected_qty: number | null;
  rejection_reason: string | null;
  requisition: string | null;
  /** The vendor code. */
  supplier: string | null;
  transaction_number: string;
  transaction_qty: number;
}

export interface GrnEntry {
  grn_No: string;
  hospital_id: string;
  location: string;
  location_name: string;
  received_at: string;
  rows: GrnEntryRow[];
  status: GrnEntryStatus;
  store_code: string;
  store_id: string;
  store_name: string;
  totals: { accepted_qty: number | null; rejected_qty: number | null; transaction_qty: number };
  verified_at: string | null;
  verified_by: { employeeCode: string; name: string } | null;
}

export interface GrnEntryQuery {
  hospitalId?: string;
  limit?: number;
  page?: number;
  /** Matches the GRN number. */
  search?: string;
  status?: GrnEntryStatus;
}

/** The store's answer for every row: accepted + rejected must equal what was sent. */
export interface VerifyGrnEntryInput {
  batches: Array<{
    acceptedQty: number;
    rejectedQty: number;
    rejectionReason?: string;
    transactionNumber: string;
  }>;
}

export function createGrnEntriesApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    listGrnEntries(query: GrnEntryQuery = {}) {
      return client.request<ApiResponse<ApiList<GrnEntry>>>('/grn-entries', { query });
    },
    verifyGrnEntry(grnNumber: string, input: VerifyGrnEntryInput) {
      return client.request<ApiResponse<GrnEntry>>(
        `/grn-entries/${encodeURIComponent(grnNumber)}/verify`,
        { body: input, method: 'PATCH' },
      );
    },
  };
}
