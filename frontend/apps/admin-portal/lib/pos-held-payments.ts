import type { OnlinePayment } from '@aahar/api-client';
import { HELD_PAYMENTS_KEY_PREFIX } from './auth-storage';

/**
 * A guest's paid online payment that no bill has taken yet (its bill was refused), kept on this
 * device per counter: a reload or a sign-out must not lead to charging the guest again.
 */
export interface HeldPayment {
  /** Set once the cashier gave it up: it stays on the till until someone marks it refunded. */
  abandonedAt?: string;
  /** Who took it: only they bill it, as the bill lands in the shift of whoever sends it. */
  cashierId?: string;
  cashierName?: string;
  payment: OnlinePayment;
}

const keyFor = (counterId: string) => `${HELD_PAYMENTS_KEY_PREFIX}${counterId}`;

export function readHeldPayments(counterId: string): HeldPayment[] {
  try {
    return JSON.parse(localStorage.getItem(keyFor(counterId)) ?? '[]') as HeldPayment[];
  } catch {
    return [];
  }
}

/** Re-reads before writing, and returns the payments now held, for the screen. */
export function changeHeldPayments(
  counterId: string,
  change: (held: HeldPayment[]) => HeldPayment[],
): HeldPayment[] {
  const held = change(readHeldPayments(counterId));

  try {
    if (held.length > 0) localStorage.setItem(keyFor(counterId), JSON.stringify(held));
    else localStorage.removeItem(keyFor(counterId));
  } catch {
    // Private browsing or a full disk: the screen keeps its copy until it reloads.
  }

  return held;
}
