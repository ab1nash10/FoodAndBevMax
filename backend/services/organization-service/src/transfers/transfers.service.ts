import { NotificationPublisher } from '@aahar/auth';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryLocationType, Prisma, StockReferenceType, TransferStatus } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { NOTIFY_ROLES } from '../common/notification-roles';
import { getDocumentOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { lockRow } from '../common/row-lock';
import type { ActorContext } from '../common/request-context';
import { CreateTransferDto, CreateTransferLineDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { TransfersRepository, TransferWithRelations } from './transfers.repository';
import { optionalText, toDate, toDateOnly, toNumber } from '../common/values';
import {
  assertCanMoveStockFrom,
  assertSupportedSource,
  dispatchTransactionType,
  insufficientStockMessage,
  sourceDisplayName,
  sourceItemType,
  stockBalanceKey,
  stockKey,
  toNullableDate,
  toNullableText,
  toTransferResponse,
  type PreparedTransferLine,
} from './transfers.helpers';

type TransferClient = Prisma.TransactionClient;

@Injectable()
export class TransfersService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationPublisher,
    private readonly transfers: TransfersRepository,
  ) {}

  async list(query: ListTransfersQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.TransferWhereInput = {
      deletedAt: null,
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.destinationType ? { destinationType: query.destinationType } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            transferDate: {
              ...(query.fromDate ? { gte: toDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: toDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { transferNumber: { contains: query.search, mode: 'insensitive' } },
              { remarks: { contains: query.search, mode: 'insensitive' } },
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
      this.transfers.findMany({
        orderBy: getDocumentOrderBy(query, 'transferNumber', 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.transfers.count({ where }),
    ]);

    return {
      items: items.map(toTransferResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toTransferResponse(await this.findActiveTransfer(id));
  }

  async create(dto: CreateTransferDto, context: ActorContext) {
    assertCanMoveStockFrom(dto.sourceType, 'CREATE', context.permissions);

    return this.transfers.transaction(async (tx) => {
      await this.assertTransferHeader(dto, tx);
      const transferDate = toDate(dto.transferDate);
      const businessDate = dto.businessDate
        ? toDateOnly(dto.businessDate)
        : toDateOnly(transferDate);
      const lines = await this.prepareLines(
        dto.items,
        dto.hospitalId,
        dto.sourceId,
        dto.sourceType,
        businessDate,
        tx,
      );

      const transfer = await this.transfers.create(
        {
          businessDate,
          createdBy: context.actorId,
          destinationId: dto.destinationId,
          destinationType: dto.destinationType,
          hospitalId: dto.hospitalId,
          remarks: optionalText(dto.remarks),
          sourceId: dto.sourceId,
          sourceType: dto.sourceType,
          status: TransferStatus.DRAFT,
          transferDate,
          updatedBy: context.actorId,
        },
        tx,
      );

      for (const line of lines) {
        await this.transfers.createLine(
          {
            batchNumber: line.batchNumber,
            createdBy: context.actorId,
            expiryDate: line.expiryDate,
            itemId: line.itemId,
            remarks: line.remarks,
            sentQty: line.sentQty,
            transferId: transfer.id,
            updatedBy: context.actorId,
          },
          tx,
        );
      }

      const created = await this.findActiveTransfer(transfer.id, tx);
      const newValue = toTransferResponse(created);

      await this.auditLog.record(
        {
          action: 'TRANSFER_CREATE',
          actorId: context.actorId,
          entityId: created.id,
          entityName: 'transfers',
          hospitalId: created.hospitalId,
          ipAddress: context.ipAddress,
          newValue,
        },
        tx,
      );

      return newValue;
    });
  }

  async dispatch(id: string, context: ActorContext) {
    return this.transfers.transaction(async (tx) => {
      await lockRow(tx, 'transfers', id);
      const existing = await this.findActiveTransfer(id, tx);

      assertCanMoveStockFrom(existing.sourceType, 'DISPATCH', context.permissions);

      if (existing.status !== TransferStatus.DRAFT) {
        throw new BadRequestException('Only draft transfers can be dispatched');
      }

      await this.assertTransferEntitiesActive(
        {
          destinationId: existing.destinationId,
          destinationType: existing.destinationType,
          hospitalId: existing.hospitalId,
          sourceId: existing.sourceId,
          sourceType: existing.sourceType,
        },
        tx,
      );

      for (const line of existing.lines) {
        const balance = await this.findSourceBalanceForLine(
          existing.hospitalId,
          existing.sourceId,
          existing.sourceType,
          existing.businessDate,
          line,
          tx,
        );
        const sentQty = toNumber(line.sentQty);
        const updatedBalance = await this.transfers.decrementStockBalance(
          balance.id,
          sentQty,
          context.actorId,
          tx,
        );

        if (!updatedBalance) {
          throw new BadRequestException(
            `${line.item.itemName}: sent quantity exceeds current ${sourceDisplayName(
              existing.sourceType,
            )} available quantity`,
          );
        }

        await this.transfers.createStockLedger(
          {
            balanceAfter: toNumber(updatedBalance.availableQty),
            batchNumber: line.batchNumber,
            businessDate: existing.businessDate,
            createdBy: context.actorId,
            expiryDate: line.expiryDate,
            hospitalId: existing.hospitalId,
            itemId: line.itemId,
            itemType: line.item.itemType,
            locationId: existing.sourceId,
            locationType: existing.sourceType,
            qtyIn: 0,
            qtyOut: sentQty,
            referenceId: existing.id,
            referenceType: StockReferenceType.TRANSFER,
            remarks: existing.remarks,
            transactionDateTime: new Date(),
            transactionType: dispatchTransactionType(existing.sourceType),
            updatedBy: context.actorId,
          },
          tx,
        );
      }

      const dispatched = await this.transfers.update(
        id,
        {
          status: TransferStatus.PENDING_ACKNOWLEDGEMENT,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'TRANSFER_DISPATCH',
          actorId: context.actorId,
          entityId: id,
          entityName: 'transfers',
          hospitalId: dispatched.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toTransferResponse(dispatched),
          oldValue: toTransferResponse(existing),
        },
        tx,
      );

      // The transfer now sits in PENDING_ACKNOWLEDGEMENT and cannot move stock until someone
      // at the destination acts on it, so this is the moment worth telling them about.
      await this.notifications.publish(
        {
          actorId: context.actorId,
          body: `${dispatched.lines.length} line(s) are waiting to be acknowledged before the stock is credited.`,
          category: 'TRANSFER',
          entityId: dispatched.id,
          entityName: 'transfers',
          hospitalId: dispatched.hospitalId,
          link: '/inventory/transfers',
          roleNames: NOTIFY_ROLES,
          title: `Transfer ${dispatched.transferNumber} awaiting acknowledgement`,
        },
        tx,
      );

      return toTransferResponse(dispatched);
    });
  }

  async cancel(id: string, context: ActorContext) {
    return this.transfers.transaction(async (tx) => {
      await lockRow(tx, 'transfers', id);
      const existing = await this.findActiveTransfer(id, tx);

      if (existing.status !== TransferStatus.DRAFT) {
        throw new BadRequestException('Only draft transfers can be cancelled');
      }

      const cancelled = await this.transfers.update(
        id,
        {
          status: TransferStatus.CANCELLED,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'TRANSFER_CANCEL',
          actorId: context.actorId,
          entityId: id,
          entityName: 'transfers',
          hospitalId: cancelled.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toTransferResponse(cancelled),
          oldValue: toTransferResponse(existing),
        },
        tx,
      );

      return toTransferResponse(cancelled);
    });
  }

  private async assertTransferHeader(dto: CreateTransferDto, client: TransferClient) {
    assertSupportedSource(dto.sourceType);

    if (dto.sourceId === dto.destinationId) {
      throw new BadRequestException('Source and destination cannot be same');
    }

    await this.assertTransferEntitiesActive(dto, client);
  }

  private async assertTransferEntitiesActive(
    transfer: Pick<
      CreateTransferDto,
      'destinationId' | 'destinationType' | 'hospitalId' | 'sourceId' | 'sourceType'
    >,
    client: TransferClient,
  ) {
    assertSupportedSource(transfer.sourceType);

    if (transfer.destinationType !== InventoryLocationType.RESTAURANT) {
      throw new BadRequestException('Destination must be a restaurant');
    }

    const [hospital, source, restaurant] = await Promise.all([
      this.transfers.findActiveHospital(transfer.hospitalId, client),
      transfer.sourceType === InventoryLocationType.KITCHEN
        ? this.transfers.findActiveKitchen(transfer.sourceId, client)
        : this.transfers.findActiveStore(transfer.sourceId, client),
      this.transfers.findActiveRestaurant(transfer.destinationId, client),
    ]);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }

    if (!source || !source.isActive) {
      throw new BadRequestException(
        `${sourceDisplayName(transfer.sourceType)} not found or inactive`,
      );
    }

    if (!restaurant || !restaurant.isActive) {
      throw new BadRequestException('Restaurant not found or inactive');
    }

    if (source.hospitalId !== transfer.hospitalId) {
      throw new BadRequestException(
        `${sourceDisplayName(transfer.sourceType)} does not belong to selected location`,
      );
    }

    if (restaurant.hospitalId !== transfer.hospitalId) {
      throw new BadRequestException('Restaurant does not belong to selected location');
    }
  }

  private async findActiveTransfer(
    id: string,
    client?: TransferClient,
  ): Promise<TransferWithRelations> {
    const transfer = await this.transfers.findActiveById(id, client);

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return transfer;
  }

  private async findSourceBalanceForLine(
    hospitalId: string,
    sourceId: string,
    sourceType: InventoryLocationType,
    businessDate: Date,
    line: TransferWithRelations['lines'][number],
    client: TransferClient,
  ) {
    const lineStockKey = stockBalanceKey(
      {
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        itemId: line.itemId,
      },
      businessDate,
    );
    const [balance] = await this.transfers.findActiveSourceStockBalances(
      hospitalId,
      sourceId,
      sourceType,
      sourceItemType(sourceType),
      [lineStockKey],
      client,
    );

    if (!balance || toNumber(balance.availableQty) < toNumber(line.sentQty)) {
      throw new BadRequestException(
        insufficientStockMessage(
          {
            batchNumber: line.batchNumber,
            expiryDate: line.expiryDate,
            itemName: line.item.itemName,
          },
          businessDate,
          balance ? toNumber(balance.availableQty) : 0,
          toNumber(line.sentQty),
        ),
      );
    }

    return balance;
  }

  private async prepareLines(
    lines: CreateTransferLineDto[],
    hospitalId: string,
    sourceId: string,
    sourceType: InventoryLocationType,
    businessDate: Date,
    client: TransferClient,
  ): Promise<PreparedTransferLine[]> {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const items = await this.transfers.findItemsByIds(itemIds, client);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const expectedItemType = sourceItemType(sourceType);
    const prepared = lines.map((line, index) => {
      const item = itemMap.get(line.itemId);
      const lineLabel = `Line ${index + 1}`;
      const batchNumber = toNullableText(line.batchNumber);
      const expiryDate = toNullableDate(line.expiryDate);

      if (!item) {
        throw new BadRequestException(`${lineLabel}: This item is inactive and cannot be used.`);
      }

      if (item.itemType !== expectedItemType) {
        throw new BadRequestException(
          `${lineLabel}: ${sourceDisplayName(sourceType)} transfers support only ${expectedItemType} items`,
        );
      }

      if (sourceType === InventoryLocationType.STORE && !batchNumber) {
        throw new BadRequestException(`${lineLabel}: batch number is required`);
      }

      if (sourceType === InventoryLocationType.STORE && !expiryDate) {
        throw new BadRequestException(`${lineLabel}: expiry date is required`);
      }

      if (sourceType === InventoryLocationType.KITCHEN && (batchNumber || expiryDate)) {
        throw new BadRequestException(
          `${lineLabel}: kitchen READYMADE transfers must not include batch or expiry`,
        );
      }

      return {
        batchNumber,
        expiryDate,
        itemId: line.itemId,
        itemName: item.itemName,
        itemType: item.itemType,
        remarks: optionalText(line.remarks),
        sentQty: line.sentQty,
      };
    });
    const totals = new Map<string, number>();
    const lineByKey = new Map<string, PreparedTransferLine>();

    prepared.forEach((line) => {
      const key = stockKey(stockBalanceKey(line, businessDate));
      totals.set(key, (totals.get(key) ?? 0) + line.sentQty);
      lineByKey.set(key, line);
    });

    const balances = await this.transfers.findActiveSourceStockBalances(
      hospitalId,
      sourceId,
      sourceType,
      expectedItemType,
      prepared.map((line) => stockBalanceKey(line, businessDate)),
      client,
    );
    const balanceMap = new Map(balances.map((balance) => [stockKey(balance), balance]));

    for (const [key, requestedQty] of totals.entries()) {
      const balance = balanceMap.get(key);
      const line = lineByKey.get(key);

      if (!balance || toNumber(balance.availableQty) < requestedQty) {
        throw new BadRequestException(
          insufficientStockMessage(
            line!,
            businessDate,
            balance ? toNumber(balance.availableQty) : 0,
            requestedQty,
          ),
        );
      }
    }

    return prepared;
  }
}
