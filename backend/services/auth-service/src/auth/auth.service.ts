import { randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword, isSessionCurrent, verifyPassword } from '@aahar/auth';
import { getRequestContext, logger, maskPhone, NO_ENTITY_ID } from '@aahar/logging';
import { UserStatus } from '@prisma/client';
import { AuthAuditLogService } from '../common/audit/auth-audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import type { AuthContext, AuthTokens } from './auth.types';
import { LogoutDto } from './dto/logout.dto';
import { EmailPasswordLoginDto } from './dto/email-password-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpService } from './services/otp.service';
import { RefreshTokenReusedError, TokenService } from './services/token.service';

// Ten wrong passwords for one email within 15 minutes lock its password sign-in for 15 minutes;
// thirty from one address within 10 minutes (one guess at many accounts) lock that address for
// 10. Code (OTP) sign-in stays open throughout.
const PASSWORD_FAILURES_PER_ACCOUNT = { max: 10, seconds: 15 * 60 };
const PASSWORD_FAILURES_PER_ADDRESS = { max: 30, seconds: 10 * 60 };
// However often it is refreshed, a session ends 30 days after its sign-in.
const MAX_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

const authUserInclude = {
  permissionOverrides: {
    include: {
      permission: true,
    },
    where: {
      deletedAt: null,
    },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
            where: {
              deletedAt: null,
            },
          },
        },
      },
    },
    where: {
      deletedAt: null,
      role: { deletedAt: null },
    },
  },
} as const;

/** Who a sign-in attempt was for: an email as typed, a phone as its last four digits. */
function shownTarget(target: { channel: 'email' | 'mobile'; value: string }): string {
  return target.channel === 'mobile' ? maskPhone(target.value) : target.value;
}

