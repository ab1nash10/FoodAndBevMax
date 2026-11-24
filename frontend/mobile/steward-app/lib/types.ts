// The few API shapes this app reads, as the F&B services send them (see
// frontend/packages/api-client/src/orders.ts: Delivery, UNDELIVERED_REASONS). Copied, not
// imported: this app is its own npm project outside the pnpm workspace.

export type OrderStatus = 'CANCELLED' | 'COLLECTED' | 'PLACED' | 'PREPARING' | 'READY';

export interface Delivery {
  bedNumber: string | null;
  deliveredAt: string | null;
  id: string;
  instructions: string | null;
  /** Placed on the guest's phone: Delivered needs their code (scan their QR, or type it). */
  needsCode: boolean;
  items: { name: string; note?: string; quantity: number }[];
  orderNumber: string;
  placedAt: string;
  readyAt: string | null;
  restaurantName: string;
  roomNumber: string | null;
  status: OrderStatus;
  stewardAssignedAt: string | null;
  undeliveredAt: string | null;
  undeliveredReason: string | null;
}

/** Why a steward could not hand a room order over; the server accepts only these. */
export const UNDELIVERED_REASONS = [
  'Patient discharged',
  'Patient not in room',
  'Patient refused it',
] as const;

export type UndeliveredReason = (typeof UNDELIVERED_REASONS)[number];

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
