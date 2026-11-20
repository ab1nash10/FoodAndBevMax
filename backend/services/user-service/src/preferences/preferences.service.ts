import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { JwtRequestUser } from '@aahar/auth';
import { AuditLogService } from '../common/audit/audit-log.service';
import { parsePreferences, type UserPreferences } from '../common/preferences';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/** The signed-in user's own preferences. Never acts on anyone else's account. */
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

    return {
      ...parsePreferences(user.preferences),
      defaultLocationId: user.hospitalId,
    };
  }

  /**
   * What the portal needs to place the user: their reach, their default location and the active
   * locations they may pick. Served here, not by GET /hospitals, so it needs no permission:
   * operational roles without HOSPITAL_VIEW still see where they work.
   */
  async access(actor: JwtRequestUser) {
    const [user, locations] = await Promise.all([
      this.prisma.user.findFirst({
        select: { employeeCode: true, hospitalId: true },
        where: { deletedAt: null, id: actor.id },
      }),
      this.prisma.hospital.findMany({
        select: {
          city: true,
          displayName: true,
          hospitalCode: true,
          hospitalName: true,
          id: true,
          isActive: true,
          legalEntity: { select: { locationName: true } },
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      defaultLocationId: user.hospitalId,
      // Shown under Preferences → My details; the access token does not carry it.
      employeeCode: user.employeeCode,
      locationScope: actor.locationScope,
      // Titled as the Locations list titles them (the entity's Location, else the location's own
      // name), so renaming one there renames it in the header too.
      locations: locations
        .map(({ legalEntity, ...location }) => ({
          ...location,
          displayName: location.displayName ?? location.hospitalName,
          title: legalEntity?.locationName ?? location.hospitalName,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
      // As resolved for this request (not the token's copy): the portal's own server routes,
      // such as the image upload, check them here.
      permissions: actor.permissions,
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

    await this.auditLog.record({
      action: 'UPDATE',
      actorId: actor.id,
      entityId: actor.id,
      entityName: 'user_preferences',
      newValue: next,
      oldValue: current,
    });

    return next;
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
