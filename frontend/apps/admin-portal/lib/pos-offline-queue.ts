import { ApiClientError, type PosBillInput } from '@aahar/api-client';

/**
 * A bill the till could not send, kept on this device until the server takes it. The server
 * gives it its bill number then, as for any bill: the device never makes one up.
 */
export interface QueuedBill {
  /** Set when the cashier gave it up. Kept a week so the loss stays on record. */
  discardedAt?: string;
  /** Why the server refused it. Set, the bill waits for the cashier instead of a retry. */
  error?: string;
  /** Exactly what was sent; its clientOrderId makes a resend return the bill already made. */
  payload: PosBillInput;
  queuedAt: string;
  /** "2 × Tea, 1 × Samosa": the payload only has menu ids. */
  summary: string;
  /** The till's total, for the list. The server prices the bill again. */
  total: number;
}

const keepDiscardedMs = 7 * 24 * 60 * 60 * 1000;

function keyFor(counterId: string) {
  return `aahar.pos.unsent-bills.${counterId}`;
}

export function readQueue(counterId: string): QueuedBill[] {
  try {
    const raw = localStorage.getItem(keyFor(counterId));
    const bills = raw ? (JSON.parse(raw) as QueuedBill[]) : [];

    return bills.filter(
      (bill) => !bill.discardedAt || Date.now() - Date.parse(bill.discardedAt) < keepDiscardedMs,
    );
  } catch {
    return [];
  }
}

function writeQueue(counterId: string, bills: QueuedBill[]): boolean {
  try {
    if (bills.length > 0) localStorage.setItem(keyFor(counterId), JSON.stringify(bills));
    else localStorage.removeItem(keyFor(counterId));
    return true;
  } catch {
    return false;
  }
}

/** Re-reads before writing: the till may queue another bill while one is being sent. */
function update(
  counterId: string,
  clientOrderId: string,
  change: (bill: QueuedBill) => QueuedBill | null,
) {
  writeQueue(
    counterId,
    readQueue(counterId).flatMap((bill) => {
      if (bill.payload.clientOrderId !== clientOrderId) return [bill];
      const changed = change(bill);
      return changed ? [changed] : [];
    }),
  );
}

/** False when the device would not store it: the caller must keep the bill on screen. */
export function queueBill(bill: Omit<QueuedBill, 'queuedAt'>): boolean {
  const { counterId, clientOrderId } = bill.payload;
  const others = readQueue(counterId).filter(
    (queued) => queued.payload.clientOrderId !== clientOrderId,
  );

  return writeQueue(counterId, [...others, { ...bill, queuedAt: new Date().toISOString() }]);
}

export function discardBill(counterId: string, clientOrderId: string) {
  update(counterId, clientOrderId, (bill) => ({ ...bill, discardedAt: new Date().toISOString() }));
}

/** No answer from the server at all (offline, DNS, timeout), as opposed to an error it sent. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 0;
}

/** The server looked at the bill and said no (bad data, out of stock): retrying won't change it. */
function isRefusal(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  );
}

/**
 * Sends the waiting bills oldest first; `all` also retries the ones the server refused. Stops at
 * the first that gets no answer (or a 5xx, a lapsed session): the rest go on the next try.
 * Returns how many went through.
 */
export async function sendQueued(
  counterId: string,
  send: (payload: PosBillInput) => Promise<unknown>,
  all = false,
): Promise<number> {
  let sent = 0;

  for (const bill of readQueue(counterId)) {
    if (bill.discardedAt || (bill.error && !all)) continue;
    const id = bill.payload.clientOrderId;

    try {
      await send(bill.payload);
      update(counterId, id, () => null);
      sent += 1;
    } catch (error) {
      if (!isRefusal(error)) break;
      update(counterId, id, (queued) => ({ ...queued, error: error.message }));
    }
  }

  return sent;
}
