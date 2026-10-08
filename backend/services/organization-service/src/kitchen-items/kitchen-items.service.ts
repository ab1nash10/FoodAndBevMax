import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemType, Prisma, type Kitchen } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateKitchenItemDto } from './dto/create-kitchen-item.dto';
import { ListKitchenItemsQueryDto } from './dto/list-kitchen-items-query.dto';
import { UpdateKitchenItemDto } from './dto/update-kitchen-item.dto';
import { KitchenItemsRepository, KitchenItemWithRelations } from './kitchen-items.repository';
import { assertUsableAt } from '../common/location-masters';

type KitchenItemClient = Prisma.TransactionClient;

function toKitchenItemResponse(mapping: KitchenItemWithRelations) {
  return {
    createdAt: mapping.createdAt,
    deletedAt: mapping.deletedAt,
    id: mapping.id,
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
      ...(query.kitchenId ? { kitchenId: query.kitchenId } : {}),
      ...(query.search
        ? {
            OR: [
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
        const kitchen = await this.assertValidKitchen(dto.kitchenId, tx);

        await this.assertValidReadymadeItem(dto.itemId, kitchen.hospitalId, tx);
        await this.assertUniqueMapping(dto.kitchenId, dto.itemId, undefined, tx);

        const mapping = await this.kitchenItems.create(
          {
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

        let nextHospitalId = existing.kitchen.hospital.id;

        if (dto.kitchenId !== undefined) {
          nextHospitalId = (await this.assertValidKitchen(dto.kitchenId, tx)).hospitalId;
          data.kitchen = { connect: { id: dto.kitchenId } };
        }

        if (dto.itemId !== undefined) {
          await this.assertValidReadymadeItem(dto.itemId, nextHospitalId, tx);
          data.item = { connect: { id: dto.itemId } };
        } else if (nextHospitalId !== existing.kitchen.hospital.id) {
          // Moving to another location's kitchen: the item it keeps must be usable there.
          const item = await this.kitchenItems.findActiveItem(existing.itemId, tx);

          if (item) {
            assertUsableAt(item, nextHospitalId, 'item');
          }
        }

        if (dto.kitchenId !== undefined || dto.itemId !== undefined) {
          await this.assertUniqueMapping(nextKitchenId, nextItemId, id, tx);
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
    excludeId: string | undefined,
    client: KitchenItemClient,
  ): Promise<void> {
    const mapping = await this.kitchenItems.findActiveMapping(kitchenId, itemId, excludeId, client);

    if (mapping) {
      throw new ConflictException('Kitchen item mapping already exists');
    }
  }

  private async assertValidKitchen(kitchenId: string, client: KitchenItemClient): Promise<Kitchen> {
    const kitchen = await this.kitchenItems.findActiveKitchen(kitchenId, client);

    if (!kitchen || !kitchen.isActive) {
      throw new BadRequestException('Kitchen not found or inactive');
    }

    return kitchen;
  }

  private async assertValidReadymadeItem(
    itemId: string,
    hospitalId: string,
    client: KitchenItemClient,
  ): Promise<void> {
    const item = await this.kitchenItems.findActiveItem(itemId, client);

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    if (!item.isActive) {
      throw new BadRequestException('This item is inactive and cannot be used.');
    }

    if (item.itemType !== ItemType.READYMADE) {
      throw new BadRequestException('Only READYMADE items can be mapped to kitchens');
    }

    assertUsableAt(item, hospitalId, 'item');
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
