/**
 * How a waiting online payment is checked, on every screen that takes one (the till, the kiosk,
 * the guest's phone) and for every gateway (the user, 2026-11-26): every 5 s for its first 30 s,
 * then every 10 s, and given up (cancelled) at 3 minutes. The server's sweep gives up on the same
 * clock when the screen has gone (QrOrdersService.sweep, OnlinePaymentsService.cancelAbandoned).
 */
export const PAYMENT_WINDOW_MS = 3 * 60_000;

/** The wait before the next check, for a payment waited on this long. */
export const paymentCheckEvery = (waitedMs: number) => (waitedMs < 30_000 ? 5_000 : 10_000);
