export type OrderStatus = 'CANCELLED' | 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';

/** Where an order was placed. */
export type OrderSource = 'KIOSK' | 'OTHER' | 'POS' | 'QR';

export interface RestaurantOrder {
  id: string;
  items: Array<{ name: string; note?: string; quantity: number }>;
  orderNumber: string;
  placedAt: string;
  readyAt: string | null;
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
