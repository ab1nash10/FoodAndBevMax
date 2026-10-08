import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { uniqueViolationTarget } from '@aahar/auth';
import { Prisma, type ItemCategory } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import {
  assertActiveHospital,
  assertMayChangeShared,
  assertNotUsedElsewhere,
  assertUsableAt,
  sharedOrAt,
} from '../common/location-masters';
import { normalizeMasterName } from '../common/normalize-master-name';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsRepository, ItemWithCategory } from './items.repository';

type ItemClient = Prisma.TransactionClient;

function toItemResponse(item: ItemWithCategory) {
  return {
    category: {
      categoryName: item.category.categoryName,
      id: item.category.id,
      isActive: item.category.isActive,
    },
    categoryId: item.categoryId,
    createdAt: item.createdAt,
    deletedAt: item.deletedAt,
    hospital: item.hospital,
    hospitalId: item.hospitalId,
    hsnCode: item.hsnCode,
    id: item.id,
    isActive: item.isActive,
    itemCode: item.itemCode,
    itemName: item.itemName,
    itemType: item.itemType,
    preparationTimeMinutes: item.preparationTimeMinutes,
    type: item.type,
    updatedAt: item.updatedAt,
  };
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly items: ItemsRepository,
  ) {}

  async list(query: ListItemsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.ItemWhereInput = {
      ...(query.hospitalId ? { AND: [sharedOrAt(query.hospitalId)] } : {}),
      category: {
        deletedAt: null,
      },
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.itemType ? { itemType: query.itemType } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
            OR: [
              { category: { categoryName: { contains: query.search, mode: 'insensitive' } } },
              { hsnCode: { contains: query.search, mode: 'insensitive' } },
              { itemCode: { contains: query.search, mode: 'insensitive' } },
              { itemName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.items.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.items.count({ where }),
    ]);

    return {
      items: items.map(toItemResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const item = await this.findActiveItem(id);

    return toItemResponse(item);
  }

  async create(dto: CreateItemDto, context: ActorContext) {
    try {
      const created = await this.items.transaction(async (tx) => {
        const hospitalId = dto.hospitalId ?? null;

        assertMayChangeShared(hospitalId, 'items');

        if (hospitalId) {
          await assertActiveHospital(tx, hospitalId);
        }

        const normalizedName = normalizeMasterName(dto.itemName);
        const itemCode = await this.generateUniqueItemCode(tx);
        const category = await this.assertActiveCategory(dto.categoryId, tx);

        assertUsableAt(category, hospitalId, 'category');
        await this.assertUniqueNormalizedItemName(normalizedName, undefined, tx);

        const item = await this.items.create(
          {
            categoryId: dto.categoryId,
            createdBy: context.actorId,
            hospitalId,
            hsnCode: dto.hsnCode,
            isActive: dto.isActive ?? true,
            itemCode,
            itemName: dto.itemName,
            itemType: dto.itemType,
            normalizedName,
            preparationTimeMinutes: dto.preparationTimeMinutes,
            type: dto.type,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'ITEM_CREATE',
            actorId: context.actorId,
            entityId: item.id,
            entityName: 'items',
            ipAddress: context.ipAddress,
            newValue: toItemResponse(item),
          },
          tx,
        );

        return item;
      });

      return toItemResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Item');
    }
  }

  async update(id: string, dto: UpdateItemDto, context: ActorContext) {
    try {
      const updated = await this.items.transaction(async (tx) => {
        const existing = await this.findActiveItem(id, tx);
        const data: Prisma.ItemUpdateInput = {};
        const hospitalId = dto.hospitalId === undefined ? existing.hospitalId : dto.hospitalId;

        assertMayChangeShared(existing.hospitalId, 'items');

        if (hospitalId !== existing.hospitalId) {
          assertMayChangeShared(hospitalId, 'items');

          if (hospitalId) {
            await assertActiveHospital(tx, hospitalId);
            assertNotUsedElsewhere(await this.items.countUsesOutside(id, hospitalId, tx), 'item');
          }

          data.hospital = hospitalId ? { connect: { id: hospitalId } } : { disconnect: true };
        }

        if (dto.categoryId !== undefined) {
          assertUsableAt(
            await this.assertActiveCategory(dto.categoryId, tx),
            hospitalId,
            'category',
          );
          data.category = {
            connect: {
              id: dto.categoryId,
            },
          };
        } else if (hospitalId !== existing.hospitalId) {
          assertUsableAt(existing.category, hospitalId, 'category');
        }

        if (dto.hsnCode !== undefined) {
          data.hsnCode = dto.hsnCode;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.itemName !== undefined) {
          const normalizedName = normalizeMasterName(dto.itemName);

          await this.assertUniqueNormalizedItemName(normalizedName, id, tx);
          data.itemName = dto.itemName;
          data.normalizedName = normalizedName;
        }

        if (dto.itemType !== undefined) {
          data.itemType = dto.itemType;
        }

        if (dto.preparationTimeMinutes !== undefined) {
          data.preparationTimeMinutes = dto.preparationTimeMinutes;
        }

        if (dto.type !== undefined) {
          data.type = dto.type;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const item = Object.keys(data).length ? await this.items.update(id, data, tx) : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'ITEM_STATUS_CHANGE'
                : 'ITEM_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'items',
            ipAddress: context.ipAddress,
            newValue: toItemResponse(item),
            oldValue: toItemResponse(existing),
          },
          tx,
        );

        return item;
      });

      return toItemResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Item');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveItem(id);

    assertMayChangeShared(existing.hospitalId, 'items');

    await this.items.transaction(async (tx) => {
      await this.items.update(
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
          action: 'ITEM_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'items',
          ipAddress: context.ipAddress,
          oldValue: toItemResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveCategory(id: string, client: ItemClient): Promise<ItemCategory> {
    const category = await this.items.findActiveCategory(id, client);

    if (!category) {
      throw new BadRequestException('Item category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException('This category is inactive and cannot be used for new items.');
    }

    return category;
  }

  private async assertUniqueNormalizedItemName(
    normalizedName: string,
    excludeId: string | undefined,
    client: ItemClient,
  ): Promise<void> {
    const item = await this.items.findByNormalizedName(normalizedName, excludeId, client);

    if (item) {
      throw new ConflictException('Similar item already exists');
    }
  }

  private async findActiveItem(id: string, client?: ItemClient): Promise<ItemWithCategory> {
    const item = await this.items.findActiveById(id, client);

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  private async generateUniqueItemCode(client: ItemClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextValue = await this.items.getNextItemCodeSequenceValue(client);

      if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
        throw new InternalServerErrorException('Unable to generate item code');
      }

      const itemCode = `ITM${String(nextValue).padStart(4, '0')}`;
      const existing = await this.items.findByCode(itemCode, undefined, client);

      if (!existing) {
        return itemCode;
      }
    }

    throw new ConflictException('Item code already exists');
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = uniqueViolationTarget(error.meta);

      if (/normalized_name/.test(target)) {
        throw new ConflictException('Similar item already exists');
      }

      if (/item_?code/i.test(target)) {
        throw new ConflictException('Item code already exists');
      }

      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
