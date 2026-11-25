import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { SmsService } from '@aahar/auth';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import type { SendStaffOtpDto, VerifyStaffOtpDto } from './dto/pos.dto';
import { PosService } from './pos.service';
import { sha256 } from './staff-discount-confirm';

const CODE_TTL_MS = 5 * 60_000;
// Long enough for a guest to pay a UPI or card payment the bill then takes.
const TOKEN_TTL_MS = 15 * 60_000;
const RESEND_AFTER_MS = 60_000;
const MAX_SENDS_PER_DAY = 10;
const MAX_WRONG_TRIES = 5;

/**
 * A typed Employee ID proves nothing at the till: the cashier could give any employee's discount
 * to anyone. So the discount needs the employee's own word, as QR and kiosk orders get it from the
 * guest's OTP-confirmed mobile: a code sent to the employee's registered mobile, read out at the
 * counter. Rows stay as the record of each confirmation.
 */
@Injectable()
export class StaffDiscountOtpService {
  constructor(
    private readonly config: ConfigService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async send(dto: SendStaffOtpDto) {
    const counter = await this.pos.findCounter(dto.counterId);
    const { discountPercent, employeeCode } = await this.pos.employeeDiscount(
      counter,
      dto.employeeCode.trim(),
    );

    if (!discountPercent) {
      throw new BadRequestException(
        'This employee gets no staff discount here, so no code is needed.',
      );
    }

    const employee = await this.prisma.employee.findUnique({
      select: { mobile: true },
      where: { employeeCode },
    });
    const mobile = (employee?.mobile ?? '').replace(/\D/g, '').slice(-10);

    if (mobile.length !== 10) {
      throw new BadRequestException(
        'This employee has no mobile number on record, so the staff discount cannot be confirmed. Add it under Employees.',
      );
    }

    const now = Date.now();
    const recent = await this.prisma.staffDiscountOtp.findMany({
      select: { createdAt: true },
      where: { createdAt: { gte: new Date(now - 24 * 60 * 60_000) }, employeeCode },
    });

    if (recent.some((row) => row.createdAt.getTime() > now - RESEND_AFTER_MS)) {
      throw new HttpException(
        'A code was just sent. Wait a minute before sending another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (recent.length >= MAX_SENDS_PER_DAY) {
      throw new HttpException(
        'Too many codes today for this employee. Bill without the staff discount.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const canSend = this.sms.isConfigured();
    const devOtp =
      this.config.get<string>('ALLOW_DEV_OTP') === 'true' &&
      this.config.get<string>('NODE_ENV') === 'development';

    if (!canSend && !devOtp) {
      throw new ServiceUnavailableException(
        'Codes cannot be sent right now. Bill without the staff discount.',
      );
    }

    const code = canSend ? String(randomInt(0, 1_000_000)).padStart(6, '0') : '000000';
    const id = randomUUID();

    await this.prisma.staffDiscountOtp.create({
      data: {
        codeHash: sha256(`${id}:${code}`),
        employeeCode,
        expiresAt: new Date(now + CODE_TTL_MS),
        id,
        restaurantId: counter.restaurantId,
      },
    });

    if (canSend) {
      try {
        await this.sms.sendOtp(mobile, code);
      } catch (error) {
        // Not sent: it does not count, and another may be asked for at once.
        await this.prisma.staffDiscountOtp.delete({ where: { id } });
        throw error;
      }
    }

    return { otpId: id, sentTo: `******${mobile.slice(-4)}` };
  }

  /** Right, the till gets a token its next bill uses up; wrong, a try is spent (five per code). */
  async verify(dto: VerifyStaffOtpDto) {
    const counter = await this.pos.findCounter(dto.counterId);
    const now = new Date();
    // Counted before it is compared, so guesses sent at once each spend a try.
    const { count } = await this.prisma.staffDiscountOtp.updateMany({
      data: { attempts: { increment: 1 } },
      where: {
        attempts: { lt: MAX_WRONG_TRIES },
        expiresAt: { gt: now },
        id: dto.otpId,
        restaurantId: counter.restaurantId,
        verifiedAt: null,
      },
    });

    if (count !== 1) {
      throw new BadRequestException('That code has expired or was used. Send a new one.');
    }

    const row = await this.prisma.staffDiscountOtp.findUniqueOrThrow({
      select: { codeHash: true },
      where: { id: dto.otpId },
    });

    if (
      !timingSafeEqual(Buffer.from(sha256(`${dto.otpId}:${dto.code}`)), Buffer.from(row.codeHash))
    ) {
      throw new BadRequestException('That code is not right.');
    }

    const token = randomBytes(32).toString('base64url');
    const confirmed = await this.prisma.staffDiscountOtp.updateMany({
      data: {
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
        tokenHash: sha256(token),
        verifiedAt: now,
      },
      where: { id: dto.otpId, verifiedAt: null },
    });

    if (confirmed.count !== 1) {
      throw new BadRequestException('That code has expired or was used. Send a new one.');
    }

    return { employeeToken: token };
  }
}
