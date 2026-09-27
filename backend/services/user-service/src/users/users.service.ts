import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationPublisher, hashPassword, type JwtRequestUser } from '@aahar/auth';
import { LocationScope, Prisma, RecordStatus, Role, UserStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  SUPER_ADMIN_ROLE,
  assertSuperAdminActor,
  assertSuperAdminRemains,
  holdsSuperAdminRole,
  isSuperAdminRole,
} from '../common/super-admin';
import {
  assertCanGrantScope,
  assertHoldsPermissions,
  assertHospitalsWithinReach,
  assertNotSelf,
  assertUserWithinReach,
  hospitalIdsOf,
  sameIds,
  userReachWhere,
} from '../common/actor-scope';
import { diffPermissionOverrides } from '../common/permission-overrides';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignUserLocationsDto } from './dto/assign-user-locations.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceUserPermissionsDto } from './dto/replace-user-permissions.dto';

const userInclude = {
  assignedHospitals: {
    include: { hospital: { select: { hospitalName: true, id: true } } },
    where: { deletedAt: null },
  },
  roles: {
    include: {
      role: true,
    },
    where: {
      deletedAt: null,
      role: { deletedAt: null },
    },
  },
} satisfies Prisma.UserInclude;

type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

// Arbitrary constant naming the "last Super Admin" advisory lock.
const SUPER_ADMIN_LOCK_KEY = 7_201_001;

interface ActorContext {
  actor?: JwtRequestUser;
  actorId?: string;
  actorRoles?: string[];
  ipAddress?: string;
}

function toUserResponse(user: UserWithRoles) {
  return {
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
    designation: user.designation,
    email: user.email,
    employeeCode: user.employeeCode,
    id: user.id,
    mobile: user.mobile,
    name: user.name,
    hospitals: user.assignedHospitals.map(({ hospital }) => ({
      id: hospital.id,
      name: hospital.hospitalName,
    })),
    locationScope: user.roles[0]?.role.locationScope ?? null,
    roles: user.roles.map((userRole) => ({
      description: userRole.role.description,
      id: userRole.role.id,
      locationScope: userRole.role.locationScope,
      name: userRole.role.name,
      status: userRole.role.status,
    })),
    status: user.status,
    updatedAt: user.updatedAt,
  };
}

function toUserSnapshot(user: UserWithRoles) {
  return toUserResponse(user);
}

