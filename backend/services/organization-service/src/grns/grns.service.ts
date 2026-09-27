import { NotificationPublisher } from '@aahar/auth';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GrnStatus,
  InventoryLocationType,
  ItemType,
  Prisma,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { NOTIFY_ROLES } from '../common/notification-roles';
import { getPageMeta, getPagination } from '../common/pagination';
import { lockRow } from '../common/row-lock';
import type { ActorContext } from '../common/request-context';
import { CreateGrnDto, CreateGrnLineDto } from './dto/create-grn.dto';
import { GrnSortField, ListGrnsQueryDto } from './dto/list-grns-query.dto';
import { UpdateGrnDto } from './dto/update-grn.dto';
import { GrnsRepository, GrnWithRelations } from './grns.repository';

type GrnClient = Prisma.TransactionClient;

interface PreparedGrnBatch {
  acceptedQty: number;
  batchNumber: string;
  expiryDate: Date;
  manufacturingDate?: Date;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
}

interface PreparedGrnLine {
  acceptedQty: number;
  batches: PreparedGrnBatch[];
  itemId: string;
  orderedQty?: number;
  receivedQty: number;
  rejectedQty: number;
  rejectionReason?: string;
  remarks?: string;
}

function getGrnOrderBy(query: ListGrnsQueryDto): Prisma.GrnOrderByWithRelationInput {
  const sortBy: GrnSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
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

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(3));
}

function isExpiredForAcceptance(expiryDate: Date): boolean {
  const today = toDateOnly(new Date());

  return toDateOnly(expiryDate) < today;
}

function toGrnResponse(grn: GrnWithRelations) {
  return {
    createdAt: grn.createdAt,
    deletedAt: grn.deletedAt,
    grnNumber: grn.grnNumber,
    hospital: grn.hospital,
    hospitalId: grn.hospitalId,
    id: grn.id,
    invoiceNumber: grn.invoiceNumber,
    lines: grn.lines.map((line) => ({
      acceptedQty: toNumber(line.acceptedQty),
      batches: line.batches.map((batch) => ({
        acceptedQty: toNumber(batch.acceptedQty),
        batchNumber: batch.batchNumber,
        createdAt: batch.createdAt,
        expiryDate: batch.expiryDate,
        grnLineId: batch.grnLineId,
        id: batch.id,
        itemId: batch.itemId,
        manufacturingDate: batch.manufacturingDate,
        receivedQty: toNumber(batch.receivedQty),
        rejectedQty: toNumber(batch.rejectedQty),
        rejectionReason: batch.rejectionReason,
        updatedAt: batch.updatedAt,
      })),
      createdAt: line.createdAt,
      grnId: line.grnId,
      id: line.id,
      item: line.item,
      itemId: line.itemId,
      orderedQty: line.orderedQty === null ? null : toNumber(line.orderedQty),
      receivedQty: toNumber(line.receivedQty),
      rejectedQty: toNumber(line.rejectedQty),
      rejectionReason: line.rejectionReason,
      remarks: line.remarks,
      updatedAt: line.updatedAt,
    })),
    poNumber: grn.poNumber,
    receivedBy: grn.receivedBy,
    receivedDate: grn.receivedDate,
    remarks: grn.remarks,
    status: grn.status,
    store: grn.store,
    storeId: grn.storeId,
    updatedAt: grn.updatedAt,
    vendorName: grn.vendorName,
  };
}

