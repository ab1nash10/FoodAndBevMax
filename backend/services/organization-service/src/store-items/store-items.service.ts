import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemType, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateStoreItemDto } from './dto/create-store-item.dto';
import { ListStoreItemsQueryDto } from './dto/list-store-items-query.dto';
import { UpdateStoreItemDto } from './dto/update-store-item.dto';
import { StoreItemsRepository, StoreItemWithRelations } from './store-items.repository';

type StoreItemClient = Prisma.TransactionClient;

function toStoreItemResponse(mapping: StoreItemWithRelations) {
  return {
    createdAt: mapping.createdAt,
    deletedAt: mapping.deletedAt,
    id: mapping.id,
    isActive: mapping.isActive,
    item: mapping.item,
    itemId: mapping.itemId,
    store: mapping.store,
    storeId: mapping.storeId,
    updatedAt: mapping.updatedAt,
  };
}

@Injectable()
export class StoreItemsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly storeItems: StoreItemsRepository,
  ) {}

  async list(query: ListStoreItemsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.StoreItemWhereInput = {
      deletedAt: null,
      ...(query.hospitalId ? { store: { hospitalId: query.hospitalId } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.search
        ? {
            OR: [
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              { store: { storeCode: { contains: query.search, mode: 'insensitive' } } },
              { store: { storeName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.storeItems.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.storeItems.count({ where }),
    ]);

    return {
      items: items.map(toStoreItemResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toStoreItemResponse(await this.findActiveStoreItem(id));
  }

  async create(dto: CreateStoreItemDto, context: ActorContext) {
    try {
      const created = await this.storeItems.transaction(async (tx) => {
        await this.assertValidStore(dto.storeId, tx);
        await this.assertValidMrpItem(dto.itemId, tx);
        await this.assertUniqueMapping(dto.storeId, dto.itemId, undefined, tx);

        const mapping = await this.storeItems.create(
          {
            createdBy: context.actorId,
            isActive: dto.isActive ?? true,
            itemId: dto.itemId,
            storeId: dto.storeId,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'STORE_ITEM_CREATE',
            actorId: context.actorId,
            entityId: mapping.id,
            entityName: 'store_items',
            ipAddress: context.ipAddress,
            newValue: toStoreItemResponse(mapping),
          },
          tx,
        );

        return mapping;
      });

      return toStoreItemResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Store item mapping');
    }
  }

  async update(id: string, dto: UpdateStoreItemDto, context: ActorContext) {
    try {
      const updated = await this.storeItems.transaction(async (tx) => {
        const existing = await this.findActiveStoreItem(id, tx);
        const nextStoreId = dto.storeId ?? existing.storeId;
        const nextItemId = dto.itemId ?? existing.itemId;
        const data: Prisma.StoreItemUpdateInput = {};

        if (dto.storeId !== undefined) {
          await this.assertValidStore(dto.storeId, tx);
          data.store = { connect: { id: dto.storeId } };
        }

        if (dto.itemId !== undefined) {
          await this.assertValidMrpItem(dto.itemId, tx);
          data.item = { connect: { id: dto.itemId } };
        }

        if (dto.storeId !== undefined || dto.itemId !== undefined) {
          await this.assertUniqueMapping(nextStoreId, nextItemId, id, tx);
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const mapping = Object.keys(data).length
          ? await this.storeItems.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'STORE_ITEM_STATUS_CHANGE'
                : 'STORE_ITEM_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'store_items',
            ipAddress: context.ipAddress,
            newValue: toStoreItemResponse(mapping),
            oldValue: toStoreItemResponse(existing),
          },
          tx,
        );

        return mapping;
      });

      return toStoreItemResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Store item mapping');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveStoreItem(id);

    await this.storeItems.transaction(async (tx) => {
      await this.storeItems.update(
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
          action: 'STORE_ITEM_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'store_items',
          ipAddress: context.ipAddress,
          oldValue: toStoreItemResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  private async assertUniqueMapping(
    storeId: string,
    itemId: string,
    excludeId: string | undefined,
    client: StoreItemClient,
  ): Promise<void> {
    const mapping = await this.storeItems.findActiveMapping(storeId, itemId, excludeId, client);

    if (mapping) {
      throw new ConflictException('Store item mapping already exists');
    }
  }

  private async assertValidMrpItem(itemId: string, client: StoreItemClient): Promise<void> {
    const item = await this.storeItems.findActiveItem(itemId, client);

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    if (!item.isActive) {
      throw new BadRequestException('This item is inactive and cannot be used.');
    }

    if (item.itemType !== ItemType.MRP) {
      throw new BadRequestException('Only MRP items can be mapped to stores');
    }
  }

  private async assertValidStore(storeId: string, client: StoreItemClient): Promise<void> {
    const store = await this.storeItems.findActiveStore(storeId, client);

    if (!store) {
      throw new BadRequestException('Store not found or inactive');
    }

    if (!store.isActive) {
      throw new BadRequestException('Store not found or inactive');
    }
  }

  private async findActiveStoreItem(
    id: string,
    client?: StoreItemClient,
  ): Promise<StoreItemWithRelations> {
    const mapping = await this.storeItems.findActiveById(id, client);

    if (!mapping) {
      throw new NotFoundException('Store item mapping not found');
    }

    return mapping;
  }
}
