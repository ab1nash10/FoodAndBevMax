import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { uniqueViolationTarget } from '@aahar/auth';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import {
  assertActiveHospital,
  assertMayChangeShared,
  assertNotUsedElsewhere,
  sharedOrAt,
} from '../common/location-masters';
import { normalizeMasterName } from '../common/normalize-master-name';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { ListItemCategoriesQueryDto } from './dto/list-item-categories-query.dto';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto';
import {
  ItemCategoriesRepository,
  type ItemCategoryWithHospital,
} from './item-categories.repository';

type ItemCategoryClient = Prisma.TransactionClient;

function toItemCategoryResponse(category: ItemCategoryWithHospital) {
  return {
    categoryName: category.categoryName,
    createdAt: category.createdAt,
    deletedAt: category.deletedAt,
    hospital: category.hospital,
    hospitalId: category.hospitalId,
    id: category.id,
    isActive: category.isActive,
    updatedAt: category.updatedAt,
  };
}

@Injectable()
export class ItemCategoriesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly itemCategories: ItemCategoriesRepository,
  ) {}

  async list(query: ListItemCategoriesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.ItemCategoryWhereInput = {
      ...(query.hospitalId ? sharedOrAt(query.hospitalId) : {}),
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            categoryName: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.itemCategories.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.itemCategories.count({ where }),
    ]);

    return {
      items: items.map(toItemCategoryResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const category = await this.findActiveItemCategory(id);

    return toItemCategoryResponse(category);
  }

  async create(dto: CreateItemCategoryDto, context: ActorContext) {
    try {
      const created = await this.itemCategories.transaction(async (tx) => {
        const hospitalId = dto.hospitalId ?? null;

        assertMayChangeShared(hospitalId, 'item categories');

        if (hospitalId) {
          await assertActiveHospital(tx, hospitalId);
        }

        const normalizedName = normalizeMasterName(dto.categoryName);

        await this.assertUniqueNormalizedCategoryName(normalizedName, undefined, tx);

        const category = await this.itemCategories.create(
          {
            categoryName: dto.categoryName,
            createdBy: context.actorId,
            hospitalId,
            isActive: dto.isActive ?? true,
            normalizedName,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'ITEM_CATEGORY_CREATE',
            actorId: context.actorId,
            entityId: category.id,
            entityName: 'item_categories',
            ipAddress: context.ipAddress,
            newValue: toItemCategoryResponse(category),
          },
          tx,
        );

        return category;
      });

      return toItemCategoryResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Item category');
    }
  }

  async update(id: string, dto: UpdateItemCategoryDto, context: ActorContext) {
    try {
      const updated = await this.itemCategories.transaction(async (tx) => {
        const existing = await this.findActiveItemCategory(id, tx);
        const data: Prisma.ItemCategoryUpdateInput = {};
        const hospitalId = dto.hospitalId === undefined ? existing.hospitalId : dto.hospitalId;

        assertMayChangeShared(existing.hospitalId, 'item categories');

        if (hospitalId !== existing.hospitalId) {
          assertMayChangeShared(hospitalId, 'item categories');

          if (hospitalId) {
            await assertActiveHospital(tx, hospitalId);
            assertNotUsedElsewhere(
              await this.itemCategories.countItemsOutside(id, hospitalId, tx),
              'category',
            );
          }

          data.hospital = hospitalId ? { connect: { id: hospitalId } } : { disconnect: true };
        }

        if (dto.categoryName !== undefined) {
          const normalizedName = normalizeMasterName(dto.categoryName);

          await this.assertUniqueNormalizedCategoryName(normalizedName, id, tx);
          data.categoryName = dto.categoryName;
          data.normalizedName = normalizedName;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const category = Object.keys(data).length
          ? await this.itemCategories.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'ITEM_CATEGORY_STATUS_CHANGE'
                : 'ITEM_CATEGORY_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'item_categories',
            ipAddress: context.ipAddress,
            newValue: toItemCategoryResponse(category),
            oldValue: toItemCategoryResponse(existing),
          },
          tx,
        );

        return category;
      });

      return toItemCategoryResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Item category');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveItemCategory(id);

    assertMayChangeShared(existing.hospitalId, 'item categories');

    await this.itemCategories.transaction(async (tx) => {
      const hasActiveItems = await this.itemCategories.hasActiveItems(id, tx);

      if (hasActiveItems) {
        throw new BadRequestException('Item category is assigned to active items');
      }

      await this.itemCategories.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'ITEM_CATEGORY_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'item_categories',
          ipAddress: context.ipAddress,
          oldValue: toItemCategoryResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertUniqueNormalizedCategoryName(
    normalizedName: string,
    excludeId: string | undefined,
    client: ItemCategoryClient,
  ): Promise<void> {
    const category = await this.itemCategories.findByNormalizedName(
      normalizedName,
      excludeId,
      client,
    );

    if (category) {
      throw new ConflictException('Similar category already exists');
    }
  }

  private async findActiveItemCategory(
    id: string,
    client?: ItemCategoryClient,
  ): Promise<ItemCategoryWithHospital> {
    const category = await this.itemCategories.findActiveById(id, client);

    if (!category) {
      throw new NotFoundException('Item category not found');
    }

    return category;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = uniqueViolationTarget(error.meta);

      if (/normalized_name/.test(target)) {
        throw new ConflictException('Similar category already exists');
      }

      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
