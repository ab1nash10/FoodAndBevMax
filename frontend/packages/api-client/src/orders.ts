import type { FoodType } from './catalog';
import type { EmploymentType } from './organization';
import type { ListQuery } from './http';

export type OrderStatus = 'CANCELLED' | 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';

/** Where an order was placed. */
export type OrderSource = 'COUNTER' | 'KIOSK' | 'OTHER' | 'POS' | 'QR';

export interface RestaurantOrder {
  /** Set on bills raised in AAHAR's POS; null on orders other systems send. */
  bedNumber: string | null;
  billNumber: string | null;
  channel: PosChannel | null;
  id: string;
  instructions: string | null;
  items: Array<{ name: string; note?: string; quantity: number }>;
  orderNumber: string;
  placedAt: string;
  readyAt: string | null;
  roomNumber: string | null;
  source: OrderSource;
  status: OrderStatus;
}

/** One order on the TV pickup board: its number and pickup details, never the guest's. */
export interface BoardOrder {
  counterName?: string;
  /** For PREPARING. */
  estimatedReadyAt?: string;
  itemCount: number;
  orderNumber: string;
  /** For READY. */
  readyAt?: string;
  serviceType?: 'DINE_IN' | 'TAKE_AWAY';
  status: 'PREPARING' | 'READY';
}

/** The TV pickup board's feed (GET /order-board/:restaurantId). */
export interface BoardFeed {
  /** The restaurant's first counter, for "Can't see your number? Ask at ...". */
  helpCounterName?: string;
  isOpen: boolean;
  locationName: string;
  /** While closed: when it next opens (ISO). */
  opensAt?: string;
  orders: BoardOrder[];
  restaurantName: string;
  /** The server's clock; the board's minutes and clock follow it, not the TV's. */
  serverTime: string;
  slotEndsAt?: string;
  slotName?: string;
}

// AAHAR's own POS: bills raised at a counter.

/** COUNTER = walk-in at the counter; ROOM = a patient room (room price where one is set). */
export type PosChannel = 'COUNTER' | 'ROOM';

export type PaymentMode = 'CARD' | 'CASH' | 'OTHER' | 'UPI';

export interface PosCounter {
  counterCode: string;
  counterName: string;
  hospital: {
    billPrefix: string | null;
    gstApplicable: boolean;
    hospitalCode: string;
    hospitalName: string;
    id: string;
  };
  hospitalId: string;
  id: string;
  restaurant: {
    id: string;
    legalName: string | null;
    restaurantCode: string;
    restaurantName: string;
    /** Whether the restaurant gives staff discount at all. */
    staffDiscountApplicable: boolean;
    /** Where UPI payments go: the till and the bill show a QR for it. */
    upiId: string | null;
  };
  restaurantId: string;
}

export interface PosMenuItem {
  availableFrom: string | null;
  availableTo: string | null;
  category: { categoryName: string; id: string } | null;
  daysOfWeek: string[];
  foodType: FoodType;
  gstPercent: number;
  /** The menu item's id: what a bill line sends. */
  id: string;
  isAvailable: boolean;
  /** Whether staff discount applies to it. */
  isDiscountable: boolean;
  isGstInclusive: boolean;
  /** Switched on, on today's days and inside its time window. */
  isOnSale: boolean;
  itemCode: string;
  itemId: string;
  itemName: string;
  menuItemCode: string;
  preparationTimeMinutes: number | null;
  /** The channel's price; null when none is set (it cannot be billed). */
  price: number | null;
  /** Unexpired stock at the counter; null when the counter keeps no stock of it. */
  stock: number | null;
}

export interface PosMenu {
  counter: PosCounter;
  items: PosMenuItem[];
}

export interface PosBillLineInput {
  menuId: string;
  note?: string;
  quantity: number;
}

export interface PosBillInput {
  bedNumber?: string;
  channel: PosChannel;
  /** The till's own id for this bill, made once per bill: a retry returns the same bill. */
  clientOrderId: string;
  complimentaryReason?: string;
  counterId: string;
  customerMobile?: string;
  employeeCode?: string;
  instructions?: string;
  isComplimentary?: boolean;
  lines: PosBillLineInput[];
  /** Required unless complimentary. */
  paymentMode?: PaymentMode;
  paymentReference?: string;
  /** Required for ROOM. */
  roomNumber?: string;
}

export interface PosBillLine {
  /** Staff discount on the line; taxableAmount is after it. */
  discountAmount: number;
  gstAmount: number;
  gstPercent: number;
  /** HSN, or the restaurant service SAC 996331. */
  hsnCode: string | null;
  id: string;
  isDiscountable: boolean;
  isGstInclusive: boolean;
  itemId: string;
  itemName: string;
  lineTotal: number;
  menuId: string;
  menuItemCode: string;
  note: string | null;
  quantity: number;
  taxableAmount: number;
  unitPrice: number;
}

