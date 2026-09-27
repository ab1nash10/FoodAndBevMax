import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InventoryLocationType,
  ItemType,
  Prisma,
  StockReferenceType,
  StockTransactionType,
  TransferAcknowledgementStatus,
  TransferStatus,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import {
  CreateTransferAcknowledgementDto,
  CreateTransferAcknowledgementLineDto,
} from './dto/create-transfer-acknowledgement.dto';
import {
  ListTransferAcknowledgementsQueryDto,
  TransferAcknowledgementSortField,
} from './dto/list-transfer-acknowledgements-query.dto';
import {
  TransferAcknowledgementsRepository,
  TransferAcknowledgementWithRelations,
  TransferForAcknowledgement,
} from './transfer-acknowledgements.repository';

type AcknowledgementClient = Prisma.TransactionClient;

interface PreparedAcknowledgementLine {
  acceptedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
  transferLine: TransferForAcknowledgement['lines'][number];
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function toDate(value: string): Date {
  return new Date(value);
}

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);

  date.setHours(0, 0, 0, 0);

  return date;
}

function toNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

function quantitiesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0005;
}

function itemStockBusinessDate(itemType: ItemType, businessDate: Date): Date | null {
  return itemType === ItemType.READYMADE ? toDateOnly(businessDate) : null;
}

