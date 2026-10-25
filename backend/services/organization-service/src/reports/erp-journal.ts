// The ERP (SUN) journal export, laid out as the finance team's "ERP Payment mode template": one
// row per posting, three journals per bill. ZHI01 books the revenue (item base, CGST, SGST and
// round-off against the revenue control account), ZHI02 the money received (cash, card, UPI
// against the settlement clearing account) and ZHI03 settles the two, with any staff discount.
// A cancelled bill is posted, then posted again with every debit and credit swapped.
// Pure: bills in, rows out. Account codes are from "ERP Account Code details".
import type { Bill, ReportBody, ReportColumn, ReportRow } from './report-builders';

export interface ErpBill extends Bill {
  /** The day the bill is counted on (the next day once the day was closed). */
  businessDate: Date | null;
  discountPercent: number | null;
  onlineProvider: 'PAYU' | 'RAZORPAY' | null;
  paymentReference: string | null;
}

const HEADERS = [
  'SUN_BU',
  'JRNAL_TYPE',
  'LEDGER',
  'ACCOUNT_CODE',
  'TREFERENCE',
  'DESCRIPTION',
  'PERIOD',
  'TRANSACTION_DATE',
  'DC',
  'AMOUNT',
  'CUR',
  'DUE_DATE',
  ...Array.from({ length: 10 }, (_, index) => `T${index + 1}`),
  ...Array.from({ length: 25 }, (_, index) => `AFS_${index + 1}`),
  ...Array.from({ length: 5 }, (_, index) => `AFS_DATE_${index + 1}`),
  'ENTRY_DATE',
  'MODIFY_DATE',
  'UNQ_ID',
  'BATCH_CODE',
  'STATUS',
  'STATUS_DESC',
  'ERROR_DESC',
  'SYSTEM_TYPE',
  'TRANSACTION_TYPE',
  'JRNAL_NO',
  'MEMO_AMT',
  'ERROR',
  'CODE',
  'TYPE',
  'DETAILS',
  'MESSAGESTATUS',
  'MESSAGEID',
];

const ACCOUNT = {
  discount: '32501001',
  /** Item base amount, without GST. */
  revenue: '42020075',
  revenueControl: 'DINTF001',
  roundOff: '32106008',
  settlement: '26106021',
};
/** The POS customer account; the same for visitors, staff and room service. */
const POS_ACCOUNT = '30SUP013';
const DEPARTMENT = 'DCAS0003';

/** CGST and SGST accounts by the half rate. */
const TAX_ACCOUNTS: Record<string, [cgst: string, sgst: string]> = {
  '2.5': ['26110005', '26110001'],
  '6': ['26110006', '26110002'],
  '9': ['26110007', '26110003'],
  '14': ['26110008', '26110004'],
};

// ponytail: Razorpay has no account in the code sheet, so it posts to UPI; give it its own
// code here once finance names one. OTHER has none either and is left blank to be filled in.
function receivedInto(bill: ErpBill): [account: string, label: string] {
  switch (bill.paidVia) {
    case 'CASH':
      return ['13102016', 'CASH'];
    case 'CARD':
      return ['13101018', 'CREDIT'];
    case 'ONLINE':
      return bill.onlineProvider === 'PAYU' ? ['13101386', 'PAYU'] : ['13101259', 'UPI'];
    case 'UPI':
      return ['13101259', 'UPI'];
    default:
      return ['', 'OTHER'];
  }
}

const money = (value: number) => Math.round(value * 100) / 100;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The site day of a bill as [day, month (1-12), year]. */
function siteDay(bill: ErpBill): [number, number, number] {
  if (bill.businessDate) {
    const date = bill.businessDate;
    return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()];
  }

  const [day, month, year] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata' })
    .format(bill.placedAt)
    .split('/')
    .map(Number);
  return [day!, month!, year!];
}

/** The SUN unit of a location: its bill prefix without "MAX" (MAXBLK is BLK). */
export function erpUnit(location: { billPrefix: string | null; hospitalCode: string }) {
  return location.billPrefix?.replace(/^MAX[-_\s]*/i, '') || location.hospitalCode;
}

type Posting = {
  account: string;
  amount: number;
  dc: 'C' | 'D';
  discountName?: string;
  label: string;
  memo?: number;
};

