import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { RedisService, SmsService } from '@aahar/auth';
import { logger } from '@aahar/logging';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CounterShiftStatus,
  GuestOrderSource,
  OnlinePaymentStatus,
  OrderChannel,
  PaymentMode,
  Prisma,
  QrOrderStatus,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { optionalText, toNumber } from '../common/values';
import type {
  CreateKioskPaidOrderDto,
  CreateQrOrderDto,
  QrChannel,
  QrGuestOtpDto,
  QrGuestVerifyDto,
} from './dto/qr.dto';
import { providersAt } from './online-payment-providers';

type PaymentProviderName = 'PAYU' | 'PINELABS' | 'RAZORPAY';
import { OnlinePaymentsService } from './online-payments.service';
import { sellableMenu, siteBusinessDate } from './pos-pricing';
import { PosService, servedOn } from './pos.service';

/** The registered SMS says the code is "valid for 5 minutes". */
const OTP_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_SENDS_PER_DAY = 5;
const MAX_WRONG_TRIES = 5;
const DAY_SECONDS = 24 * 60 * 60;
/** A guest stays signed in on their phone this long. */
const GUEST_SESSION_MS = 30 * 24 * 60 * 60_000;
const signInFirst = 'Confirm your mobile number with an OTP to order.';

/** Waiting orders are settled this often without the guest's page (sweep). */
const SWEEP_EVERY_MS = 60_000;
/** The guest's own page checks every few seconds: the sweep leaves an order to it this long. */
const SWEEP_AFTER_MS = 90_000;
/** Still unpaid this long after it was placed, an order is let go as the kiosk's Cancel does. */
const GIVE_UP_AFTER_MS = 30 * 60_000;
/** One the sweep cannot settle (its gateway refusing it, say) stops being tried after this. */
const SWEEP_WINDOW_MS = 24 * 60 * 60_000;
/** A cancelled Razorpay order is asked again this long: an open checkout can still be paid. */
const RECHECK_CANCELLED_MS = 30 * 60_000;
const SWEEP_BATCH = 20;
const paidLate = 'Paid after the order was cancelled.';

const notTaking = 'Ordering is closed right now. Please try again later.';
const kioskNotTaking = 'This kiosk is not taking orders right now. Please order at the counter.';
const notAtTable = (restaurantName: string) =>
  `${restaurantName} does not take orders at the table. Please order at the counter.`;
const notBilled =
  'Your payment was received, but the order could not be placed. Please show this screen at the counter for a refund.';

/** "MAX-PATPARGANJ, New Delhi, Delhi": what the location's own fields give, in order. */
const addressOf = (place: { address: string | null; city: string | null; state: string | null }) =>
  [place.address, place.city, place.state].filter(Boolean).join(', ') || null;

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
 * Ordering from the restaurant's QR on a guest's own phone: delivered to a patient's room, or
 * picked up at the QR counter by staff and visitors. The live menu for either,
 * a staff discount confirmed by an OTP on the employee's registered mobile, and payment by UPI
 * through the location's gateway. Only a paid order is billed, at the restaurant's QR counter
 * and into its open shift, as a counter bill would be (prices, stock, GST, kitchen, board).
 *
 * The phone opens it with the restaurant's board link secret, as the kiosk and TV board do. It
 * reads its order with a key the server derives from the order id, so nothing secret is stored
 * and a lost reply can be asked for again.
 */
