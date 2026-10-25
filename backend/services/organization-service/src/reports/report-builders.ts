// The F&B reports, laid out as the old system's (Idoraa) Excel exports: the same titles, columns
// and column order, so finance and operations read them as before. Pure: bills in, rows out.

export interface BillLine {
  category: string;
  code: string;
  discount: number;
  gst: number;
  gstPercent: number;
  hsn: string;
  name: string;
  qty: number;
  rate: number;
  taxable: number;
  total: number;
}

export interface Bill {
  /** Who billed it: for a complimentary meal, who approved it (only an approver may bill one). */
  billedBy: string | null;
  billNumber: string;
  cancelReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  complimentaryReason: string | null;
  counterCode: string;
  discount: number;
  employeeCode: string | null;
  employeeName: string | null;
  grandTotal: number;
  gst: number;
  isCancelled: boolean;
  isComplimentary: boolean;
  lines: BillLine[];
  operatorCode: string | null;
  /** How it was paid, as the reports split it; ONLINE is UPI through Razorpay or PayU. */
  paidVia: 'CARD' | 'CASH' | 'ONLINE' | 'OTHER' | 'UPI' | null;
  placedAt: Date;
  restaurant: string;
  room: string | null;
  roundOff: number;
  /** Which column group of the item-wise report it falls in. */
  source: 'POS' | 'QR' | 'ROOM';
  subtotal: number;
}

export interface ReportColumn {
  /** A heading over several columns, e.g. "POS Orders". */
  group?: string;
  key: string;
  kind?: 'money' | 'number' | 'text';
  label: string;
}

export type ReportRow = Record<string, number | string | null>;

export interface ReportBody {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Sums of the money and number columns, for the last line. */
  totals: ReportRow | null;
}

const money = (value: number) => Math.round(value * 100) / 100;
const sum = <T>(items: T[], pick: (item: T) => number) =>
  money(items.reduce((total, item) => total + pick(item), 0));

const siteDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
});
const siteTime = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  hour12: true,
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
/** "14-Apr-2026", as the old reports print dates. */
export const dateLabel = (value: Date) => siteDate.format(value).replaceAll(' ', '-');
export const timeLabel = (value: Date) => siteTime.format(value).toUpperCase();

const paid = (bill: Bill) => !bill.isCancelled && !bill.isComplimentary;
const inHouse = (bill: Bill) => !bill.isCancelled && bill.isComplimentary;

function totalsOf(columns: ReportColumn[], rows: ReportRow[], label: string): ReportRow | null {
  if (rows.length === 0) return null;
  const totals: ReportRow = { [columns[0]!.key]: label };

  for (const column of columns.slice(1)) {
    if (column.kind === 'money' || column.kind === 'number') {
      totals[column.key] = sum(rows, (row) => Number(row[column.key] ?? 0));
    }
  }

  return totals;
}

const text = (key: string, label: string, group?: string): ReportColumn => ({
  group,
  key,
  kind: 'text',
  label,
});
const amount = (key: string, label: string, group?: string): ReportColumn => ({
  group,
  key,
  kind: 'money',
  label,
});
const count = (key: string, label: string, group?: string): ReportColumn => ({
  group,
  key,
  kind: 'number',
  label,
});

/** Sales Report, and Sales Report - Admin (who billed, and whose staff discount it was). */
export function salesReport(bills: Bill[], admin: boolean): ReportBody {
  const columns = [
    text('restaurant', 'Restaurant Name'),
    text('pos', 'POS Code'),
    text('bill', 'Bill No'),
    amount('amount', 'Bill Amount'),
    text('at', 'Date & Time'),
    amount('taxable', 'Taxable Amount'),
    amount('discount', 'Discount'),
    amount('gst', 'GST/VAT'),
    amount('cash', 'CASH'),
    amount('card', 'CREDIT CARD'),
    amount('upi', 'UPI'),
    amount('online', admin ? 'Online' : 'ONLINE'),
    amount('other', 'OTHER'),
    ...(admin
      ? [
          text('operator', 'Operator Code'),
          text('empId', 'Emp ID (Discount)'),
          text('empName', 'Emp Name'),
        ]
      : []),
  ];
  const rows = bills.filter(paid).map((bill) => {
    const via = (mode: Bill['paidVia']) => (bill.paidVia === mode ? bill.grandTotal : 0);

    return {
      amount: bill.grandTotal,
      at: `${dateLabel(bill.placedAt)} ${timeLabel(bill.placedAt)}`,
      bill: bill.billNumber,
      card: via('CARD'),
      cash: via('CASH'),
      discount: bill.discount,
      gst: bill.gst,
      online: via('ONLINE'),
      other: via('OTHER'),
      pos: bill.counterCode,
      restaurant: bill.restaurant,
      taxable: sum(bill.lines, (line) => line.taxable),
      upi: via('UPI'),
      ...(admin
        ? {
            empId: bill.discount ? bill.employeeCode : null,
            empName: bill.discount ? bill.employeeName : null,
            operator: bill.operatorCode,
          }
        : {}),
    };
  });

  return { columns, rows, totals: totalsOf(columns, rows, 'Total') };
}

