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

/** The pickup board on a TV: order numbers only. */
export interface OrderBoard {
  preparing: string[];
  ready: string[];
  restaurantName: string;
}