export interface PosBill {
  bedNumber: string | null;
  billNumber: string;
  businessDate: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** The cashier's employee code: the bill's UID / operator id. */
  cashierCode: string | null;
  cashierName: string | null;
  channel: PosChannel;
  complimentaryReason: string | null;
  counter: { counterCode: string; counterName: string; id: string };
  customerMobile: string | null;
  /** The staff discount rate given, and what it took off (0 when none). */
  discountPercent: number | null;
  discountTotal: number;
  employeeCode: string | null;
  grandTotal: number;
  gstTotal: number;
  /** state is the place of supply. */
  hospital: {
    address: string | null;
    city: string | null;
    hospitalName: string;
    id: string;
    state: string | null;
  };
  id: string;
  instructions: string | null;
  isComplimentary: boolean;
  /** The kitchen ticket number, e.g. COUNTER-01/261021/0003. */
  kotNumber: string;
  lines: PosBillLine[];
  orderNumber: string;
  paymentMode: PaymentMode | null;
  paymentReference: string | null;
  placedAt: string;
  restaurant: {
    address: string | null;
    fssaiNumber: string | null;
    gstAddress: string | null;
    gstNumber: string | null;
    id: string;
    legalEntity: { entityAddress: string; entityName: string; gstNumber: string } | null;
    legalName: string | null;
    restaurantName: string;
    upiId: string | null;
  };
  roomNumber: string | null;
  roundOff: number;
  status: OrderStatus;
  subtotal: number;
}

export interface PosBillSummary {
  billNumber: string;
  businessDate: string;
  cancelReason: string | null;
  channel: PosChannel;
  complimentaryReason: string | null;
  counter: { counterCode: string; counterName: string; id: string };
  customerMobile: string | null;
  discountPercent: number | null;
  discountTotal: number;
  employeeCode: string | null;
  grandTotal: number;
  gstTotal: number;
  id: string;
  instructions: string | null;
  isComplimentary: boolean;
  /** Total quantity on the bill. */
  itemCount: number;
  items: Array<{ name: string; note?: string; quantity: number }>;
  lineCount: number;
  orderNumber: string;
  paymentMode: PaymentMode | null;
  paymentReference: string | null;
  placedAt: string;
  restaurant: { id: string; restaurantName: string };
  roomNumber: string | null;
  status: OrderStatus;
  subtotal: number;
}

export interface PosBillListQuery extends ListQuery {
  channel?: PosChannel;
  counterId?: string;
  /** Business dates, YYYY-MM-DD. */
  from?: string;
  hospitalId?: string;
  isComplimentary?: boolean;
  paymentMode?: PaymentMode;
  restaurantId?: string;
  sortBy?: 'billNumber' | 'grandTotal' | 'placedAt';
  status?: OrderStatus;
  to?: string;
}

export interface PosDaySummary {
  bills: number;
  byPaymentMode: Array<{ amount: number; count: number; mode: PaymentMode }>;
  cancelled: { amount: number; count: number };
  complimentary: { amount: number; count: number };
  counter: PosCounter;
  /** YYYY-MM-DD. */
  date: string;
  sales: number;
}

/** A counter's stock per item for one business day (every menu item, zeros included). */
export interface PosStockSummary {
  counter: PosCounter;
  /** YYYY-MM-DD. */
  date: string;
  items: Array<{
    /** Unexpired stock at the counter now. */
    available: number;
    /** Sold that day, less what cancelled bills put back. */
    consumed: number;
    /** False when the counter has never held stock of it (e.g. made to order). */
    isTracked: boolean;
    itemCode: string;
    itemId: string;
    itemName: string;
    /** Received at the counter that day. */
    received: number;
  }>;
}

/** Who an Employee ID entered at the till belongs to, and the staff discount they get there. */
export interface PosEmployee {
  /** 0 when the restaurant gives none, the employee is not eligible, or has no type set. */
  discountPercent: number;
  eligibleForDiscount: boolean;
  employeeCode: string;
  employeeName: string;
  employmentType: EmploymentType | null;
}

export interface StaffDiscountSettings {
  rates: Array<{ discountPercent: number; employmentType: EmploymentType }>;
  restaurantId: string;
  restaurantName: string;
  staffDiscountApplicable: boolean;
}

export interface StaffDiscountInput {
  rates: Array<{ discountPercent: number; employmentType: EmploymentType }>;
  staffDiscountApplicable: boolean;
}