@Injectable()
export class GrnsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly grns: GrnsRepository,
    private readonly notifications: NotificationPublisher,
  ) {}

  async list(query: ListGrnsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.GrnWhereInput = {
      deletedAt: null,
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            receivedDate: {
              ...(query.fromDate ? { gte: toDate(query.fromDate) } : {}),
              ...(query.toDate ? { lte: toDate(query.toDate) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { grnNumber: { contains: query.search, mode: 'insensitive' } },
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { poNumber: { contains: query.search, mode: 'insensitive' } },
              { store: { storeName: { contains: query.search, mode: 'insensitive' } } },
              { vendorName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.grns.findMany({
        orderBy: getGrnOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.grns.count({ where }),
    ]);

    return {
      items: items.map(toGrnResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toGrnResponse(await this.findActiveGrn(id));
  }

  async create(dto: CreateGrnDto, context: ActorContext) {
    try {
      return await this.grns.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);
        await this.assertActiveStoreForHospital(dto.storeId, dto.hospitalId, tx);
        const lines = await this.prepareLines(dto.items, dto.storeId, tx);

        const grn = await this.grns.create(
          {
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            invoiceNumber: optionalText(dto.invoiceNumber),
            poNumber: optionalText(dto.poNumber),
            receivedBy: dto.receivedBy.trim(),
            receivedDate: toDate(dto.receivedDate),
            remarks: optionalText(dto.remarks),
            status: GrnStatus.DRAFT,
            storeId: dto.storeId,
            updatedBy: context.actorId,
            vendorName: optionalText(dto.vendorName),
          },
          tx,
        );

        await this.createLines(grn.id, lines, context.actorId, tx);
        const created = await this.findActiveGrn(grn.id, tx);
        const newValue = toGrnResponse(created);

        await this.auditLog.record(
          {
            action: 'GRN_CREATE',
            actorId: context.actorId,
            entityId: created.id,
            entityName: 'grns',
            hospitalId: created.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'GRN');
    }
  }

  async update(id: string, dto: UpdateGrnDto, context: ActorContext) {
    try {
      return await this.grns.transaction(async (tx) => {
        await lockRow(tx, 'grns', id);
        const existing = await this.findActiveGrn(id, tx);

        this.assertEditable(existing);

        const oldValue = toGrnResponse(existing);
        const nextHospitalId = dto.hospitalId ?? existing.hospitalId;
        const nextStoreId = dto.storeId ?? existing.storeId;
        let preparedLines: PreparedGrnLine[] | undefined;

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
        }

        if (dto.storeId !== undefined || dto.hospitalId !== undefined) {
          await this.assertActiveStoreForHospital(nextStoreId, nextHospitalId, tx);
        }

        if (dto.items !== undefined) {
          preparedLines = await this.prepareLines(dto.items, nextStoreId, tx);
        }

        const data: Prisma.GrnUpdateInput = {};

        if (dto.hospitalId !== undefined) {
          data.hospital = { connect: { id: dto.hospitalId } };
        }

        if (dto.storeId !== undefined) {
          data.store = { connect: { id: dto.storeId } };
        }

        if (dto.receivedDate !== undefined) {
          data.receivedDate = toDate(dto.receivedDate);
        }

        if (dto.receivedBy !== undefined) {
          data.receivedBy = dto.receivedBy.trim();
        }

        if (dto.vendorName !== undefined) {
          data.vendorName = optionalText(dto.vendorName);
        }

        if (dto.poNumber !== undefined) {
          data.poNumber = optionalText(dto.poNumber);
        }

        if (dto.invoiceNumber !== undefined) {
          data.invoiceNumber = optionalText(dto.invoiceNumber);
        }

        if (dto.remarks !== undefined) {
          data.remarks = optionalText(dto.remarks);
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        if (Object.keys(data).length > 0) {
          await this.grns.update(id, data, tx);
        }

        if (preparedLines) {
          await this.grns.softDeleteLinesAndBatches(id, context.actorId, tx);
          await this.createLines(id, preparedLines, context.actorId, tx);
        }

        const updated = await this.findActiveGrn(id, tx);
        const newValue = toGrnResponse(updated);

        await this.auditLog.record(
          {
            action: 'GRN_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'grns',
            hospitalId: updated.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
            oldValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'GRN');
    }
  }

  async remove(id: string, context: ActorContext) {
    await this.grns.transaction(async (tx) => {
      // Read under the lock, or a delete landing just after a post removed a posted GRN.
      await lockRow(tx, 'grns', id);
      const existing = await this.findActiveGrn(id, tx);

      this.assertEditable(existing);

      await this.grns.softDeleteLinesAndBatches(id, context.actorId, tx);
      await this.grns.update(
        id,
        {
          deletedAt: new Date(),
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'GRN_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'grns',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toGrnResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  async cancel(id: string, context: ActorContext) {
    return this.grns.transaction(async (tx) => {
      await lockRow(tx, 'grns', id);
      const existing = await this.findActiveGrn(id, tx);

      if (existing.status === GrnStatus.POSTED_TO_STOCK) {
        throw new BadRequestException('Posted GRN cannot be cancelled');
      }

      if (existing.status === GrnStatus.CANCELLED) {
        return toGrnResponse(existing);
      }

      const cancelled = await this.grns.update(
        id,
        {
          status: GrnStatus.CANCELLED,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'GRN_CANCEL',
          actorId: context.actorId,
          entityId: id,
          entityName: 'grns',
          hospitalId: cancelled.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toGrnResponse(cancelled),
          oldValue: toGrnResponse(existing),
        },
        tx,
      );

      return toGrnResponse(cancelled);
    });
  }

  async postToStock(id: string, context: ActorContext) {
    return this.grns.transaction(async (tx) => {
      await lockRow(tx, 'grns', id);
      const existing = await this.findActiveGrn(id, tx);

      if (existing.status === GrnStatus.POSTED_TO_STOCK) {
        throw new BadRequestException('GRN is already posted to stock');
      }

      if (existing.status === GrnStatus.CANCELLED) {
        throw new BadRequestException('Cancelled GRN cannot be posted to stock');
      }

      await this.assertActiveHospital(existing.hospitalId, tx);
      await this.assertActiveStoreForHospital(existing.storeId, existing.hospitalId, tx);

      for (const line of existing.lines) {
        for (const batch of line.batches) {
          const acceptedQty = toNumber(batch.acceptedQty);

          if (acceptedQty <= 0) {
            continue;
          }

          if (isExpiredForAcceptance(batch.expiryDate)) {
            throw new BadRequestException(`Expired batch ${batch.batchNumber} cannot be accepted`);
          }

          const balance = await this.grns.upsertStockBalance(
            {
              actorId: context.actorId,
              batchNumber: batch.batchNumber,
              expiryDate: batch.expiryDate,
              hospitalId: existing.hospitalId,
              itemId: batch.itemId,
              locationId: existing.storeId,
              quantity: acceptedQty,
            },
            tx,
          );

          await this.grns.createStockLedger(
            {
              balanceAfter: toNumber(balance.availableQty),
              batchNumber: batch.batchNumber,
              businessDate: toDateOnly(existing.receivedDate),
              createdBy: context.actorId,
              expiryDate: batch.expiryDate,
              hospitalId: existing.hospitalId,
              itemId: batch.itemId,
              itemType: ItemType.MRP,
              locationId: existing.storeId,
              locationType: InventoryLocationType.STORE,
              qtyIn: acceptedQty,
              qtyOut: 0,
              referenceId: existing.id,
              referenceType: StockReferenceType.GRN,
              remarks: existing.remarks,
              transactionDateTime: new Date(),
              transactionType: StockTransactionType.GRN_IN,
              updatedBy: context.actorId,
            },
            tx,
          );
        }
      }

      const posted = await this.grns.update(
        id,
        {
          status: GrnStatus.POSTED_TO_STOCK,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'GRN_POST',
          actorId: context.actorId,
          entityId: id,
          entityName: 'grns',
          hospitalId: posted.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toGrnResponse(posted),
          oldValue: toGrnResponse(existing),
        },
        tx,
      );

      await this.notifications.publish(
        {
          actorId: context.actorId,
          body: `${posted.lines.length} line(s) received into store stock.`,
          category: 'GRN',
          entityId: posted.id,
          entityName: 'grns',
          hospitalId: posted.hospitalId,
          link: '/inventory/grns',
          roleNames: NOTIFY_ROLES,
          title: `GRN ${posted.grnNumber} posted to stock`,
        },
        tx,
      );

      return toGrnResponse(posted);
    });
  }

  private async assertActiveHospital(hospitalId: string, client: GrnClient): Promise<void> {
    const hospital = await this.grns.findActiveHospital(hospitalId, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async assertActiveStoreForHospital(
    storeId: string,
    hospitalId: string,
    client: GrnClient,
  ): Promise<void> {
    const store = await this.grns.findActiveStore(storeId, client);

    if (!store || !store.isActive) {
      throw new BadRequestException('Store not found or inactive');
    }

    if (store.hospitalId !== hospitalId) {
      throw new BadRequestException('Store does not belong to selected hospital');
    }
  }

  private assertEditable(grn: GrnWithRelations): void {
    if (grn.status === GrnStatus.POSTED_TO_STOCK) {
      throw new BadRequestException('Posted GRN cannot be edited');
    }

    if (grn.status === GrnStatus.CANCELLED) {
      throw new BadRequestException('Cancelled GRN cannot be edited');
    }
  }

  private async createLines(
    grnId: string,
    lines: PreparedGrnLine[],
    actorId: string | undefined,
    client: GrnClient,
  ): Promise<void> {
    for (const line of lines) {
      const createdLine = await client.grnLine.create({
        data: {
          acceptedQty: line.acceptedQty,
          createdBy: actorId,
          grnId,
          itemId: line.itemId,
          orderedQty: line.orderedQty,
          receivedQty: line.receivedQty,
          rejectedQty: line.rejectedQty,
          rejectionReason: line.rejectionReason,
          remarks: line.remarks,
          updatedBy: actorId,
        },
      });

      for (const batch of line.batches) {
        await this.grns.createBatch(
          {
            acceptedQty: batch.acceptedQty,
            batchNumber: batch.batchNumber,
            createdBy: actorId,
            expiryDate: batch.expiryDate,
            grnLineId: createdLine.id,
            itemId: line.itemId,
            manufacturingDate: batch.manufacturingDate,
            receivedQty: batch.receivedQty,
            rejectedQty: batch.rejectedQty,
            rejectionReason: batch.rejectionReason,
            updatedBy: actorId,
          },
          client,
        );
      }
    }
  }

  private async findActiveGrn(id: string, client?: GrnClient): Promise<GrnWithRelations> {
    const grn = await this.grns.findActiveById(id, client);

    if (!grn) {
      throw new NotFoundException('GRN not found');
    }

    return grn;
  }

  private async prepareLines(
    lines: CreateGrnLineDto[],
    storeId: string,
    client: GrnClient,
  ): Promise<PreparedGrnLine[]> {
    const itemIds = [...new Set(lines.map((line) => line.itemId))];
    const mappings = await this.grns.findActiveStoreMappings(storeId, itemIds, client);
    const mappedItems = new Map(mappings.map((mapping) => [mapping.itemId, mapping.item] as const));

    return lines.map((line, index) => {
      const item = mappedItems.get(line.itemId);
      const lineLabel = `Line ${index + 1}`;

      if (!item) {
        throw new BadRequestException(`${lineLabel}: This store item mapping is inactive.`);
      }

      if (item.itemType !== ItemType.MRP) {
        throw new BadRequestException(`${lineLabel}: only MRP items can be added to GRN`);
      }

      if (!quantitiesMatch(line.receivedQty, line.acceptedQty + line.rejectedQty)) {
        throw new BadRequestException(
          `${lineLabel}: received quantity must equal accepted plus rejected quantity`,
        );
      }

      const batches = line.batches.map((batch, batchIndex) => {
        const batchLabel = `${lineLabel}, batch ${batchIndex + 1}`;
        const batchNumber = batch.batchNumber.trim();
        const expiryDate = toDateOnly(batch.expiryDate);
        const acceptedQty = batch.acceptedQty;
        const rejectedQty = batch.rejectedQty;

        if (!batchNumber) {
          throw new BadRequestException(`${batchLabel}: batch number is required`);
        }

        if (!quantitiesMatch(batch.receivedQty, acceptedQty + rejectedQty)) {
          throw new BadRequestException(
            `${batchLabel}: received quantity must equal accepted plus rejected quantity`,
          );
        }

        if (acceptedQty > 0 && isExpiredForAcceptance(expiryDate)) {
          throw new BadRequestException(`${batchLabel}: expired batch cannot be accepted`);
        }

        return {
          acceptedQty,
          batchNumber,
          expiryDate,
          manufacturingDate: batch.manufacturingDate
            ? toDateOnly(batch.manufacturingDate)
            : undefined,
          receivedQty: batch.receivedQty,
          rejectedQty,
          rejectionReason: optionalText(batch.rejectionReason),
        };
      });

      if (!quantitiesMatch(line.receivedQty, sum(batches.map((batch) => batch.receivedQty)))) {
        throw new BadRequestException(
          `${lineLabel}: line received quantity must equal batch total`,
        );
      }

      if (!quantitiesMatch(line.acceptedQty, sum(batches.map((batch) => batch.acceptedQty)))) {
        throw new BadRequestException(
          `${lineLabel}: line accepted quantity must equal batch total`,
        );
      }

      if (!quantitiesMatch(line.rejectedQty, sum(batches.map((batch) => batch.rejectedQty)))) {
        throw new BadRequestException(
          `${lineLabel}: line rejected quantity must equal batch total`,
        );
      }

      return {
        acceptedQty: line.acceptedQty,
        batches,
        itemId: line.itemId,
        orderedQty: line.orderedQty,
        receivedQty: line.receivedQty,
        rejectedQty: line.rejectedQty,
        rejectionReason: optionalText(line.rejectionReason),
        remarks: optionalText(line.remarks),
      };
    });
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
