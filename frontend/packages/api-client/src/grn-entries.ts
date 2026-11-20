import { createApiClient, type ApiClientOptions, type ApiList, type ApiResponse } from './http';

/**
 * An ERP GRN moves stock the moment it arrives. PENDING: a reverse (flag 1) still waiting for
 * stock to come back to the store. VERIFIED: everything moved. CLOSED: a waiting reverse a store
 * admin closed, the rest written off with a reason.
 */
export type GrnEntryStatus = 'PENDING' | 'VERIFIED' | 'CLOSED';

/**
 * One row of a GRN the ERP sent (one batch of one item), in the ERP's own field names, with
 * what moved. Item name and HSN come from the Item master when the ERP left them out.
 */
export interface GrnEntryRow {
  'Discount/Extra Charges': number | null;
  'HSN No': string | null;
  MRP: number | null;
  'Tax Rate': string | null;
  'Total Value': number | null;
  UOM: string | null;
  'Unit Rate': number | null;
  /** What moved: into the store (flag 0) or out of it (flag 1). */
  accepted_qty: number;
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
  /** What a reverse still waits for (0 once done or closed). */
  pending_qty: number;
  purchase_order: string | null;
  /** What was closed without moving. */
  rejected_qty: number;
  rejection_reason: string | null;
  requisition: string | null;
  /** The row's own id. */
  row_id: string;
  /** The vendor code. */
  supplier: string | null;
  /** AAHAR's number for the request that sent the row (the same on every row of it). */
  transaction_number: string;
  transaction_qty: number;
}

export interface GrnEntry {
  grn_No: string;
  hospital_id: string;
  location: string;
  location_name: string;
  received_at: string;
  /** Whether a waiting reverse runs again by itself when its batch reaches the store. */
  rerun_active: boolean;
  rows: GrnEntryRow[];
  status: GrnEntryStatus;
  store_code: string;
  store_id: string;
  store_name: string;
  totals: {
    accepted_qty: number;
    pending_qty: number;
    rejected_qty: number;
    transaction_qty: number;
  };
  /** AAHAR's number for the request that sent this GRN, given to the ERP in its response. */
  transaction_number: string;
  /** When it finished or was closed; by whom when a user did it. */
  verified_at: string | null;
  verified_by: { employeeCode: string; name: string } | null;
}

export interface GrnEntryQuery {
  hospitalId?: string;
  limit?: number;
  page?: number;
  /** Received on or after / on or before these days (YYYY-MM-DD, India). */
  receivedFrom?: string;
  receivedTo?: string;
  /** Matches the GRN number, or the start of the transaction number. */
  search?: string;
  status?: GrnEntryStatus;
}

export function createGrnEntriesApi(options: ApiClientOptions) {
  const client = createApiClient(options);
  const path = (grnNumber: string, action: string) =>
    `/grn-entries/${encodeURIComponent(grnNumber)}/${action}`;

  return {
    listGrnEntries(query: GrnEntryQuery = {}) {
      return client.request<ApiResponse<ApiList<GrnEntry>>>('/grn-entries', { query });
    },
    /** Runs a waiting reverse now: it takes what the store holds of its batch. */
    runGrnEntry(grnNumber: string) {
      return client.request<ApiResponse<GrnEntry>>(path(grnNumber, 'run'), { method: 'POST' });
    },
    /** Pauses or resumes a waiting reverse running again by itself; resuming runs it at once. */
    setGrnEntryRerun(grnNumber: string, active: boolean) {
      return client.request<ApiResponse<GrnEntry>>(path(grnNumber, 'rerun'), {
        body: { active },
        method: 'PATCH',
      });
    },
    /** Closes a waiting reverse that cannot finish; the rest is written off with the reason. */
    closeGrnEntry(grnNumber: string, reason: string) {
      return client.request<ApiResponse<GrnEntry>>(path(grnNumber, 'close'), {
        body: { reason },
        method: 'PATCH',
      });
    },
  };
}
