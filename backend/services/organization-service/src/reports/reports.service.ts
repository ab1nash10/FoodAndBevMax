import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderChannel, OrderSource, OrderStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { toNumber } from '../common/values';
import { priceBill } from '../pos/pos-pricing';
import type { ReportQueryDto } from './dto/report-query.dto';
import { erpJournal, erpUnit, type ErpBill } from './erp-journal';
import {
  apcReport,
  cancelledReport,
  dateLabel,
  dayItemSummaryReport,
  inHouseReport,
  itemSalesReport,
  salesReport,
  taxReport,
  unpaidReport,
  type ReportBody,
} from './report-builders';

/** The reports, in the order the Reports page lists them; each has its own permission. */
export const reportCatalog = [
  {
    code: 'sales',
    description: 'Every paid bill with its taxable value, discount, GST and how it was paid.',
    permission: 'REPORT_SALES',
    title: 'Sales Report',
  },
  {
    code: 'sales-admin',
    description: 'The Sales Report with who billed each bill and whose staff discount it was.',
    permission: 'REPORT_SALES_ADMIN',
    title: 'Sales Report - Admin',
  },
  {
    code: 'apc',
    description: 'Per restaurant: bills, KOTs, gross and net sale, and the average per bill.',
    permission: 'REPORT_APC',
    title: 'APC Report',
  },
  {
    code: 'item-sales',
    description: 'Per item and category: quantity and amounts for POS, room and QR orders.',
    permission: 'REPORT_ITEM_SALES',
    title: 'Category Wise Sales Report',
  },
  {
    code: 'day-item-summary',
    description: 'Per item: the quantity sold each day, with rate, discount and total.',
    permission: 'REPORT_ITEM_SUMMARY',
    title: 'Day wise Item Summary Report',
  },
  {
    code: 'tax',
    description: 'Every billed line with its CGST, SGST and HSN/SAC.',
    permission: 'REPORT_TAX',
    title: 'Tax Collection Report',
  },
  {
    code: 'cancelled',
    description: 'Every cancelled bill, line by line, with when, why and by whom.',
    permission: 'REPORT_CANCELLED',
    title: 'Cancelled Bills Report',
  },
  {
    code: 'unpaid',
    description:
      'Kiosk orders nobody paid for at a counter, line by line, at the menu price (before any staff discount).',
    permission: 'REPORT_UNPAID',
    title: 'Unpaid Bills Report',
  },
  {
    code: 'in-house',
    description: 'Every complimentary (in-house consumption) bill, line by line.',
    permission: 'REPORT_IHC',
    title: 'In-House Consumption Bills Report',
  },
  {
    code: 'item-sales-ihc',
    description: 'The Category Wise Sales Report for complimentary bills.',
    permission: 'REPORT_IHC',
    title: 'Category Wise Sales Report (I.H.C)',
  },
  {
    code: 'day-item-summary-ihc',
    description: 'The Day wise Item Summary for complimentary bills.',
    permission: 'REPORT_IHC',
    title: 'Day wise Item Summary Report (I.H.C)',
  },
  {
    code: 'erp',
    description:
      'Paid and cancelled bills as SUN journal lines (ZHI01 revenue, ZHI02 receipts, ZHI03 settlement), in the ERP import layout.',
    permission: 'REPORT_ERP',
    title: 'ERP Journal (SUN)',
  },
] as const;

export const reportPermissions = [...new Set(reportCatalog.map((report) => report.permission))];

type ReportCode = (typeof reportCatalog)[number]['code'];

/** At most this much at a time: the reports read every bill and line in the range. */
const MAX_DAYS = 93;
const DAY = 86_400_000;

