import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { hashPassword, verifyPassword, type JwtRequestUser } from '@aahar/auth';
import { UserStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { parsePreferences, type UserPreferences } from '../common/preferences';
import { PrismaService } from '../common/prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/** The signed-in user's own preferences and password. Never acts on anyone else's account. */
@Injectable()
export class PreferencesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // The default location is the user's home location (users.hospital_id), the one place every
  // user's starting location is kept; the rest of the preferences live in the JSON column.
  async get(userId: string): Promise<UserPreferences> {
    const user = await this.prisma.user.findFirst({
      select: { hospitalId: true, preferences: true },
      where: { deletedAt: null, id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { ...parsePreferences(user.preferences), defaultLocationId: user.hospitalId };
  }

  /**
   * What the portal needs to place the user: their reach, their default location and the active
   * locations they may pick. Served here, not by GET /hospitals, so it needs no permission:
   * operational roles without HOSPITAL_VIEW still see where they work.
   */
  async access(actor: JwtRequestUser) {
    const [{ defaultLocationId }, locations] = await Promise.all([
      this.get(actor.id),
      this.prisma.hospital.findMany({
        orderBy: [{ displayName: 'asc' }, { hospitalName: 'asc' }],
        select: {
          city: true,
          displayName: true,
          hospitalCode: true,
          hospitalName: true,
          id: true,
          isActive: true,
          postalCode: true,
          state: true,
        },
        where: {
          deletedAt: null,
          isActive: true,
          ...(actor.allowedHospitalIds === null ? {} : { id: { in: actor.allowedHospitalIds } }),
        },
      }),
    ]);

    return {
      defaultLocationId,
      locationScope: actor.locationScope,
      locations: locations.map((location) => ({
        ...location,
        displayName: location.displayName ?? location.hospitalName,
      })),
    };
  }

  async update(actor: JwtRequestUser, dto: UpdatePreferencesDto): Promise<UserPreferences> {
    const current = await this.get(actor.id);

    if (dto.defaultLocationId !== undefined) {
      if (!dto.defaultLocationId) {
        throw new BadRequestException('Choose a location as your default');
      }

      await this.assertLocationAllowed(dto.defaultLocationId, actor);
    }

    const next: UserPreferences = {
      defaultLocationId: dto.defaultLocationId ?? current.defaultLocationId,
      mutedNotificationCategories:
        dto.mutedNotificationCategories === undefined
          ? current.mutedNotificationCategories
          : (dto.mutedNotificationCategories ?? []),
      startPage: dto.startPage === undefined ? current.startPage : dto.startPage,
      theme: dto.theme === undefined ? current.theme : dto.theme,
    };
    const { defaultLocationId, ...stored } = next;

    await this.prisma.user.update({
      data: {
        ...(dto.defaultLocationId ? { hospitalId: defaultLocationId } : {}),
        preferences: stored,
        updatedBy: actor.id,
      },
      where: { id: actor.id },
    });

    return next;
  }

  async changePassword(
    actor: JwtRequestUser,
    dto: ChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ changed: true }> {
    const user = await this.prisma.user.findFirst({
      select: { passwordHash: true },
      where: { deletedAt: null, id: actor.id, status: UserStatus.ACTIVE },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 400, never 401: the portal treats every 401 as an expired session and signs the user out.
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Your account has no password yet. Ask an administrator to set one.',
      );
    }

    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Choose a password different from the current one');
    }

    // Hashed before the transaction, so the connection is not held through the scrypt work.
    const passwordHash = await hashPassword(dto.newPassword);

    // A new password ends every session the user has open, this one included, as it does when
    // an administrator sets it: their tokens carry the old session version, which the auth layer
    // then refuses, so each device signs in again with the new password.
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        data: { passwordHash, sessionVersion: { increment: 1 }, updatedBy: actor.id },
        where: { id: actor.id },
      });
      await this.auditLog.record(
        {
          action: 'USER_PASSWORD_CHANGE',
          actorId: actor.id,
          entityId: actor.id,
          entityName: 'users',
          ipAddress,
        },
        tx,
      );
    });

    return { changed: true };
  }

  /** The same reach as the header's location selector: only locations the user can work in. */
  private async assertLocationAllowed(locationId: string, actor: JwtRequestUser): Promise<void> {
    if (actor.allowedHospitalIds !== null && !actor.allowedHospitalIds.includes(locationId)) {
      throw new BadRequestException('That location is outside your assigned access');
    }

    const exists = await this.prisma.hospital.count({
      where: { deletedAt: null, id: locationId },
    });

    if (!exists) {
      throw new BadRequestException('Location not found');
    }
  }
}