@Injectable()
export class QrOrdersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly secret: string;
  private sweeper?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly onlinePayments: OnlinePaymentsService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    /** Guests' sign-in codes, kept only until they expire (Redis; in memory without it). */
    private readonly store: RedisService,
    private readonly auditLog?: AuditLogService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /** Settles waiting orders every minute, so a paid one is billed even after its guest left. */
  onApplicationBootstrap() {
    // Integration tests settle orders through status() themselves; a timer would race them.
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_EVERY_MS).unref();
  }

  onApplicationShutdown() {
    clearInterval(this.sweeper);
  }

  private keyFor(id: string) {
    return createHmac('sha256', this.secret).update(`qr-order:${id}`).digest('base64url');
  }

  private async restaurant(restaurantId: string, token: string | undefined) {
    const restaurant = token
      ? await this.prisma.restaurant.findFirst({
          select: {
            // QR orders are billed at the restaurant's first counter: nothing to set up.
            counters: {
              orderBy: { createdAt: 'asc' },
              select: { id: true },
              take: 1,
              where: { deletedAt: null, isActive: true },
            },
            address: true,
            atTableDining: true,
            hospital: { select: { address: true, city: true, hospitalName: true, state: true } },
            hospitalId: true,
            id: true,
            inRoomDiningEnabled: true,
            location: { select: { locationName: true } },
            kioskCounterId: true,
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

    const { counters, ...rest } = restaurant;

    return { ...rest, qrCounterId: counters[0]?.id ?? null };
  }

  /** The QR (or kiosk) counter, when it is active and has a shift open now; null: no orders. */
  private async openCounter(restaurant: { id: string }, counterId: string | null) {
    if (!counterId) return null;

    return this.prisma.counter.findFirst({
      select: { counterName: true, id: true },
      where: {
        deletedAt: null,
        id: counterId,
        isActive: true,
        restaurantId: restaurant.id,
        shifts: { some: { status: CounterShiftStatus.OPEN } },
      },
    });
  }

  /**
   * A room's QR: its name and the restaurants that deliver to it, each with its ordering link
   * secret: only those with In Room Dining switched on (and a counter to bill at).
   * The QR holds only the room's id, so a restaurant's new link secret never reprints it.
   */
  async room(roomId: string) {
    const room = await this.prisma.room.findFirst({
      select: {
        hospital: { select: { address: true, city: true, hospitalName: true, state: true } },
        hospitalId: true,
        roomName: true,
      },
      where: {
        deletedAt: null,
        hospital: { deletedAt: null, isActive: true },
        id: roomId,
        isActive: true,
        // A room or bed: a table's QR is GET /qr/tables/:id.
        restaurantId: null,
      },
    });

    if (!room) throw new NotFoundException('This QR code is no longer valid.');

    const restaurants = await this.prisma.restaurant.findMany({
      orderBy: { restaurantName: 'asc' },
      select: {
        boardToken: true,
        // Its QR counter (the first active one) takes orders while a shift is open there.
        counters: {
          orderBy: { createdAt: 'asc' },
          select: {
            shifts: { select: { id: true }, take: 1, where: { status: CounterShiftStatus.OPEN } },
          },
          take: 1,
          where: { deletedAt: null, isActive: true },
        },
        id: true,
        openingTime: true,
        restaurantName: true,
      },
      where: {
        counters: { some: { deletedAt: null, isActive: true } },
        deletedAt: null,
        hospitalId: room.hospitalId,
        inRoomDiningEnabled: true,
        isActive: true,
      },
    });
    // How long its room dishes take, quickest to slowest: "ready in 25–40 min".
    const prep = await this.prisma.restaurantMenu.groupBy({
      _max: { preparationTimeMinutes: true },
      _min: { preparationTimeMinutes: true },
      by: ['restaurantId'],
      where: {
        ...sellableMenu,
        deletedAt: null,
        isActive: true,
        preparationTimeMinutes: { gt: 0 },
        restaurantId: { in: restaurants.map((restaurant) => restaurant.id) },
        serveAt: { in: servedOn(OrderChannel.ROOM) },
      },
    });

    return {
      locationAddress: addressOf(room.hospital),
      locationName: room.hospital.hospitalName,
      restaurants: await Promise.all(
        restaurants.map(async (restaurant) => {
          const times = prep.find((row) => row.restaurantId === restaurant.id);

          return {
            id: restaurant.id,
            /** Taking orders now: its QR counter has a shift open. */
            open: Boolean(restaurant.counters[0]?.shifts.length),
            /** "HH:mm", as set on the restaurant; null when not set. */
            opensAt: restaurant.openingTime,
            readyMinutes:
              times?._min.preparationTimeMinutes && times._max.preparationTimeMinutes
                ? {
                    max: times._max.preparationTimeMinutes,
                    min: times._min.preparationTimeMinutes,
                  }
                : null,
            restaurantName: restaurant.restaurantName,
            token: restaurant.boardToken ?? (await this.newBoardToken(restaurant.id)),
          };
        }),
      ),
      roomName: room.roomName,
    };
  }

  /**
   * A table's QR: its restaurant's ordering link, with the table filled in, while the restaurant
   * takes orders at the table (At Table Dining). Like a bed's, the QR holds only the table's id.
   */
  async table(tableId: string) {
    const table = await this.prisma.room.findFirst({
      select: {
        restaurant: {
          select: { atTableDining: true, boardToken: true, id: true, restaurantName: true },
        },
        roomName: true,
      },
      where: {
        deletedAt: null,
        hospital: { deletedAt: null, isActive: true },
        id: tableId,
        isActive: true,
        restaurant: { deletedAt: null, isActive: true },
        restaurantId: { not: null },
      },
    });

    if (!table?.restaurant) throw new NotFoundException('This QR code is no longer valid.');

    const { restaurant } = table;

    if (!restaurant.atTableDining) {
      throw new BadRequestException(notAtTable(restaurant.restaurantName));
    }

    return {
      restaurantId: restaurant.id,
      restaurantName: restaurant.restaurantName,
      tableName: table.roomName,
      token: restaurant.boardToken ?? (await this.newBoardToken(restaurant.id)),
    };
  }

  /** A restaurant whose ordering link was never opened gets its secret now, as the portal would. */
  private async newBoardToken(restaurantId: string) {
    const boardToken = randomBytes(24).toString('base64url');

    await this.prisma.restaurant.updateMany({
      data: { boardToken },
      where: { boardToken: null, id: restaurantId },
    });

    const { boardToken: saved } = await this.prisma.restaurant.findUniqueOrThrow({
      select: { boardToken: true },
      where: { id: restaurantId },
    });

    return saved!;
  }

  /**
   * The menu: for a room at the room price, or for pickup at the counter's. A restaurant without
   * In Room Dining serves pickup only. Dishes off for now or sold out are listed, not available.
   */
  async menu(restaurantId: string, token: string | undefined, channel: QrChannel = 'ROOM') {
    const restaurant = await this.restaurant(restaurantId, token);
    const counter = await this.openCounter(restaurant, restaurant.qrCounterId);
    const served = restaurant.inRoomDiningEnabled ? channel : 'COUNTER';
    const menu = restaurant.qrCounterId
      ? await this.pos.menu({ channel: served, counterId: restaurant.qrCounterId })
      : null;

    return {
      address: restaurant.address ?? addressOf(restaurant.hospital),
      locationName: restaurant.location?.locationName ?? restaurant.hospital.hospitalName,
      /** False while the QR counter has no shift open: the page then takes no orders. */
      open: counter !== null,
      /** Where pickup orders are collected: the QR counter. */
      pickupCounter: counter?.counterName ?? null,
      restaurantName: restaurant.restaurantName,
      /** Whether it delivers to rooms (In Room Dining); without it, pickup only. */
      roomDelivery: restaurant.inRoomDiningEnabled,
      staffDiscount: restaurant.staffDiscountApplicable,
      items: (menu?.items ?? [])
        // Not sold this way at all (no room price): not on this menu.
        .filter((item) => item.price !== null)
        .map((item) => ({
          available: item.isOnSale && (item.stock === null || item.stock > 0),
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

  /**
   * Sends a sign-in OTP to the guest's mobile. Once confirmed, the phone orders under that name
   * and number, and an employee's registered mobile gets their staff discount by itself.
   */
  async sendGuestOtp(restaurantId: string, token: string | undefined, dto: QrGuestOtpDto) {
    await this.restaurant(restaurantId, token);
    const { mobile } = dto;
    // Nothing about a guest is kept: the code, the wait and the day's count all expire.
    const codeKey = `qr-guest:otp:${mobile}`;
    const waitKey = `qr-guest:wait:${mobile}`;
    const todayKey = `qr-guest:sent:${mobile}:${siteBusinessDate(new Date())}`;

    if (!(await this.store.setIfAbsent(waitKey, '1', RESEND_AFTER_MS / 1000))) {
      throw new HttpException(
        'An OTP was just sent. Wait a minute before asking for another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if ((await this.store.increment(todayKey, DAY_SECONDS)) > MAX_SENDS_PER_DAY) {
      throw new HttpException(
        'Too many OTPs today for this number. Please ask at the counter.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const devOtp =
      this.config.get<string>('ALLOW_DEV_OTP') === 'true' &&
      this.config.get<string>('NODE_ENV') === 'development';
    const canSend = this.sms.isConfigured();
    // Not sent: the number may ask again at once, and it does not count for the day.
    const giveBack = async () => {
      await this.store.delete(codeKey);
      await this.store.delete(waitKey);
      await this.store.decrement(todayKey);
    };

    if (!canSend && !devOtp) {
      await giveBack();
      throw new ServiceUnavailableException(
        'OTPs cannot be sent right now. Please order at the counter.',
      );
    }

    const otp = canSend ? String(randomInt(0, 1_000_000)).padStart(6, '0') : '000000';
    const nonce = randomUUID();

    // A new code replaces any earlier one, and its wrong tries start again.
    await this.store.setWithExpiry(
      codeKey,
      JSON.stringify({
        codeHash: sha256(`${nonce}:${otp}`),
        name: dto.name.trim().replace(/\s+/g, ' '),
        nonce,
      }),
      OTP_TTL_MS / 1000,
    );
    await this.store.delete(`qr-guest:tries:${mobile}`);

    if (canSend) {
      try {
        await this.sms.sendOtp(mobile, otp);
      } catch (error) {
        await giveBack();
        throw error;
      }
    }

    return { sentTo: `******${mobile.slice(-4)}` };
  }

  /** Checks the OTP; right, the phone gets its sign-in, good for 30 days. The code is gone. */
  async verifyGuestOtp(restaurantId: string, token: string | undefined, dto: QrGuestVerifyDto) {
    await this.restaurant(restaurantId, token);
    const codeKey = `qr-guest:otp:${dto.mobile}`;
    const triesKey = `qr-guest:tries:${dto.mobile}`;
    const saved = await this.store.get(codeKey);

    if (!saved) throw new BadRequestException('That OTP has expired. Ask for a new one.');
    // Counted before it is compared, as the portal's OTP is: guesses sent all at once each use
    // a try, so a burst gets no more than five.
    if ((await this.store.increment(triesKey, OTP_TTL_MS / 1000)) > MAX_WRONG_TRIES) {
      throw new BadRequestException('Too many wrong tries. Ask for a new OTP.');
    }

    const sent = JSON.parse(saved) as { codeHash: string; name: string; nonce: string };
    const right = Buffer.from(sha256(`${sent.nonce}:${dto.otp}`));

    if (!timingSafeEqual(right, Buffer.from(sent.codeHash))) {
      throw new BadRequestException('That OTP is not right.');
    }
    // Only the first of two at once: a code works once.
    if (!(await this.store.delete(codeKey))) {
      throw new BadRequestException('That OTP has expired. Ask for a new one.');
    }
    await this.store.delete(triesKey);

    const expiresAt = Date.now() + GUEST_SESSION_MS;

    return {
      expiresAt: new Date(expiresAt).toISOString(),
      guestToken: this.guestToken({ e: expiresAt, m: dto.mobile, n: sent.name }),
      mobile: dto.mobile,
      name: sent.name,
    };
  }

  /** The staff discount a signed-in guest gets here: 0 unless theirs is an employee's mobile. */
  async guestDiscount(restaurantId: string, token: string | undefined, guestToken: string) {
    const restaurant = await this.restaurant(restaurantId, token);
    const guest = this.guestFrom(guestToken);
    const staff = await this.staffByMobile(restaurant, guest.mobile);

    return { discountPercent: staff?.discountPercent ?? 0 };
  }

  /** A sign-in the server alone can make: name, mobile and expiry, with its HMAC. */
  private guestToken(guest: { e: number; m: string; n: string }) {
    const body = Buffer.from(JSON.stringify(guest)).toString('base64url');

    return `${body}.${this.guestMac(body)}`;
  }

  private guestMac(body: string) {
    return createHmac('sha256', this.secret).update(`qr-guest:${body}`).digest('base64url');
  }

  /** The name and mobile a sign-in confirmed; a forged, expired or missing one is refused. */
  private guestFrom(guestToken: string | undefined) {
    const [body = '', mac = ''] = (guestToken ?? '').split('.');
    const expected = Buffer.from(this.guestMac(body));
    const given = Buffer.from(mac);

    if (!body || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ForbiddenException(signInFirst);
    }

    const guest = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      e: number;
      m: string;
      n: string;
    };

    if (!(guest.e > Date.now())) throw new ForbiddenException(signInFirst);

    return { mobile: guest.m, name: guest.n };
  }

  /** An active employee whose registered mobile this is, and their discount here, if any. */
  private async staffByMobile(
    restaurant: { id: string; staffDiscountApplicable: boolean },
    mobile: string,
  ) {
    if (!restaurant.staffDiscountApplicable) return null;

    const employee = await this.prisma.employee.findFirst({
      select: { employeeCode: true },
      where: { deletedAt: null, isActive: true, mobile: { endsWith: mobile } },
    });

    if (!employee) return null;

    const { discountPercent } = await this.pos
      .employeeDiscount({ restaurantId: restaurant.id }, employee.employeeCode)
      .catch(() => ({ discountPercent: 0 }));

    return discountPercent ? { discountPercent, employeeCode: employee.employeeCode } : null;
  }

  /**
   * Prices the order at the QR counter and opens a UPI payment for it. Nothing is billed until
   * it is paid. Sending the same clientOrderId again returns the same order.
   */
  async createOrder(restaurantId: string, token: string | undefined, dto: CreateQrOrderDto) {
    const restaurant = await this.restaurant(restaurantId, token);
    // Every QR order is a signed-in guest's: their confirmed name and mobile go on it.
    const guest = this.guestFrom(dto.guestToken);
    const clientOrderId = dto.clientOrderId.trim();
    const existing = await this.prisma.qrOrder.findUnique({
      where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
    });

    if (existing) return this.view(existing.id);

    const channel = dto.channel ?? OrderChannel.ROOM;

    if (channel === OrderChannel.ROOM && !restaurant.inRoomDiningEnabled) {
      throw new BadRequestException(
        'This restaurant does not deliver to rooms. Please pick up at the counter.',
      );
    }

    // Rooms order from the bed's own QR, under the bed's own name; the restaurant's QR is pickup only.
    const room =
      channel === OrderChannel.ROOM && dto.roomId
        ? await this.prisma.room.findFirst({
            select: { roomName: true },
            where: {
              deletedAt: null,
              hospitalId: restaurant.hospitalId,
              id: dto.roomId,
              isActive: true,
              restaurantId: null,
            },
          })
        : null;

    if (channel === OrderChannel.ROOM && !room) {
      throw new BadRequestException('To order to your room, scan the QR code on your bed.');
    }

    if (channel === OrderChannel.TABLE && !restaurant.atTableDining) {
      throw new BadRequestException(notAtTable(restaurant.restaurantName));
    }

    // A table orders from its own QR, under its own name: one of this restaurant's tables.
    const table =
      channel === OrderChannel.TABLE && dto.tableId
        ? await this.prisma.room.findFirst({
            select: { roomName: true },
            where: {
              deletedAt: null,
              id: dto.tableId,
              isActive: true,
              restaurantId: restaurant.id,
            },
          })
        : null;

    if (channel === OrderChannel.TABLE && !table) {
      throw new BadRequestException('To order at your table, scan the QR code on it.');
    }

    const open = await this.openCounter(restaurant, restaurant.qrCounterId);

    if (!open) throw new ConflictException(notTaking);

    const counter = await this.pos.findCounter(open.id);
    const provider = await this.upiProvider(counter.hospitalId);

    if (!provider) {
      throw new ConflictException(
        'This restaurant cannot take UPI payments on the phone yet. Please order at the counter.',
      );
    }

    // An employee's registered mobile gets their staff discount: nothing more to show.
    const staff = await this.staffByMobile(restaurant, guest.mobile);

    return this.place({
      bedNumber: null,
      channel,
      clientOrderId,
      counter,
      customerMobile: guest.mobile,
      customerName: guest.name,
      // Razorpay's checkout opens on the guest's page, their name and mobile filled in.
      embedded: provider === 'RAZORPAY',
      employeeCode: staff?.employeeCode,
      instructions: optionalText(dto.instructions) ?? null,
      lines: dto.lines,
      provider,
      restaurantId: restaurant.id,
      returnUrl: dto.returnUrl,
      roomNumber: room?.roomName ?? null,
      source: GuestOrderSource.QR,
      tableName: table?.roomName ?? null,
    });
  }

  /** The location's UPI gateway (Razorpay or PayU), if it has one set up. */
  private async upiProvider(hospitalId: string) {
    return [...(await providersAt(this.prisma, this.config, hospitalId)).keys()].find(
      (name) => name !== 'PINELABS',
    );
  }

  /** Whether the kiosk takes orders now, and how it can be paid: UPI, the counter's card machine. */
  async kioskPayment(restaurant: {
    hospitalId: string;
    id: string;
    kioskCounterId: string | null;
  }) {
    const counterId = (await this.openCounter(restaurant, restaurant.kioskCounterId))?.id;

    if (!counterId) return { open: false, payWith: [] as Array<'CARD' | 'UPI'> };

    const [upi, card] = await Promise.all([
      this.upiProvider(restaurant.hospitalId),
      this.onlinePayments.cardMachine(counterId),
    ]);
    const payWith: Array<'CARD' | 'UPI'> = [];

    if (upi) payWith.push('UPI');
    if (card) payWith.push('CARD');

    return { open: payWith.length > 0, payWith };
  }

  /**
   * A kiosk order the guest pays at the kiosk: by UPI (the gateway's QR for the amount, shown on
   * the kiosk) or a card on the kiosk counter's machine. Billed there once paid.
   */
  async createKioskOrder(
    restaurantId: string,
    token: string | undefined,
    dto: CreateKioskPaidOrderDto,
  ) {
    const restaurant = await this.restaurant(restaurantId, token);
    // Signed in for this order only (the kiosk forgets them after): their name and mobile.
    const guest = this.guestFrom(dto.guestToken);
    const clientOrderId = dto.clientOrderId.trim();
    const existing = await this.prisma.qrOrder.findUnique({
      where: { restaurantId_clientOrderId: { clientOrderId, restaurantId: restaurant.id } },
    });

    if (existing) return this.view(existing.id);

    const counterId = (await this.openCounter(restaurant, restaurant.kioskCounterId))?.id;

    if (!counterId) throw new ConflictException(kioskNotTaking);

    const counter = await this.pos.findCounter(counterId);
    let provider: PaymentProviderName | undefined;

    if (dto.method === 'CARD') {
      if (!(await this.onlinePayments.cardMachine(counterId))) {
        throw new ConflictException('This kiosk has no card machine. Please pay by UPI.');
      }
      provider = 'PINELABS';
    } else {
      provider = await this.upiProvider(counter.hospitalId);
      if (!provider) {
        throw new ConflictException('This kiosk cannot take UPI right now. Please pay by card.');
      }
    }

    // An employee's registered mobile gets their staff discount, as on the phone.
    const staff = await this.staffByMobile(restaurant, guest.mobile);

    return this.place({
      bedNumber: null,
      channel: OrderChannel.COUNTER,
      clientOrderId,
      counter,
      customerMobile: guest.mobile,
      customerName: guest.name,
      employeeCode: staff?.employeeCode,
      instructions: null,
      lines: dto.lines,
      provider,
      restaurantId: restaurant.id,
      roomNumber: null,
      source: GuestOrderSource.KIOSK,
      tableName: null,
    });
  }

  /** Prices the order as the bill will be, opens its payment, and keeps the order. */
  private async place(input: {
    bedNumber: string | null;
    channel: OrderChannel;
    clientOrderId: string;
    counter: Awaited<ReturnType<PosService['findCounter']>>;
    customerMobile?: string;
    customerName?: string;
    /** Paid in the provider's checkout on the guest's page, not on a link page. */
    embedded?: boolean;
    /** The employee whose discount applies: the guest's confirmed mobile is theirs. */
    employeeCode?: string;
    instructions: string | null;
    lines: Array<{ menuId: string; quantity: number }>;
    provider: PaymentProviderName;
    restaurantId: string;
    returnUrl?: string;
    roomNumber: string | null;
    source: GuestOrderSource;
    tableName: string | null;
  }) {
    const { channel, clientOrderId, counter, employeeCode, provider, restaurantId } = input;
    const lines = input.lines.map(({ menuId, quantity }) => ({ menuId, quantity }));
    // Refuses what is not sold for this channel now, before any payment is opened.
    const totals = await this.pos.quoteBill(counter, { channel, employeeCode, lines });
    const id = randomUUID();
    const key = this.keyFor(id);
    const payment = await this.onlinePayments.start(
      {
        channel,
        counterId: counter.id,
        customerMobile: input.customerMobile,
        customerName: input.customerName,
        employeeCode,
        lines,
        provider,
      },
      { actorId: undefined },
      returnAddress(input.returnUrl, id, key),
      input.embedded,
    );

    try {
      await this.prisma.qrOrder.create({
        data: {
          bedNumber: input.bedNumber,
          channel,
          clientOrderId,
          counterId: counter.id,
          employeeCode: employeeCode ?? null,
          grandTotal: payment.amount,
          hospitalId: counter.hospitalId,
          id,
          instructions: input.instructions,
          lines,
          onlinePaymentId: payment.id,
          restaurantId,
          roomNumber: input.roomNumber,
          source: input.source,
          tableName: input.tableName,
        },
      });
    } catch (error) {
      // A double tap that raced past the check above: the first one's order is the answer.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.qrOrder.findUniqueOrThrow({
          where: { restaurantId_clientOrderId: { clientOrderId, restaurantId } },
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
      summary: `${input.source === GuestOrderSource.KIOSK ? 'Kiosk' : 'QR'} order placed: ₹${payment.amount} by ${provider === 'PINELABS' ? 'card' : 'UPI'}`,
    });

    return { ...(await this.view(id)), ...totals };
  }

  /**
   * Where the guest's order stands. While it waits, the gateway is asked; once paid it is billed
   * at the QR counter (once: the bill is keyed by the order). If the bill cannot be made, the
   * payment is kept as paid but not billed, for a refund at the counter.
   */
  async status(id: string, key: string) {
    const order = await this.ownOrder(id, key);

    if (order.status === QrOrderStatus.AWAITING_PAYMENT) {
      await this.settle(order, (await this.onlinePayments.check(order.onlinePaymentId)).status);
    }

    return this.view(id);
  }

  /** Where its payment stands decides the order: billed once paid, closed once it ended unpaid. */
  private async settle(order: Prisma.QrOrderGetPayload<object>, payment: OnlinePaymentStatus) {
    if (payment === OnlinePaymentStatus.PAID) {
      await this.bill(order);
    } else if (payment !== OnlinePaymentStatus.PENDING) {
      await this.prisma.qrOrder.updateMany({
        data: { status: QrOrderStatus.CLOSED },
        where: { id: order.id, status: QrOrderStatus.AWAITING_PAYMENT },
      });
    }
  }

  /** The order a guest's key opens; any other key (or none) finds nothing. */
  private async ownOrder(id: string, key: string) {
    const expected = Buffer.from(this.keyFor(id));
    const given = Buffer.from(key);

    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new NotFoundException('Order not found.');
    }

    const order = await this.prisma.qrOrder.findUnique({ where: { id } });

    if (!order) throw new NotFoundException('Order not found.');

    return order;
  }

  /**
   * The guest gives up on paying (the kiosk's Cancel, or it times out). If they paid meanwhile,
   * the order is billed as usual; otherwise the payment is cancelled and nothing is ordered.
   */
  async cancel(id: string, key: string) {
    const order = await this.ownOrder(id, key);

    if (order.status === QrOrderStatus.AWAITING_PAYMENT) {
      await this.settle(order, (await this.onlinePayments.cancel(order.onlinePaymentId)).status);
    }

    return this.view(id);
  }

  /**
   * Settles waiting orders without the guest's page, as status() does: billed once paid (so the
   * kitchen hears of it after the guest closed the page), closed once the payment ended, and let
   * go as the kiosk's Cancel does when still unpaid after 30 minutes. Then Razorpay orders
   * cancelled lately are asked again. The oldest first, a batch per run, never two runs at once
   * here; an order that fails is logged and tried on the next run.
   *
   * ponytail: no lock across pods, so every pod sweeps the same orders. Settling twice is safe
   * (one bill per order; the loser of a race takes the winner's bill). More than 20 waiting at
   * once delays the newest until the oldest settle. Add an advisory lock, or a bigger batch, if
   * pods or volumes grow.
   */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;

    try {
      const now = Date.now();
      const orders = await this.prisma.qrOrder.findMany({
        orderBy: { createdAt: 'asc' },
        take: SWEEP_BATCH,
        where: {
          createdAt: { gte: new Date(now - SWEEP_WINDOW_MS), lt: new Date(now - SWEEP_AFTER_MS) },
          status: QrOrderStatus.AWAITING_PAYMENT,
        },
      });

      for (const order of orders) {
        try {
          const payment =
            now - order.createdAt.valueOf() > GIVE_UP_AFTER_MS
              ? await this.onlinePayments.cancel(order.onlinePaymentId)
              : await this.onlinePayments.check(order.onlinePaymentId);

          await this.settle(order, payment.status);
        } catch (error) {
          logger.warn({ err: error, qrOrderId: order.id }, 'qr_order_sweep_failed');
        }
      }

      await this.recheckCancelled(now);
    } catch (error) {
      logger.error({ err: error }, 'qr_order_sweep_failed');
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Razorpay has no cancel for an order (nor AAHAR for a PayU link), so a checkout still open on
   * the guest's phone can take a payment after AAHAR let it go. Those cancelled in the last 30
   * minutes are asked again; one
   * found paid is kept for a refund: its order, closed by then, becomes paid but not billed (a
   * till's payment gets its own "refund it" row from OnlinePaymentsService).
   */
  private async recheckCancelled(now: number) {
    const payments = await this.prisma.onlinePayment.findMany({
      orderBy: { updatedAt: 'asc' },
      select: { id: true },
      take: SWEEP_BATCH,
      where: {
        // Neither can be cancelled at the provider: a Razorpay order, a PayU payment link.
        OR: [{ provider: 'RAZORPAY', providerRef: { startsWith: 'order_' } }, { provider: 'PAYU' }],
        status: OnlinePaymentStatus.CANCELLED,
        updatedAt: { gte: new Date(now - RECHECK_CANCELLED_MS) },
      },
    });

    for (const { id } of payments) {
      try {
        if (!(await this.onlinePayments.paidAfterCancel(id))) continue;

        const order = await this.prisma.qrOrder.findUnique({ where: { onlinePaymentId: id } });

        if (!order) continue;

        const { count } = await this.prisma.qrOrder.updateMany({
          data: { failureReason: paidLate, status: QrOrderStatus.PAID_NOT_BILLED },
          where: { id: order.id, status: QrOrderStatus.CLOSED },
        });

        if (count === 1) this.recordNotBilled(order, paidLate);
      } catch (error) {
        logger.warn({ err: error, onlinePaymentId: id }, 'online_payment_recheck_failed');
      }
    }
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
          tableName: order.tableName ?? undefined,
        },
        // The guest bills it: room orders are theirs to place.
        { actorId: undefined, permissions: ['POS_ROOM_ORDER'] },
      );

      await this.markBilled(order.id, bill.id);
    } catch (error) {
      // A reason the bill cannot be made (sold out, shift ended): kept for a refund. Anything
      // else (the database, a timeout) is tried again on the next check.
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;

      // Two checks at once: the other one billed this order with its payment first, and this one
      // was told the payment is on another bill. That bill is the order's own.
      const payment = await this.prisma.onlinePayment.findUnique({
        select: { orderId: true },
        where: { id: order.onlinePaymentId },
      });

      if (payment?.orderId) {
        await this.markBilled(order.id, payment.orderId);
        return;
      }

      const { count } = await this.prisma.qrOrder.updateMany({
        data: { failureReason: error.message, status: QrOrderStatus.PAID_NOT_BILLED },
        where: { id: order.id, status: QrOrderStatus.AWAITING_PAYMENT },
      });

      // Only the call that flagged it asks for the refund.
      if (count === 1) this.recordNotBilled(order, error.message);
    }
  }

  /** Billed with its bill: also over a "paid but not billed" the loser of a race wrote first. */
  private async markBilled(id: string, billedOrderId: string) {
    await this.prisma.qrOrder.updateMany({
      data: { billedOrderId, failureReason: null, status: QrOrderStatus.BILLED },
      where: {
        id,
        status: { in: [QrOrderStatus.AWAITING_PAYMENT, QrOrderStatus.PAID_NOT_BILLED] },
      },
    });
  }

  private recordNotBilled(order: { hospitalId: string; id: string }, reason: string) {
    void this.auditLog?.record({
      action: 'STATUS_CHANGE',
      entityId: order.id,
      entityName: 'qr_orders',
      hospitalId: order.hospitalId,
      newValue: { reason, status: QrOrderStatus.PAID_NOT_BILLED },
      summary: 'QR order paid but not billed: refund it',
    });
  }

  private async view(id: string) {
    const order = await this.prisma.qrOrder.findUniqueOrThrow({
      include: {
        billedOrder: {
          select: {
            billNumber: true,
            deliveredAt: true,
            lines: {
              select: {
                itemName: true,
                lineTotal: true,
                quantity: true,
                restaurantMenu: { select: { preparationTimeMinutes: true } },
              },
            },
            orderNumber: true,
            placedAt: true,
            readyAt: true,
            status: true,
          },
        },
        onlinePayment: {
          select: {
            customerMobile: true,
            customerName: true,
            paymentUrl: true,
            provider: true,
            providerRef: true,
          },
        },
        restaurant: { select: { restaurantName: true } },
      },
      where: { id },
    });

    const billed = order.billedOrder;
    const payment = order.onlinePayment;
    const awaiting = order.status === QrOrderStatus.AWAITING_PAYMENT;
    // A Razorpay order is paid in Razorpay's checkout on the guest's page: it needs the key id.
    const keyId =
      awaiting && payment.provider === 'RAZORPAY' && payment.providerRef.startsWith('order_')
        ? (await providersAt(this.prisma, this.config, order.hospitalId)).get('RAZORPAY')?.publicKey
        : undefined;
    // The slowest dish sets when it should be ready, counted from when it was paid and billed.
    const prepMinutes = Math.max(
      0,
      ...(billed?.lines ?? []).map((line) => line.restaurantMenu.preparationTimeMinutes ?? 0),
    );

    return {
      billNumber: billed?.billNumber ?? null,
      channel: order.channel,
      checkout: keyId
        ? {
            amount: Math.round(toNumber(order.grandTotal) * 100),
            currency: 'INR',
            keyId,
            name: order.restaurant.restaurantName,
            orderId: payment.providerRef,
            prefill: {
              ...(payment.customerMobile ? { contact: `+91${payment.customerMobile}` } : {}),
              ...(payment.customerName ? { name: payment.customerName } : {}),
            },
          }
        : null,
      deliveredAt: billed?.deliveredAt?.toISOString() ?? null,
      grandTotal: toNumber(order.grandTotal),
      id: order.id,
      key: this.keyFor(order.id),
      /** Where the kitchen has it: PLACED, PREPARING, READY, COLLECTED. */
      kitchenStatus: order.billedOrder?.status ?? null,
      lines: (billed?.lines ?? []).map((line) => ({
        amount: toNumber(line.lineTotal),
        itemName: line.itemName,
        quantity: line.quantity,
      })),
      message: order.status === QrOrderStatus.PAID_NOT_BILLED ? notBilled : null,
      orderNumber: order.billedOrder?.orderNumber ?? null,
      paymentUrl: awaiting ? payment.paymentUrl || null : null,
      paidAt: billed?.placedAt.toISOString() ?? null,
      provider: order.onlinePayment.provider,
      readyAt: billed?.readyAt?.toISOString() ?? null,
      readyBy:
        billed && prepMinutes
          ? new Date(billed.placedAt.valueOf() + prepMinutes * 60_000).toISOString()
          : null,
      restaurantName: order.restaurant.restaurantName,
      roomNumber: order.roomNumber,
      status: order.status,
      tableName: order.tableName,
    };
  }
}