const round = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  catalog(permissions: string[] = []) {
    return reportCatalog
      .filter((report) => permissions.includes(report.permission))
      .map(({ code, description, title }) => ({ code, description, title }));
  }

  async run(code: string, query: ReportQueryDto, permissions: string[] = []) {
    const report = reportCatalog.find((entry) => entry.code === code);

    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    if (!permissions.includes(report.permission)) {
      throw new ForbiddenException(`You do not have access to the ${report.title}.`);
    }

    const from = new Date(query.from);
    const to = new Date(query.to);

    if (!(from < to)) {
      throw new BadRequestException('The report has to end after it starts.');
    }

    if (to.getTime() - from.getTime() > MAX_DAYS * DAY) {
      throw new BadRequestException(`Pick at most ${MAX_DAYS} days at a time.`);
    }

    const restaurantIds = query.restaurantIds?.split(',').filter(Boolean);
    const [hospital, restaurants, bills] = await Promise.all([
      this.prisma.hospital.findFirst({
        select: {
          billPrefix: true,
          city: true,
          hospitalCode: true,
          hospitalName: true,
          postalCode: true,
          state: true,
        },
        where: { id: query.hospitalId },
      }),
      restaurantIds?.length
        ? this.prisma.restaurant.findMany({
            orderBy: { restaurantName: 'asc' },
            select: { restaurantName: true },
            where: { hospitalId: query.hospitalId, id: { in: restaurantIds } },
          })
        : Promise.resolve([]),
      report.code === 'unpaid'
        ? this.unpaidOrders(query.hospitalId, from, to, restaurantIds)
        : this.bills(query.hospitalId, from, to, restaurantIds),
    ]);

    if (!hospital) {
      throw new NotFoundException('Location not found.');
    }

    if (restaurantIds?.length && !restaurants.length) {
      throw new NotFoundException('Restaurant not found.');
    }

    const where = [hospital.city, [hospital.state, hospital.postalCode].filter(Boolean).join('-')]
      .filter(Boolean)
      .join(', ');

    return {
      code: report.code,
      from,
      generatedAt: new Date(),
      location: `${hospital.hospitalCode} - ${hospital.hospitalName}${where ? `, ${where}` : ''}`,
      restaurants: restaurants.length
        ? restaurants.map((restaurant) => restaurant.restaurantName)
        : ['All restaurants'],
      /** A plain table for another system to import: no heading block, no total line. */
      plain: report.code === 'erp',
      title: report.title,
      to,
      ...build(report.code, bills, from, to, erpUnit(hospital)),
    };
  }

  /**
   * Kiosk orders placed in [from, to) that no counter ever billed, priced at today's menu price
   * the way the counter bills.
   */
  // ponytail: no staff discount here (it depends on the rule at billing time); the remark says
  // these are list prices. Store the kiosk's quoted total on the order if finance needs it exact.
  private async unpaidOrders(
    hospitalId: string,
    from: Date,
    to: Date,
    restaurantIds?: string[],
  ): Promise<ErpBill[]> {
    const orders = await this.prisma.kioskOrder.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        employeeCode: true,
        lines: true,
        number: true,
        restaurant: {
          select: { hospital: { select: { gstApplicable: true } }, restaurantName: true },
        },
      },
      where: {
        billedOrderId: null,
        createdAt: { gte: from, lt: to },
        restaurant: { hospitalId },
        ...(restaurantIds?.length ? { restaurantId: { in: restaurantIds } } : {}),
      },
    });
    const kioskLines = (lines: Prisma.JsonValue) =>
      lines as Array<{ menuId: string; quantity: number }>;
    const menuIds = [
      ...new Set(orders.flatMap((order) => kioskLines(order.lines).map((line) => line.menuId))),
    ];
    const menus = menuIds.length
      ? await this.prisma.restaurantMenu.findMany({
          select: {
            category: { select: { categoryName: true } },
            gstPercent: true,
            id: true,
            isGstInclusive: true,
            item: { select: { hsnCode: true, itemName: true } },
            menuItemCode: true,
            price: true,
          },
          where: { id: { in: menuIds } },
        })
      : [];
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));

    return orders.map((order) => {
      const gstApplicable = order.restaurant.hospital.gstApplicable;
      const lines = kioskLines(order.lines).flatMap((line) => {
        const menu = menuById.get(line.menuId);
        return menu ? [{ line, menu }] : [];
      });
      const totals = priceBill(
        lines.map(({ line, menu }) => ({
          gstPercent: gstApplicable ? toNumber(menu.gstPercent) : 0,
          isGstInclusive: menu.isGstInclusive,
          quantity: line.quantity,
          unitPrice: menu.price === null ? 0 : toNumber(menu.price),
        })),
      );

      return {
        billedBy: null,
        billNumber: `Kiosk ${order.number}`,
        businessDate: null,
        cancelReason: 'Not paid at a counter',
        cancelledAt: null,
        cancelledBy: null,
        complimentaryReason: null,
        counterCode: '',
        discount: 0,
        discountPercent: null,
        employeeCode: order.employeeCode,
        employeeName: null,
        grandTotal: totals.grandTotal,
        gst: totals.gstTotal,
        isCancelled: false,
        isComplimentary: false,
        lines: lines.map(({ line, menu }, index) => ({
          category: menu.category?.categoryName ?? '',
          code: menu.menuItemCode,
          discount: 0,
          gst: totals.lines[index]!.gstAmount,
          gstPercent: gstApplicable ? toNumber(menu.gstPercent) : 0,
          hsn: menu.item.hsnCode ?? '',
          name: menu.item.itemName,
          qty: line.quantity,
          rate: menu.price === null ? 0 : toNumber(menu.price),
          taxable: totals.lines[index]!.taxableAmount,
          total: totals.lines[index]!.lineTotal,
        })),
        onlineProvider: null,
        operatorCode: order.employeeCode,
        paidVia: null,
        paymentReference: null,
        placedAt: order.createdAt,
        restaurant: order.restaurant.restaurantName,
        room: null,
        roundOff: totals.roundOff,
        source: 'POS',
        subtotal: totals.subtotal,
      } satisfies ErpBill;
    });
  }

  /** The location's counter bills placed in [from, to), with lines and who is behind them. */
  private async bills(
    hospitalId: string,
    from: Date,
    to: Date,
    restaurantIds?: string[],
  ): Promise<ErpBill[]> {
    const orders = await this.prisma.restaurantOrder.findMany({
      orderBy: { placedAt: 'asc' },
      select: {
        bedNumber: true,
        billNumber: true,
        businessDate: true,
        cancelReason: true,
        cancelledAt: true,
        channel: true,
        complimentaryReason: true,
        counter: { select: { counterCode: true } },
        createdBy: true,
        discountPercent: true,
        discountTotal: true,
        employeeCode: true,
        grandTotal: true,
        gstTotal: true,
        isComplimentary: true,
        lines: {
          orderBy: { itemName: 'asc' },
          select: {
            discountAmount: true,
            gstAmount: true,
            gstPercent: true,
            hsnCode: true,
            itemName: true,
            lineTotal: true,
            menuItemCode: true,
            quantity: true,
            restaurantMenu: { select: { category: { select: { categoryName: true } } } },
            taxableAmount: true,
            unitPrice: true,
          },
        },
        onlinePayment: { select: { provider: true } },
        paymentMode: true,
        paymentReference: true,
        placedAt: true,
        restaurant: { select: { restaurantName: true } },
        roomNumber: true,
        roundOff: true,
        status: true,
        subtotal: true,
        updatedBy: true,
      },
      where: {
        hospitalId,
        placedAt: { gte: from, lt: to },
        source: OrderSource.COUNTER,
        ...(restaurantIds?.length ? { restaurantId: { in: restaurantIds } } : {}),
      },
    });
    const userIds = [
      ...new Set(orders.flatMap((order) => [order.createdBy, order.updatedBy]).filter(Boolean)),
    ] as string[];
    // Bills keep the code as typed; employee codes are saved upper case.
    const employeeCodes = [
      ...new Set(orders.map((order) => order.employeeCode?.toUpperCase()).filter(Boolean)),
    ] as string[];
    const [users, employees] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            select: { employeeCode: true, id: true, name: true },
            where: { id: { in: userIds } },
          })
        : Promise.resolve([]),
      employeeCodes.length
        ? this.prisma.employee.findMany({
            select: { employeeCode: true, employeeName: true },
            where: { employeeCode: { in: employeeCodes } },
          })
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const employeeName = new Map(
      employees.map((employee) => [employee.employeeCode.toUpperCase(), employee.employeeName]),
    );
    const value = (amount: Prisma.Decimal | null) => (amount === null ? 0 : toNumber(amount));

    return orders.map((order) => {
      const isCancelled = order.status === OrderStatus.CANCELLED;

      return {
        billedBy: order.createdBy ? (userById.get(order.createdBy)?.name ?? null) : null,
        billNumber: order.billNumber ?? '',
        businessDate: order.businessDate,
        cancelReason: order.cancelReason,
        cancelledAt: order.cancelledAt,
        cancelledBy:
          isCancelled && order.updatedBy ? (userById.get(order.updatedBy)?.name ?? null) : null,
        complimentaryReason: order.complimentaryReason,
        counterCode: order.counter?.counterCode ?? '',
        discount: value(order.discountTotal),
        discountPercent: order.discountPercent === null ? null : value(order.discountPercent),
        employeeCode: order.employeeCode,
        employeeName: order.employeeCode
          ? (employeeName.get(order.employeeCode.toUpperCase()) ?? null)
          : null,
        grandTotal: value(order.grandTotal),
        gst: value(order.gstTotal),
        isCancelled,
        isComplimentary: order.isComplimentary,
        lines: order.lines.map((line) => ({
          category: line.restaurantMenu.category?.categoryName ?? '',
          code: line.menuItemCode,
          discount: value(line.discountAmount),
          gst: value(line.gstAmount),
          gstPercent: value(line.gstPercent),
          hsn: line.hsnCode ?? '',
          name: line.itemName,
          qty: line.quantity,
          rate: value(line.unitPrice),
          taxable: value(line.taxableAmount),
          total: value(line.lineTotal),
        })),
        onlineProvider: order.onlinePayment?.provider ?? null,
        operatorCode: order.createdBy
          ? (userById.get(order.createdBy)?.employeeCode ?? null)
          : null,
        paidVia:
          order.paymentMode === 'UPI' && order.onlinePayment
            ? 'ONLINE'
            : (order.paymentMode ?? null),
        paymentReference: order.paymentReference,
        placedAt: order.placedAt,
        restaurant: order.restaurant.restaurantName,
        room: [order.roomNumber, order.bedNumber].filter(Boolean).join(' / ') || null,
        roundOff: round(value(order.roundOff)),
        source: order.channel === OrderChannel.ROOM ? 'ROOM' : 'POS',
        subtotal: value(order.subtotal),
      } satisfies ErpBill;
    });
  }
}

