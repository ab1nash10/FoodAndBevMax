import { getAllowedHospitalIds, hospitalScopeStorage } from '@aahar/auth';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CounterShiftStatus,
  EmploymentType,
  InventoryLocationType,
  MenuServeAt,
  OrderChannel,
  OrderSource,
  OrderStatus,
  PaymentMode,
  Prisma,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { bestDiscountRule } from '../employee-discounts/employee-discount-rules';
import { getOrderBy, getPageMeta, getPagination, toStatusCounts } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { lockRow } from '../common/row-lock';
import { ShortCache } from '../common/short-cache';
import { optionalText, toDateOnly, toNumber } from '../common/values';
import type {
  CancelPosOrderDto,
  CreatePosOrderDto,
  EmployeeLookupQueryDto,
  ListPosOrdersQueryDto,
  PosMenuQueryDto,
  PosSummaryQueryDto,
  SetStaffDiscountsDto,
} from './dto/pos.dto';
import { itemCount } from '../restaurant-orders/restaurant-orders.service';
import { deviceHost } from './device-host';
import { isOnSale, priceBill, sellableMenu, siteBusinessDate } from './pos-pricing';
import { shiftStates, shiftsOn, tally, userNames } from './shifts';

type Client = Prisma.TransactionClient | PrismaService;

/** SAC for restaurant food service, printed for items with no HSN of their own. */
const RESTAURANT_SERVICE_SAC = '996331';

/** A restaurant counts as using its kiosk when a kiosk order came in within this many days. */
const KIOSK_IN_USE_DAYS = 30;

const notAssignedToTill =
  'You are not assigned to the location of this till’s restaurant. Ask an admin to give you access to its location.';

/** Whether the signed-in user reaches the location of one of the till's restaurants. */
function mayWorkTill(device: { restaurants: Array<{ restaurant: { hospitalId: string } }> }) {
  const allowed = getAllowedHospitalIds();
  // null: a Super Admin, who reaches every location (undefined: no request, as in a job).
  return (
    allowed == null ||
    device.restaurants.some((entry) => allowed.includes(entry.restaurant.hospitalId))
  );
}

const counterSelect = {
  counterCode: true,
  counterName: true,
  hospital: {
    select: {
      billPrefix: true,
      gstApplicable: true,
      hospitalCode: true,
      hospitalName: true,
      id: true,
    },
  },
  hospitalId: true,
  id: true,
  restaurant: {
    select: {
      id: true,
      legalName: true,
      restaurantCode: true,
      restaurantName: true,
      staffDiscountApplicable: true,
      upiId: true,
    },
  },
  restaurantId: true,
} satisfies Prisma.CounterSelect;

const orderDetailInclude = {
  counter: { select: { counterCode: true, counterName: true, id: true } },
  hospital: { select: { address: true, city: true, hospitalName: true, id: true, state: true } },
  lines: {
    include: { restaurantMenu: { select: { isDiscountable: true } } },
    orderBy: { itemName: 'asc' },
  },
  restaurant: {
    select: {
      address: true,
      fssaiNumber: true,
      gstAddress: true,
      gstNumber: true,
      id: true,
      legalEntity: { select: { entityAddress: true, entityName: true, gstNumber: true } },
      legalName: true,
      restaurantName: true,
      upiId: true,
    },
  },
} satisfies Prisma.RestaurantOrderInclude;

type OrderDetail = Prisma.RestaurantOrderGetPayload<{ include: typeof orderDetailInclude }>;

const money = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));

/** Which menu items a channel sells, by the item's serveAt. */
function servedOn(channel: OrderChannel): MenuServeAt[] {
  return [MenuServeAt.BOTH, channel === OrderChannel.ROOM ? MenuServeAt.ROOM : MenuServeAt.COUNTER];
}

/** A room order is charged the room price where one is set; a counter order the counter price. */
function channelPrice(
  menu: { price: Prisma.Decimal | null; roomPrice: Prisma.Decimal | null },
  channel: OrderChannel,
): number | null {
  const price = channel === OrderChannel.ROOM ? (menu.roomPrice ?? menu.price) : menu.price;

  return price === null ? null : toNumber(price);
}

/** The kitchen ticket's number: counter, business day and order, e.g. COUNTER-01/261021/0003. */
function kotNumber(order: OrderDetail): string {
  const day = order.businessDate?.toISOString().slice(2, 10).replaceAll('-', '') ?? '';

  return `${order.counter?.counterCode ?? ''}/${day}/${order.orderNumber}`;
}

function toOrderResponse(
  order: OrderDetail,
  cashier: { employeeCode: string; name: string } | null,
) {
  return {
    billNumber: order.billNumber,
    bedNumber: order.bedNumber,
    businessDate: order.businessDate,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt,
    cashierCode: cashier?.employeeCode ?? null,
    cashierName: cashier?.name ?? null,
    channel: order.channel,
    complimentaryReason: order.complimentaryReason,
    counter: order.counter,
    customerMobile: order.customerMobile,
    discountPercent: money(order.discountPercent),
    discountTotal: money(order.discountTotal) ?? 0,
    employeeCode: order.employeeCode,
    grandTotal: money(order.grandTotal),
    gstTotal: money(order.gstTotal),
    hospital: order.hospital,
    id: order.id,
    instructions: order.instructions,
    isComplimentary: order.isComplimentary,
    kotNumber: kotNumber(order),
    lines: order.lines.map((line) => ({
      discountAmount: toNumber(line.discountAmount),
      gstAmount: toNumber(line.gstAmount),
      gstPercent: toNumber(line.gstPercent),
      hsnCode: line.hsnCode,
      id: line.id,
      isDiscountable: line.restaurantMenu.isDiscountable,
      isGstInclusive: line.isGstInclusive,
      itemId: line.itemId,
      itemName: line.itemName,
      lineTotal: toNumber(line.lineTotal),
      menuId: line.restaurantMenuId,
      menuItemCode: line.menuItemCode,
      note: line.note,
      quantity: line.quantity,
      taxableAmount: toNumber(line.taxableAmount),
      unitPrice: toNumber(line.unitPrice),
    })),
    orderNumber: order.orderNumber,
    paymentMode: order.paymentMode,
    paymentReference: order.paymentReference,
    placedAt: order.placedAt,
    restaurant: order.restaurant,
    roomNumber: order.roomNumber,
    roundOff: money(order.roundOff),
    status: order.status,
    subtotal: money(order.subtotal),
  };
}

