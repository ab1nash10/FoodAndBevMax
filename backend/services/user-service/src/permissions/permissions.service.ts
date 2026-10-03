import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ListPermissionsQueryDto } from './dto/list-permissions-query.dto';

function toPermissionResponse(permission: {
  action: string;
  code: string;
  createdAt: Date;
  description: string | null;
  id: string;
  module: string;
  updatedAt: Date;
}) {
  return {
    action: permission.action,
    code: permission.code,
    createdAt: permission.createdAt,
    description: permission.description,
    id: permission.id,
    module: permission.module,
    updatedAt: permission.updatedAt,
  };
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPermissionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PermissionWhereInput = {
      deletedAt: null,
      ...(query.action ? { action: { equals: query.action, mode: 'insensitive' } } : {}),
      ...(query.module ? { module: { equals: query.module, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { module: { contains: query.search, mode: 'insensitive' } },
              { action: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        orderBy: [{ module: 'asc' }, { action: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.permission.count({ where }),
    ]);

    return {
      items: items.map(toPermissionResponse),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
