import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderSource, OrderStatus, Prisma, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { boardSchedule } from './board-schedule';
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
  bedNumber: true,
  billNumber: true,
  channel: true,
  id: true,
  instructions: true,
  items: true,
  orderNumber: true,
  placedAt: true,
  readyAt: true,
  roomNumber: true,
  source: true,
  status: true,
} satisfies Prisma.RestaurantOrderSelect;

/** The kitchen screen's: also who is taking it to the guest. Not for senders or the board. */
const kitchenSelect = { ...orderSelect, stewardId: true } satisfies Prisma.RestaurantOrderSelect;

// ponytail: stewards are found by this role's name; give them a permission of their own if roles
// start being renamed.
export const STEWARD_ROLE = 'Delivery Operator';

/** Active users with the steward role at a location (their home one or one assigned). */
export const stewardsAt = (hospitalId: string): Prisma.UserWhereInput => ({
  deletedAt: null,
  OR: [{ hospitalId }, { assignedHospitals: { some: { deletedAt: null, hospitalId } } }],
  roles: { some: { deletedAt: null, role: { deletedAt: null, name: STEWARD_ROLE } } },
  status: UserStatus.ACTIVE,
});

export function hashOrderKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ponytail: one estimate for every order the sender gave none for; derive it from the menu's
// preparationTimeMinutes if senders start sending item ids.
const DEFAULT_PREP_MINUTES = 10;

