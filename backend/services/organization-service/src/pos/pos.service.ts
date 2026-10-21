import { hospitalScopeStorage } from '@aahar/auth';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmploymentType,
  InventoryLocationType,
  MenuServeAt,
  OrderChannel,
  OrderSource,
  OrderStatus,
  Prisma,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { lockRow } from '../common/row-lock';
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
import { isOnSale, priceBill, siteBusinessDate } from './pos-pricing';

type Client = Prisma.TransactionClient | PrismaService;

/** SAC for restaurant food service, printed for items with no HSN of their own. */
const RESTAURANT_SERVICE_SAC = '996331';

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

  /** The active counters the user may bill at (reads are already limited to their locations). */
  async counters() {
    return this.prisma.counter.findMany({
      orderBy: [{ restaurant: { restaurantName: 'asc' } }, { counterName: 'asc' }],
      select: counterSelect,
      where: {
        deletedAt: null,
        hospital: { deletedAt: null, isActive: true },
        isActive: true,
        restaurant: { deletedAt: null, isActive: true },
      },
    });
  }

  private async findCounter(id: string, client: Client = this.prisma) {
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
        category: { select: { categoryName: true, id: true } },
        item: { select: { itemCode: true, itemName: true, type: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { item: { itemName: 'asc' } }],
      where: {
        deletedAt: null,
        isActive: true,
        item: { deletedAt: null, isActive: true },
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

  private async billOrder(
    tx: Prisma.TransactionClient,
    counter: Awaited<ReturnType<PosService['findCounter']>>,
    clientOrderId: string,
    dto: CreatePosOrderDto,
    context: ActorContext,
  ): Promise<string> {
    const now = new Date();
    const businessDate = toDateOnly(siteBusinessDate(now));
    const menuIds = [...new Set(dto.lines.map((line) => line.menuId))];
    const menus = await tx.restaurantMenu.findMany({
      include: { item: { select: { hsnCode: true, itemName: true } } },
      where: {
        deletedAt: null,
        id: { in: menuIds },
        isActive: true,
        restaurantId: counter.restaurantId,
      },
    });
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const served = servedOn(dto.channel);
    const isComplimentary = dto.isComplimentary === true;
    const employeeCode = optionalText(dto.employeeCode);
    // A complimentary meal is free anyway; a discount only applies to what is paid for.
    const staffDiscount =
      employeeCode && !isComplimentary
        ? (await this.employeeDiscount(counter, employeeCode, tx)).discountPercent
        : 0;

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
        paymentMode: isComplimentary ? null : dto.paymentMode,
        paymentReference: isComplimentary ? null : optionalText(dto.paymentReference),
        restaurantId: counter.restaurantId,
        roomNumber: optionalText(dto.roomNumber),
        roundOff: totals.roundOff,
        senderId: counter.id,
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
    const rate =
      restaurant.staffDiscountApplicable && employee.eligibleForDiscount && employee.employmentType
        ? await client.restaurantStaffDiscount.findUnique({
            select: { discountPercent: true },
            where: {
              restaurantId_employmentType: {
                employmentType: employee.employmentType,
                restaurantId: counter.restaurantId,
              },
            },
          })
        : null;

    return { ...employee, discountPercent: rate ? toNumber(rate.discountPercent) : 0 };
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
    const [orders, total] = await Promise.all([
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
      meta: getPageMeta(page, limit, total),
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

  /** A counter's takings for a business day: by payment mode, complimentary and cancelled. */
  async summary(query: PosSummaryQueryDto) {
    const counter = await this.findCounter(query.counterId);
    const date = query.date ?? siteBusinessDate(new Date());
    const orders = await this.prisma.restaurantOrder.findMany({
      select: { grandTotal: true, isComplimentary: true, paymentMode: true, status: true },
      where: { businessDate: toDateOnly(date), counterId: counter.id, source: OrderSource.COUNTER },
    });
    const byMode = new Map<string, { amount: number; count: number }>();
    const complimentary = { amount: 0, count: 0 };
    const cancelled = { amount: 0, count: 0 };
    let sales = 0;
    let bills = 0;

    for (const order of orders) {
      const amount = money(order.grandTotal) ?? 0;
      const bucket =
        order.status === OrderStatus.CANCELLED
          ? cancelled
          : order.isComplimentary
            ? complimentary
            : undefined;

      if (bucket) {
        bucket.amount += amount;
        bucket.count += 1;
        continue;
      }

      const mode = order.paymentMode ?? 'OTHER';
      const entry = byMode.get(mode) ?? { amount: 0, count: 0 };
      entry.amount += amount;
      entry.count += 1;
      byMode.set(mode, entry);
      sales += amount;
      bills += 1;
    }

    return {
      bills,
      byPaymentMode: [...byMode].map(([mode, entry]) => ({ mode, ...entry })),
      cancelled,
      complimentary,
      counter,
      date,
      sales,
    };
  }

  /**
   * Cancels a bill and puts what it took back into the counter's stock. A bill the kitchen has
   * already handed over can still be cancelled (a refund), but only once.
   */
  async cancel(id: string, dto: CancelPosOrderDto, context: ActorContext) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({
        select: { hospitalId: true, id: true, status: true },
        where: { id, source: OrderSource.COUNTER },
      });

      if (!order) {
        throw new NotFoundException('Bill not found.');
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
