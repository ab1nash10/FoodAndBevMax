import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderSource, OrderStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import type { PushOrderDto } from './dto/push-order.dto';

/** Orders older than this drop off the kitchen screen and the board: yesterday's leftovers. */
const ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const ACTIVE_STATUSES = [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY];

/** Where an order may go next from each status. READY -> PREPARING undoes a mistaken tap. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  CANCELLED: [],
  COLLECTED: [],
  PLACED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COLLECTED, OrderStatus.PREPARING],
};

const orderSelect = {
  id: true,
  items: true,
  orderNumber: true,
  placedAt: true,
  readyAt: true,
  source: true,
  status: true,
} satisfies Prisma.RestaurantOrderSelect;

export function hashOrderKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function activeSince(): Date {
  return new Date(Date.now() - ACTIVE_WINDOW_MS);
}

@Injectable()
export class RestaurantOrdersService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Any channel sends an order. A POS device's key sends for the restaurants mapped to that
   * device (always source POS); a restaurant's order key sends for that restaurant only, from a
   * kiosk, QR ordering or any other app.
   */
  async pushOrder(orderKey: string | undefined, dto: PushOrderDto) {
    if (!orderKey) {
      throw new UnauthorizedException('Send the order key in the x-order-key header.');
    }

    const sender = await this.resolveSender(hashOrderKey(orderKey), dto.restaurantCode?.trim());
    const externalOrderId = dto.orderId.trim();
    const items = (dto.items ?? []).map(({ name, note, quantity }) => ({
      name: name.trim(),
      quantity,
      ...(note?.trim() ? { note: note.trim() } : {}),
    }));

    // A resend never moves the kitchen's progress back; only a cancel changes the status.
    return this.prisma.restaurantOrder.upsert({
      create: {
        externalOrderId,
        hospitalId: sender.restaurant.hospitalId,
        items,
        orderNumber: dto.orderNumber.trim(),
        posDeviceId: sender.posDeviceId,
        restaurantId: sender.restaurant.id,
        senderId: sender.id,
        source: sender.posDeviceId ? OrderSource.POS : (dto.source ?? OrderSource.OTHER),
        status: dto.status ?? OrderStatus.PLACED,
      },
      select: orderSelect,
      update: {
        orderNumber: dto.orderNumber.trim(),
        ...(dto.items ? { items } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      where: { senderId_externalOrderId: { externalOrderId, senderId: sender.id } },
    });
  }

  private async resolveSender(keyHash: string, restaurantCode: string | undefined) {
    const device = await this.prisma.posDevice.findFirst({
      select: {
        id: true,
        restaurants: {
          select: { restaurant: { select: { hospitalId: true, id: true } } },
          take: 1,
          where: {
            deletedAt: null,
            isActive: true,
            restaurant: { deletedAt: null, restaurantCode },
          },
        },
      },
      where: { apiKeyHash: keyHash, deletedAt: null, isActive: true },
    });

    if (device) {
      if (!restaurantCode) {
        throw new BadRequestException('restaurantCode is required with a POS key.');
      }

      const restaurant = device.restaurants[0]?.restaurant;

      if (!restaurant) {
        throw new ForbiddenException(
          `This POS is not mapped to restaurant ${restaurantCode}. Map it under POS & Payment Machines.`,
        );
      }

      return { id: device.id, posDeviceId: device.id, restaurant };
    }

    const restaurant = await this.prisma.restaurant.findFirst({
      select: { hospitalId: true, id: true, restaurantCode: true },
      where: { deletedAt: null, orderKeyHash: keyHash },
    });

    if (!restaurant) {
      throw new UnauthorizedException('This order key is not valid, or its POS is disabled.');
    }

    if (restaurantCode && restaurantCode !== restaurant.restaurantCode) {
      throw new ForbiddenException(`This key is for restaurant ${restaurant.restaurantCode} only.`);
    }

    return { id: restaurant.id, posDeviceId: null, restaurant };
  }

  /** The kitchen screen: today's open orders, oldest first. */
  async listActive(restaurantId: string) {
    return this.prisma.restaurantOrder.findMany({
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      select: orderSelect,
      take: 300,
      where: { placedAt: { gte: activeSince() }, restaurantId, status: { in: ACTIVE_STATUSES } },
    });
  }

  async setStatus(id: string, status: OrderStatus, context: ActorContext) {
    const order = await this.prisma.restaurantOrder.findFirst({
      select: { status: true },
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!NEXT_STATUSES[order.status].includes(status)) {
      throw new ConflictException(`An order that is ${order.status} cannot be marked ${status}.`);
    }

    // Only from the status just read: two screens tapping at once cannot skip a step.
    const { count } = await this.prisma.restaurantOrder.updateMany({
      data: {
        readyAt: status === OrderStatus.READY ? new Date() : undefined,
        status,
        updatedBy: context.actorId,
      },
      where: { id, status: order.status },
    });

    if (count === 0) {
      throw new ConflictException('Someone else just updated this order. Refresh and try again.');
    }

    return this.prisma.restaurantOrder.findFirstOrThrow({ select: orderSelect, where: { id } });
  }

  /** The TV board: order numbers only, found by the restaurant's board secret. */
  async board(token: string) {
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: { id: true, restaurantName: true },
          where: { boardToken: token, deletedAt: null },
        })
      : null;

    if (!restaurant) {
      throw new NotFoundException('This board link is no longer valid.');
    }

    const orders = await this.prisma.restaurantOrder.findMany({
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      select: { orderNumber: true, readyAt: true, status: true },
      take: 300,
      where: {
        placedAt: { gte: activeSince() },
        restaurantId: restaurant.id,
        status: { in: ACTIVE_STATUSES },
      },
    });
    const ready = orders
      .filter((order) => order.status === OrderStatus.READY)
      .sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0));

    return {
      preparing: orders
        .filter((order) => order.status !== OrderStatus.READY)
        .map((order) => order.orderNumber),
      ready: ready.map((order) => order.orderNumber),
      restaurantName: restaurant.restaurantName,
    };
  }

  /** The restaurant's board secret, made on first use; regenerate turns the old link off. */
  async boardLink(restaurantId: string, regenerate: boolean, context: ActorContext) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { boardToken: true, id: true },
      where: { deletedAt: null, id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (restaurant.boardToken && !regenerate) {
      return { boardToken: restaurant.boardToken };
    }

    const boardToken = randomBytes(24).toString('base64url');

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        data: { boardToken, updatedBy: context.actorId },
        where: { id: restaurant.id },
      });
      await this.auditLog.record(
        {
          action: restaurant.boardToken
            ? 'RESTAURANT_BOARD_LINK_RESET'
            : 'RESTAURANT_BOARD_LINK_CREATE',
          actorId: context.actorId,
          entityId: restaurant.id,
          entityName: 'restaurants',
          ipAddress: context.ipAddress,
        },
        tx,
      );
    });

    return { boardToken };
  }

  /**
   * A new key for the restaurant's kiosks, QR ordering and other apps to send orders with.
   * Shown once; the old key stops working.
   */
  async issueRestaurantKey(restaurantId: string, context: ActorContext) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const apiKey = `rsk_${randomBytes(24).toString('base64url')}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.restaurant.update({
        data: { orderKeyHash: hashOrderKey(apiKey), updatedBy: context.actorId },
        where: { id: restaurant.id },
      });
      await this.auditLog.record(
        {
          action: 'RESTAURANT_ORDER_KEY_ISSUE',
          actorId: context.actorId,
          entityId: restaurant.id,
          entityName: 'restaurants',
          ipAddress: context.ipAddress,
        },
        tx,
      );
    });

    return { apiKey };
  }

  /** A new key for the POS to send orders with. Shown once; the old key stops working. */
  async issuePosKey(posDeviceId: string, context: ActorContext) {
    const device = await this.prisma.posDevice.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: posDeviceId },
    });

    if (!device) {
      throw new NotFoundException('POS device not found');
    }

    const apiKey = `posk_${randomBytes(24).toString('base64url')}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.posDevice.update({
        data: { apiKeyHash: hashOrderKey(apiKey), updatedBy: context.actorId },
        where: { id: device.id },
      });
      await this.auditLog.record(
        {
          action: 'POS_DEVICE_API_KEY_ISSUE',
          actorId: context.actorId,
          entityId: device.id,
          entityName: 'pos_devices',
          ipAddress: context.ipAddress,
        },
        tx,
      );
    });

    return { apiKey };
  }
}
