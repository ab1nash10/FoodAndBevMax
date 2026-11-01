import { randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { logger, maskPhone } from '@aahar/logging';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';

type OtpChannel = 'email' | 'mobile';

export interface OtpTarget {
  channel: OtpChannel;
  value: string;
}

const DEV_OTP = '000000';
// A 6-digit code has a million values, and the per-IP throttle alone does not stop guesses
// spread across many addresses. Five misses burns the code.
const MAX_FAILED_ATTEMPTS = 5;
// Per number, not per IP: the IP throttle alone let anyone flood one phone from many addresses.
const RESEND_COOLDOWN_SECONDS = 30;
// The miss count above is per code, and every new code starts it afresh: a code every 30 seconds
// bought five more guesses each time. These two are per number or email over a day, and a new
// code does not reset them.
const DAY_SECONDS = 24 * 60 * 60;
const MAX_DAILY_FAILED_ATTEMPTS = 15;
const MAX_DAILY_SENDS = 10;

@Injectable()
export class OtpService {
  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly sms: SmsService,
  ) {}

  getTarget(input: { email?: string; mobile?: string }): OtpTarget {
    if (input.mobile) {
      return {
        channel: 'mobile',
        value: input.mobile,
      };
    }

    if (input.email) {
      return {
        channel: 'email',
        value: input.email.toLowerCase(),
      };
    }

    throw new BadRequestException('Mobile number or email is required');
  }

  /**
   * Mobile codes go out by SMS, email codes by Microsoft Graph mail. Without its channel only
   * development with ALLOW_DEV_OTP can work, signing in with the fixed code; anywhere else the
   * request is refused rather than answering "OTP sent" for a code nobody will ever receive.
   */
  assertCanDeliver(target: OtpTarget): void {
    if (!this.canDeliver(target) && !this.devOtpAllowed()) {
      throw new ServiceUnavailableException('OTP sign-in is not available right now');
    }
  }

  private canDeliver(target: OtpTarget): boolean {
    return target.channel === 'mobile' ? this.sms.isConfigured() : this.mail.isConfigured();
  }

  // Both are needed: NODE_ENV=development alone once let any misconfigured server take 000000.
  private devOtpAllowed(): boolean {
    return (
      this.config.get<string>('NODE_ENV') === 'development' &&
      this.config.get<string>('ALLOW_DEV_OTP') === 'true'
    );
  }

  /**
   * Refuses a new code while the previous one for this number is still fresh, and past ten a
   * day. Claiming the slot and counting are atomic steps, so two requests on different
   * instances cannot both send.
   */
  async claimSendSlot(target: OtpTarget): Promise<void> {
    if (
      !(await this.redis.setIfAbsent(this.getCooldownKey(target), '1', RESEND_COOLDOWN_SECONDS))
    ) {
      throw new HttpException(
        `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ponytail: a failed delivery still counts towards the ten; refund it if the gateway's
    // failures ever lock real users out.
    if (
      (await this.redis.increment(this.getDailySendsKey(target), DAY_SECONDS)) > MAX_DAILY_SENDS
    ) {
      throw new HttpException(
        'Too many OTPs requested for this account today. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async send(target: OtpTarget): Promise<void> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;

    await this.redis.setWithExpiry(this.getOtpKey(target), otp, ttlSeconds);
    await this.redis.delete(this.getAttemptsKey(target));

    if (this.canDeliver(target)) {
      try {
        await (target.channel === 'mobile'
          ? this.sms.sendOtp(target.value, otp)
          : this.mail.sendOtp(target.value, otp, Math.round(ttlSeconds / 60)));
      } catch (error) {
        // Nothing was delivered: drop the code and the cooldown so the user can retry at once.
        await this.redis.delete(this.getOtpKey(target));
        await this.redis.delete(this.getCooldownKey(target));
        throw error;
      }
    }

    // Never the code itself (with ALLOW_DEV_OTP in development the fixed OTP 000000 signs in).
    logger.debug(
      {
        channel: target.channel,
        target: target.channel === 'mobile' ? maskPhone(target.value) : target.value,
      },
      'auth_otp_generated',
    );
  }

  async verify(input: { email?: string; mobile?: string; otp: string }): Promise<OtpTarget> {
    const target = this.getTarget(input);

    if (this.devOtpAllowed() && input.otp === DEV_OTP) {
      return target;
    }

    // Checked before the code, so even the right one is refused until the day's window ends.
    const dailyFailures = Number(await this.redis.get(this.getDailyFailuresKey(target)));

    if (dailyFailures >= MAX_DAILY_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Too many wrong codes for this account. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const key = this.getOtpKey(target);
    const storedOtp = await this.redis.get(key);

    if (!storedOtp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (!otpMatches(storedOtp, input.otp)) {
      await this.recordFailedAttempt(target);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Consume exactly once: two requests racing with the same code cannot both sign in.
    if (!(await this.redis.delete(key))) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.delete(this.getAttemptsKey(target));
    await this.redis.delete(this.getDailyFailuresKey(target));

    return target;
  }

  // Counted atomically: guesses spread across instances still burn the code after five misses.
  private async recordFailedAttempt(target: OtpTarget): Promise<void> {
    const attemptsKey = this.getAttemptsKey(target);
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;
    const attempts = await this.redis.increment(attemptsKey, ttlSeconds);
    await this.redis.increment(this.getDailyFailuresKey(target), DAY_SECONDS);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await this.redis.delete(this.getOtpKey(target));
      await this.redis.delete(attemptsKey);
      logger.warn(
        {
          attempts,
          channel: target.channel,
          target: target.channel === 'mobile' ? maskPhone(target.value) : target.value,
        },
        'otp_lockout',
      );
    }
  }

  private getCooldownKey(target: OtpTarget): string {
    return `auth:otp-cooldown:${target.channel}:${target.value}`;
  }

  private getAttemptsKey(target: OtpTarget): string {
    return `auth:otp-attempts:${target.channel}:${target.value}`;
  }

  private getDailyFailuresKey(target: OtpTarget): string {
    return `auth:otp-daily-failures:${target.channel}:${target.value}`;
  }

  private getDailySendsKey(target: OtpTarget): string {
    return `auth:otp-daily-sends:${target.channel}:${target.value}`;
  }

  private getOtpKey(target: OtpTarget): string {
    return `auth:otp:${target.channel}:${target.value}`;
  }
}

function otpMatches(stored: string, supplied: string): boolean {
  const expected = Buffer.from(stored);
  const actual = Buffer.from(supplied);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
