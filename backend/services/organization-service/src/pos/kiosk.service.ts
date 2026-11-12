import { Injectable, NotFoundException } from '@nestjs/common';
import { MenuServeAt } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { toNumber } from '../common/values';
import { isOnSale, sellableMenu } from './pos-pricing';
import { QrOrdersService } from './qr-orders.service';

/** A kiosk sells what the counter sells, at the counter price. */
const counterServed = [MenuServeAt.BOTH, MenuServeAt.COUNTER];

/**
 * The restaurant's self-service kiosk menu, and whether it takes orders now. The guest pays at
 * the kiosk itself (QrOrdersService.createKioskOrder), by UPI or card. The kiosk opens with the
 * restaurant's board link (its secret), as the TV board does. Prices are always the server's.
 */
@Injectable()
export class KioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestOrders: QrOrdersService,
  ) {}

  private async restaurant(restaurantId: string, token: string | undefined) {
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: {
            hospital: { select: { gstApplicable: true, hospitalName: true } },
            hospitalId: true,
            id: true,
            kioskCounterId: true,
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

  /** What the kiosk can sell right now, at the counter price, and how it can be paid. */
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
      // Open while its kiosk counter has a shift, paid by UPI and/or that counter's card machine.
      ...(await this.guestOrders.kioskPayment(restaurant)),
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
}