@Injectable()
export class PosService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly tillByAddress = new ShortCache(5 * 60_000);

  /**
   * The active counters the user may bill at (reads are already limited to their locations),
   * each with its shift: the open one, a handover waiting for the next cashier, a closed day.
   * With `ip`, only the counters of the till that computer is: DNS must name it as a mapped POS
   * device, whatever its browser says. The POS module opens nowhere else.
   */
  async counters(ip?: string) {
    const tillName = ip === undefined ? null : await this.tillAt(ip);
    if (ip !== undefined && !tillName) {
      throw new NotFoundException(
        'This computer is not mapped to a POS. Ask an admin to add its hostname to a POS device under POS & Payment Machines.',
      );
    }
    const till = tillName ? await this.tillDevice(tillName) : undefined;
    if (till && !mayWorkTill(till)) {
      throw new ForbiddenException(notAssignedToTill);
    }
    const found = await this.prisma.counter.findMany({
      orderBy: [{ restaurant: { restaurantName: 'asc' } }, { counterName: 'asc' }],
      select: { ...counterSelect, posDeviceId: true },
      where: {
        deletedAt: null,
        hospital: { deletedAt: null, isActive: true },
        isActive: true,
        restaurant: { deletedAt: null, isActive: true },
        ...(till
          ? {
              OR: [
                { posDeviceId: till.id },
                { restaurantId: { in: till.restaurants.map((entry) => entry.restaurantId) } },
              ],
            }
          : {}),
      },
    });
    // A till bills at its device's own counters if any name it, else at its restaurants' counters.
    const counters =
      till && found.some((counter) => counter.posDeviceId === till.id)
        ? found.filter((counter) => counter.posDeviceId === till.id)
        : found;
    const [states, kiosks] = await Promise.all([
      shiftStates(
        this.prisma,
        counters.map((counter) => counter.id),
        toDateOnly(siteBusinessDate(new Date())),
      ),
      // Only a restaurant whose kiosk took orders lately has guests to look for: the other tills
      // skip the waiting-orders poll (a number can still be looked up by hand).
      this.prisma.kioskOrder.groupBy({
        by: ['restaurantId'],
        where: {
          createdAt: { gte: new Date(Date.now() - KIOSK_IN_USE_DAYS * 86_400_000) },
          restaurantId: { in: [...new Set(counters.map((counter) => counter.restaurantId))] },
        },
      }),
    ]);
    const kioskRestaurants = new Set(kiosks.map((entry) => entry.restaurantId));

    return counters.map(({ posDeviceId: _posDeviceId, ...counter }) => ({
      ...counter,
      kioskInUse: kioskRestaurants.has(counter.restaurantId),
      shift: states.get(counter.id),
    }));
  }

  /**
   * The till computer's POS device, from its hostname, with the restaurants mapped to it. Looked
   * up across every location; the counters read after it stay limited to the user's, so a till
   * outside them shows no counter.
   */
  /** The registered till the computer at `ip` is; remembered a few minutes, as DNS can be slow. */
  /** The till the computer at `ip` is, its restaurants, and whether the signed-in user may work it. */
  async tillAccess(
    ip: string,
  ): Promise<{ allowed: boolean; restaurants: string[]; till: string | null }> {
    const till = await this.tillAt(ip);
    if (!till) return { allowed: false, restaurants: [], till: null };

    const device = await this.tillDevice(till);
    return {
      allowed: mayWorkTill(device),
      restaurants: device.restaurants.map((entry) => entry.restaurant.restaurantName),
      till,
    };
  }

  async tillAt(ip: string): Promise<string | null> {
    // No DNS name is not remembered (the cache drops a failed load): a slow answer once must
    // not leave a till unrecognised for minutes. ponytail: a nameless address pays the lookup
    // (up to its 1 s timeout) on every call; remember misses briefly if that shows up.
    return await this.tillByAddress
      .get(ip, async () => {
        const { hostname } = await deviceHost(ip);
        if (!hostname) throw new Error('No DNS name');
        return await this.tillHost(hostname);
      })
      .catch(() => null);
  }

  /** The registered till a computer is, from the name DNS gives it (tills hold its short name). */
  async tillHost(dnsName: string | null): Promise<string | null> {
    const host = dnsName?.split('.')[0];
    if (!host) return null;

    return await this.tillDevice(host).then(
      () => host,
      (error: unknown) => {
        if (error instanceof NotFoundException) return null;
        throw error;
      },
    );
  }

  private async tillDevice(host: string) {
    const hostName = host.trim();
    const device = await hospitalScopeStorage.run(
      { allowedHospitalIds: null },
      async () =>
        await this.prisma.posDevice.findFirst({
          select: {
            id: true,
            restaurants: {
              select: {
                restaurant: { select: { hospitalId: true, restaurantName: true } },
                restaurantId: true,
              },
              where: { deletedAt: null, isActive: true },
            },
          },
          where: {
            deletedAt: null,
            hostName: { equals: hostName, mode: 'insensitive' },
            isActive: true,
          },
        }),
    );

    if (!device) {
      throw new NotFoundException(
        `This computer (${hostName}) is not registered as a POS. Ask an admin to add its hostname to a POS device under POS & Payment Machines.`,
      );
    }

    return device;
  }

  async findCounter(id: string, client: Client = this.prisma) {
    const counter = await client.counter.findFirst({
      select: counterSelect,
      where: {
        deletedAt: null,
        hospital: { deletedAt: null, isActive: true },
        id,
        isActive: true,
        restaurant: { deletedAt: null, isActive: true },
      },
    });

    if (!counter) {
      throw new NotFoundException('Counter not found, or it is switched off.');
    }

    return counter;
  }

  /**
   * The counter restaurant's menu for a channel: price for that channel, GST, food type,
   * category, whether it is on sale now, and the counter's stock (null when the counter does not
   * keep stock of it, e.g. tea made to order).
   */
  async menu(query: PosMenuQueryDto) {
    const counter = await this.findCounter(query.counterId);
    const now = new Date();
    const menus = await this.prisma.restaurantMenu.findMany({
      include: {
        category: { select: { categoryName: true, id: true, sortOrder: true } },
        item: { select: { itemCode: true, itemName: true, type: true } },
      },
      // Categories in their set order (Item Categories), then each item's place in the menu.
      orderBy: [
        { category: { sortOrder: 'asc' } },
        { displayOrder: 'asc' },
        { item: { itemName: 'asc' } },
      ],
      where: {
        deletedAt: null,
        isActive: true,
        ...sellableMenu,
        restaurantId: counter.restaurantId,
        serveAt: { in: servedOn(query.channel) },
      },
    });
    const stock = await this.counterStock(
      counter.id,
      menus.map((menu) => menu.itemId),
      this.prisma,
    );

    return {
      counter,
      items: menus.map((menu) => ({
        availableFrom: menu.availableFrom,
        availableTo: menu.availableTo,
        category: menu.category,
        daysOfWeek: menu.daysOfWeek,
        foodType: menu.item.type,
        gstPercent: counter.hospital.gstApplicable ? toNumber(menu.gstPercent) : 0,
        id: menu.id,
        isAvailable: menu.isAvailable,
        isDiscountable: menu.isDiscountable,
        isGstInclusive: menu.isGstInclusive,
        isOnSale: isOnSale(menu, now),
        itemCode: menu.item.itemCode,
        itemId: menu.itemId,
        itemName: menu.item.itemName,
        menuItemCode: menu.menuItemCode,
        preparationTimeMinutes: menu.preparationTimeMinutes,
        price: channelPrice(menu, query.channel),
        stock: stock.get(menu.itemId) ?? null,
      })),
    };
  }

  /** Sellable (unexpired) stock per item at a counter; items it keeps no stock of are absent. */
  private async counterStock(counterId: string, itemIds: string[], client: Client) {
    const today = toDateOnly(siteBusinessDate(new Date()));
    const rows = await client.stockBalance.findMany({
      select: { availableQty: true, expiryDate: true, itemId: true },
      where: {
        deletedAt: null,
        itemId: { in: itemIds },
        locationId: counterId,
        locationType: InventoryLocationType.COUNTER,
      },
    });
    const stock = new Map<string, number>();

    for (const row of rows) {
      const sellable = !row.expiryDate || row.expiryDate >= today;
      stock.set(
        row.itemId,
        (stock.get(row.itemId) ?? 0) + (sellable ? toNumber(row.availableQty) : 0),
      );
    }

    return stock;
  }

  async setAvailability(menuId: string, isAvailable: boolean, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const menu = await tx.restaurantMenu.findFirst({
        select: { hospitalId: true, id: true, isAvailable: true },
        where: { deletedAt: null, id: menuId },
      });

      if (!menu) {
        throw new NotFoundException('Menu item not found.');
      }

      const updated = await tx.restaurantMenu.update({
        data: { isAvailable, updatedBy: context.actorId },
        select: { id: true, isAvailable: true },
        where: { id: menuId },
      });

      await this.auditLog.record(
        {
          action: 'UPDATE',
          actorId: context.actorId,
          entityId: menuId,
          entityName: 'restaurant_menus',
          hospitalId: menu.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { isAvailable },
          oldValue: { isAvailable: menu.isAvailable },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Bills an order at a counter. Prices come from the menu, never the till; the counter's stock
   * is taken earliest expiry first; the bill number is the counter's next, so two tills never
   * share one. Sending the same clientOrderId again returns the bill already made.
   */
  async createOrder(dto: CreatePosOrderDto, context: ActorContext) {
    // Operator access, as the previous system's operator master set it per person.
    if (dto.channel === OrderChannel.ROOM && !context.permissions?.includes('POS_ROOM_ORDER')) {
      throw new ForbiddenException('You do not have access to bill room orders.');
    }

    if (dto.isComplimentary && !context.permissions?.includes('POS_COMPLIMENTARY_APPROVE')) {
      throw new ForbiddenException('You cannot approve a complimentary meal.');
    }

    const counter = await this.findCounter(dto.counterId);
    const clientOrderId = dto.clientOrderId.trim();
    const existing = await this.findByClientId(counter.id, clientOrderId);

    if (existing) {
      return this.detail(existing.id);
    }

    try {
      const id = await this.prisma.$transaction((tx) =>
        this.billOrder(tx, counter, clientOrderId, dto, context),
      );

      return await this.detail(id);
    } catch (error) {
      // A double tap that raced past the check above: the first one's bill is the answer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.findByClientId(counter.id, clientOrderId);

        if (raced) {
          return this.detail(raced.id);
        }
      }

      throw error;
    }
  }

  private findByClientId(counterId: string, clientOrderId: string) {
    return this.prisma.restaurantOrder.findUnique({
      select: { id: true },
      where: { senderId_externalOrderId: { externalOrderId: clientOrderId, senderId: counterId } },
    });
  }

  /**
   * Prices a bill from the counter's menu: the channel's price, GST, the employee's discount on
   * discountable items, refusing what is not sold here or not on sale now. Billing and online
   * payments both use it, so a UPI payment is asked for exactly what the bill will come to.
   */
  private async quote(
    client: Client,
    counter: Awaited<ReturnType<PosService['findCounter']>>,
    dto: Pick<CreatePosOrderDto, 'channel' | 'employeeCode' | 'isComplimentary' | 'lines'>,
    now: Date,
  ) {
    const menuIds = [...new Set(dto.lines.map((line) => line.menuId))];
    const menus = await client.restaurantMenu.findMany({
      include: { item: { select: { hsnCode: true, itemName: true } } },
      where: {
        deletedAt: null,
        id: { in: menuIds },
        isActive: true,
        ...sellableMenu,
        restaurantId: counter.restaurantId,
      },
    });
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const served = servedOn(dto.channel);
    const isComplimentary = dto.isComplimentary === true;
    const employeeCode = optionalText(dto.employeeCode);
    // Checked on every bill; a complimentary meal is free anyway, so it takes no discount.
    const staff = employeeCode
      ? await this.employeeDiscount(counter, employeeCode, client, now)
      : undefined;
    const staffDiscount = staff && !isComplimentary ? staff.discountPercent : 0;

    const priced = dto.lines.map((line) => {
      const menu = menuById.get(line.menuId);

      if (!menu) {
        throw new BadRequestException('An item on this bill is not on this counter’s menu.');
      }

      const unitPrice = channelPrice(menu, dto.channel);

      if (!served.includes(menu.serveAt) || unitPrice === null) {
        throw new BadRequestException(
          `${menu.item.itemName} is not sold for ${dto.channel === OrderChannel.ROOM ? 'rooms' : 'the counter'}.`,
        );
      }

      if (!isOnSale(menu, now)) {
        throw new BadRequestException(`${menu.item.itemName} is not available right now.`);
      }

      return {
        discountPercent: menu.isDiscountable ? staffDiscount : 0,
        gstPercent: counter.hospital.gstApplicable ? toNumber(menu.gstPercent) : 0,
        isGstInclusive: menu.isGstInclusive,
        line,
        menu,
        quantity: line.quantity,
        unitPrice,
      };
    });
    const totals = priceBill(priced);

    return { employeeCode, isComplimentary, priced, staffDiscount, totals };
  }

  /** What a bill comes to now, for an online payment taken before it is made. */
  async quoteBill(
    counter: Awaited<ReturnType<PosService['findCounter']>>,
    dto: Pick<CreatePosOrderDto, 'channel' | 'employeeCode' | 'lines'>,
  ) {
    return (await this.quote(this.prisma, counter, dto, new Date())).totals;
  }

  /** The paid online payment a bill is made with: this counter's, unused, for its total. */
  private async paidOnline(
    tx: Prisma.TransactionClient,
    counterId: string,
    id: string,
    grandTotal: number,
  ) {
    const payment = await tx.onlinePayment.findFirst({ where: { counterId, id } });

    if (!payment) {
      throw new NotFoundException('This payment was not found at this counter.');
    }

    if (payment.status !== 'PAID') {
      throw new BadRequestException('This payment has not been received yet.');
    }

    if (payment.orderId) {
      throw new ConflictException('This payment is already on another bill.');
    }

    if (Math.abs(toNumber(payment.amount) - grandTotal) > 0.005) {
      throw new ConflictException(
        `₹${toNumber(payment.amount).toFixed(2)} was paid, but the bill now comes to ₹${grandTotal.toFixed(2)}. Put the bill back as it was, or take the difference another way.`,
      );
    }

    return payment;
  }

  private async billOrder(
    tx: Prisma.TransactionClient,
    counter: Awaited<ReturnType<PosService['findCounter']>>,
    clientOrderId: string,
    dto: CreatePosOrderDto,
    context: ActorContext,
  ): Promise<string> {
    const now = new Date();
    const today = toDateOnly(siteBusinessDate(now));
    const [openShift, dayClosed] = await Promise.all([
      tx.counterShift.findFirst({
        select: { id: true },
        where: { counterId: counter.id, status: CounterShiftStatus.OPEN },
      }),
      tx.counterDayClose.findFirst({
        select: { id: true },
        where: { businessDate: today, counterId: counter.id },
      }),
    ]);

    if (!openShift) {
      throw new BadRequestException('Open a shift at this counter before billing.');
    }

    // Ending a shift takes this lock to count it, so a bill cannot slip in as it closes.
    await lockRow(tx, 'counter_shifts', openShift.id);
    const shift = await tx.counterShift.findUniqueOrThrow({
      select: { id: true, status: true },
      where: { id: openShift.id },
    });

    if (shift.status !== CounterShiftStatus.OPEN) {
      throw new ConflictException('This shift has just ended. Open a new one and bill again.');
    }

    // Once the counter's day is closed, later bills belong to the next business day.
    const businessDate = dayClosed ? new Date(today.getTime() + 86_400_000) : today;
    const { employeeCode, isComplimentary, priced, staffDiscount, totals } = await this.quote(
      tx,
      counter,
      dto,
      now,
    );
    const online = dto.onlinePaymentId
      ? await this.paidOnline(tx, counter.id, dto.onlinePaymentId, totals.grandTotal)
      : null;

    // Taking the location's next invoice number locks its row until the bill commits, so bills
    // at the location queue here: no two share a number, and the count below is exact.
    const { billSequence } = await tx.hospital.update({
      data: { billSequence: { increment: 1 } },
      select: { billSequence: true },
      where: { id: counter.hospitalId },
    });
    const ordersToday = await tx.restaurantOrder.count({
      where: { businessDate, counterId: counter.id, source: OrderSource.COUNTER },
    });
    const prefix = counter.hospital.billPrefix?.trim() || counter.hospital.hospitalCode;

    const order = await tx.restaurantOrder.create({
      data: {
        bedNumber: optionalText(dto.bedNumber),
        billNumber: `${prefix}/${String(billSequence).padStart(8, '0')}`,
        businessDate,
        channel: dto.channel,
        complimentaryReason: isComplimentary ? optionalText(dto.complimentaryReason) : null,
        counterId: counter.id,
        createdBy: context.actorId,
        customerMobile: optionalText(dto.customerMobile),
        discountPercent: totals.discountTotal ? staffDiscount : null,
        discountTotal: totals.discountTotal,
        employeeCode,
        externalOrderId: clientOrderId,
        grandTotal: totals.grandTotal,
        gstTotal: totals.gstTotal,
        hospitalId: counter.hospitalId,
        instructions: optionalText(dto.instructions),
        isComplimentary,
        // The kitchen screen and the pickup board read this list.
        items: priced.map(({ line, menu }) => ({
          name: menu.item.itemName,
          quantity: line.quantity,
          ...(optionalText(line.note) ? { note: optionalText(line.note) } : {}),
        })),
        lines: {
          create: priced.map(({ gstPercent, isGstInclusive, line, menu, unitPrice }, index) => ({
            discountAmount: totals.lines[index]!.discountAmount,
            gstAmount: totals.lines[index]!.gstAmount,
            gstPercent,
            hsnCode: menu.item.hsnCode?.trim() || RESTAURANT_SERVICE_SAC,
            isGstInclusive,
            itemId: menu.itemId,
            itemName: menu.item.itemName,
            lineTotal: totals.lines[index]!.lineTotal,
            menuItemCode: menu.menuItemCode,
            note: optionalText(line.note),
            quantity: line.quantity,
            restaurantMenuId: menu.id,
            taxableAmount: totals.lines[index]!.taxableAmount,
            unitPrice,
          })),
        },
        orderNumber: String(ordersToday + 1).padStart(4, '0'),
        // Online payments are UPI, except a card taken on the counter's Pine Labs machine.
        paymentMode: online
          ? online.provider === 'PINELABS'
            ? PaymentMode.CARD
            : PaymentMode.UPI
          : isComplimentary
            ? null
            : dto.paymentMode,
        paymentReference: online
          ? online.paidReference
          : isComplimentary
            ? null
            : optionalText(dto.paymentReference),
        restaurantId: counter.restaurantId,
        roomNumber: optionalText(dto.roomNumber),
        roundOff: totals.roundOff,
        senderId: counter.id,
        shiftId: shift.id,
        source: OrderSource.COUNTER,
        status: OrderStatus.PLACED,
        subtotal: totals.subtotal,
      },
      select: { billNumber: true, id: true },
    });

    const quantityByItem = new Map<string, { name: string; quantity: number }>();

    for (const { menu, quantity } of priced) {
      const entry = quantityByItem.get(menu.itemId);
      quantityByItem.set(menu.itemId, {
        name: menu.item.itemName,
        quantity: (entry?.quantity ?? 0) + quantity,
      });
    }

    for (const [itemId, entry] of quantityByItem) {
      await this.takeCounterStock(tx, counter, itemId, entry, order.id, businessDate, now, context);
    }

    // The payment goes on this bill only, and only once: a second bill with it rolls back here.
    if (online) {
      const { count } = await tx.onlinePayment.updateMany({
        data: { orderId: order.id },
        where: { id: online.id, orderId: null },
      });

      if (count === 0) {
        throw new ConflictException('This payment is already on another bill.');
      }
    }

    if (dto.kioskOrderId) {
      const { count } = await tx.kioskOrder.updateMany({
        data: { billedOrderId: order.id },
        where: { billedOrderId: null, id: dto.kioskOrderId, restaurantId: counter.restaurantId },
      });

      if (count === 0) {
        throw new ConflictException(
          'This kiosk order is already billed. Clear it and start again.',
        );
      }
    }

    await this.auditLog.record(
      {
        action: 'CREATE',
        actorId: context.actorId,
        entityId: order.id,
        entityName: 'restaurant_orders',
        hospitalId: counter.hospitalId,
        ipAddress: context.ipAddress,
        newValue: { billNumber: order.billNumber, grandTotal: totals.grandTotal, isComplimentary },
      },
      tx,
    );

    return order.id;
  }

  /**
   * Takes `quantity` of an item from the counter's stock, earliest expiry first, skipping expired
   * batches. A counter that keeps no stock of the item (no balance rows at all) sells it freely.
   */
  private async takeCounterStock(
    tx: Prisma.TransactionClient,
    counter: { hospitalId: string; id: string },
    itemId: string,
    entry: { name: string; quantity: number },
    orderId: string,
    businessDate: Date,
    now: Date,
    context: ActorContext,
  ) {
    const balances = await tx.stockBalance.findMany({
      orderBy: [
        { expiryDate: { nulls: 'last', sort: 'asc' } },
        { businessDate: { nulls: 'last', sort: 'asc' } },
        { createdAt: 'asc' },
      ],
      where: {
        deletedAt: null,
        itemId,
        locationId: counter.id,
        locationType: InventoryLocationType.COUNTER,
      },
    });

    if (balances.length === 0) {
      return;
    }

    const sellable = balances.filter(
      (balance) =>
        (!balance.expiryDate || balance.expiryDate >= businessDate) &&
        toNumber(balance.availableQty) > 0,
    );
    const onHand = sellable.reduce((sum, balance) => sum + toNumber(balance.availableQty), 0);

    if (onHand < entry.quantity) {
      throw new BadRequestException(
        `Only ${onHand} of ${entry.name} left at this counter; receive more stock or take it off the bill.`,
      );
    }

    let remaining = entry.quantity;

    for (const balance of sellable) {
      if (remaining <= 0) {
        break;
      }

      const take = Math.min(remaining, toNumber(balance.availableQty));
      const result = await tx.stockBalance.updateMany({
        data: {
          availableQty: { decrement: take },
          lastUpdatedOn: now,
          updatedBy: context.actorId,
        },
        where: { availableQty: { gte: take }, deletedAt: null, id: balance.id },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          `${entry.name} was just sold at another till. Check the stock and bill again.`,
        );
      }

      await tx.stockLedger.create({
        data: {
          balanceAfter: toNumber(balance.availableQty) - take,
          batchNumber: balance.batchNumber,
          businessDate,
          createdBy: context.actorId,
          expiryDate: balance.expiryDate,
          hospitalId: counter.hospitalId,
          itemId,
          itemType: balance.itemType,
          locationId: counter.id,
          locationType: InventoryLocationType.COUNTER,
          qtyIn: 0,
          qtyOut: take,
          referenceId: orderId,
          referenceType: StockReferenceType.ORDER,
          transactionDateTime: now,
          transactionType: StockTransactionType.SALE_OUT,
          updatedBy: context.actorId,
        },
      });
      remaining -= take;
    }
  }

  /**
   * Who an Employee ID belongs to and the staff discount they get at this counter: their
   * employee type's rate at its restaurant, when the restaurant gives staff discount and the
   * employee is eligible (0 otherwise). An ID that matches no active employee is refused.
   *
   * Staff get their discount at every Max location, not only their own, so the lookup reads past
   * the cashier's location limit; it returns only the name, type and eligibility.
   */
  async employeeDiscount(
    counter: { restaurantId: string },
    employeeCode: string,
    client: Client = this.prisma,
    now: Date = new Date(),
  ) {
    const employee = await hospitalScopeStorage.run(
      { allowedHospitalIds: null },
      async () =>
        await client.employee.findFirst({
          select: {
            eligibleForDiscount: true,
            employeeCode: true,
            employeeName: true,
            employmentType: true,
          },
          where: {
            deletedAt: null,
            employeeCode: { equals: employeeCode, mode: 'insensitive' },
            isActive: true,
          },
        }),
    );

    if (!employee) {
      throw new BadRequestException(`No active employee with ID ${employeeCode}.`);
    }

    const restaurant = await client.restaurant.findUniqueOrThrow({
      select: { staffDiscountApplicable: true },
      where: { id: counter.restaurantId },
    });
    // The restaurant's live Employee Discount rules; the best one on now applies (India time).
    const rules =
      restaurant.staffDiscountApplicable && employee.eligibleForDiscount
        ? await client.employeeDiscount.findMany({
            select: {
              daysOfWeek: true,
              discountPercent: true,
              employmentType: true,
              endTime: true,
              id: true,
              name: true,
              startTime: true,
            },
            where: { archivedAt: null, restaurantId: counter.restaurantId },
          })
        : [];
    const rule = bestDiscountRule(
      rules.map((entry) => ({ ...entry, discountPercent: toNumber(entry.discountPercent) })),
      employee.employmentType,
      now,
    );

    return {
      ...employee,
      discountName: rule?.name ?? null,
      discountPercent: rule?.discountPercent ?? 0,
    };
  }

  async lookupEmployee(query: EmployeeLookupQueryDto) {
    return this.employeeDiscount(await this.findCounter(query.counterId), query.code.trim());
  }

  /** A restaurant's staff discount: whether it gives one, and the rate for each employee type. */
  async staffDiscounts(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: {
        id: true,
        restaurantName: true,
        staffDiscountApplicable: true,
        staffDiscounts: { select: { discountPercent: true, employmentType: true } },
      },
      where: { deletedAt: null, id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found.');
    }

    return {
      rates: Object.values(EmploymentType).map((employmentType) => ({
        discountPercent: toNumber(
          restaurant.staffDiscounts.find((rate) => rate.employmentType === employmentType)
            ?.discountPercent ?? 0,
        ),
        employmentType,
      })),
      restaurantId: restaurant.id,
      restaurantName: restaurant.restaurantName,
      staffDiscountApplicable: restaurant.staffDiscountApplicable,
    };
  }

  async setStaffDiscounts(restaurantId: string, dto: SetStaffDiscountsDto, context: ActorContext) {
    const before = await this.staffDiscounts(restaurantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        data: { staffDiscountApplicable: dto.staffDiscountApplicable, updatedBy: context.actorId },
        where: { id: restaurantId },
      });

      for (const rate of dto.rates) {
        await tx.restaurantStaffDiscount.upsert({
          create: {
            discountPercent: rate.discountPercent,
            employmentType: rate.employmentType,
            restaurantId,
            updatedBy: context.actorId,
          },
          update: { discountPercent: rate.discountPercent, updatedBy: context.actorId },
          where: {
            restaurantId_employmentType: { employmentType: rate.employmentType, restaurantId },
          },
        });
      }

      await this.auditLog.record(
        {
          action: 'UPDATE',
          actorId: context.actorId,
          entityId: restaurantId,
          entityName: 'restaurant_staff_discounts',
          ipAddress: context.ipAddress,
          newValue: dto,
          oldValue: {
            rates: before.rates,
            staffDiscountApplicable: before.staffDiscountApplicable,
          },
        },
        tx,
      );
    });

    return this.staffDiscounts(restaurantId);
  }

  async detail(id: string) {
    const order = await this.prisma.restaurantOrder.findFirst({
      include: orderDetailInclude,
      where: { id, source: OrderSource.COUNTER },
    });

    if (!order) {
      throw new NotFoundException('Bill not found.');
    }

    const cashier = order.createdBy
      ? await this.prisma.user.findUnique({
          select: { employeeCode: true, name: true },
          where: { id: order.createdBy },
        })
      : null;

    return toOrderResponse(order, cashier);
  }

  async list(query: ListPosOrdersQueryDto) {
    const { limit, page } = getPagination(query);
    const search = query.search?.trim();
    const where: Prisma.RestaurantOrderWhereInput = {
      source: OrderSource.COUNTER,
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.counterId ? { counterId: query.counterId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.paymentMode ? { paymentMode: query.paymentMode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isComplimentary !== undefined ? { isComplimentary: query.isComplimentary } : {}),
      ...(query.from || query.to
        ? {
            businessDate: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { billNumber: { contains: search, mode: 'insensitive' } },
              { customerMobile: { contains: search } },
              { employeeCode: { contains: search, mode: 'insensitive' } },
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { roomNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    // The tabs (all, cancelled, complimentary) at once: the other filters (the Complimentary
    // screen keeps its own), whichever status tab is open.
    const untabbed = { ...where, status: undefined };
    const [orders, total, byStatus, complimentaryCount] = await Promise.all([
      this.prisma.restaurantOrder.findMany({
        orderBy: getOrderBy(query, 'placedAt'),
        select: {
          _count: { select: { lines: true } },
          billNumber: true,
          businessDate: true,
          cancelReason: true,
          channel: true,
          complimentaryReason: true,
          counter: { select: { counterCode: true, counterName: true, id: true } },
          customerMobile: true,
          employeeCode: true,
          grandTotal: true,
          discountPercent: true,
          discountTotal: true,
          gstTotal: true,
          id: true,
          instructions: true,
          isComplimentary: true,
          items: true,
          orderNumber: true,
          paymentMode: true,
          paymentReference: true,
          placedAt: true,
          restaurant: { select: { id: true, restaurantName: true } },
          roomNumber: true,
          status: true,
          subtotal: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.restaurantOrder.count({ where }),
      query.statusCounts
        ? this.prisma.restaurantOrder.groupBy({
            _count: { _all: true },
            by: ['status'],
            where: untabbed,
          })
        : undefined,
      query.statusCounts
        ? this.prisma.restaurantOrder.count({ where: { ...untabbed, isComplimentary: true } })
        : undefined,
    ]);

    return {
      items: orders.map(
        ({
          _count,
          discountPercent,
          discountTotal,
          grandTotal,
          gstTotal,
          items,
          subtotal,
          ...order
        }) => ({
          ...order,
          discountPercent: money(discountPercent),
          discountTotal: money(discountTotal) ?? 0,
          grandTotal: money(grandTotal),
          gstTotal: money(gstTotal),
          // [{ name, quantity, note? }], as the kitchen sees them.
          items,
          itemCount: itemCount(items),
          lineCount: _count.lines,
          subtotal: money(subtotal),
        }),
      ),
      meta: {
        ...getPageMeta(page, limit, total),
        ...(byStatus ? { complimentaryCount, statusCounts: toStatusCounts(byStatus) } : {}),
      },
    };
  }

  /**
   * Per item at a counter for a business day: stock received, stock sold (less cancelled bills)
   * and what is sellable now. Every item on the restaurant's menu is listed, zeros included, so
   * the cashier sees at a glance what has not come in.
   */
  async stockSummary(query: PosSummaryQueryDto) {
    const counter = await this.findCounter(query.counterId);
    const date = query.date ?? siteBusinessDate(new Date());
    const [menus, movements] = await Promise.all([
      this.prisma.restaurantMenu.findMany({
        select: { item: { select: { id: true, itemCode: true, itemName: true } } },
        where: { deletedAt: null, isActive: true, restaurantId: counter.restaurantId },
      }),
      this.prisma.stockLedger.groupBy({
        _sum: { qtyIn: true, qtyOut: true },
        by: ['itemId', 'transactionType'],
        where: {
          businessDate: toDateOnly(date),
          deletedAt: null,
          locationId: counter.id,
          locationType: InventoryLocationType.COUNTER,
        },
      }),
    ]);
    const stocked = await this.prisma.stockBalance.findMany({
      distinct: ['itemId'],
      select: { item: { select: { id: true, itemCode: true, itemName: true } } },
      where: {
        deletedAt: null,
        locationId: counter.id,
        locationType: InventoryLocationType.COUNTER,
      },
    });
    const items = new Map([...menus, ...stocked].map(({ item }) => [item.id, item] as const));
    const available = await this.counterStock(counter.id, [...items.keys()], this.prisma);
    const moved = (itemId: string, type: StockTransactionType, field: 'qtyIn' | 'qtyOut') =>
      toNumber(
        movements.find((row) => row.itemId === itemId && row.transactionType === type)?._sum[
          field
        ] ?? 0,
      );

    return {
      counter,
      date,
      items: [...items.values()]
        .map((item) => ({
          available: available.get(item.id) ?? 0,
          consumed:
            moved(item.id, StockTransactionType.SALE_OUT, 'qtyOut') -
            moved(item.id, StockTransactionType.SALE_CANCEL_IN, 'qtyIn'),
          isTracked: available.has(item.id),
          itemCode: item.itemCode,
          itemId: item.id,
          itemName: item.itemName,
          received: moved(item.id, StockTransactionType.COUNTER_RECEIVE_IN, 'qtyIn'),
        }))
        .sort((a, b) => a.itemName.localeCompare(b.itemName)),
    };
  }

  /**
   * A counter's takings for a business day (by payment mode, complimentary and cancelled), its
   * shifts that day, and who closed the day, once closed.
   */
  async summary(query: PosSummaryQueryDto) {
    const counter = await this.findCounter(query.counterId);
    const date = query.date?.slice(0, 10) ?? siteBusinessDate(new Date());
    const [orders, shifts, dayClose] = await Promise.all([
      this.prisma.restaurantOrder.findMany({
        select: { grandTotal: true, isComplimentary: true, paymentMode: true, status: true },
        where: {
          businessDate: toDateOnly(date),
          counterId: counter.id,
          source: OrderSource.COUNTER,
        },
      }),
      shiftsOn(this.prisma, counter.id, date),
      this.prisma.counterDayClose.findFirst({
        select: { closedAt: true, closedBy: true },
        where: { businessDate: toDateOnly(date), counterId: counter.id },
      }),
    ]);
    const names = await userNames(this.prisma, [dayClose?.closedBy ?? null]);

    return {
      ...tally(orders),
      counter,
      date,
      dayClose: dayClose
        ? {
            closedAt: dayClose.closedAt,
            closedByName: dayClose.closedBy ? (names.get(dayClose.closedBy) ?? null) : null,
          }
        : null,
      shifts,
    };
  }

  /**
   * Cancels a bill and puts what it took back into the counter's stock. A bill the kitchen has
   * already handed over can still be cancelled (a refund), but only once.
   */
  async cancel(id: string, dto: CancelPosOrderDto, context: ActorContext) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({
        select: { businessDate: true, counterId: true, hospitalId: true, id: true, status: true },
        where: { id, source: OrderSource.COUNTER },
      });

      if (!order) {
        throw new NotFoundException('Bill not found.');
      }

      // A closed day's takings are final.
      if (
        order.counterId &&
        order.businessDate &&
        (await tx.counterDayClose.findFirst({
          select: { id: true },
          where: { businessDate: order.businessDate, counterId: order.counterId },
        }))
      ) {
        throw new ConflictException(
          'This bill’s day is closed at its counter, so it can no longer be cancelled.',
        );
      }

      await lockRow(tx, 'restaurant_orders', id);
      const current = await tx.restaurantOrder.findUniqueOrThrow({
        select: { status: true },
        where: { id },
      });

      if (current.status === OrderStatus.CANCELLED) {
        throw new ConflictException('This bill is already cancelled.');
      }

      const now = new Date();
      const sold = await tx.stockLedger.findMany({
        where: {
          deletedAt: null,
          referenceId: id,
          referenceType: StockReferenceType.ORDER,
          transactionType: StockTransactionType.SALE_OUT,
        },
      });

      for (const entry of sold) {
        const qty = toNumber(entry.qtyOut);
        // ponytail: the ledger has no balance id, so the batch is found again by batch and
        // expiry; store the balance id on the ledger if two rows ever share both.
        const balance = await tx.stockBalance.findFirst({
          orderBy: { businessDate: { nulls: 'first', sort: 'desc' } },
          where: {
            batchNumber: entry.batchNumber,
            deletedAt: null,
            expiryDate: entry.expiryDate,
            itemId: entry.itemId,
            locationId: entry.locationId,
            locationType: entry.locationType,
          },
        });
        const restored = balance
          ? await tx.stockBalance.update({
              data: {
                availableQty: { increment: qty },
                lastUpdatedOn: now,
                updatedBy: context.actorId,
              },
              where: { id: balance.id },
            })
          : await tx.stockBalance.create({
              data: {
                availableQty: qty,
                batchNumber: entry.batchNumber,
                createdBy: context.actorId,
                expiryDate: entry.expiryDate,
                hospitalId: entry.hospitalId,
                itemId: entry.itemId,
                itemType: entry.itemType,
                locationId: entry.locationId,
                locationType: entry.locationType,
              },
            });

        await tx.stockLedger.create({
          data: {
            balanceAfter: toNumber(restored.availableQty),
            batchNumber: entry.batchNumber,
            businessDate: toDateOnly(siteBusinessDate(now)),
            createdBy: context.actorId,
            expiryDate: entry.expiryDate,
            hospitalId: entry.hospitalId,
            itemId: entry.itemId,
            itemType: entry.itemType,
            locationId: entry.locationId,
            locationType: entry.locationType,
            qtyIn: qty,
            qtyOut: 0,
            referenceId: id,
            referenceType: StockReferenceType.ORDER,
            remarks: dto.reason.trim(),
            transactionDateTime: now,
            transactionType: StockTransactionType.SALE_CANCEL_IN,
            updatedBy: context.actorId,
          },
        });
      }

      await tx.restaurantOrder.update({
        data: {
          cancelReason: dto.reason.trim(),
          cancelledAt: now,
          status: OrderStatus.CANCELLED,
          updatedBy: context.actorId,
        },
        where: { id },
      });
      await this.auditLog.record(
        {
          action: 'CANCEL',
          actorId: context.actorId,
          entityId: id,
          entityName: 'restaurant_orders',
          hospitalId: order.hospitalId,
          ipAddress: context.ipAddress,
          newValue: { reason: dto.reason.trim(), status: OrderStatus.CANCELLED },
          oldValue: { status: current.status },
        },
        tx,
      );
    });

    return this.detail(id);
  }
}
