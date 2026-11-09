import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { SmsService } from '@aahar/auth';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CounterShiftStatus,
  OnlinePaymentStatus,
  OrderChannel,
  PaymentMode,
  Prisma,
  QrOrderStatus,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { optionalText, toNumber } from '../common/values';
import type { CreateQrOrderDto } from './dto/qr.dto';
import { providersAt } from './online-payment-providers';
import { OnlinePaymentsService } from './online-payments.service';
import { siteBusinessDate } from './pos-pricing';
import { PosService } from './pos.service';

/** The registered SMS says the code is "valid for 5 minutes". */
const OTP_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_SENDS_PER_DAY = 5;
const MAX_WRONG_TRIES = 5;
/** How long a confirmed staff discount stays good at checkout. */
const STAFF_TOKEN_MS = 30 * 60_000;

const notTaking = 'Room service is closed right now. Please try again later.';
const noStaff = 'No employee with this ID gets a staff discount here.';
const notBilled =
  'Your payment was received, but the order could not be placed. Please show this screen at the counter for a refund.';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** A web address the payment provider may send the guest back to; anything else is dropped. */
function returnAddress(base: string | undefined, id: string, key: string): string | undefined {
  if (!base) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    url.searchParams.set('order', id);
    url.searchParams.set('key', key);
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Ordering from the restaurant's QR on a guest's own phone: the live menu (counter or room),
 * a staff discount confirmed by an OTP on the employee's registered mobile, and payment by UPI
 * through the location's gateway. Only a paid order is billed, at the restaurant's QR counter
 * and into its open shift, as a counter bill would be (prices, stock, GST, kitchen, board).
 *
 * The phone opens it with the restaurant's board link secret, as the kiosk and TV board do. It
 * reads its order with a key the server derives from the order id, so nothing secret is stored
 * and a lost reply can be asked for again.
 */
@Injectable()
export class QrOrdersService {
  private readonly secret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly onlinePayments: OnlinePaymentsService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly auditLog?: AuditLogService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private keyFor(id: string) {
    return createHmac('sha256', this.secret).update(`qr-order:${id}`).digest('base64url');
  }

  private async restaurant(restaurantId: string, token: string | undefined) {
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: {
            hospital: { select: { hospitalName: true } },
            hospitalId: true,
            id: true,
            location: { select: { locationName: true } },
            qrCounterId: true,
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

    if (!restaurant) throw new NotFoundException('This QR code is no longer valid.');

    return restaurant;
  }

  /** The QR counter, when it is active and has a shift open now; null: no QR orders. */
  private async openCounter(restaurant: { id: string; qrCounterId: string | null }) {
    if (!restaurant.qrCounterId) return null;

    const counter = await this.prisma.counter.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: restaurant.qrCounterId,
        isActive: true,
        restaurantId: restaurant.id,
        shifts: { some: { status: CounterShiftStatus.OPEN } },
      },
    });

    return counter?.id ?? null;
  }

  /** What can be delivered to a room now, at the room price. */
  async menu(restaurantId: string, token: string | undefined) {
    const restaurant = await this.restaurant(restaurantId, token);
    const counterId = await this.openCounter(restaurant);
    const menu = restaurant.qrCounterId
      ? await this.pos.menu({ channel: OrderChannel.ROOM, counterId: restaurant.qrCounterId })
      : null;

    return {
      locationName: restaurant.location?.locationName ?? restaurant.hospital.hospitalName,
      /** False while the QR counter has no shift open: the page then takes no orders. */
      open: counterId !== null,
      restaurantName: restaurant.restaurantName,
      staffDiscount: restaurant.staffDiscountApplicable,
      items: (menu?.items ?? [])
        .filter(
          (item) => item.isOnSale && item.price !== null && (item.stock === null || item.stock > 0),
        )
        .map((item) => ({
          category: item.category,
          foodType: item.foodType,
          gstPercent: item.gstPercent,
          id: item.id,
          isDiscountable: item.isDiscountable,
          isGstInclusive: item.isGstInclusive,
          itemName: item.itemName,
          preparationTimeMinutes: item.preparationTimeMinutes,
          price: item.price!,
          stock: item.stock,
        })),
    };
  }

  /** An active employee with a registered mobile who gets a discount at this restaurant. */
  private async staffMember(
    restaurant: { id: string; staffDiscountApplicable: boolean },
    code: string,
  ) {
    if (!restaurant.staffDiscountApplicable) throw new NotFoundException(noStaff);

    const employee = await this.prisma.employee.findFirst({
      select: { employeeCode: true, mobile: true },
      where: {
        deletedAt: null,
        employeeCode: { equals: code.trim(), mode: 'insensitive' },
        isActive: true,
        mobile: { not: null },
      },
    });

    if (!employee?.mobile) throw new NotFoundException(noStaff);

    const { discountPercent } = await this.pos
      .employeeDiscount({ restaurantId: restaurant.id }, employee.employeeCode)
      .catch(() => ({ discountPercent: 0 }));

    if (!discountPercent) throw new NotFoundException(noStaff);

    return { discountPercent, employeeCode: employee.employeeCode, mobile: employee.mobile };
  }

  /** Sends an OTP to the employee's registered mobile; says only where, masked. */
  async sendStaffOtp(restaurantId: string, token: string | undefined, code: string) {
    const restaurant = await this.restaurant(restaurantId, token);
    const staff = await this.staffMember(restaurant, code);
    const now = Date.now();
    const recent = await this.prisma.staffDiscountOtp.findMany({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
      where: {
        createdAt: { gte: new Date(`${siteBusinessDate(new Date())}T00:00:00+05:30`) },
        employeeCode: staff.employeeCode,
      },
    });

    if (recent[0] && now - recent[0].createdAt.valueOf() < RESEND_AFTER_MS) {
      throw new HttpException(
        'An OTP was just sent. Wait a minute before asking for another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (recent.length >= MAX_SENDS_PER_DAY) {
      throw new HttpException(
        'Too many OTPs today for this Employee ID. Please ask at the counter.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const devOtp =
      this.config.get<string>('ALLOW_DEV_OTP') === 'true' &&
      this.config.get<string>('NODE_ENV') === 'development';
    const canSend = this.sms.isConfigured();

    if (!canSend && !devOtp) {
      throw new ServiceUnavailableException(
        'Staff discount OTPs cannot be sent right now. Please ask at the counter.',
      );
    }

    const otp = canSend ? String(randomInt(0, 1_000_000)).padStart(6, '0') : '000000';
    const id = randomUUID();

    await this.prisma.staffDiscountOtp.create({
      data: {
        codeHash: sha256(`${id}:${otp}`),
        employeeCode: staff.employeeCode,
        expiresAt: new Date(now + OTP_TTL_MS),
        id,
        restaurantId: restaurant.id,
      },
    });

    if (canSend) {
      try {
        await this.sms.sendOtp(staff.mobile, otp);
      } catch (error) {
        await this.prisma.staffDiscountOtp.delete({ where: { id } });
        throw error;
      }
    }

    return { sentTo: `******${staff.mobile.slice(-4)}` };
  }

  /** Checks the OTP; right, it gives the phone a token for the discount at checkout. */
  async verifyStaffOtp(restaurantId: string, token: string | undefined, code: string, otp: string) {
    const restaurant = await this.restaurant(restaurantId, token);
    const staff = await this.staffMember(restaurant, code);
    const sent = await this.prisma.staffDiscountOtp.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        employeeCode: staff.employeeCode,
        expiresAt: { gt: new Date() },
        restaurantId: restaurant.id,
        verifiedAt: null,
      },
    });

    if (!sent) throw new BadRequestException('That OTP has expired. Ask for a new one.');
    if (sent.attempts >= MAX_WRONG_TRIES) {
      throw new BadRequestException('Too many wrong tries. Ask for a new OTP.');
    }

    const right = Buffer.from(sha256(`${sent.id}:${otp}`));

    if (!timingSafeEqual(right, Buffer.from(sent.codeHash))) {
      await this.prisma.staffDiscountOtp.update({
        data: { attempts: { increment: 1 } },
        where: { id: sent.id },
      });
      throw new BadRequestException('That OTP is not right.');
    }

    const staffToken = randomBytes(32).toString('base64url');
    // Only the first of two at once: a code works once.
    const { count } = await this.prisma.staffDiscountOtp.updateMany({
      data: { tokenHash: sha256(staffToken), verifiedAt: new Date() },
      where: { id: sent.id, verifiedAt: null },
    });

    if (count !== 1) throw new BadRequestException('That OTP has expired. Ask for a new one.');

    return { discountPercent: staff.discountPercent, staffToken };
  }

  /** The employee a staff token confirmed at this restaurant within the last half hour. */
  private async staffFor(restaurantId: string, staffToken: string | undefined) {
    if (!staffToken) return undefined;

    const confirmed = await this.prisma.staffDiscountOtp.findFirst({
      select: { employeeCode: true },
      where: {
        restaurantId,
        tokenHash: sha256(staffToken),
        verifiedAt: { gte: new Date(Date.now() - STAFF_TOKEN_MS) },
      },
    });

    if (!confirmed) {
      throw new BadRequestException('Your staff discount has expired. Confirm it again.');
    }

    return confirmed.employeeCode;
  }

  /**
   * Prices the order at the QR counter and opens a UPI payment for it. Nothing is billed until
   * it is paid. Sending the same clientOrderId again returns the same order.
   */
  async createOrder(restaurantId: string, token: string | undefined, dto: CreateQrOrderDto) {
    const restaurant = await this.restaurant(restaurantId, token);
    const clientOrderId = dto.clientOrderId.trim();
    const existing = await this.prisma.qrOrder.findUnique({
      where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
    });

    if (existing) return this.view(existing.id);

    const counterId = await this.openCounter(restaurant);

    if (!counterId) throw new ConflictException(notTaking);

    const employeeCode = await this.staffFor(restaurant.id, dto.staffToken);
    const lines = dto.lines.map(({ menuId, quantity }) => ({ menuId, quantity }));
    const counter = await this.pos.findCounter(counterId);
    // Prices it as the bill will be, and refuses what is not sold for rooms now.
    const totals = await this.pos.quoteBill(counter, {
      channel: OrderChannel.ROOM,
      employeeCode,
      lines,
    });
    const provider = [
      ...(await providersAt(this.prisma, this.config, counter.hospitalId)).keys(),
    ].find((name) => name !== 'PINELABS');

    if (!provider) {
      throw new ConflictException(
        'This restaurant cannot take UPI payments on the phone yet. Please order at the counter.',
      );
    }

    const id = randomUUID();
    const key = this.keyFor(id);
    const payment = await this.onlinePayments.start(
      { channel: OrderChannel.ROOM, counterId, employeeCode, lines, provider },
      { actorId: undefined },
      returnAddress(dto.returnUrl, id, key),
    );

    try {
      await this.prisma.qrOrder.create({
        data: {
          bedNumber: optionalText(dto.bedNumber) ?? null,
          channel: OrderChannel.ROOM,
          clientOrderId,
          counterId,
          employeeCode: employeeCode ?? null,
          grandTotal: payment.amount,
          hospitalId: counter.hospitalId,
          id,
          instructions: optionalText(dto.instructions) ?? null,
          lines,
          onlinePaymentId: payment.id,
          restaurantId: restaurant.id,
          roomNumber: optionalText(dto.roomNumber) ?? null,
        },
      });
    } catch (error) {
      // A double tap that raced past the check above: the first one's order is the answer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.qrOrder.findUniqueOrThrow({
          where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
        });
        return this.view(raced.id);
      }
      throw error;
    }

    void this.auditLog?.record({
      action: 'CREATE',
      entityId: id,
      entityName: 'qr_orders',
      hospitalId: counter.hospitalId,
      newValue: { employeeCode, grandTotal: payment.amount, lines },
      summary: `QR order placed: ₹${payment.amount} by UPI`,
    });

    return { ...(await this.view(id)), ...totals };
  }

  /**
   * Where the guest's order stands. While it waits, the gateway is asked; once paid it is billed
   * at the QR counter (once: the bill is keyed by the order). If the bill cannot be made, the
   * payment is kept as paid but not billed, for a refund at the counter.
   */
  async status(id: string, key: string) {
    const expected = Buffer.from(this.keyFor(id));
    const given = Buffer.from(key);

    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new NotFoundException('Order not found.');
    }

    const order = await this.prisma.qrOrder.findUnique({ where: { id } });

    if (!order) throw new NotFoundException('Order not found.');

    if (order.status === QrOrderStatus.AWAITING_PAYMENT) {
      const payment = await this.onlinePayments.check(order.onlinePaymentId);

      if (payment.status === OnlinePaymentStatus.PAID) {
        await this.bill(order);
      } else if (payment.status !== OnlinePaymentStatus.PENDING) {
        await this.prisma.qrOrder.updateMany({
          data: { status: QrOrderStatus.CLOSED },
          where: { id, status: QrOrderStatus.AWAITING_PAYMENT },
        });
      }
    }

    return this.view(id);
  }

  private async bill(order: Prisma.QrOrderGetPayload<object>) {
    try {
      const bill = await this.pos.createOrder(
        {
          bedNumber: order.bedNumber ?? undefined,
          channel: order.channel,
          clientOrderId: `qr-${order.id}`,
          counterId: order.counterId,
          employeeCode: order.employeeCode ?? undefined,
          instructions: order.instructions ?? undefined,
          lines: order.lines as Array<{ menuId: string; quantity: number }>,
          onlinePaymentId: order.onlinePaymentId,
          paymentMode: PaymentMode.UPI,
          roomNumber: order.roomNumber ?? undefined,
        },
        // The guest bills it: room orders are theirs to place.
        { actorId: undefined, permissions: ['POS_ROOM_ORDER'] },
      );

      await this.prisma.qrOrder.updateMany({
        data: { billedOrderId: bill.id, status: QrOrderStatus.BILLED },
        where: { id: order.id, status: QrOrderStatus.AWAITING_PAYMENT },
      });
    } catch (error) {
      // A reason the bill cannot be made (sold out, shift ended): kept for a refund. Anything
      // else (the database, a timeout) is tried again on the next check.
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;

      await this.prisma.qrOrder.updateMany({
        data: { failureReason: error.message, status: QrOrderStatus.PAID_NOT_BILLED },
        where: { id: order.id, status: QrOrderStatus.AWAITING_PAYMENT },
      });
      void this.auditLog?.record({
        action: 'STATUS_CHANGE',
        entityId: order.id,
        entityName: 'qr_orders',
        hospitalId: order.hospitalId,
        newValue: { reason: error.message, status: QrOrderStatus.PAID_NOT_BILLED },
        summary: 'QR order paid but not billed: refund it',
      });
    }
  }

  private async view(id: string) {
    const order = await this.prisma.qrOrder.findUniqueOrThrow({
      include: {
        billedOrder: { select: { billNumber: true, orderNumber: true, status: true } },
        onlinePayment: { select: { paymentUrl: true, provider: true } },
        restaurant: { select: { restaurantName: true } },
      },
      where: { id },
    });

    return {
      billNumber: order.billedOrder?.billNumber ?? null,
      channel: order.channel,
      grandTotal: toNumber(order.grandTotal),
      id: order.id,
      key: this.keyFor(order.id),
      /** Where the kitchen has it: PLACED, PREPARING, READY, COLLECTED. */
      kitchenStatus: order.billedOrder?.status ?? null,
      message: order.status === QrOrderStatus.PAID_NOT_BILLED ? notBilled : null,
      orderNumber: order.billedOrder?.orderNumber ?? null,
      paymentUrl:
        order.status === QrOrderStatus.AWAITING_PAYMENT ? order.onlinePayment.paymentUrl : null,
      provider: order.onlinePayment.provider,
      restaurantName: order.restaurant.restaurantName,
      roomNumber: order.roomNumber,
      status: order.status,
    };
  }
}
