import type { PaymentMode } from '@prisma/client';
import { roundMoney } from './shifts';

/**
 * A closed shift's money check (payment reconciliation, the user's rules of 2026-11-26): what the
 * shift's bills say against what was received, per payment mode. Cash received is the cash
 * counted when the shift ended; UPI and card received are the payments a gateway (Razorpay,
 * PayU, Pine Labs) confirmed. Each difference needs the restaurant admin's reason, and every
 * shift, matched or not, then waits for a Supervisor's approval.
 */

/** A difference that needs a reason: one per payment mode at most. */
export type CheckKey = 'CARD' | 'CASH' | 'UPI';

export type CheckKind = 'not-counted' | 'over' | 'short' | 'unconfirmed';

/** Where a shift stands: its reasons are missing, it waits for the supervisor, or was decided. */
export type ReconciliationStatus = 'APPROVED' | 'NEEDS_REASON' | 'SENT_BACK' | 'WAITING';

/** As stored: the admin sent reasons, the supervisor sent it back, or approved it. */
export type StoredStatus = 'APPROVED' | 'SENT_BACK' | 'SUBMITTED';

export interface ShiftBill {
  amount: number;
  cancelled: boolean;
  complimentary: boolean;
  /** A gateway confirmed its payment (a paid online payment is linked to it). */
  confirmed: boolean;
  id: string;
  /** The bill number, else the order number. */
  number: string;
  paymentMode: PaymentMode | null;
}

/** A bill as loaded for a shift: also when a Pay later one was collected, and in which shift. */
export interface LoadedShiftBill extends ShiftBill {
  collectedMode: PaymentMode | null;
  collectedShiftId: string | null;
  shiftId: string | null;
}

/**
 * A shift's bills for its money: those billed in it (a Pay later one, still due there, is no
 * money), and the Pay later bills collected in it, as sales in the mode they were paid by.
 */
export function shiftBills(shiftId: string, bills: LoadedShiftBill[]): ShiftBill[] {
  const sale = ({
    collectedMode: _mode,
    collectedShiftId: _shift,
    shiftId: _billedIn,
    ...bill
  }: LoadedShiftBill): ShiftBill => bill;

  return [
    ...bills.filter((bill) => bill.shiftId === shiftId).map(sale),
    ...bills
      .filter((bill) => bill.collectedShiftId === shiftId && bill.collectedMode)
      .map((bill) => ({
        ...sale(bill),
        number: `${bill.number} (collected)`,
        paymentMode: bill.collectedMode,
      })),
  ];
}

/** A payment a gateway confirmed at the till during the shift that no bill was made with. */
export interface UnbilledPayment {
  amount: number;
  id: string;
  mode: 'CARD' | 'UPI';
  paidAt: Date | null;
  reference: string | null;
}

export interface ShiftMoneyInput {
  bills: ShiftBill[];
  countedCash: number | null;
  openingCash: number;
  unbilled: UnbilledPayment[];
}

export interface MoneyRow {
  /** What the bills say; for cash, the opening cash plus the cash bills. */
  billed: number;
  /** received − billed; null when nothing can be checked (not counted, or typed-in modes). */
  difference: number | null;
  mode: PaymentMode;
  received: number | null;
}

export interface Check {
  /** The difference (received − billed); for cash short/over its size; null when not counted. */
  amount: number | null;
  /** UPI/card bills no gateway confirmed. */
  bills: Array<{ amount: number; id: string; number: string }>;
  key: CheckKey;
  kind: CheckKind;
  /** UPI/card payments a gateway confirmed with no bill made. */
  payments: Array<{ amount: number; id: string; paidAt: Date | null; reference: string | null }>;
  /** The reasons the restaurant admin may pick from. */
  reasons: string[];
}

export interface ReasonInput {
  note?: string | null;
  reason?: string | null;
}

export type Reasons = Partial<Record<CheckKey, ReasonInput>>;

const OTHER = 'Other';

const REASONS: Record<'CARD' | 'not-counted' | 'over' | 'short' | 'UPI', string[]> = {
  CARD: [
    'Checked on the card machine report',
    'Paid on another card machine',
    'Paid, but the bill was not made',
    'Guest did not pay',
    OTHER,
  ],
  'not-counted': ['Cash not counted at shift end', OTHER],
  over: ['Cash over', 'Opening cash not entered', 'Change not given back', OTHER],
  short: ['Cash short', 'Wrong change given', 'Opening cash entered wrong', OTHER],
  UPI: [
    'Checked in the bank or UPI app',
    'Paid on another UPI app',
    'Paid, but the bill was not made',
    'Guest did not pay',
    OTHER,
  ],
};