/** A short machine reason from the refusal, never its free text. */
function failureReason(error: unknown): string {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 429) return 'cooldown';
    if (status === 401) return 'invalid_or_expired';
    if (status === 404) return 'not_registered';
    if (status === 503) return 'delivery_failed';
    return `http_${status}`;
  }
  return 'error';
}

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = hashPassword(randomUUID());

  constructor(
    private readonly auditLog: AuthAuditLogService,
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    const target = this.otp.getTarget(dto);

    this.otp.assertCanDeliver(target);

    // Sign-in is only for accounts created in the portal: a number or email that does not
    // belong to an active user is refused here, before any SMS is sent, and verify-otp checks
    // the same again. ponytail: this tells a caller which numbers are registered - accepted for
    // an internal staff portal; the IP throttle and the per-number cooldown bound the probing.
    const user = await this.findLoginUserOrNull(target);

    if (!user) {
      this.recordFailure('OTP_FAILED', target, 'not_registered');
      throw new NotFoundException(
        target.channel === 'mobile'
          ? 'This mobile number is not registered. Please contact your IT team for access rights.'
          : 'This email is not registered. Please contact your IT team for access rights.',
      );
    }

    try {
      await this.otp.claimSendSlot(target);
      await this.otp.send(target);
    } catch (error) {
      this.recordFailure('OTP_FAILED', target, failureReason(error), user.id);
      throw error;
    }

    await this.auditLog.record({
      action: 'OTP_SENT',
      entityId: user.id,
      entityName: 'users',
      newValue: { channel: target.channel, target: shownTarget(target) },
      userId: user.id,
    });

    return {
      channel: target.channel,
    };
  }

  async verifyOtp(dto: VerifyOtpDto, context: AuthContext): Promise<AuthTokens> {
    const target = this.otp.getTarget(dto);
    let user: Awaited<ReturnType<AuthService['findLoginUser']>>;

    try {
      await this.otp.verify(dto);
      user = await this.findLoginUser(target);
    } catch (error) {
      this.recordFailure('LOGIN_FAILED', target, failureReason(error));
      throw error;
    }

    const tokens = await this.startSession(user);

    await this.auditLog.record({
      action: 'LOGIN_SUCCESS',
      entityId: user.id,
      ipAddress: context.ipAddress,
      newValue: {
        channel: target.channel,
      },
      userId: user.id,
    });

    return tokens;
  }

  /**
   * Email and password sign-in, verified against the password stored on the user record.
   *
   * The seed gives the Super Admin its first password from ADMIN_PASSWORD (prisma/seed.ts),
   * hashed into the user record like any other; `pnpm admin:password` replaces it.
   */
  async loginWithPassword(dto: EmailPasswordLoginDto, context: AuthContext): Promise<AuthTokens> {
    const target = { channel: 'email', value: dto.email.toLowerCase() } as const;
    // Counted per email typed, registered or not, so a lock tells a caller nothing about who exists.
    const failureCounters = [
      { key: `auth:password-failures:${target.value}`, ...PASSWORD_FAILURES_PER_ACCOUNT },
      ...(context.ipAddress
        ? [
            {
              key: `auth:password-failures-ip:${context.ipAddress}`,
              ...PASSWORD_FAILURES_PER_ADDRESS,
            },
          ]
        : []),
    ];
    const failures = await Promise.all(failureCounters.map(({ key }) => this.redis.get(key)));

    if (failureCounters.some(({ max }, index) => Number(failures[index]) >= max)) {
      this.recordFailure('LOGIN_FAILED', target, 'locked');
      throw new HttpException(
        'Too many failed sign-in attempts. Please try again later, or sign in with a code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Passwords are an email-only credential; a mobile number always signs in through OTP.
    const user = await this.findLoginUserOrNull(target);

    // Always pay for one scrypt, so an unknown email is not answered measurably faster than a
    // wrong password; otherwise response time alone enumerates registered addresses.
    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.dummyPasswordHash),
    );

    if (!user?.passwordHash || !passwordMatches) {
      // Atomic counts; the failure that reaches a limit restarts its window, so the lock runs
      // its full length from there.
      await Promise.all(
        failureCounters.map(async ({ key, max, seconds }) => {
          if ((await this.redis.increment(key, seconds)) === max) {
            await this.redis.setWithExpiry(key, String(max), seconds);
          }
        }),
      );
      this.recordFailure('LOGIN_FAILED', target, 'invalid_credentials', user?.id);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Only the account's own count: one right password must not wipe an address's spraying.
    await this.redis.delete(failureCounters[0]!.key);

    const tokens = await this.startSession(user);

    await this.auditLog.record({
      action: 'LOGIN_SUCCESS',
      entityId: user.id,
      ipAddress: context.ipAddress,
      newValue: { channel: 'email-password' },
      userId: user.id,
    });

    return tokens;
  }

  async refresh(dto: RefreshTokenDto, context: AuthContext): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(dto.refreshToken, context);
    const user = await this.findUserById(payload.sub);

    // An admin changed this user after sign-in: end the session instead of renewing it.
    if (!isSessionCurrent(payload.sv, user.sessionVersion)) {
      await this.tokens.revokeRefreshToken(payload.jti);
      await this.auditLog.record({
        action: 'SESSION_REVOKED',
        entityId: user.id,
        ipAddress: context.ipAddress,
        newValue: { reason: 'signed_in_elsewhere_or_account_changed' },
        userId: user.id,
      });
      throw new UnauthorizedException('Your account was updated. Please sign in again.');
    }

    const authTime = payload.authTime ?? payload.iat;

    if (authTime !== undefined && Date.now() / 1000 - authTime > MAX_SESSION_AGE_SECONDS) {
      await this.tokens.revokeRefreshToken(payload.jti);
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // ponytail: not an atomic spend. Several portal tabs waking together all refresh with the
    // same token; a spent token is only called reuse after a minute's grace (TokenService).
    // Make this atomic only once the portal serialises refresh across tabs.
    await this.tokens.spendRefreshToken(payload);

    const tokens = await this.tokens.issueTokens(this.toTokenUser(user), authTime);

    await this.auditLog.record({
      action: 'SESSION_REFRESHED',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userId: user.id,
    });

    return tokens;
  }

  async logout(dto: LogoutDto, context: AuthContext) {
    const payload = await this.verifyRefreshToken(dto.refreshToken, context);

    await this.tokens.revokeRefreshToken(payload.jti);
    await this.endEverySession(payload.sub);
    await this.auditLog.record({
      action: 'LOGOUT',
      entityId: payload.sub,
      ipAddress: context.ipAddress,
      userId: payload.sub,
    });

    return {
      loggedOut: true,
    };
  }

  /**
   * A replaced refresh token presented again means a copy is loose: every session the user has
   * ends, so whoever holds it - the thief or the user - must sign in again.
   */
  private async verifyRefreshToken(refreshToken: string, context: AuthContext) {
    try {
      return await this.tokens.verifyRefreshToken(refreshToken);
    } catch (error) {
      if (error instanceof RefreshTokenReusedError) {
        await this.endEverySession(error.userId);
        await this.auditLog.record({
          action: 'SESSION_REVOKED',
          entityId: error.userId,
          ipAddress: context.ipAddress,
          newValue: { reason: 'refresh_token_reused' },
          userId: error.userId,
        });
      }

      throw error;
    }
  }

  /**
   * Signing out (or a reused refresh token) ends every session the user has, on every device:
   * the new session version makes the auth layer refuse their access and refresh tokens at
   * once. Signed out, an admin may also change their credentials straight away. Raw SQL keeps
   * updated_at as it is.
   */
  private async endEverySession(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE users SET last_active_at = NULL, session_version = session_version + 1
      WHERE id = ${userId}::uuid`;
  }

  /**
   * A refused OTP or sign-in: a warning line (what CloudWatch counts per IP) and an audit row.
   * Never the code or password; a phone shows its last four digits only.
   */
  private recordFailure(
    action: 'LOGIN_FAILED' | 'OTP_FAILED',
    target: { channel: 'email' | 'mobile'; value: string },
    reason: string,
    userId?: string,
  ): void {
    const details = { channel: target.channel, reason, target: shownTarget(target) };

    // The address goes on the line so CloudWatch can count failures per IP; the row has its own column.
    logger.warn(
      { ...details, ip: getRequestContext()?.ip },
      action === 'LOGIN_FAILED' ? 'login_failed' : 'otp_failed',
    );
    void this.auditLog.record({
      action,
      entityId: userId ?? NO_ENTITY_ID,
      entityName: 'users',
      newValue: details,
      summary: `${action === 'LOGIN_FAILED' ? 'Sign-in' : 'OTP'} refused for ${details.target}: ${reason}`,
      userId,
    });
  }

  /**
   * One browser at a time: a sign-in moves the session version on, so the tokens of any earlier
   * sign-in are refused from then on and that browser is sent back to the login page. Raw SQL
   * keeps updated_at as it is.
   */
  private async startSession(user: Awaited<ReturnType<AuthService['findUserById']>>) {
    const [session] = await this.prisma.$queryRaw<Array<{ sessionVersion: number }>>`
      UPDATE users SET session_version = session_version + 1
      WHERE id = ${user.id}::uuid
      RETURNING session_version AS "sessionVersion"`;

    if (!session) {
      throw new UnauthorizedException('User is not registered or active');
    }

    return this.tokens.issueTokens({
      ...this.toTokenUser(user),
      sessionVersion: session.sessionVersion,
    });
  }

  private async findLoginUser(target: { channel: 'email' | 'mobile'; value: string }) {
    const user = await this.prisma.user.findFirst({
      include: authUserInclude,
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        ...(target.channel === 'mobile'
          ? {
              mobile: target.value,
            }
          : {
              email: target.value,
            }),
      },
    });

    if (!user) {
      throw new UnauthorizedException('User is not registered or active');
    }

    return user;
  }

  /**
   * Null only when no such user exists: a database outage must surface as one (503), not tell
   * a registered user to go to IT or that their password is wrong.
   */
  private findLoginUserOrNull(target: { channel: 'email' | 'mobile'; value: string }) {
    return this.findLoginUser(target).catch((error: unknown) => {
      if (error instanceof UnauthorizedException) {
        return null;
      }

      throw error;
    });
  }

  private async findUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      include: authUserInclude,
      where: {
        deletedAt: null,
        id,
        status: UserStatus.ACTIVE,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User is not registered or active');
    }

    return user;
  }

  private toTokenUser(user: Awaited<ReturnType<AuthService['findUserById']>>) {
    const roles = user.roles.map((userRole) => userRole.role.name);
    const permissionCodes = new Set(
      user.roles.flatMap((userRole) =>
        userRole.role.permissions
          .filter((rolePermission) => rolePermission.permission.deletedAt === null)
          .map((rolePermission) => rolePermission.permission.code),
      ),
    );
    user.permissionOverrides.forEach(({ granted, permission }) => {
      if (permission.deletedAt !== null) return;
      if (granted) permissionCodes.add(permission.code);
      else permissionCodes.delete(permission.code);
    });
    const permissions = [...permissionCodes];

    return {
      email: user.email,
      id: user.id,
      mobile: user.mobile,
      name: user.name,
      permissions,
      roles,
      sessionVersion: user.sessionVersion,
    };
  }
}