@Injectable()
export class UsersService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationPublisher,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Access now resolves from the database on every request, so a change lands immediately.
   * Telling the affected user is what stops that feeling like an unexplained failure.
   */
  private async notifyAccessChanged(
    userId: string,
    title: string,
    body: string,
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.notifications.publish(
      {
        actorId: context.actorId,
        body,
        category: 'ACCESS',
        entityId: userId,
        entityName: 'users',
        link: '/dashboard',
        title,
        userIds: [userId],
      },
      tx,
    );
  }

  async list(query: ListUsersQueryDto, context: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      AND: [userReachWhere(context.actor)],
      deletedAt: null,
      ...(query.roleId
        ? {
            roles: {
              some: {
                deletedAt: null,
                roleId: query.roleId,
              },
            },
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { mobile: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        include: userInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map(toUserResponse),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string, context: ActorContext) {
    const user = await this.findActiveUser(id, this.prisma, context);

    return toUserResponse(user);
  }

  async create(dto: CreateUserDto, context: ActorContext) {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const role = await this.findActiveRole(dto.roleId, tx, context, true);
        const user = await tx.user.create({
          data: {
            avatarUrl: dto.avatarUrl,
            createdBy: context.actorId,
            designation: dto.designation,
            email: dto.email.toLowerCase(),
            employeeCode: dto.employeeCode,
            mobile: dto.mobile,
            name: dto.name,
            passwordHash: await hashPassword(dto.password),
            status: dto.status ?? UserStatus.ACTIVE,
            updatedBy: context.actorId,
          },
          // Only the id is used; the roles are read back after the role is assigned.
          select: { id: true },
        });

        await this.assignUserRole(user.id, role.id, context, tx);
        await this.replaceUserHospitals(user.id, role, dto.hospitalIds, context, tx);

        const userWithRole = await tx.user.findFirstOrThrow({
          include: userInclude,
          where: {
            deletedAt: null,
            id: user.id,
          },
        });

        await this.auditLog.record(
          {
            action: 'USER_CREATE',
            actorId: context.actorId,
            entityId: user.id,
            entityName: 'users',
            ipAddress: context.ipAddress,
            newValue: {
              ...toUserSnapshot(userWithRole),
              hospitalIds: dto.hospitalIds,
            },
          },
          tx,
        );

        return userWithRole;
      });

      return toUserResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'User');
    }
  }

  async update(id: string, dto: UpdateUserDto, context: ActorContext) {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await this.findActiveUser(id, tx, context);

        this.assertCanManageUser(existing, context);

        // The portal sends role, locations and status on every save, so only a real change counts.
        const roleChanged = dto.roleId !== undefined && dto.roleId !== existing.roles[0]?.role.id;
        const hospitalsChanged =
          dto.hospitalIds !== undefined && !sameIds(dto.hospitalIds, hospitalIdsOf(existing));
        const statusChanged = dto.status !== undefined && dto.status !== existing.status;

        if (roleChanged || hospitalsChanged || statusChanged) {
          assertNotSelf(id, context.actor, 'role, locations or status');
        }

        const data: Prisma.UserUpdateInput = {};

        if (dto.avatarUrl !== undefined) {
          data.avatarUrl = dto.avatarUrl;
        }

        if (dto.designation !== undefined) {
          data.designation = dto.designation;
        }

        if (dto.email !== undefined) {
          data.email = dto.email.toLowerCase();
        }

        if (dto.mobile !== undefined) {
          data.mobile = dto.mobile;
        }

        if (dto.name !== undefined) {
          data.name = dto.name;
        }

        if (dto.password !== undefined) {
          data.passwordHash = await hashPassword(dto.password);
        }

        if (dto.status !== undefined) {
          data.status = dto.status;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const user = Object.keys(data).length
          ? await tx.user.update({
              data,
              include: userInclude,
              where: {
                id,
              },
            })
          : existing;

        if (dto.roleId !== undefined) {
          const role = await this.findActiveRole(dto.roleId, tx, context, roleChanged);
          await this.replaceUserRole(id, role.id, context, tx);
          await this.replaceUserHospitals(id, role, dto.hospitalIds, context, tx);
        } else if (dto.hospitalIds !== undefined) {
          // Locations changed on their own, so validate against the role the user already holds.
          const currentRole = existing.roles[0]?.role;

          if (!currentRole) {
            throw new BadRequestException('Assign a role before assigning locations');
          }

          await this.replaceUserHospitals(id, currentRole, dto.hospitalIds, context, tx);
        }

        const userWithRoles = await tx.user.findFirstOrThrow({
          include: userInclude,
          where: {
            deletedAt: null,
            id: user.id,
          },
        });

        await this.auditLog.record(
          {
            action: 'USER_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'users',
            ipAddress: context.ipAddress,
            newValue: {
              ...toUserSnapshot(userWithRoles),
              hospitalIds: dto.hospitalIds,
            },
            oldValue: toUserSnapshot(existing),
          },
          tx,
        );

        if (holdsSuperAdminRole(existing.roles)) {
          await this.assertSuperAdminRemains(tx);
        }

        return userWithRoles;
      });

      return toUserResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'User');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveUser(id, this.prisma, context);

    this.assertCanManageUser(existing, context);
    assertNotSelf(id, context.actor, 'account');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        data: {
          deletedAt: new Date(),
          status: UserStatus.DISABLED,
          updatedBy: context.actorId,
        },
        where: {
          id,
        },
      });
      await tx.userRole.updateMany({
        data: {
          deletedAt: new Date(),
          updatedBy: context.actorId,
        },
        where: {
          deletedAt: null,
          userId: id,
        },
      });
      await this.auditLog.record(
        {
          action: 'USER_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'users',
          ipAddress: context.ipAddress,
          oldValue: toUserSnapshot(existing),
        },
        tx,
      );

      if (holdsSuperAdminRole(existing.roles)) {
        await this.assertSuperAdminRemains(tx);
      }
    });

    return {
      id,
    };
  }

  async assignRole(id: string, dto: AssignRoleDto, context: ActorContext) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findActiveUser(id, tx, context);

      this.assertCanManageUser(existing, context);
      assertNotSelf(id, context.actor, 'role');

      const role = await this.findActiveRole(dto.roleId, tx, context, true);

      await this.replaceUserRole(id, role.id, context, tx);
      // Keep the user's locations but hold them to the new role's scope rules, as a role change
      // through PUT /users/:id does; before, this path left a SINGLE role holding many locations.
      const homeFirst = [
        ...(existing.hospitalId ? [existing.hospitalId] : []),
        ...hospitalIdsOf(existing).filter((hospitalId) => hospitalId !== existing.hospitalId),
      ];
      await this.replaceUserHospitals(id, role, homeFirst, context, tx);

      const userWithRoles = await tx.user.findFirstOrThrow({
        include: userInclude,
        where: {
          deletedAt: null,
          id,
        },
      });

      await this.auditLog.record(
        {
          action: 'USER_ROLE_ASSIGN',
          actorId: context.actorId,
          entityId: id,
          entityName: 'user_roles',
          ipAddress: context.ipAddress,
          newValue: {
            roleId: role.id,
            roleName: role.name,
          },
          oldValue: {
            roles: existing.roles.map((userRole) => userRole.role.name),
          },
        },
        tx,
      );

      await this.notifyAccessChanged(
        id,
        'Your role was changed',
        `You are now assigned the ${role.name} role. Your access has been updated.`,
        context,
        tx,
      );

      if (holdsSuperAdminRole(existing.roles)) {
        await this.assertSuperAdminRemains(tx);
      }

      return userWithRoles;
    });

    return toUserResponse(updated);
  }

  /**
   * Replaces the assigned locations for several users at once.
   *
   * Runs as one transaction: every user is validated against their own role's scope first, so a
   * batch containing a single-location user and two locations fails as a whole rather than
   * leaving half the users reassigned.
   */
  async assignLocations(dto: AssignUserLocationsDto, context: ActorContext) {
    const userIds = [...new Set(dto.userIds)];

    return this.prisma.$transaction(async (tx) => {
      const updated: Array<{ id: string; name: string }> = [];

      for (const userId of userIds) {
        const user = await this.findActiveUser(userId, tx, context);

        this.assertCanManageUser(user, context);
        assertNotSelf(userId, context.actor, 'locations');

        const role = user.roles[0]?.role;

        if (!role) {
          throw new BadRequestException(
            `${user.name} has no role, so locations cannot be assigned`,
          );
        }

        await this.replaceUserHospitals(userId, role, dto.hospitalIds, context, tx);

        await this.auditLog.record(
          {
            action: 'USER_LOCATION_ASSIGN',
            actorId: context.actorId,
            entityId: userId,
            entityName: 'user_hospitals',
            ipAddress: context.ipAddress,
            newValue: { hospitalIds: dto.hospitalIds },
          },
          tx,
        );

        await this.notifyAccessChanged(
          userId,
          'Your locations were updated',
          `You are now assigned to ${dto.hospitalIds.length} location(s).`,
          context,
          tx,
        );

        updated.push({ id: user.id, name: user.name });
      }

      return { updated, updatedCount: updated.length };
    });
  }

  async getPermissions(id: string, context: ActorContext) {
    await this.findActiveUser(id, this.prisma, context);

    return this.getPermissionsForUser(id, this.prisma);
  }

  async replacePermissions(id: string, dto: ReplaceUserPermissionsDto, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.findActiveUser(id, tx, context);

      this.assertCanManageUser(user, context);
      assertNotSelf(id, context.actor, 'permissions');

      await this.assertPermissionsExist(dto.permissionIds, tx);
      const inheritedPermissionIds = await this.getRolePermissionIds(user, tx);
      const currentOverrides = await tx.userPermission.findMany({
        where: { deletedAt: null, userId: id },
      });
      const currentEffective = this.getEffectivePermissionIds(
        inheritedPermissionIds,
        currentOverrides,
      );
      // Only what this save adds must be held by the actor; re-sending what the user already has,
      // or removing something, is not a grant.
      const addedIds = dto.permissionIds.filter(
        (permissionId) => !currentEffective.has(permissionId),
      );

      if (addedIds.length) {
        const added = await tx.permission.findMany({
          select: { code: true },
          where: { id: { in: addedIds } },
        });
        assertHoldsPermissions(
          added.map(({ code }) => code),
          context.actor,
        );
      }
      const { grants, revokes } = diffPermissionOverrides(
        dto.permissionIds,
        inheritedPermissionIds,
      );

      await tx.userPermission.updateMany({
        data: { deletedAt: new Date(), updatedBy: context.actorId },
        where: { deletedAt: null, userId: id },
      });

      await this.writeOverrides(id, grants, true, context, tx);
      await this.writeOverrides(id, revokes, false, context, tx);

      await this.auditLog.record(
        {
          action: 'USER_PERMISSION_ASSIGN',
          actorId: context.actorId,
          entityId: id,
          entityName: 'user_permissions',
          ipAddress: context.ipAddress,
          newValue: { permissionIds: dto.permissionIds },
        },
        tx,
      );

      await this.notifyAccessChanged(
        id,
        'Your permissions were updated',
        `${grants.length} permission(s) granted and ${revokes.length} revoked beyond your role.`,
        context,
        tx,
      );

      return this.getPermissionsForUser(id, tx);
    });
  }

  /** Revives the override rows that already exist, then inserts the rest. Two bulk statements. */
  private async writeOverrides(
    userId: string,
    permissionIds: string[],
    granted: boolean,
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!permissionIds.length) {
      return;
    }

    await tx.userPermission.updateMany({
      data: { deletedAt: null, granted, updatedBy: context.actorId },
      where: { permissionId: { in: permissionIds }, userId },
    });
    await tx.userPermission.createMany({
      data: permissionIds.map((permissionId) => ({
        createdBy: context.actorId,
        granted,
        permissionId,
        updatedBy: context.actorId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  private async getPermissionsForUser(
    id: string,
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const user = await this.findActiveUser(id, client);
    const [permissions, overrides, inheritedPermissionIds] = await Promise.all([
      client.permission.findMany({
        orderBy: [{ module: 'asc' }, { action: 'asc' }, { code: 'asc' }],
        where: { deletedAt: null },
      }),
      client.userPermission.findMany({ where: { deletedAt: null, userId: id } }),
      this.getRolePermissionIds(user, client),
    ]);
    const effectivePermissionIds = this.getEffectivePermissionIds(
      inheritedPermissionIds,
      overrides,
    );

    return {
      effectivePermissionIds: [...effectivePermissionIds],
      permissions: permissions.map((permission) => ({
        action: permission.action,
        code: permission.code,
        description: permission.description,
        id: permission.id,
        module: permission.module,
      })),
    };
  }

  private getEffectivePermissionIds(
    inheritedPermissionIds: Set<string>,
    overrides: Array<{ granted: boolean; permissionId: string }>,
  ) {
    const effectivePermissionIds = new Set(inheritedPermissionIds);
    overrides.forEach(({ granted, permissionId }) => {
      if (granted) effectivePermissionIds.add(permissionId);
      else effectivePermissionIds.delete(permissionId);
    });
    return effectivePermissionIds;
  }

  private async getRolePermissionIds(
    user: UserWithRoles,
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const roleIds = user.roles.map((userRole) => userRole.role.id);
    if (!roleIds.length) return new Set<string>();
    const rolePermissions = await client.rolePermission.findMany({
      select: { permissionId: true },
      where: { deletedAt: null, permission: { deletedAt: null }, roleId: { in: roleIds } },
    });
    return new Set(rolePermissions.map(({ permissionId }) => permissionId));
  }

  private async assertPermissionsExist(
    permissionIds: string[],
    client: Prisma.TransactionClient | PrismaService,
  ) {
    const count = await client.permission.count({
      where: { deletedAt: null, id: { in: permissionIds } },
    });
    if (count !== permissionIds.length)
      throw new BadRequestException('One or more permissions were not found');
  }

  private async assignUserRole(
    userId: string,
    roleId: string,
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.userRole.upsert({
      create: {
        createdBy: context.actorId,
        roleId,
        updatedBy: context.actorId,
        userId,
      },
      update: {
        deletedAt: null,
        updatedBy: context.actorId,
      },
      where: {
        userId_roleId: {
          roleId,
          userId,
        },
      },
    });
  }

  private async replaceUserRole(
    userId: string,
    roleId: string,
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.userRole.updateMany({
      data: {
        deletedAt: new Date(),
        updatedBy: context.actorId,
      },
      where: {
        deletedAt: null,
        userId,
      },
    });
    await this.assignUserRole(userId, roleId, context, tx);
  }

  /**
   * With a context, a user outside the actor's hospitals reads as not found; changing one also
   * needs every hospital the user works at to be the actor's (assertCanManageUser).
   */
  private async findActiveUser(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
    context?: ActorContext,
  ): Promise<UserWithRoles> {
    const user = await client.user.findFirst({
      include: userInclude,
      where: {
        ...(context ? userReachWhere(context.actor) : {}),
        deletedAt: null,
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * `granting` is false when a save only re-sends the role the user already holds, so an existing
   * assignment keeps saving even where the actor could not grant that role afresh.
   */
  private async findActiveRole(
    id: string,
    client: Prisma.TransactionClient | PrismaService,
    context: ActorContext,
    granting: boolean,
  ): Promise<Role> {
    const role = await client.role.findFirst({
      include: {
        permissions: {
          include: { permission: { select: { code: true } } },
          where: { deletedAt: null, permission: { deletedAt: null } },
        },
      },
      where: {
        deletedAt: null,
        id,
      },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    // Every path that grants a role to a user comes through here.
    if (isSuperAdminRole(role)) {
      assertSuperAdminActor(context.actorRoles);
    }

    if (granting) {
      if (role.status !== RecordStatus.ACTIVE) {
        throw new BadRequestException(`The ${role.name} role is inactive`);
      }

      assertCanGrantScope(role, context.actor);
      assertHoldsPermissions(
        role.permissions.map(({ permission }) => permission.code),
        context.actor,
      );
    }

    return role;
  }

  /**
   * Applies the location hierarchy when a user is saved.
   *
   * ALL    - Super Admin reaches every location, so assignments are not required.
   * MULTI  - Admin must hold at least one location and may hold several.
   * SINGLE - every operational role is limited to exactly one location.
   */
  private async replaceUserHospitals(
    userId: string,
    role: Role,
    hospitalIds: string[] | undefined,
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const requested = [...new Set(hospitalIds ?? [])];

    assertHospitalsWithinReach(requested, context.actor);

    if (role.locationScope === LocationScope.SINGLE && requested.length !== 1) {
      throw new BadRequestException(
        `The ${role.name} role works at a single location, so exactly one location must be assigned`,
      );
    }

    if (role.locationScope === LocationScope.MULTI && requested.length === 0) {
      throw new BadRequestException(
        `The ${role.name} role requires at least one assigned location`,
      );
    }

    if (requested.length) {
      const count = await tx.hospital.count({
        where: { deletedAt: null, id: { in: requested } },
      });

      if (count !== requested.length) {
        throw new BadRequestException('One or more locations were not found');
      }
    }

    await tx.userHospital.updateMany({
      data: { deletedAt: new Date(), updatedBy: context.actorId },
      where: { deletedAt: null, userId },
    });

    if (!requested.length) {
      return;
    }

    await tx.userHospital.updateMany({
      data: { deletedAt: null, updatedBy: context.actorId },
      where: { hospitalId: { in: requested }, userId },
    });
    await tx.userHospital.createMany({
      data: requested.map((hospitalId) => ({
        createdBy: context.actorId,
        hospitalId,
        updatedBy: context.actorId,
        userId,
      })),
      skipDuplicates: true,
    });

    // The home hospital keeps single-location users working with code that still reads it.
    await tx.user.update({
      data: { hospitalId: requested[0], updatedBy: context.actorId },
      where: { id: userId },
    });
  }

  /** Guards the reverse direction: altering a user who already holds Super Admin. */
  private assertCanManageUser(user: UserWithRoles, context: ActorContext): void {
    if (holdsSuperAdminRole(user.roles)) {
      assertSuperAdminActor(context.actorRoles);
    }

    assertUserWithinReach(user, context.actor);
  }

  /**
   * Run inside the transaction after writing, and only when the edited user held Super Admin, so
   * that any demotion path — role change, status change, delete — rolls back if it would lock
   * everyone out. Skipping it otherwise keeps a database with no Super Admin at all usable.
   */
  private async assertSuperAdminRemains(tx: Prisma.TransactionClient): Promise<void> {
    // Serialises the count: two Super Admins disabling each other at once would otherwise each
    // still see the other as active under READ COMMITTED, both commit, and none would remain.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SUPER_ADMIN_LOCK_KEY})::text AS locked`;

    assertSuperAdminRemains(
      await tx.user.count({
        where: {
          deletedAt: null,
          roles: {
            some: {
              deletedAt: null,
              role: { deletedAt: null, name: SUPER_ADMIN_ROLE },
            },
          },
          status: UserStatus.ACTIVE,
        },
      }),
    );
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
