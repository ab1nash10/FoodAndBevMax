import type { Grn, GrnLine, Transfer, TransferLine } from './inventory';
import type { KitchenProduction, KitchenProductionLine } from './kitchen';

// GET /dashboard/records keeps only the fields the dashboard's numbers read; a full record from
// the list endpoints fits these types too.
export type DashboardTransfer = Pick<
  Transfer,
  'createdAt' | 'hospital' | 'hospitalId' | 'id' | 'status' | 'transferDate' | 'updatedAt'
> & {
  lines: Array<
    Pick<TransferLine, 'acceptedQty' | 'itemId' | 'rejectedQty' | 'rejectionReason'> & {
      item: Pick<TransferLine['item'], 'itemName'>;
    }
  >;
};

export type DashboardProduction = Pick<
  KitchenProduction,
  'hospital' | 'hospitalId' | 'id' | 'kitchenId' | 'productionDate' | 'status'
> & {
  kitchen: Pick<KitchenProduction['kitchen'], 'kitchenName'>;
  lines: Array<
    Pick<KitchenProductionLine, 'producedQty' | 'wastageQty'> & {
      item: Pick<KitchenProductionLine['item'], 'itemName'>;
    }
  >;
};

export type DashboardGrn = Pick<Grn, 'receivedDate' | 'status' | 'vendorName'> & {
  lines: Array<Pick<GrnLine, 'acceptedQty' | 'rejectedQty'>>;
};

export interface DashboardRecordList<T> {
  items: T[];
  /** More records exist than the endpoint returns (5,000), so the numbers are a lower bound. */
  truncated: boolean;
}

/** A source is missing when the user may not view its list. */
export interface DashboardRecords {
  grns?: DashboardRecordList<DashboardGrn>;
  productions?: DashboardRecordList<DashboardProduction>;
  transfers?: DashboardRecordList<DashboardTransfer>;
}

export interface DashboardRecordsQuery {
  /** Transfers, posted productions and posted GRNs dated from here on. */
  fromDate: string;
  hospitalId?: string;
}

/** A count or first record is missing when the user may not view its list. */
export interface DashboardSetup {
  counts: {
    employees?: number;
    hospitals?: number;
    items?: number;
    kitchenItems?: number;
    kitchens?: number;
    menus?: number;
    restaurants?: number;
    storeItems?: number;
    stores?: number;
  };
  firstGrn?: Grn | null;
  firstTransfer?: Transfer | null;
}

/** The nav badges' counts (GET /dashboard/nav-counts); a count is missing when the user may not view its list. */
export interface DashboardNavCounts {
  grns?: number;
  productions?: number;
  transfers?: number;
}

/**
 * Every active location the user may list, by kind, with only what turns an id into a name or a
 * link (GET /dashboard/location-names). A kind is missing when the user may not view its list.
 */
export interface LocationNames {
  counters?: Array<{
    counterName: string;
    hospitalId: string;
    id: string;
    restaurant: { restaurantName: string };
  }>;
  kitchens?: Array<{ hospitalId: string; id: string; kitchenCode: string; kitchenName: string }>;
  restaurants?: Array<{
    hospitalId: string;
    id: string;
    restaurantCode: string;
    restaurantName: string;
  }>;
  stores?: Array<{ hospitalId: string; id: string; storeCode: string; storeName: string }>;
}
