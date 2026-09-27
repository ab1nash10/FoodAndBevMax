import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { hashPassword, verifyPassword } from '@aahar/auth';
import { UserStatus } from '@prisma/client';
import { AuthAuditLogService } from '../common/audit/auth-audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AuthContext, AuthTokens } from './auth.types';
import { LogoutDto } from './dto/logout.dto';
import { EmailPasswordLoginDto } from './dto/email-password-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpService } from './services/otp.service';
import { TokenService } from './services/token.service';

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

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = hashPassword(randomUUID());

  constructor(
    private readonly auditLog: AuthAuditLogService,
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    const target = this.otp.getTarget(dto);

    this.otp.assertCanDeliver(target);

    // Sign-in is only for accounts created in the portal: a number or email that does not
    // belong to an active user is refused here, before any SMS is sent, and verify-otp checks
    // the same again. ponytail: this tells a caller which numbers are registered - accepted for
    // an internal staff portal; the IP throttle and the per-number cooldown bound the probing.
    const user = await this.findLoginUser(target).catch(() => null);

    if (!user) {
      throw new NotFoundException(
        target.channel === 'mobile'
          ? 'This mobile number is not registered. Please contact your administrator.'
          : 'This email is not registered. Please contact your administrator.',
      );
    }

    await this.otp.claimSendSlot(target);
    await this.otp.send(target);

    return {
      channel: target.channel,
    };
  }

  async verifyOtp(dto: VerifyOtpDto, context: AuthContext): Promise<AuthTokens> {
    const target = await this.otp.verify(dto);
    const user = await this.findLoginUser(target);
    const tokens = await this.tokens.issueTokens(this.toTokenUser(user));

    await this.auditLog.record({
      action: 'AUTH_LOGIN',
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
    // Passwords are an email-only credential; a mobile number always signs in through OTP.
    const user = await this.findLoginUser({
      channel: 'email',
      value: dto.email.toLowerCase(),
    }).catch(() => null);

    // Always pay for one scrypt, so an unknown email is not answered measurably faster than a
    // wrong password; otherwise response time alone enumerates registered addresses.
    const passwordMatches = await verifyPassword(
      dto.password,
      user?.passwordHash ?? (await this.dummyPasswordHash),
    );

    if (!user?.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.tokens.issueTokens(this.toTokenUser(user));

    await this.auditLog.record({
      action: 'AUTH_LOGIN',
      entityId: user.id,
      ipAddress: context.ipAddress,
      newValue: { channel: 'email-password' },
      userId: user.id,
    });

    return tokens;
  }

  async refresh(dto: RefreshTokenDto, context: AuthContext): Promise<AuthTokens> {
    const payload = await this.tokens.verifyRefreshToken(dto.refreshToken);
    const user = await this.findUserById(payload.sub);

    // ponytail: not an atomic spend. Several portal tabs waking together all refresh with the
    // same token, and each tab clears the shared session on a 401, so failing all but one would
    // sign every tab out. Make this atomic only once the portal serialises refresh across tabs.
    await this.tokens.revokeRefreshToken(payload.jti);

    const tokens = await this.tokens.issueTokens(this.toTokenUser(user));

    await this.auditLog.record({
      action: 'AUTH_REFRESH',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userId: user.id,
    });

    return tokens;
  }

  async logout(dto: LogoutDto, context: AuthContext) {
    const payload = await this.tokens.verifyRefreshToken(dto.refreshToken);

    await this.tokens.revokeRefreshToken(payload.jti);
    await this.auditLog.record({
      action: 'AUTH_LOGOUT',
      entityId: payload.sub,
      ipAddress: context.ipAddress,
      userId: payload.sub,
    });

    return {
      loggedOut: true,
    };
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
      permissions,
      roles,
    };
  }
}