/** APC Report: per restaurant, bills and KOTs (NC = complimentary), sales and average per bill. */
export function apcReport(bills: Bill[]): ReportBody {
  const columns = [
    text('restaurant', 'Restaurant Name'),
    count('bills', 'Bills'),
    count('kot', 'KOT'),
    count('ncKot', 'NC KOT'),
    amount('gross', 'Gross Sale'),
    amount('discount', 'Discount'),
    amount('nonTaxable', 'Non Taxable'),
    amount('taxable', 'Taxable'),
    amount('taxes', 'Taxes'),
    amount('roundOff', 'Round Off'),
    amount('net', 'Net Sale'),
    amount('apc', 'APC'),
  ];
  const byRestaurant = new Map<string, Bill[]>();

  for (const bill of bills.filter((entry) => !entry.isCancelled)) {
    byRestaurant.set(bill.restaurant, [...(byRestaurant.get(bill.restaurant) ?? []), bill]);
  }

  const rows = [...byRestaurant]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([restaurant, group]) => {
      const sold = group.filter(paid);
      const lines = sold.flatMap((bill) => bill.lines);
      const net = sum(sold, (bill) => bill.grandTotal);

      return {
        apc: sold.length ? money(net / sold.length) : 0,
        bills: sold.length,
        discount: sum(sold, (bill) => bill.discount),
        gross: sum(sold, (bill) => bill.subtotal),
        kot: group.length,
        ncKot: group.length - sold.length,
        net,
        nonTaxable: sum(
          lines.filter((line) => line.gstPercent === 0),
          (line) => line.taxable,
        ),
        restaurant,
        roundOff: sum(sold, (bill) => bill.roundOff),
        taxable: sum(
          lines.filter((line) => line.gstPercent > 0),
          (line) => line.taxable,
        ),
        taxes: sum(sold, (bill) => bill.gst),
      };
    });
  const totals = totalsOf(columns, rows, 'Total');

  if (totals) {
    totals.apc = Number(totals.bills) ? money(Number(totals.net) / Number(totals.bills)) : 0;
  }

  return { columns, rows, totals };
}

interface ItemTally {
  category: string;
  code: string;
  discount: number;
  gross: number;
  gst: number;
  name: string;
  qty: number;
  total: number;
}

function tallyItems(lines: BillLine[]) {
  const items = new Map<string, ItemTally>();

  for (const line of lines) {
    const key = `${line.code}|${line.name}`;
    const item = items.get(key) ?? {
      category: line.category,
      code: line.code,
      discount: 0,
      gross: 0,
      gst: 0,
      name: line.name,
      qty: 0,
      total: 0,
    };
    item.discount = money(item.discount + line.discount);
    item.gross = money(item.gross + line.rate * line.qty);
    item.gst = money(item.gst + line.gst);
    item.qty += line.qty;
    item.total = money(item.total + line.total);
    items.set(key, item);
  }

  return items;
}

const sources = [
  ['POS', 'POS Orders'],
  ['ROOM', 'Room Orders'],
  ['QR', 'QR Orders'],
] as const;

