import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuServeAt, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { toDateOnly, toNumber } from '../common/values';
import type { CreateKioskOrderDto } from './dto/kiosk.dto';
import { isOnSale, priceBill, sellableMenu, siteBusinessDate } from './pos-pricing';
import { PosService } from './pos.service';

/** A kiosk sells what the counter sells, at the counter price. */
const counterServed = [MenuServeAt.BOTH, MenuServeAt.COUNTER];

type KioskLine = { menuId: string; quantity: number };

/** How long an unpaid kiosk order stays on the till's Waiting to pay list. */
const WAITING_MS = 2 * 60 * 60 * 1000;

/**
 * The restaurant's self-service kiosk: its menu, a staff member's discount by registered
 * mobile, and orders the guest pays for at a counter. The kiosk opens with the restaurant's
 * board link (its secret), as the TV board does. Prices are always the server's.
 */
@Injectable()
export class KioskService {
  constructor(
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
  ) {}

  private async restaurant(restaurantId: string, token: string | undefined) {
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: {
            // A kiosk order is paid at a counter: with none, there is nowhere to pay.
            counters: { select: { id: true }, take: 1, where: { deletedAt: null, isActive: true } },
            hospital: { select: { gstApplicable: true, hospitalName: true } },
            id: true,
            location: { select: { locationName: true } },
            restaurantName: true,
            staffDiscountApplicable: true,
          },
          where: {
            boardToken: token,
            deletedAt: null,
            hospital: { deletedAt: null, isActive: true },
            id: restaurantId,
            isActive: true,
          },
        })
      : null;

    if (!restaurant) {
      throw new NotFoundException('This kiosk link is no longer valid.');
    }

    return restaurant;
  }

  /** What the kiosk can sell right now, at the counter price. */
  async menu(restaurantId: string, token: string | undefined) {
    const restaurant = await this.restaurant(restaurantId, token);
    const now = new Date();
    const menus = await this.prisma.restaurantMenu.findMany({
      include: {
        category: { select: { categoryName: true, id: true, sortOrder: true } },
        item: { select: { itemName: true, type: true } },
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
        price: { not: null },
        restaurantId: restaurant.id,
        serveAt: { in: counterServed },
      },
    });

    return {
      /** False while the restaurant has no active counter: the kiosk then takes no orders. */
      canPay: restaurant.counters.length > 0,
      locationName: restaurant.location?.locationName ?? restaurant.hospital.hospitalName,
      restaurantName: restaurant.restaurantName,
      staffDiscount: restaurant.staffDiscountApplicable,
      items: menus
        .filter((menu) => isOnSale(menu, now))
        .map((menu) => ({
          category: menu.category,
          foodType: menu.item.type,
          gstPercent: restaurant.hospital.gstApplicable ? toNumber(menu.gstPercent) : 0,
          id: menu.id,
          isDiscountable: menu.isDiscountable,
          isFeatured: menu.isFeatured,
          isGstInclusive: menu.isGstInclusive,
          itemName: menu.item.itemName,
          preparationTimeMinutes: menu.preparationTimeMinutes,
          price: toNumber(menu.price!),
        })),
    };
  }

  /**
   * The active employee with this registered mobile. Exactly one must match; a number shared by
   * two employees gets no discount here (the cashier can still enter the Employee ID).
   */
  private async employeeByMobile(restaurantId: string, mobile: string) {
    const matches = await this.prisma.employee.findMany({
      select: { employeeCode: true },
      take: 2,
      where: { deletedAt: null, isActive: true, mobile: { endsWith: mobile } },
    });

    if (matches.length !== 1) {
      throw new NotFoundException('No staff member is registered with this mobile number.');
    }

    return this.pos.employeeDiscount({ restaurantId }, matches[0]!.employeeCode);
  }

  /** The staff discount for a registered mobile. Says no more than the rate. */
  async staffDiscount(restaurantId: string, token: string | undefined, mobile: string) {
    const restaurant = await this.restaurant(restaurantId, token);
    const employee = await this.employeeByMobile(restaurant.id, mobile);

    return { discountPercent: employee.discountPercent };
  }

  /**
   * Prices the kiosk's lines as the counter will bill them. An order already taken is not
   * checked for sale again, so a resend still gets its number after an item goes off.
   */
  private async priced(
    restaurant: Awaited<ReturnType<KioskService['restaurant']>>,
    lines: readonly KioskLine[],
    discountPercent: number,
    taken = false,
  ) {
    const now = new Date();
    const menus = await this.prisma.restaurantMenu.findMany({
      include: { item: { select: { itemName: true } } },
      where: {
        id: { in: [...new Set(lines.map((line) => line.menuId))] },
        restaurantId: restaurant.id,
        ...(taken
          ? {}
          : { deletedAt: null, isActive: true, ...sellableMenu, serveAt: { in: counterServed } }),
      },
    });
    const byId = new Map(menus.map((menu) => [menu.id, menu]));
    const priced = lines.map((line) => {
      const menu = byId.get(line.menuId);

      if (!menu || menu.price === null) {
        throw new BadRequestException('An item in this order is not on the menu.');
      }

      if (!taken && !isOnSale(menu, now)) {
        throw new BadRequestException(`${menu.item.itemName} is not available right now.`);
      }

      return {
        discountPercent: menu.isDiscountable ? discountPercent : 0,
        gstPercent: restaurant.hospital.gstApplicable ? toNumber(menu.gstPercent) : 0,
        isGstInclusive: menu.isGstInclusive,
        itemName: menu.item.itemName,
        menuId: menu.id,
        quantity: line.quantity,
        unitPrice: toNumber(menu.price),
      };
    });
    const totals = priceBill(priced);

    return {
      discountPercent,
      discountTotal: totals.discountTotal,
      grandTotal: totals.grandTotal,
      gstTotal: totals.gstTotal,
      lines: priced.map((line, index) => ({
        itemName: line.itemName,
        lineTotal: totals.lines[index]!.lineTotal,
        menuId: line.menuId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      roundOff: totals.roundOff,
      subtotal: totals.subtotal,
    };
  }

  /**
   * Places the order: the number the guest reads out at the counter, and the total they will
   * pay. Sending the same clientOrderId again returns the same order.
   */
  async createOrder(restaurantId: string, token: string | undefined, dto: CreateKioskOrderDto) {
    const restaurant = await this.restaurant(restaurantId, token);
    const clientOrderId = dto.clientOrderId.trim();
    const existing = await this.prisma.kioskOrder.findUnique({
      where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
    });

    if (existing) {
      return this.placed(restaurant, existing);
    }

    if (restaurant.counters.length === 0) {
      throw new BadRequestException(
        'This kiosk is not taking orders yet. Please ask a member of staff.',
      );
    }

    const employee =
      dto.mobile && restaurant.staffDiscountApplicable
        ? await this.employeeByMobile(restaurant.id, dto.mobile)
        : null;
    const lines = dto.lines.map(({ menuId, quantity }) => ({ menuId, quantity }));
    // Checks every item is on sale before the order is kept.
    const totals = await this.priced(restaurant, lines, employee?.discountPercent ?? 0);
    const businessDate = toDateOnly(siteBusinessDate(new Date()));

    // The day's next number; two kiosks taking the same one at once retry with the next.
    for (let attempt = 0; ; attempt += 1) {
      const last = await this.prisma.kioskOrder.findFirst({
        orderBy: { number: 'desc' },
        select: { number: true },
        where: { businessDate, restaurantId: restaurant.id },
      });

      try {
        const order = await this.prisma.kioskOrder.create({
          data: {
            businessDate,
            clientOrderId,
            employeeCode: employee?.employeeCode ?? null,
            lines,
            number: (last?.number ?? 0) + 1,
            restaurantId: restaurant.id,
          },
        });

        return { id: order.id, number: order.number, ...totals };
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
          attempt >= 4
        ) {
          throw error;
        }

        // A double tap that raced past the check above: the first one's order is the answer.
        const raced = await this.prisma.kioskOrder.findUnique({
          where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
        });

        if (raced) {
          return this.placed(restaurant, raced);
        }
      }
    }
  }

  private async placed(
    restaurant: Awaited<ReturnType<KioskService['restaurant']>>,
    order: { employeeCode: string | null; id: string; lines: Prisma.JsonValue; number: number },
  ) {
    const discountPercent = order.employeeCode
      ? (await this.pos.employeeDiscount({ restaurantId: restaurant.id }, order.employeeCode))
          .discountPercent
      : 0;

    return {
      id: order.id,
      number: order.number,
      ...(await this.priced(restaurant, order.lines as KioskLine[], discountPercent, true)),
    };
  }

  /**
   * For the cashier: today's kiosk order with this number at the counter's restaurant, to load
   * into the till. One already billed says which bill it became.
   */
  async forCounter(counterId: string, number: number) {
    const counter = await this.pos.findCounter(counterId);
    const order = await this.prisma.kioskOrder.findUnique({
      where: {
        restaurantId_businessDate_number: {
          businessDate: toDateOnly(siteBusinessDate(new Date())),
          number,
          restaurantId: counter.restaurantId,
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `No kiosk order ${number} today at ${counter.restaurant.restaurantName}.`,
      );
    }

    if (order.billedOrderId) {
      const bill = await this.prisma.restaurantOrder.findUnique({
        select: { billNumber: true },
        where: { id: order.billedOrderId },
      });

      throw new ConflictException(
        `Kiosk order ${number} is already billed${bill?.billNumber ? ` (${bill.billNumber})` : ''}.`,
      );
    }

    return {
      employeeCode: order.employeeCode,
      id: order.id,
      lines: order.lines as KioskLine[],
      number: order.number,
    };
  }

  /**
   * For the cashier: kiosk orders at the counter's restaurant still waiting to be paid, oldest
   * first, with what is in each. Two queries however many are waiting.
   */
  async waiting(counterId: string) {
    const counter = await this.pos.findCounter(counterId);
    const orders = await this.prisma.kioskOrder.findMany({
      orderBy: { number: 'asc' },
      select: { createdAt: true, employeeCode: true, id: true, lines: true, number: true },
      // ponytail: an order nobody came to pay for drops off after WAITING_MS; add a cancel
      // button if cashiers need to clear them sooner.
      take: 50,
      where: {
        billedOrderId: null,
        businessDate: toDateOnly(siteBusinessDate(new Date())),
        createdAt: { gte: new Date(Date.now() - WAITING_MS) },
        restaurantId: counter.restaurantId,
      },
    });
    const menuIds = [
      ...new Set(orders.flatMap((order) => (order.lines as KioskLine[]).map((l) => l.menuId))),
    ];
    const menus = menuIds.length
      ? await this.prisma.restaurantMenu.findMany({
          select: { id: true, item: { select: { itemName: true } } },
          where: { id: { in: menuIds } },
        })
      : [];
    const names = new Map(menus.map((menu) => [menu.id, menu.item.itemName]));

    return orders.map((order) => ({
      createdAt: order.createdAt,
      id: order.id,
      isStaff: Boolean(order.employeeCode),
      items: (order.lines as KioskLine[]).map((line) => ({
        name: names.get(line.menuId) ?? 'Item no longer on the menu',
        quantity: line.quantity,
      })),
      number: order.number,
    }));
  }
}