function postings(bill: ErpBill): Array<{ journal: string; list: Posting[]; reference: string }> {
  const taxes = new Map<number, number>();

  for (const line of bill.lines) {
    taxes.set(line.gstPercent, (taxes.get(line.gstPercent) ?? 0) + line.gst);
  }

  const charged = money(bill.grandTotal + bill.discount);
  const [paidInto, paidLabel] = receivedInto(bill);
  const revenue: Posting[] = [
    { account: ACCOUNT.revenue, amount: bill.subtotal, dc: 'C', label: 'FOOD' },
    ...[...taxes]
      .filter(([, gst]) => gst > 0)
      .flatMap(([percent, gst]): Posting[] => {
        const half = percent / 2;
        const [cgst, sgst] = TAX_ACCOUNTS[String(half)] ?? ['', ''];
        const amount = money(gst / 2);

        return [
          { account: cgst, amount, dc: 'C', label: `CGST${Math.trunc(half)}` },
          { account: sgst, amount: money(gst - amount), dc: 'C', label: `SGST${Math.trunc(half)}` },
        ];
      }),
    ...(bill.roundOff
      ? [
          {
            account: ACCOUNT.roundOff,
            amount: Math.abs(bill.roundOff),
            dc: bill.roundOff > 0 ? 'C' : 'D',
            label: 'FOOD',
          } satisfies Posting,
        ]
      : []),
    { account: ACCOUNT.revenueControl, amount: charged, dc: 'D', label: 'RevenueControlAccount' },
  ];

  return [
    { journal: 'ZHI01', list: revenue, reference: bill.billNumber },
    {
      journal: 'ZHI02',
      list: [
        { account: paidInto, amount: bill.grandTotal, dc: 'D', label: paidLabel },
        { account: ACCOUNT.settlement, amount: bill.grandTotal, dc: 'C', label: paidLabel },
      ],
      reference: bill.paymentReference || bill.billNumber,
    },
    {
      journal: 'ZHI03',
      list: [
        { account: ACCOUNT.settlement, amount: bill.grandTotal, dc: 'D', label: 'F&BSETTLED' },
        ...(bill.discount
          ? [
              {
                account: ACCOUNT.discount,
                amount: bill.discount,
                dc: 'D',
                discountName: `Discount_${bill.discountPercent ?? 0}%`,
                label: 'F&BSETTLED',
                memo: bill.subtotal,
              } satisfies Posting,
            ]
          : []),
        { account: ACCOUNT.revenueControl, amount: charged, dc: 'C', label: 'F&BSETTLED' },
      ],
      reference: bill.billNumber,
    },
  ];
}

/** The journal rows for the paid and cancelled bills (complimentary bills post nothing). */
export function erpJournal(bills: ErpBill[], unit: string): ReportBody {
  const columns: ReportColumn[] = HEADERS.map((header) => ({
    key: header,
    kind: header === 'AMOUNT' ? 'money' : 'text',
    label: header,
  }));
  const rows: ReportRow[] = [];

  for (const bill of bills.filter((entry) => !entry.isComplimentary)) {
    const [day, month, year] = siteDay(bill);
    const date = `${String(day).padStart(2, '0')}${String(month).padStart(2, '0')}${year}`;
    // The financial year starts in April: June 2025 is period 003 of 2025.
    const period = `${String(((month + 8) % 12) + 1).padStart(3, '0')}${month >= 4 ? year : year - 1}`;
    const passes = bill.isCancelled ? [false, true] : [false];

    for (const reversed of passes) {
      for (const { journal, list, reference } of postings(bill)) {
        for (const posting of list.filter((entry) => entry.amount > 0)) {
          const dc = reversed ? (posting.dc === 'C' ? 'D' : 'C') : posting.dc;
          rows.push({
            ACCOUNT_CODE: posting.account,
            AFS_1: 'FNB',
            AFS_10: posting.discountName ?? null,
            AFS_11: bill.billNumber,
            AFS_12: 'FNB',
            AFS_14: 'FNB',
            AFS_15: unit,
            AFS_16: 'Non Chargeable',
            AFS_19: bill.billNumber,
            AFS_2: 'FNB',
            AFS_20: `${journal}-0-${bill.billNumber}-${unit}-H`,
            AFS_3: bill.operatorCode,
            AFS_4: 'FNB',
            AFS_5: bill.billNumber,
            AFS_7: 'FNB',
            AFS_8: posting.label,
            AFS_9: posting.label,
            AFS_DATE_1: date,
            AFS_DATE_2: date,
            AFS_DATE_3: date,
            AMOUNT: money(posting.amount),
            BATCH_CODE: `${journal}-0-${date}-${unit}-H`,
            CUR: 'INR',
            DC: dc,
            DESCRIPTION: 'FNB',
            JRNAL_TYPE: journal,
            LEDGER: 'H',
            MEMO_AMT: posting.memo ?? 0,
            MESSAGESTATUS: '0',
            PERIOD: period,
            SUN_BU: unit,
            SYSTEM_TYPE: 'HIS',
            T1: unit,
            T10: 'N',
            T2: unit,
            T3: POS_ACCOUNT,
            T4: '_NA',
            T5: journal === 'ZHI02' ? '_NA' : DEPARTMENT,
            T6: '_NA',
            T7: '_NA',
            T8: 'R',
            T9: MONTHS[month - 1]!,
            TRANSACTION_DATE: date,
            TRANSACTION_TYPE: 'SETTLED',
            TREFERENCE: reference,
            UNQ_ID: 0,
          });
        }
      }
    }
  }

  return { columns, rows, totals: null };
}