/** The site days a range covers, as the day-wise reports head their columns. */
function daysIn(from: Date, to: Date): string[] {
  const days: string[] = [];

  for (let at = from.getTime(); at < to.getTime(); at += DAY / 4) {
    const day = dateLabel(new Date(at));
    if (!days.includes(day)) days.push(day);
  }

  const last = dateLabel(new Date(to.getTime() - 1));
  if (!days.includes(last)) days.push(last);

  return days;
}

function build(code: ReportCode, bills: ErpBill[], from: Date, to: Date, unit: string): ReportBody {
  switch (code) {
    case 'erp':
      return erpJournal(bills, unit);
    case 'unpaid':
      return unpaidReport(bills);
    case 'sales':
      return salesReport(bills, false);
    case 'sales-admin':
      return salesReport(bills, true);
    case 'apc':
      return apcReport(bills);
    case 'item-sales':
      return itemSalesReport(bills, false);
    case 'item-sales-ihc':
      return itemSalesReport(bills, true);
    case 'day-item-summary':
      return dayItemSummaryReport(bills, false, daysIn(from, to));
    case 'day-item-summary-ihc':
      return dayItemSummaryReport(bills, true, daysIn(from, to));
    case 'tax':
      return taxReport(bills);
    case 'cancelled':
      return cancelledReport(bills);
    case 'in-house':
      return inHouseReport(bills);
  }
}
