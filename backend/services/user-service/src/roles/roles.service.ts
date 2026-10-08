import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtRequestUser } from '@aahar/auth';
import { Prisma, RecordStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertHoldsPermissions } from '../common/actor-scope';
import { assertSuperAdminActor, isSuperAdminRole } from '../common/super-admin';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = {
  permissions: {
    include: {
      permission: true,
    },
    where: {
      deletedAt: null,
    },
  },
} satisfies Prisma.RoleInclude;

type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

interface ActorContext {
  actor?: JwtRequestUser;
  actorId?: string;
  actorRoles?: string[];
  ipAddress?: string;
}

function toRoleResponse(role: RoleWithPermissions) {
  return {
    createdAt: role.createdAt,
    deletedAt: role.deletedAt,
    description: role.description,
    id: role.id,
    locationScope: role.locationScope,
    name: role.name,
    permissions: role.permissions.map((rolePermission) => ({
      action: rolePermission.permission.action,
      code: rolePermission.permission.code,
      description: rolePermission.permission.description,
      id: rolePermission.permission.id,
      module: rolePermission.permission.module,
    })),
    status: role.status,
    updatedAt: role.updatedAt,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: ListRolesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.RoleWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        include: roleInclude,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.role.count({ where }),
    ]);

    return {
      items: items.map(toRoleResponse),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const role = await this.findActiveRole(id);

    return toRoleResponse(role);
  }

  async create(dto: CreateRoleDto, context: ActorContext) {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.permissionIds?.length) {
          await this.assertPermissionsExist(dto.permissionIds, tx);
          await this.assertCanAddPermissions([], dto.permissionIds, context, tx);
        }

        const role = await tx.role.create({
          data: {
            createdBy: context.actorId,
            description: dto.description,
            name: dto.name,
            updatedBy: context.actorId,
          },
          include: roleInclude,
        });

        if (dto.permissionIds?.length) {
          await this.replacePermissions(role.id, dto.permissionIds, context, tx);
        }

        const roleWithPermissions = await this.findActiveRole(role.id, tx);

        await this.auditLog.record(
          {
            action: 'ROLE_CREATE',
            actorId: context.actorId,
            entityId: role.id,
            entityName: 'roles',
            ipAddress: context.ipAddress,
            newValue: toRoleResponse(roleWithPermissions),
          },
          tx,
        );

        return roleWithPermissions;
      });

      return toRoleResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Role');
    }
  }

  async update(id: string, dto: UpdateRoleDto, context: ActorContext) {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const existing = await this.findActiveRole(id, tx);

        if (isSuperAdminRole(existing)) {
          assertSuperAdminActor(context.actorRoles);

          // Every Super Admin guard matches this exact name. Renamed, the role would stop being
          // protected, and anyone could then create a new role called "Super Admin".
          if (dto.name !== undefined && dto.name !== existing.name) {
            throw new BadRequestException('The Super Admin role cannot be renamed');
          }
        }

        const data: Prisma.RoleUpdateInput = {};

        if (dto.description !== undefined) {
          data.description = dto.description;
        }

        if (dto.name !== undefined) {
          data.name = dto.name;
        }

        if (dto.status !== undefined) {
          data.status = dto.status;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const role = Object.keys(data).length
          ? await tx.role.update({
              data,
              include: roleInclude,
              where: {
                id,
              },
            })
          : existing;

        if (dto.permissionIds !== undefined) {
          await this.assertCanAddPermissions(
            existing.permissions.map(({ permissionId }) => permissionId),
            dto.permissionIds,
            context,
            tx,
          );
          await this.replacePermissions(role.id, dto.permissionIds, context, tx);
        }

        const roleWithPermissions = await this.findActiveRole(role.id, tx);

        await this.auditLog.record(
          {
            action: 'ROLE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'roles',
            ipAddress: context.ipAddress,
            newValue: toRoleResponse(roleWithPermissions),
            oldValue: toRoleResponse(existing),
          },
          tx,
        );

        return roleWithPermissions;
      });

      return toRoleResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Role');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveRole(id);

    if (isSuperAdminRole(existing)) {
      assertSuperAdminActor(context.actorRoles);
      // Deleting the role revokes every Super Admin at once, so it is never allowed.
      throw new ConflictException('The Super Admin role cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        data: {
          deletedAt: new Date(),
          status: RecordStatus.INACTIVE,
          updatedBy: context.actorId,
        },
        where: {
          id,
        },
      });
      await tx.rolePermission.updateMany({
        data: {
          deletedAt: new Date(),
          updatedBy: context.actorId,
        },
        where: {
          deletedAt: null,
          roleId: id,
        },
      });
      await this.auditLog.record(
        {
          action: 'ROLE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'roles',
          ipAddress: context.ipAddress,
          oldValue: toRoleResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto, context: ActorContext) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findActiveRole(id, tx);

      if (isSuperAdminRole(existing)) {
        assertSuperAdminActor(context.actorRoles);
      }

      await this.assertCanAddPermissions(
        existing.permissions.map(({ permissionId }) => permissionId),
        dto.permissionIds,
        context,
        tx,
      );
      await this.replacePermissions(id, dto.permissionIds, context, tx);
      const roleWithPermissions = await this.findActiveRole(id, tx);

      await this.auditLog.record(
        {
          action: 'ROLE_PERMISSION_ASSIGN',
          actorId: context.actorId,
          entityId: id,
          entityName: 'role_permissions',
          ipAddress: context.ipAddress,
          newValue: {
            permissionIds: dto.permissionIds,
          },
          oldValue: {
            permissions: existing.permissions.map(
              (rolePermission) => rolePermission.permission.code,
            ),
          },
        },
        tx,
      );

      return roleWithPermissions;
    });

    return toRoleResponse(updated);
  }

  private async replacePermissions(
    roleId: string,
    permissionIds: string[],
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.assertPermissionsExist(permissionIds, tx);
    await tx.rolePermission.updateMany({
      data: {
        deletedAt: new Date(),
        updatedBy: context.actorId,
      },
      where: {
        deletedAt: null,
        roleId,
      },
    });

    if (!permissionIds.length) {
      return;
    }

    // Revive the rows that already exist, then insert only the genuinely new ones. Two bulk
    // statements instead of one upsert per permission, which was a round trip per row.
    await tx.rolePermission.updateMany({
      data: {
        deletedAt: null,
        updatedBy: context.actorId,
      },
      where: {
        permissionId: { in: permissionIds },
        roleId,
      },
    });
    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        createdBy: context.actorId,
        permissionId,
        roleId,
        updatedBy: context.actorId,
      })),
      skipDuplicates: true,
    });
  }

  /** Only permissions this save adds to the role must be held by the actor. */
  private async assertCanAddPermissions(
    currentIds: string[],
    requestedIds: string[],
    context: ActorContext,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const addedIds = requestedIds.filter((id) => !currentIds.includes(id));

    if (!addedIds.length) {
      return;
    }

    const added = await tx.permission.findMany({
      select: { code: true },
      where: { id: { in: addedIds } },
    });

    assertHoldsPermissions(
      added.map(({ code }) => code),
      context.actor,
    );
  }

  private async assertPermissionsExist(
    permissionIds: string[],
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const count = await client.permission.count({
      where: {
        deletedAt: null,
        id: {
          in: permissionIds,
        },
      },
    });

    if (count !== permissionIds.length) {
      throw new BadRequestException('One or more permissions were not found');
    }
  }

  private async findActiveRole(
    id: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<RoleWithPermissions> {
    const role = await client.role.findFirst({
      include: roleInclude,
      where: {
        deletedAt: null,
        id,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
