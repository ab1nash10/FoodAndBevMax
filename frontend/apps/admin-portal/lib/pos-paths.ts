/**
 * POS pages that are back-office work, done at a desk rather than at a till (2026-11-26): the
 * restaurant admin's Reconciliation and the Supervisor's Approvals. They are in the POS menu but
 * need no till, and the 8-hour idle sign-out applies to them like any other screen.
 */
const BACK_OFFICE = ['/pos/reconciliation', '/pos/approvals'];

/** A till screen: behind the till gate, and kept signed in while idle. */
export function isTillScreen(path: string): boolean {
  const pos = path === '/pos' || path.startsWith('/pos/');

  return pos && !BACK_OFFICE.some((page) => path === page || path.startsWith(`${page}/`));
}