/** Category Wise Sales Report: per item, rate, qty and amounts for POS, room and QR orders. */
export function itemSalesReport(bills: Bill[], ihc: boolean): ReportBody {
  const chosen = bills.filter(ihc ? inHouse : paid);
  const columns: ReportColumn[] = [
    text('code', 'Menu Item Code'),
    text('category', 'Category'),
    text('name', 'Item Name'),
    ...sources.flatMap(([source, group]) => [
      amount(`${source}_rate`, 'Rate', group),
      count(`${source}_qty`, 'Qty', group),
      amount(`${source}_price`, 'Price', group),
      amount(`${source}_discount`, 'Discount', group),
      amount(`${source}_gst`, 'GST', group),
      amount(`${source}_total`, 'Total Amount', group),
    ]),
  ];
  const perSource = new Map(
    sources.map(([source]) => [
      source,
      tallyItems(chosen.filter((bill) => bill.source === source).flatMap((bill) => bill.lines)),
    ]),
  );
  const all = tallyItems(chosen.flatMap((bill) => bill.lines));
  const rows = [...all.entries()]
    .sort(([, a], [, b]) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(([key, item]) => {
      const row: ReportRow = { category: item.category, code: item.code, name: item.name };

      for (const [source] of sources) {
        const entry = perSource.get(source)?.get(key);
        row[`${source}_rate`] = entry?.qty ? money(entry.gross / entry.qty) : 0;
        row[`${source}_qty`] = entry?.qty ?? 0;
        row[`${source}_price`] = entry?.gross ?? 0;
        row[`${source}_discount`] = entry?.discount ?? 0;
        row[`${source}_gst`] = entry?.gst ?? 0;
        row[`${source}_total`] = entry?.total ?? 0;
      }

      return row;
    });
  const totals = totalsOf(columns, rows, 'Total');

  // A rate does not add up across items.
  for (const [source] of sources) {
    if (totals) totals[`${source}_rate`] = null;
  }

  return { columns, rows, totals };
}

/** Day wise Item Summary Report: per item, the quantity sold each day, then totals. */
export function dayItemSummaryReport(bills: Bill[], ihc: boolean, days: string[]): ReportBody {
  const chosen = bills.filter(ihc ? inHouse : paid);
  const columns: ReportColumn[] = [
    text('code', 'Menu Item Code'),
    text('name', 'Item Name'),
    ...days.map((day) => count(`day_${day}`, day)),
    count('qty', 'Total Qty'),
    amount('rate', 'Rate'),
    amount('discount', 'Discount Value'),
    amount('total', 'Total Amount'),
  ];
  const all = tallyItems(chosen.flatMap((bill) => bill.lines));
  const perDay = new Map(
    days.map((day) => [
      day,
      tallyItems(
        chosen.filter((bill) => dateLabel(bill.placedAt) === day).flatMap((bill) => bill.lines),
      ),
    ]),
  );
  const rows = [...all.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([key, item]) => ({
      code: item.code,
      discount: item.discount,
      name: item.name,
      qty: item.qty,
      rate: item.qty ? money(item.gross / item.qty) : 0,
      total: item.total,
      ...Object.fromEntries(days.map((day) => [`day_${day}`, perDay.get(day)?.get(key)?.qty ?? 0])),
    }));
  const totals = totalsOf(columns, rows, 'Total');

  if (totals) totals.rate = null;

  return { columns, rows, totals };
}

/** Tax Collection Report: every billed line with its CGST and SGST halves and HSN/SAC. */
export function taxReport(bills: Bill[]): ReportBody {
  const columns = [
    text('bill', 'Inv. Number'),
    text('date', 'Inv. Date'),
    count('cgstPercent', 'CGST %'),
    count('sgstPercent', 'SGST %'),
    text('item', 'Item'),
    amount('rate', 'Rate'),
    count('qty', 'Quantity'),
    amount('gross', 'Gross Value'),
    amount('discount', 'Discount value'),
    amount('taxable', 'Taxable Value'),
    amount('cgst', 'CSGT'),
    amount('sgst', 'SGST'),
    text('hsn', 'HSN/SAC'),
  ];
  const rows = bills.filter(paid).flatMap((bill) =>
    bill.lines.map((line) => {
      const cgst = money(line.gst / 2);

      return {
        bill: bill.billNumber,
        cgst,
        cgstPercent: line.gstPercent / 2,
        date: dateLabel(bill.placedAt),
        discount: line.discount,
        gross: money(line.rate * line.qty),
        hsn: line.hsn,
        item: line.name,
        qty: line.qty,
        rate: line.rate,
        sgst: money(line.gst - cgst),
        sgstPercent: line.gstPercent / 2,
        taxable: line.taxable,
      };
    }),
  );
  const totals = totalsOf(columns, rows, 'Total');

  if (totals) {
    totals.cgstPercent = null;
    totals.sgstPercent = null;
    totals.rate = null;
  }

  return { columns, rows, totals };
}

/** A rate does not add up across lines. */
function withoutRate(totals: ReportRow | null) {
  if (totals) totals.rate = null;
  return totals;
}

function lineColumns(): ReportColumn[] {
  return [
    text('itemCode', 'Menu Item Code'),
    text('itemName', 'Menu Name'),
    amount('rate', 'Rate'),
    count('qty', 'Qty'),
    amount('price', 'Price'),
    amount('discount', 'Discount'),
    amount('gst', 'GST'),
    amount('final', 'Final Amount'),
  ];
}

function lineValues(line: BillLine): ReportRow {
  return {
    discount: line.discount,
    final: line.total,
    gst: line.gst,
    itemCode: line.code,
    itemName: line.name,
    price: money(line.rate * line.qty),
    qty: line.qty,
    rate: line.rate,
  };
}

/** Cancelled Bills Report: every line of every cancelled bill, with who cancelled it and why. */
export function cancelledReport(bills: Bill[]): ReportBody {
  return voidedReport(
    bills.filter((bill) => bill.isCancelled),
    true,
  );
}

/**
 * Unpaid Bills Report: every line of every order nobody paid for (kiosk orders never billed at
 * a counter), laid out as the Cancelled Bills Report without its POS Code; the remark says why.
 */
export function unpaidReport(bills: Bill[]): ReportBody {
  return voidedReport(bills, false);
}

function voidedReport(bills: Bill[], withPos: boolean): ReportBody {
  const lines = lineColumns();
  const columns = [
    text('date', 'Order Date'),
    text('time', 'Time'),
    text('restaurant', 'Restaurant'),
    text('bill', 'Bill No.'),
    ...(withPos ? [text('pos', 'POS Code')] : []),
    text('room', 'Room No./Table No.'),
    text('operator', 'Operator/Admin Id'),
    amount('amount', 'Total Amount'),
    lines[0]!,
    text('cancelDate', 'Cancel Date'),
    text('cancelTime', 'Cancel Time'),
    text('remark', 'Remark'),
    text('approvedBy', 'Approved By'),
    ...lines.slice(1),
  ];
  const rows = bills.flatMap((bill) =>
    bill.lines.map((line, index) => ({
      amount: index === 0 ? bill.grandTotal : null,
      approvedBy: bill.cancelledBy,
      bill: bill.billNumber,
      cancelDate: bill.cancelledAt ? dateLabel(bill.cancelledAt) : null,
      cancelTime: bill.cancelledAt ? timeLabel(bill.cancelledAt) : null,
      date: dateLabel(bill.placedAt),
      operator: bill.operatorCode,
      pos: bill.counterCode,
      remark: bill.cancelReason,
      restaurant: bill.restaurant,
      room: bill.room,
      time: timeLabel(bill.placedAt),
      ...lineValues(line),
    })),
  );

  return { columns, rows, totals: withoutRate(totalsOf(columns, rows, 'Total')) };
}

/** In-House Consumption Bills Report: every line of every complimentary (NC) bill. */
export function inHouseReport(bills: Bill[]): ReportBody {
  const columns = [
    text('date', 'Order Date'),
    text('time', 'Time'),
    text('restaurant', 'Restaurant'),
    text('bill', 'Bill No.'),
    text('room', 'Room No./Table No.'),
    text('operator', 'Operator ID'),
    text('approvedBy', 'Approved By'),
    text('category', 'Category'),
    text('customer', 'Customer Name'),
    text('department', 'Department'),
    text('remark', 'Remarks'),
    amount('amount', 'Total Amount'),
    ...lineColumns(),
  ];
  const rows = bills.filter(inHouse).flatMap((bill) =>
    bill.lines.map((line, index) => ({
      amount: index === 0 ? bill.grandTotal : null,
      approvedBy: bill.billedBy,
      bill: bill.billNumber,
      category: line.category,
      customer: bill.employeeName,
      date: dateLabel(bill.placedAt),
      department: null,
      operator: bill.operatorCode,
      remark: bill.complimentaryReason,
      restaurant: bill.restaurant,
      room: bill.room,
      time: timeLabel(bill.placedAt),
      ...lineValues(line),
    })),
  );

  return { columns, rows, totals: withoutRate(totalsOf(columns, rows, 'Total')) };
}
