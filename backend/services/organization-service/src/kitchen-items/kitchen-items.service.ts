import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import {
  assertUsableCategory,
  classifyItem,
  kitchenItemType,
  releaseItemTypeIfUnused,
} from '../common/item-classification';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateKitchenItemDto } from './dto/create-kitchen-item.dto';
import { ListKitchenItemsQueryDto } from './dto/list-kitchen-items-query.dto';
import { UpdateKitchenItemDto } from './dto/update-kitchen-item.dto';
import { KitchenItemsRepository, KitchenItemWithRelations } from './kitchen-items.repository';

type KitchenItemClient = Prisma.TransactionClient;

function toKitchenItemResponse(mapping: KitchenItemWithRelations) {
  return {
    createdAt: mapping.createdAt,
    deletedAt: mapping.deletedAt,
    id: mapping.id,
    category: mapping.category,
    categoryId: mapping.categoryId,
    isActive: mapping.isActive,
    item: mapping.item,
    itemId: mapping.itemId,
    kitchen: mapping.kitchen,
    kitchenId: mapping.kitchenId,
    updatedAt: mapping.updatedAt,
  };
}

@Injectable()
export class KitchenItemsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly kitchenItems: KitchenItemsRepository,
  ) {}

  async list(query: ListKitchenItemsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.KitchenItemWhereInput = {
      deletedAt: null,
      ...(query.hospitalId ? { kitchen: { hospitalId: query.hospitalId } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { item: { itemType: query.itemType } } : {}),
      ...(query.kitchenId ? { kitchenId: query.kitchenId } : {}),
      ...(query.search
        ? {
            OR: [
              { category: { categoryName: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              { kitchen: { kitchenCode: { contains: query.search, mode: 'insensitive' } } },
              { kitchen: { kitchenName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.kitchenItems.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.kitchenItems.count({ where }),
    ]);

    return {
      items: items.map(toKitchenItemResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toKitchenItemResponse(await this.findActiveKitchenItem(id));
  }

  async create(dto: CreateKitchenItemDto, context: ActorContext) {
    try {
      const created = await this.kitchenItems.transaction(async (tx) => {
        // Mapping to a kitchen makes the item Readymade or Live; the category is this mapping's.
        const itemType = await kitchenItemType(tx, dto.itemId, dto.itemType);
        await this.assertValidKitchen(dto.kitchenId, itemType, tx);
        await classifyItem(tx, dto.itemId, itemType, context.actorId);
        await assertUsableCategory(tx, dto.categoryId);
        await this.assertUniqueMapping(
          dto.kitchenId,
          dto.itemId,
          dto.categoryId ?? null,
          undefined,
          tx,
        );

        const mapping = await this.kitchenItems.create(
          {
            categoryId: dto.categoryId,
            createdBy: context.actorId,
            isActive: dto.isActive ?? true,
            itemId: dto.itemId,
            kitchenId: dto.kitchenId,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'KITCHEN_ITEM_CREATE',
            actorId: context.actorId,
            entityId: mapping.id,
            entityName: 'kitchen_items',
            ipAddress: context.ipAddress,
            newValue: toKitchenItemResponse(mapping),
          },
          tx,
        );

        return mapping;
      });

      return toKitchenItemResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Kitchen item mapping');
    }
  }

  async update(id: string, dto: UpdateKitchenItemDto, context: ActorContext) {
    try {
      const updated = await this.kitchenItems.transaction(async (tx) => {
        const existing = await this.findActiveKitchenItem(id, tx);
        const nextKitchenId = dto.kitchenId ?? existing.kitchenId;
        const nextItemId = dto.itemId ?? existing.itemId;
        const data: Prisma.KitchenItemUpdateInput = {};

        const retyped = dto.itemId !== undefined || dto.itemType !== undefined;

        if (dto.kitchenId !== undefined || retyped) {
          const itemType = await kitchenItemType(tx, nextItemId, dto.itemType);
          await this.assertValidKitchen(nextKitchenId, itemType, tx);
          if (retyped) await classifyItem(tx, nextItemId, itemType, context.actorId);
        }

        if (dto.kitchenId !== undefined) {
          data.kitchen = { connect: { id: dto.kitchenId } };
        }

        if (dto.itemId !== undefined) {
          data.item = { connect: { id: dto.itemId } };
        }

        // Only this mapping's category: the item's other mappings keep theirs.
        if (dto.categoryId !== undefined) {
          await assertUsableCategory(tx, dto.categoryId);
          data.category = { connect: { id: dto.categoryId } };
        }

        // The same item may sit under several categories; only an exact repeat is refused.
        if (
          dto.kitchenId !== undefined ||
          dto.itemId !== undefined ||
          dto.categoryId !== undefined
        ) {
          await this.assertUniqueMapping(
            nextKitchenId,
            nextItemId,
            dto.categoryId ?? existing.categoryId,
            id,
            tx,
          );
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const mapping = Object.keys(data).length
          ? await this.kitchenItems.update(id, data, tx)
          : existing;

        if (dto.itemId !== undefined && dto.itemId !== existing.itemId) {
          await releaseItemTypeIfUnused(tx, existing.itemId, ItemType.READYMADE);
        }

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'KITCHEN_ITEM_STATUS_CHANGE'
                : 'KITCHEN_ITEM_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'kitchen_items',
            ipAddress: context.ipAddress,
            newValue: toKitchenItemResponse(mapping),
            oldValue: toKitchenItemResponse(existing),
          },
          tx,
        );

        return mapping;
      });

      return toKitchenItemResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Kitchen item mapping');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveKitchenItem(id);

    await this.kitchenItems.transaction(async (tx) => {
      await this.kitchenItems.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      // A mistaken mapping is fully undone: an item never used here loses the type again.
      await releaseItemTypeIfUnused(tx, existing.itemId, ItemType.READYMADE);
      await this.auditLog.record(
        {
          action: 'KITCHEN_ITEM_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'kitchen_items',
          ipAddress: context.ipAddress,
          oldValue: toKitchenItemResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  private async assertUniqueMapping(
    kitchenId: string,
    itemId: string,
    categoryId: string | null,
    excludeId: string | undefined,
    client: KitchenItemClient,
  ): Promise<void> {
    const mapping = await this.kitchenItems.findActiveMapping(
      kitchenId,
      itemId,
      categoryId,
      excludeId,
      client,
    );

    if (mapping) {
      throw new ConflictException('Kitchen item mapping already exists for this category');
    }
  }

  private async assertValidKitchen(
    kitchenId: string,
    itemType: ItemType,
    client: KitchenItemClient,
  ): Promise<void> {
    const kitchen = await this.kitchenItems.findActiveKitchen(kitchenId, client);

    if (!kitchen || !kitchen.isActive) {
      throw new BadRequestException('Kitchen not found or inactive');
    }

    // ponytail: kitchens have no type, so the Main Kitchen (every location gets one) is known by
    // its name; add a kitchen type column if locations start renaming it.
    if (
      itemType === ItemType.READYMADE &&
      kitchen.kitchenName.trim().toLowerCase() !== 'main kitchen'
    ) {
      throw new BadRequestException(
        'A Readymade item is made in the Main Kitchen. Pick the Main Kitchen, or make the item Live.',
      );
    }
  }

  private async findActiveKitchenItem(
    id: string,
    client?: KitchenItemClient,
  ): Promise<KitchenItemWithRelations> {
    const mapping = await this.kitchenItems.findActiveById(id, client);

    if (!mapping) {
      throw new NotFoundException('Kitchen item mapping not found');
    }

    return mapping;
  }
}
