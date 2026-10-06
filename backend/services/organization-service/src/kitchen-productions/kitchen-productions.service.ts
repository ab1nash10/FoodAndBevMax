import { NotificationPublisher } from '@aahar/auth';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InventoryLocationType,
  ItemType,
  KitchenProductionStatus,
  Prisma,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { NOTIFY_ROLES } from '../common/notification-roles';
import { getDocumentOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import { lockRow } from '../common/row-lock';
import type { ActorContext } from '../common/request-context';
import {
  CreateKitchenProductionDto,
  CreateKitchenProductionLineDto,
} from './dto/create-kitchen-production.dto';
import { ListKitchenProductionsQueryDto } from './dto/list-kitchen-productions-query.dto';
import { UpdateKitchenProductionDto } from './dto/update-kitchen-production.dto';
import {
  KitchenProductionsRepository,
  KitchenProductionWithRelations,
} from './kitchen-productions.repository';
import { optionalText, toDate, toDateOnly, toNumber } from '../common/values';

type KitchenProductionClient = Prisma.TransactionClient;

interface PreparedProductionLine {
  acceptedQty: number;
  itemId: string;
  producedQty: number;
  remarks?: string;
  wastageQty: number;
}

function toKitchenProductionResponse(production: KitchenProductionWithRelations) {
  return {
    businessDate: production.businessDate,
    chef: production.chef,
    chefUserId: production.chefUserId,
    createdAt: production.createdAt,
    deletedAt: production.deletedAt,
    hospital: production.hospital,
    hospitalId: production.hospitalId,
    id: production.id,
    kitchen: production.kitchen,
    kitchenId: production.kitchenId,
    lines: production.lines.map((line) => ({
      acceptedQty: toNumber(line.acceptedQty),
      createdAt: line.createdAt,
      deletedAt: line.deletedAt,
      id: line.id,
      item: line.item,
      itemId: line.itemId,
      producedQty: toNumber(line.producedQty),
      productionId: line.productionId,
      remarks: line.remarks,
      updatedAt: line.updatedAt,
      wastageQty: toNumber(line.wastageQty),
    })),
    productionDate: production.productionDate,
    productionNumber: production.productionNumber,
    remarks: production.remarks,
    status: production.status,
    updatedAt: production.updatedAt,
  };
}

@Injectable()
export class KitchenProductionsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationPublisher,
    private readonly productions: KitchenProductionsRepository,
  ) {}

  async list(query: ListKitchenProductionsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.KitchenProductionWhereInput = {
      deletedAt: null,
      ...(query.chefUserId ? { chefUserId: query.chefUserId } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.kitchenId ? { kitchenId: query.kitchenId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            productionDate: {
              ...(query.fromDate ? { gte: toDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: toDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { productionNumber: { contains: query.search, mode: 'insensitive' } },
              { remarks: { contains: query.search, mode: 'insensitive' } },
              { kitchen: { kitchenCode: { contains: query.search, mode: 'insensitive' } } },
              { kitchen: { kitchenName: { contains: query.search, mode: 'insensitive' } } },
              {
                lines: {
                  some: { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
                },
              },
              {
                lines: {
                  some: { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.productions.findMany({
        orderBy: getDocumentOrderBy(query, 'productionNumber', 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.productions.count({ where }),
    ]);

    return {
      items: items.map(toKitchenProductionResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toKitchenProductionResponse(await this.findActiveProduction(id));
  }

  async create(dto: CreateKitchenProductionDto, context: ActorContext) {
    try {
      return await this.productions.transaction(async (tx) => {
        await this.assertProductionHeader(dto.hospitalId, dto.kitchenId, dto.chefUserId, tx);
        const lines = await this.prepareLines(dto.items, dto.kitchenId, tx);
        const productionDate = toDate(dto.productionDate);
        const businessDate = toDateOnly(dto.businessDate);

        const production = await this.productions.create(
          {
            businessDate,
            chefUserId: dto.chefUserId,
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            kitchenId: dto.kitchenId,
            productionDate,
            remarks: optionalText(dto.remarks),
            status: KitchenProductionStatus.DRAFT,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.createLines(production.id, lines, context.actorId, tx);
        const created = await this.findActiveProduction(production.id, tx);
        const newValue = toKitchenProductionResponse(created);

        await this.auditLog.record(
          {
            action: 'KITCHEN_PRODUCTION_CREATE',
            actorId: context.actorId,
            entityId: created.id,
            entityName: 'kitchen_productions',
            hospitalId: created.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      handlePrismaError(error, 'Kitchen production');
    }
  }

  async update(id: string, dto: UpdateKitchenProductionDto, context: ActorContext) {
    try {
      return await this.productions.transaction(async (tx) => {
        await lockRow(tx, 'kitchen_productions', id);
        const existing = await this.findActiveProduction(id, tx);

        this.assertEditable(existing);

        const nextHospitalId = dto.hospitalId ?? existing.hospitalId;
        const nextKitchenId = dto.kitchenId ?? existing.kitchenId;
        const data: Prisma.KitchenProductionUncheckedUpdateInput = {
          updatedBy: context.actorId,
        };

        if (
          dto.hospitalId !== undefined ||
          dto.kitchenId !== undefined ||
          dto.chefUserId !== undefined
        ) {
          await this.assertProductionHeader(nextHospitalId, nextKitchenId, dto.chefUserId, tx);
        }

        if (dto.hospitalId !== undefined) {
          data.hospitalId = dto.hospitalId;
        }

        if (dto.kitchenId !== undefined) {
          data.kitchenId = dto.kitchenId;
        }

        if (dto.productionDate !== undefined) {
          data.productionDate = toDate(dto.productionDate);
        }

        if (dto.businessDate !== undefined) {
          data.businessDate = toDateOnly(dto.businessDate);
        }

        if (dto.chefUserId !== undefined) {
          data.chefUserId = dto.chefUserId;
        }

        if (dto.remarks !== undefined) {
          data.remarks = optionalText(dto.remarks);
        }

        if (dto.items) {
          const lines = await this.prepareLines(dto.items, nextKitchenId, tx);

          await this.productions.softDeleteLines(id, context.actorId, tx);
          await this.createLines(id, lines, context.actorId, tx);
        } else if (dto.kitchenId !== undefined) {
          await this.assertMappedReadyMadeItems(
            nextKitchenId,
            existing.lines.map((line) => line.itemId),
            tx,
          );
        }

        const updated = await this.productions.update(id, data, tx);

        await this.auditLog.record(
          {
            action: 'KITCHEN_PRODUCTION_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'kitchen_productions',
            hospitalId: updated.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toKitchenProductionResponse(updated),
            oldValue: toKitchenProductionResponse(existing),
          },
          tx,
        );

        return toKitchenProductionResponse(updated);
      });
    } catch (error) {
      handlePrismaError(error, 'Kitchen production');
    }
  }

  async remove(id: string, context: ActorContext) {
    await this.productions.transaction(async (tx) => {
      // Read under the lock, or a delete landing just after a post removed a posted production.
      await lockRow(tx, 'kitchen_productions', id);
      const existing = await this.findActiveProduction(id, tx);

      this.assertEditable(existing);

      await this.productions.softDeleteLines(id, context.actorId, tx);
      await this.productions.update(
        id,
        {
          deletedAt: new Date(),
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'KITCHEN_PRODUCTION_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'kitchen_productions',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toKitchenProductionResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  async post(id: string, context: ActorContext) {
    return this.productions.transaction(async (tx) => {
      await lockRow(tx, 'kitchen_productions', id);
      const existing = await this.findActiveProduction(id, tx);

      if (existing.status === KitchenProductionStatus.POSTED) {
        throw new BadRequestException('Kitchen production is already posted');
      }

      if (existing.status === KitchenProductionStatus.CANCELLED) {
        throw new BadRequestException('Cancelled kitchen production cannot be posted');
      }

      await this.assertProductionHeader(existing.hospitalId, existing.kitchenId, undefined, tx);

      for (const line of existing.lines) {
        const acceptedQty = toNumber(line.acceptedQty);

        if (acceptedQty <= 0) {
          continue;
        }

        const balance = await this.productions.upsertStockBalance(
          {
            actorId: context.actorId,
            businessDate: existing.businessDate,
            hospitalId: existing.hospitalId,
            itemId: line.itemId,
            locationId: existing.kitchenId,
            quantity: acceptedQty,
          },
          tx,
        );

        await this.productions.createStockLedger(
          {
            balanceAfter: toNumber(balance.availableQty),
            businessDate: existing.businessDate,
            createdBy: context.actorId,
            hospitalId: existing.hospitalId,
            itemId: line.itemId,
            itemType: ItemType.READYMADE,
            locationId: existing.kitchenId,
            locationType: InventoryLocationType.KITCHEN,
            qtyIn: acceptedQty,
            qtyOut: 0,
            referenceId: existing.id,
            referenceType: StockReferenceType.KITCHEN_PRODUCTION,
            remarks: line.remarks ?? existing.remarks,
            transactionDateTime: new Date(),
            transactionType: StockTransactionType.KITCHEN_PRODUCTION_IN,
            updatedBy: context.actorId,
          },
          tx,
        );
      }

      const posted = await this.productions.update(
        id,
        {
          status: KitchenProductionStatus.POSTED,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'KITCHEN_PRODUCTION_POST',
          actorId: context.actorId,
          entityId: id,
          entityName: 'kitchen_productions',
          hospitalId: posted.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toKitchenProductionResponse(posted),
          oldValue: toKitchenProductionResponse(existing),
        },
        tx,
      );

      await this.notifications.publish(
        {
          actorId: context.actorId,
          body: `${posted.lines.length} item(s) are now available in kitchen stock for distribution.`,
          category: 'KITCHEN',
          entityId: posted.id,
          entityName: 'kitchen_productions',
          hospitalId: posted.hospitalId,
          link: '/kitchen/productions',
          roleNames: NOTIFY_ROLES,
          title: `Kitchen production ${posted.productionNumber} posted`,
        },
        tx,
      );

      return toKitchenProductionResponse(posted);
    });
  }

  async cancel(id: string, context: ActorContext) {
    return this.productions.transaction(async (tx) => {
      await lockRow(tx, 'kitchen_productions', id);
      const existing = await this.findActiveProduction(id, tx);

      if (existing.status === KitchenProductionStatus.POSTED) {
        throw new BadRequestException('Posted kitchen production cannot be cancelled');
      }

      if (existing.status === KitchenProductionStatus.CANCELLED) {
        throw new BadRequestException('Kitchen production is already cancelled');
      }

      const cancelled = await this.productions.update(
        id,
        {
          status: KitchenProductionStatus.CANCELLED,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'KITCHEN_PRODUCTION_CANCEL',
          actorId: context.actorId,
          entityId: id,
          entityName: 'kitchen_productions',
          hospitalId: cancelled.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toKitchenProductionResponse(cancelled),
          oldValue: toKitchenProductionResponse(existing),
        },
        tx,
      );

      return toKitchenProductionResponse(cancelled);
    });
  }

  private assertEditable(production: KitchenProductionWithRelations): void {
    if (production.status === KitchenProductionStatus.POSTED) {
      throw new BadRequestException('Posted kitchen production cannot be edited');
    }

    if (production.status === KitchenProductionStatus.CANCELLED) {
      throw new BadRequestException('Cancelled kitchen production cannot be edited');
    }
  }

  private async assertMappedReadyMadeItems(
    kitchenId: string,
    itemIds: string[],
    client: KitchenProductionClient,
  ): Promise<void> {
    const uniqueItemIds = [...new Set(itemIds)];
    const mappings = await this.productions.findActiveKitchenMappings(
      kitchenId,
      uniqueItemIds,
      client,
    );
    const mappedItemIds = new Set(mappings.map((mapping) => mapping.itemId));

    uniqueItemIds.forEach((itemId) => {
      if (!mappedItemIds.has(itemId)) {
        throw new BadRequestException(
          'All items must be active READYMADE items mapped to the selected kitchen',
        );
      }
    });
  }

  private async assertProductionHeader(
    hospitalId: string,
    kitchenId: string,
    chefUserId: string | undefined,
    client: KitchenProductionClient,
  ): Promise<void> {
    const [hospital, kitchen] = await Promise.all([
      this.productions.findActiveHospital(hospitalId, client),
      this.productions.findActiveKitchen(kitchenId, client),
    ]);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }

    if (!kitchen || !kitchen.isActive) {
      throw new BadRequestException('Kitchen not found or inactive');
    }

    if (kitchen.hospitalId !== hospitalId) {
      throw new BadRequestException('Kitchen does not belong to selected hospital');
    }

    if (chefUserId) {
      const chef = await this.productions.findActiveChef(chefUserId, client);

      if (!chef) {
        throw new BadRequestException('Chef user not found or inactive');
      }
    }
  }

  private async createLines(
    productionId: string,
    lines: PreparedProductionLine[],
    actorId: string | undefined,
    client: KitchenProductionClient,
  ): Promise<void> {
    for (const line of lines) {
      await this.productions.createLine(
        {
          acceptedQty: line.acceptedQty,
          createdBy: actorId,
          itemId: line.itemId,
          producedQty: line.producedQty,
          productionId,
          remarks: line.remarks,
          updatedBy: actorId,
          wastageQty: line.wastageQty,
        },
        client,
      );
    }
  }

  private async findActiveProduction(
    id: string,
    client?: KitchenProductionClient,
  ): Promise<KitchenProductionWithRelations> {
    const production = await this.productions.findActiveById(id, client);

    if (!production) {
      throw new NotFoundException('Kitchen production not found');
    }

    return production;
  }

  private async prepareLines(
    lines: CreateKitchenProductionLineDto[],
    kitchenId: string,
    client: KitchenProductionClient,
  ): Promise<PreparedProductionLine[]> {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const mappings = await this.productions.findActiveKitchenMappings(kitchenId, itemIds, client);
    const mappedItems = new Map(mappings.map((mapping) => [mapping.itemId, mapping.item] as const));

    return lines.map((line, index) => {
      const item = mappedItems.get(line.itemId);
      const lineLabel = `Line ${index + 1}`;
      const wastageQty = line.wastageQty ?? 0;
      const acceptedQty = line.acceptedQty ?? Number((line.producedQty - wastageQty).toFixed(3));

      if (!item) {
        throw new BadRequestException(`${lineLabel}: This kitchen item mapping is inactive.`);
      }

      if (item.itemType !== ItemType.READYMADE) {
        throw new BadRequestException(`${lineLabel}: only READYMADE items can be produced`);
      }

      if (line.producedQty <= 0) {
        throw new BadRequestException(`${lineLabel}: produced quantity must be greater than zero`);
      }

      if (acceptedQty > line.producedQty) {
        throw new BadRequestException(
          `${lineLabel}: accepted quantity cannot exceed produced quantity`,
        );
      }

      if (acceptedQty < 0) {
        throw new BadRequestException(`${lineLabel}: accepted quantity cannot be negative`);
      }

      if (wastageQty > line.producedQty) {
        throw new BadRequestException(
          `${lineLabel}: wastage quantity cannot exceed produced quantity`,
        );
      }

      if (acceptedQty + wastageQty > line.producedQty + 0.0005) {
        throw new BadRequestException(
          `${lineLabel}: accepted plus wastage quantity cannot exceed produced quantity`,
        );
      }

      return {
        acceptedQty,
        itemId: line.itemId,
        producedQty: line.producedQty,
        remarks: optionalText(line.remarks),
        wastageQty,
      };
    });
  }
}