function getAcknowledgementOrderBy(
  query: ListTransferAcknowledgementsQueryDto,
): Prisma.TransferAcknowledgementOrderByWithRelationInput {
  const sortBy: TransferAcknowledgementSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

function getAcknowledgementStatus(
  lines: PreparedAcknowledgementLine[],
): TransferAcknowledgementStatus {
  const allAccepted = lines.every((line) =>
    quantitiesMatch(line.acceptedQty, toNumber(line.transferLine.sentQty)),
  );
  const allRejected = lines.every((line) =>
    quantitiesMatch(line.rejectedQty, toNumber(line.transferLine.sentQty)),
  );

  if (allAccepted) {
    return TransferAcknowledgementStatus.ACCEPTED_FULL;
  }

  if (allRejected) {
    return TransferAcknowledgementStatus.REJECTED_FULL;
  }

  return TransferAcknowledgementStatus.ACCEPTED_PARTIAL;
}

function toAcknowledgementResponse(acknowledgement: TransferAcknowledgementWithRelations) {
  return {
    acknowledgementDate: acknowledgement.acknowledgementDate,
    createdAt: acknowledgement.createdAt,
    deletedAt: acknowledgement.deletedAt,
    hospital: acknowledgement.hospital,
    hospitalId: acknowledgement.hospitalId,
    id: acknowledgement.id,
    lines: acknowledgement.lines.map((line) => ({
      acceptedQty: toNumber(line.acceptedQty),
      batchNumber: line.batchNumber,
      createdAt: line.createdAt,
      expiryDate: line.expiryDate,
      id: line.id,
      item: line.item,
      itemId: line.itemId,
      rejectedQty: toNumber(line.rejectedQty),
      rejectionReason: line.rejectionReason,
      remarks: line.remarks,
      sentQty: toNumber(line.sentQty),
      transferLineId: line.transferLineId,
      updatedAt: line.updatedAt,
    })),
    remarks: acknowledgement.remarks,
    status: acknowledgement.status,
    transfer: {
      businessDate: acknowledgement.transfer.businessDate,
      destinationId: acknowledgement.transfer.destinationId,
      destinationType: acknowledgement.transfer.destinationType,
      id: acknowledgement.transfer.id,
      sourceId: acknowledgement.transfer.sourceId,
      sourceType: acknowledgement.transfer.sourceType,
      status: acknowledgement.transfer.status,
      transferDate: acknowledgement.transfer.transferDate,
      transferNumber: acknowledgement.transfer.transferNumber,
    },
    transferId: acknowledgement.transferId,
    updatedAt: acknowledgement.updatedAt,
  };
}

@Injectable()
export class TransferAcknowledgementsService {
  constructor(
    private readonly acknowledgements: TransferAcknowledgementsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: ListTransferAcknowledgementsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.TransferAcknowledgementWhereInput = {
      deletedAt: null,
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.transferId ? { transferId: query.transferId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            acknowledgementDate: {
              ...(query.fromDate ? { gte: toDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: toDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { remarks: { contains: query.search, mode: 'insensitive' } },
              { transfer: { transferNumber: { contains: query.search, mode: 'insensitive' } } },
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
      this.acknowledgements.findMany({
        orderBy: getAcknowledgementOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.acknowledgements.count({ where }),
    ]);

    return {
      items: items.map(toAcknowledgementResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toAcknowledgementResponse(await this.findActiveAcknowledgement(id));
  }

  async create(dto: CreateTransferAcknowledgementDto, context: ActorContext) {
    return this.acknowledgements.transaction(async (tx) => {
      const transfer = await this.findTransferForAcknowledgement(dto.transferId, tx);
      const existing = await this.acknowledgements.findExistingForTransfer(dto.transferId, tx);

      if (existing) {
        throw new BadRequestException('Transfer has already been acknowledged');
      }

      const lines = this.prepareLines(dto.items, transfer);
      const status = getAcknowledgementStatus(lines);
      const acknowledgement = await this.acknowledgements.create(
        {
          createdBy: context.actorId,
          hospitalId: transfer.hospitalId,
          remarks: optionalText(dto.remarks),
          status,
          transferId: transfer.id,
          updatedBy: context.actorId,
        },
        tx,
      );

      for (const line of lines) {
        await this.acknowledgements.createLine(
          {
            acceptedQty: line.acceptedQty,
            acknowledgementId: acknowledgement.id,
            batchNumber: line.transferLine.batchNumber,
            createdBy: context.actorId,
            expiryDate: line.transferLine.expiryDate,
            itemId: line.transferLine.itemId,
            rejectedQty: line.rejectedQty,
            rejectionReason: line.rejectionReason,
            remarks: line.remarks,
            sentQty: toNumber(line.transferLine.sentQty),
            transferLineId: line.transferLine.id,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.acknowledgements.updateTransferLine(
          line.transferLine.id,
          {
            acceptedQty: line.acceptedQty,
            rejectedQty: line.rejectedQty,
            rejectionReason: line.rejectionReason,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.postAcceptedStock(transfer, acknowledgement.id, line, context, tx);
        await this.postRejectedReturn(transfer, acknowledgement.id, line, context, tx);
      }

      await this.acknowledgements.updateTransfer(
        transfer.id,
        {
          status: TransferStatus.ACKNOWLEDGED,
          updatedBy: context.actorId,
        },
        tx,
      );

      const created = await this.findActiveAcknowledgement(acknowledgement.id, tx);
      const newValue = toAcknowledgementResponse(created);

      await this.auditLog.record(
        {
          action: 'TRANSFER_ACKNOWLEDGE',
          actorId: context.actorId,
          entityId: acknowledgement.id,
          entityName: 'transfer_acknowledgements',
          hospitalId: acknowledgement.hospitalId,
          ipAddress: context.ipAddress,
          newValue,
        },
        tx,
      );

      return newValue;
    });
  }

  private async findActiveAcknowledgement(
    id: string,
    client?: AcknowledgementClient,
  ): Promise<TransferAcknowledgementWithRelations> {
    const acknowledgement = await this.acknowledgements.findActiveById(id, client);

    if (!acknowledgement) {
      throw new NotFoundException('Transfer acknowledgement not found');
    }

    return acknowledgement;
  }

  private async findTransferForAcknowledgement(
    transferId: string,
    client: AcknowledgementClient,
  ): Promise<TransferForAcknowledgement> {
    const transfer = await this.acknowledgements.findActiveTransfer(transferId, client);

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    if (transfer.status !== TransferStatus.PENDING_ACKNOWLEDGEMENT) {
      throw new BadRequestException('Only pending transfers can be acknowledged');
    }

    if (
      transfer.sourceType !== InventoryLocationType.STORE &&
      transfer.sourceType !== InventoryLocationType.KITCHEN
    ) {
      throw new BadRequestException('Transfer source must be Store or Kitchen');
    }

    if (transfer.destinationType !== InventoryLocationType.RESTAURANT) {
      throw new BadRequestException('Transfer destination must be a restaurant');
    }

    return transfer;
  }

  private prepareLines(
    dtoLines: CreateTransferAcknowledgementLineDto[],
    transfer: TransferForAcknowledgement,
  ): PreparedAcknowledgementLine[] {
    const transferLineMap = new Map(transfer.lines.map((line) => [line.id, line]));
    const dtoLineIds = new Set(dtoLines.map((line) => line.transferLineId));

    if (dtoLineIds.size !== dtoLines.length) {
      throw new BadRequestException('Duplicate acknowledgement lines are not allowed');
    }

    if (dtoLineIds.size !== transfer.lines.length) {
      throw new BadRequestException('All transfer lines must be acknowledged');
    }

    return dtoLines.map((dtoLine, index) => {
      const transferLine = transferLineMap.get(dtoLine.transferLineId);
      const lineLabel = `Line ${index + 1}`;

      if (!transferLine) {
        throw new BadRequestException(`${lineLabel}: transfer line does not belong to transfer`);
      }

      if (dtoLine.itemId && dtoLine.itemId !== transferLine.itemId) {
        throw new BadRequestException(`${lineLabel}: item does not match transfer line`);
      }

      if (dtoLine.batchNumber && dtoLine.batchNumber.trim() !== transferLine.batchNumber) {
        throw new BadRequestException(`${lineLabel}: batch does not match transfer line`);
      }

      if (
        dtoLine.expiryDate &&
        (!transferLine.expiryDate ||
          toDateOnly(dtoLine.expiryDate).getTime() !==
            toDateOnly(transferLine.expiryDate).getTime())
      ) {
        throw new BadRequestException(`${lineLabel}: expiry date does not match transfer line`);
      }

      if (
        dtoLine.sentQty !== undefined &&
        !quantitiesMatch(dtoLine.sentQty, toNumber(transferLine.sentQty))
      ) {
        throw new BadRequestException(`${lineLabel}: sent quantity does not match transfer line`);
      }

      if (
        !quantitiesMatch(dtoLine.acceptedQty + dtoLine.rejectedQty, toNumber(transferLine.sentQty))
      ) {
        throw new BadRequestException(
          `${lineLabel}: accepted plus rejected quantity must equal sent quantity`,
        );
      }

      if (dtoLine.rejectedQty > 0 && !optionalText(dtoLine.rejectionReason)) {
        throw new BadRequestException(`${lineLabel}: rejection reason is required`);
      }

      return {
        acceptedQty: dtoLine.acceptedQty,
        rejectedQty: dtoLine.rejectedQty,
        rejectionReason: optionalText(dtoLine.rejectionReason),
        remarks: optionalText(dtoLine.remarks),
        transferLine,
      };
    });
  }

  private async postAcceptedStock(
    transfer: TransferForAcknowledgement,
    acknowledgementId: string,
    line: PreparedAcknowledgementLine,
    context: ActorContext,
    client: AcknowledgementClient,
  ): Promise<void> {
    if (line.acceptedQty <= 0) {
      return;
    }

    const balance = await this.acknowledgements.upsertStockBalance(
      {
        actorId: context.actorId,
        batchNumber: line.transferLine.batchNumber,
        businessDate: itemStockBusinessDate(line.transferLine.item.itemType, transfer.businessDate),
        expiryDate: line.transferLine.expiryDate,
        hospitalId: transfer.hospitalId,
        itemId: line.transferLine.itemId,
        itemType: line.transferLine.item.itemType,
        locationId: transfer.destinationId,
        locationType: InventoryLocationType.RESTAURANT,
        quantity: line.acceptedQty,
      },
      client,
    );

    await this.acknowledgements.createStockLedger(
      {
        balanceAfter: toNumber(balance.availableQty),
        batchNumber: line.transferLine.batchNumber,
        businessDate: transfer.businessDate,
        createdBy: context.actorId,
        expiryDate: line.transferLine.expiryDate,
        hospitalId: transfer.hospitalId,
        itemId: line.transferLine.itemId,
        itemType: line.transferLine.item.itemType,
        locationId: transfer.destinationId,
        locationType: InventoryLocationType.RESTAURANT,
        qtyIn: line.acceptedQty,
        qtyOut: 0,
        referenceId: acknowledgementId,
        referenceType: StockReferenceType.TRANSFER_ACKNOWLEDGEMENT,
        remarks: line.remarks,
        transactionDateTime: new Date(),
        transactionType: StockTransactionType.RESTAURANT_TRANSFER_IN,
        updatedBy: context.actorId,
      },
      client,
    );
  }

  private async postRejectedReturn(
    transfer: TransferForAcknowledgement,
    acknowledgementId: string,
    line: PreparedAcknowledgementLine,
    context: ActorContext,
    client: AcknowledgementClient,
  ): Promise<void> {
    if (line.rejectedQty <= 0) {
      return;
    }

    const balance = await this.acknowledgements.upsertStockBalance(
      {
        actorId: context.actorId,
        batchNumber: line.transferLine.batchNumber,
        businessDate: itemStockBusinessDate(line.transferLine.item.itemType, transfer.businessDate),
        expiryDate: line.transferLine.expiryDate,
        hospitalId: transfer.hospitalId,
        itemId: line.transferLine.itemId,
        itemType: line.transferLine.item.itemType,
        locationId: transfer.sourceId,
        locationType: transfer.sourceType,
        quantity: line.rejectedQty,
      },
      client,
    );

    await this.acknowledgements.createStockLedger(
      {
        balanceAfter: toNumber(balance.availableQty),
        batchNumber: line.transferLine.batchNumber,
        businessDate: transfer.businessDate,
        createdBy: context.actorId,
        expiryDate: line.transferLine.expiryDate,
        hospitalId: transfer.hospitalId,
        itemId: line.transferLine.itemId,
        itemType: line.transferLine.item.itemType,
        locationId: transfer.sourceId,
        locationType: transfer.sourceType,
        qtyIn: line.rejectedQty,
        qtyOut: 0,
        referenceId: acknowledgementId,
        referenceType: StockReferenceType.TRANSFER_ACKNOWLEDGEMENT,
        remarks: line.rejectionReason,
        transactionDateTime: new Date(),
        transactionType: StockTransactionType.TRANSFER_REJECTED_RETURN_IN,
        updatedBy: context.actorId,
      },
      client,
    );
  }
}