const checkLabels: Record<CheckKey, string> = {
  CARD: 'the card difference',
  CASH: 'the cash difference',
  UPI: 'the UPI difference',
};

const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0));

/** The shift's money per payment mode, and the differences that need a reason. */
export function shiftMoney(input: ShiftMoneyInput): { checks: Check[]; money: MoneyRow[] } {
  // Cancelled and complimentary bills are not sales: no money reaches the drawer or a gateway.
  const sales = input.bills.filter((bill) => !bill.cancelled && !bill.complimentary);
  const inMode = (mode: PaymentMode) => sales.filter((bill) => bill.paymentMode === mode);
  const checks: Check[] = [];

  const expectedCash = roundMoney(
    input.openingCash + sum(inMode('CASH').map((bill) => bill.amount)),
  );
  const cashDifference =
    input.countedCash === null ? null : roundMoney(input.countedCash - expectedCash);
  const money: MoneyRow[] = [
    {
      billed: expectedCash,
      difference: cashDifference,
      mode: 'CASH',
      received: input.countedCash,
    },
  ];

  if (cashDifference === null || cashDifference !== 0) {
    const kind: CheckKind =
      cashDifference === null ? 'not-counted' : cashDifference < 0 ? 'short' : 'over';
    checks.push({
      amount: cashDifference === null ? null : Math.abs(cashDifference),
      bills: [],
      key: 'CASH',
      kind,
      payments: [],
      reasons: REASONS[kind],
    });
  }

  for (const mode of ['UPI', 'CARD'] as const) {
    const bills = inMode(mode);
    const unconfirmed = bills.filter((bill) => !bill.confirmed);
    const unbilled = input.unbilled.filter((payment) => payment.mode === mode);
    const billed = sum(bills.map((bill) => bill.amount));
    const received = sum([
      ...bills.filter((bill) => bill.confirmed).map((bill) => bill.amount),
      ...unbilled.map((payment) => payment.amount),
    ]);
    const difference = roundMoney(received - billed);

    money.push({ billed, difference, mode, received });

    if (unconfirmed.length || unbilled.length) {
      checks.push({
        amount: difference,
        bills: unconfirmed.map(({ amount, id, number }) => ({ amount, id, number })),
        key: mode,
        kind: 'unconfirmed',
        payments: unbilled.map(({ amount, id, paidAt, reference }) => ({
          amount,
          id,
          paidAt,
          reference,
        })),
        reasons: REASONS[mode],
      });
    }
  }

  // Other is typed in at the till: shown, with nothing to check it against.
  const other = sum(inMode('OTHER').map((bill) => bill.amount));

  if (other > 0) {
    money.push({ billed: other, difference: null, mode: 'OTHER', received: null });
  }

  return { checks, money };
}

/** The reason given for `check`, when it is one of its own (a stale one no longer counts). */
function fits(check: Check, given: ReasonInput | undefined): boolean {
  return Boolean(given?.reason && check.reasons.includes(given.reason));
}

/**
 * Where the shift stands. With no reasons sent, a shift with differences needs them and a
 * matched one waits for approval straight away; sent reasons that no longer fit the differences
 * (a bill's payment mode changed since) count as missing.
 */
export function reconciliationStatus(
  checks: Check[],
  record: { reasons: Reasons; status: StoredStatus } | null,
): ReconciliationStatus {
  if (record?.status === 'APPROVED') return 'APPROVED';
  if (record?.status === 'SENT_BACK') return 'SENT_BACK';

  const reasons = record?.status === 'SUBMITTED' ? record.reasons : {};

  return checks.every((check) => fits(check, reasons[check.key])) ? 'WAITING' : 'NEEDS_REASON';
}

/** Why these reasons cannot be sent for `checks`, or null when they can. */
export function reasonRefusal(checks: Check[], reasons: Reasons): string | null {
  for (const check of checks) {
    const given = reasons[check.key];
    const label = checkLabels[check.key];

    if (!given?.reason?.trim()) return `Give a reason for ${label}.`;
    if (!fits(check, given)) return `Choose one of the listed reasons for ${label}.`;
    if (given.reason === OTHER && !given.note?.trim()) {
      return `Say what happened when the reason for ${label} is Other.`;
    }
  }

  return null;
}
