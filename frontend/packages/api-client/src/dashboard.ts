import type { GrnEntryStatus } from './grn-entries';
import type { Transfer, TransferLine } from './inventory';
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

/** A GRN the ERP sent, slimmed to what the vendor numbers read. */
export interface DashboardGrn {
  lines: Array<{ acceptedQty: number; rejectedQty: number }>;
  receivedDate: string;
  status: GrnEntryStatus;
  /** The ERP's supplier code (it sends no vendor name); null when it sent none. */
  vendorName: string | null;
}

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
  /** Transfers, posted productions and ERP GRNs dated from here on. */
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
  /** The first GRN the ERP sent. */
  firstGrn?: { grnNumber: string; receivedDate: string } | null;
  firstTransfer?: Transfer | null;
}

/** The nav badges' counts (GET /dashboard/nav-counts); a count is missing when the user may not view its list. */
export interface DashboardNavCounts {
  /** ERP GRNs still PENDING (a return waiting on the store). */
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

/** How a bill reached the counter (GET /dashboard/service's channel mix). */
export type DashboardChannel = 'COUNTER' | 'KIOSK' | 'QR' | 'ROOM' | 'TABLE';

export interface DashboardDayTotals {
  averageBill: number;
  bills: number;
  roomOrders: number;
  sales: number;
}

/**
 * A day's service (GET /dashboard/service), India time. `sales` is missing without
 * ORDER_REPORT_VIEW and `kitchen` without ORDER_VIEW.
 */
export interface DashboardServiceDay {
  date: string;
  kitchen?: {
    lanes: Array<{
      count: number;
      orders: Array<{ at: string; id: string; items: string; number: string; where: string }>;
      status: 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';
    }>;
  };
  sales?: {
    /** Every hour 0–23: bills and sales on the day and on the day it is compared with. */
    byHour: Array<{
      bills: number;
      compareBills: number;
      compareSales: number;
      hour: number;
      sales: number;
    }>;
    /** Every channel, the busiest first. */
    channels: Array<{ bills: number; key: DashboardChannel; sales: number }>;
    /** Open shifts first, then counters that billed today and have closed. */
    counters: Array<{
      bills: number;
      cashier: string | null;
      counterId: string;
      counterName: string;
      open: boolean;
      openedAt: string | null;
      restaurantName: string;
      sales: number;
    }>;
    /** The day compared with: the same day last week, or yesterday (compare: day). */
    compare: DashboardDayTotals;
    compareDate: string;
    today: DashboardDayTotals;
    /** More bills than the endpoint reads (20,000): the numbers are a lower bound. */
    truncated: boolean;
  };
}