/** How many items an order has, from its stored [{ name, quantity }] list. */
export function itemCount(items: Prisma.JsonValue): number {
  return Array.isArray(items)
    ? items.reduce<number>(
        (sum, item) =>
          sum +
          (item && typeof item === 'object' && 'quantity' in item ? Number(item.quantity) || 0 : 0),
        0,
      )
    : 0;
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
    const counterId = dto.counterCode
      ? await this.counterIdFor(sender.restaurant.id, dto.counterCode.trim())
      : undefined;
    const details = {
      ...(counterId ? { counterId } : {}),
      ...(dto.prepMinutes ? { prepMinutes: dto.prepMinutes } : {}),
      ...(dto.serviceType ? { serviceType: dto.serviceType } : {}),
    };
    const items = (dto.items ?? []).map(({ name, note, quantity }) => ({
      name: name.trim(),
      quantity,
      ...(note?.trim() ? { note: note.trim() } : {}),
    }));
    const where = { senderId_externalOrderId: { externalOrderId, senderId: sender.id } };

    // A channel's cancel follows the kitchen screen's rules: a collected order stays collected.
    if (dto.status) {
      const existing = await this.prisma.restaurantOrder.findUnique({
        select: { status: true },
        where,
      });

      if (
        existing &&
        existing.status !== dto.status &&
        !NEXT_STATUSES[existing.status].includes(dto.status)
      ) {
        throw new ConflictException(
          `An order that is ${existing.status} cannot be marked ${dto.status}.`,
        );
      }
    }

    // A resend never moves the kitchen's progress back; only a cancel changes the status.
    const saved = await this.prisma.restaurantOrder.upsert({
      create: {
        ...details,
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
        ...details,
        orderNumber: dto.orderNumber.trim(),
        ...(dto.items ? { items } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      where,
    });

    // Sent by a POS or channel with its order key: no signed-in actor.
    await this.auditLog.record({
      action: dto.status ? 'STATUS_CHANGE' : 'CREATE',
      entityId: saved.id,
      entityName: 'restaurant_orders',
      hospitalId: sender.restaurant.hospitalId,
      newValue: {
        externalOrderId,
        items,
        orderNumber: dto.orderNumber.trim(),
        status: saved.status,
      },
      summary: `Order ${dto.orderNumber.trim()} received (${saved.status})`,
    });

    return saved;
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
    return this.withStewardNames(
      await this.prisma.restaurantOrder.findMany({
        orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
        select: kitchenSelect,
        take: 300,
        where: { placedAt: { gte: activeSince() }, restaurantId, status: { in: ACTIVE_STATUSES } },
      }),
    );
  }

  /** Each order with its steward's name (null when it has none). */
  private async withStewardNames<T extends { stewardId: string | null }>(orders: T[]) {
    const ids = [...new Set(orders.map((order) => order.stewardId).filter(Boolean))] as string[];
    const users = ids.length
      ? await this.prisma.user.findMany({
          select: { id: true, name: true },
          where: { id: { in: ids } },
        })
      : [];
    const names = new Map(users.map((user) => [user.id, user.name]));

    return orders.map((order) => ({
      ...order,
      stewardName: order.stewardId ? (names.get(order.stewardId) ?? null) : null,
    }));
  }

  /** Who may take a restaurant's orders to guests: its location's Delivery Operators. */
  async stewards(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { hospitalId: true },
      where: { id: restaurantId },
    });

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return this.prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { employeeCode: true, id: true, name: true },
      where: stewardsAt(restaurant.hospitalId),
    });
  }

  /** Gives an order to a steward (or, with null, takes it off them) until it is handed over. */
  async setSteward(id: string, stewardId: string | null, context: ActorContext) {
    const order = await this.prisma.restaurantOrder.findFirst({
      select: { hospitalId: true, status: true, stewardId: true },
      where: { id },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.COLLECTED) {
      throw new ConflictException(
        'This order is already handed over, so its steward cannot change.',
      );
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new ConflictException('This order is cancelled, so it needs no steward.');
    }
    if (
      stewardId &&
      !(await this.prisma.user.findFirst({
        select: { id: true },
        where: { ...stewardsAt(order.hospitalId), id: stewardId },
      }))
    ) {
      throw new ConflictException(
        'Choose a steward: a Delivery Operator at this order’s location.',
      );
    }

    await this.prisma.restaurantOrder.update({
      data: {
        stewardAssignedAt: stewardId ? new Date() : null,
        stewardId,
        updatedBy: context.actorId,
      },
      where: { id },
    });
    await this.auditLog.record({
      action: 'STEWARD_ASSIGN',
      actorId: context.actorId,
      entityId: id,
      entityName: 'restaurant_orders',
      ipAddress: context.ipAddress,
      newValue: { stewardId },
      oldValue: { stewardId: order.stewardId },
    });
    const [updated] = await this.withStewardNames([
      await this.prisma.restaurantOrder.findFirstOrThrow({ select: kitchenSelect, where: { id } }),
    ]);

    return updated;
  }

  async setStatus(id: string, status: OrderStatus, context: ActorContext) {
    const order = await this.prisma.restaurantOrder.findFirst({
      select: { acceptedAt: true, source: true, status: true },
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // A counter bill is cancelled from its bill, which needs a reason and puts its stock back.
    if (order.source === OrderSource.COUNTER && status === OrderStatus.CANCELLED) {
      throw new ConflictException(
        'Cancel a counter bill from Bill History: it records why and restocks the counter.',
      );
    }

    if (!NEXT_STATUSES[order.status].includes(status)) {
      throw new ConflictException(`An order that is ${order.status} cannot be marked ${status}.`);
    }

    // Only from the status just read: two screens tapping at once cannot skip a step.
    const { count } = await this.prisma.restaurantOrder.updateMany({
      data: {
        // The first time the kitchen takes it (a READY sent back keeps it), and the handover.
        acceptedAt: status === OrderStatus.PREPARING && !order.acceptedAt ? new Date() : undefined,
        deliveredAt: status === OrderStatus.COLLECTED ? new Date() : undefined,
        readyAt: status === OrderStatus.READY ? new Date() : undefined,
        status,
        updatedBy: context.actorId,
      },
      where: { id, status: order.status },
    });

    if (count === 0) {
      throw new ConflictException('Someone else just updated this order. Refresh and try again.');
    }

    await this.auditLog.record({
      action: 'STATUS_CHANGE',
      actorId: context.actorId,
      entityId: id,
      entityName: 'restaurant_orders',
      ipAddress: context.ipAddress,
      newValue: { status },
      oldValue: { status: order.status },
    });

    return this.prisma.restaurantOrder.findFirstOrThrow({ select: orderSelect, where: { id } });
  }

  private async counterIdFor(restaurantId: string, counterCode: string): Promise<string> {
    const counter = await this.prisma.counter.findFirst({
      select: { id: true },
      where: { counterCode, deletedAt: null, restaurantId },
    });

    if (!counter) {
      throw new BadRequestException(`This restaurant has no counter ${counterCode}.`);
    }

    return counter.id;
  }

  /**
   * The TV pickup board's feed: the restaurant, its meal slot and open hours, and its open
   * orders. Order numbers and counters only, never a guest's name, phone or payment. The
   * restaurant id and its board secret must match.
   */
  async board(restaurantId: string, token: string | undefined) {
    const now = new Date();
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: {
            closingTime: true,
            counters: {
              orderBy: { counterCode: 'asc' },
              select: { counterName: true },
              take: 1,
              where: { deletedAt: null, isActive: true },
            },
            hospital: { select: { hospitalName: true } },
            hospitalId: true,
            id: true,
            isActive: true,
            location: { select: { locationName: true } },
            offline: true,
            open24x7: true,
            openingTime: true,
            restaurantName: true,
          },
          where: { boardToken: token, deletedAt: null, id: restaurantId },
        })
      : null;

    if (!restaurant) {
      throw new NotFoundException('This board link is no longer valid.');
    }

    const [slots, orders] = await Promise.all([
      this.prisma.timeSlot.findMany({
        select: { endTime: true, slotName: true, startTime: true },
        where: {
          deletedAt: null,
          isActive: true,
          isAlwaysAvailable: false,
          OR: [{ hospitalId: null }, { hospitalId: restaurant.hospitalId }],
        },
      }),
      this.prisma.restaurantOrder.findMany({
        orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
        select: {
          counter: { select: { counterName: true } },
          items: true,
          orderNumber: true,
          placedAt: true,
          prepMinutes: true,
          readyAt: true,
          serviceType: true,
          status: true,
        },
        take: 300,
        where: {
          placedAt: { gte: activeSince() },
          restaurantId: restaurant.id,
          status: { in: ACTIVE_STATUSES },
        },
      }),
    ]);

    return {
      ...boardSchedule(restaurant, slots, now),
      helpCounterName: restaurant.counters[0]?.counterName,
      locationName: restaurant.location?.locationName ?? restaurant.hospital.hospitalName,
      orders: orders.map((order) => ({
        counterName: order.counter?.counterName,
        itemCount: itemCount(order.items),
        orderNumber: order.orderNumber,
        serviceType: order.serviceType ?? undefined,
        ...(order.status === OrderStatus.READY
          ? { readyAt: (order.readyAt ?? order.placedAt).toISOString(), status: 'READY' as const }
          : {
              estimatedReadyAt: new Date(
                order.placedAt.getTime() + (order.prepMinutes ?? DEFAULT_PREP_MINUTES) * 60_000,
              ).toISOString(),
              status: 'PREPARING' as const,
            }),
      })),
      restaurantName: restaurant.restaurantName,
      serverTime: now.toISOString(),
    };
  }

  /** The restaurant's board secret, made on first use; regenerate turns the old link off. */
  /** The counter QR (phone) orders are billed at, into its open shift; null turns them off. */
  async setQrCounter(restaurantId: string, counterId: string | null, context: ActorContext) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { hospitalId: true, id: true, qrCounterId: true },
      where: { deletedAt: null, id: restaurantId },
    });

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    if (
      counterId &&
      !(await this.prisma.counter.findFirst({
        select: { id: true },
        where: { deletedAt: null, id: counterId, isActive: true, restaurantId },
      }))
    ) {
      throw new BadRequestException('Choose an active counter of this restaurant.');
    }

    await this.prisma.restaurant.update({
      data: { qrCounterId: counterId, updatedBy: context.actorId },
      where: { id: restaurantId },
    });
    await this.auditLog.record({
      action: 'UPDATE',
      actorId: context.actorId,
      entityId: restaurantId,
      entityName: 'restaurants',
      hospitalId: restaurant.hospitalId,
      ipAddress: context.ipAddress,
      newValue: { qrCounterId: counterId },
      oldValue: { qrCounterId: restaurant.qrCounterId },
      summary: counterId ? 'QR ordering counter set' : 'QR ordering turned off',
    });

    return { qrCounterId: counterId };
  }

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
