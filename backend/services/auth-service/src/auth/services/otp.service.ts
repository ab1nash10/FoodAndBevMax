import { randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/redis/redis.service';
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

@Injectable()
export class OtpService {
  constructor(
    private readonly config: ConfigService,
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
   * Mobile codes go out by SMS. Without a gateway only development can work, because the code
   * is printed to the log there; anywhere else the request is refused rather than answering
   * "OTP sent" for a code nobody will ever receive. Email has no delivery channel yet.
   */
  assertCanDeliver(target: OtpTarget): void {
    const bySms = target.channel === 'mobile' && this.sms.isConfigured();

    if (!bySms && this.config.get<string>('NODE_ENV') !== 'development') {
      throw new ServiceUnavailableException('OTP sign-in is not available right now');
    }
  }

  /**
   * Refuses a new code while the previous one for this number is still fresh. Claiming the slot
   * is one atomic step, so two requests on different instances cannot both send.
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
  }

  async send(target: OtpTarget): Promise<void> {
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;

    await this.redis.setWithExpiry(this.getOtpKey(target), otp, ttlSeconds);
    await this.redis.delete(this.getAttemptsKey(target));

    if (target.channel === 'mobile' && this.sms.isConfigured()) {
      try {
        await this.sms.sendOtp(target.value, otp);
      } catch (error) {
        // Nothing was delivered: drop the code and the cooldown so the user can retry at once.
        await this.redis.delete(this.getOtpKey(target));
        await this.redis.delete(this.getCooldownKey(target));
        throw error;
      }
    }

    if (this.config.get<string>('NODE_ENV') === 'development') {
      console.info(
        JSON.stringify({
          channel: target.channel,
          event: 'auth_otp_generated',
          otp,
          target: target.value,
        }),
      );
    }
  }

  async verify(input: { email?: string; mobile?: string; otp: string }): Promise<OtpTarget> {
    const target = this.getTarget(input);
    const isDevelopment = this.config.get<string>('NODE_ENV') === 'development';

    if (isDevelopment && input.otp === DEV_OTP) {
      return target;
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

    return target;
  }

  // Counted atomically: guesses spread across instances still burn the code after five misses.
  private async recordFailedAttempt(target: OtpTarget): Promise<void> {
    const attemptsKey = this.getAttemptsKey(target);
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;
    const attempts = await this.redis.increment(attemptsKey, ttlSeconds);

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await this.redis.delete(this.getOtpKey(target));
      await this.redis.delete(attemptsKey);
    }
  }

  private getCooldownKey(target: OtpTarget): string {
    return `auth:otp-cooldown:${target.channel}:${target.value}`;
  }

  private getAttemptsKey(target: OtpTarget): string {
    return `auth:otp-attempts:${target.channel}:${target.value}`;
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
