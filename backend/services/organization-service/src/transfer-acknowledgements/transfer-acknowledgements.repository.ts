import { Injectable } from '@nestjs/common';
import { InventoryLocationType, ItemType, Prisma, StockBalance, Transfer } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const acknowledgementInclude = {
  hospital: {
    select: {
      hospitalCode: true,
      hospitalName: true,
      id: true,
      isActive: true,
    },
  },
  lines: {
    include: {
      item: {
        select: {
          id: true,
          isActive: true,
          itemCode: true,
          itemName: true,
          itemType: true,
          type: true,
        },
      },
      transferLine: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
    where: {
      deletedAt: null,
    },
  },
  transfer: {
    include: {
      lines: {
        include: {
          item: {
            select: {
              id: true,
              isActive: true,
              itemCode: true,
              itemName: true,
              itemType: true,
              type: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        where: {
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.TransferAcknowledgementInclude;

export type TransferAcknowledgementWithRelations = Prisma.TransferAcknowledgementGetPayload<{
  include: typeof acknowledgementInclude;
}>;

export type TransferForAcknowledgement = TransferAcknowledgementWithRelations['transfer'];

type AcknowledgementClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TransferAcknowledgementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.TransferAcknowledgementCountArgs): Promise<number> {
    return this.prisma.transferAcknowledgement.count(args);
  }

  async create(
    data: Prisma.TransferAcknowledgementUncheckedCreateInput,
    client: AcknowledgementClient,
  ): Promise<TransferAcknowledgementWithRelations> {
    return client.transferAcknowledgement.create({
      data,
      include: acknowledgementInclude,
    });
  }

  async createLine(
    data: Prisma.TransferAcknowledgementLineUncheckedCreateInput,
    client: AcknowledgementClient,
  ): Promise<void> {
    await client.transferAcknowledgementLine.create({ data });
  }

  async createStockLedger(
    data: Prisma.StockLedgerUncheckedCreateInput,
    client: AcknowledgementClient,
  ): Promise<void> {
    await client.stockLedger.create({ data });
  }

  async findActiveById(
    id: string,
    client: AcknowledgementClient = this.prisma,
  ): Promise<TransferAcknowledgementWithRelations | null> {
    return client.transferAcknowledgement.findFirst({
      include: acknowledgementInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveTransfer(
    transferId: string,
    client: AcknowledgementClient,
  ): Promise<TransferForAcknowledgement | null> {
    return client.transfer.findFirst({
      include: acknowledgementInclude.transfer.include,
      where: {
        deletedAt: null,
        id: transferId,
      },
    });
  }

  async findExistingForTransfer(
    transferId: string,
    client: AcknowledgementClient,
  ): Promise<Transfer | null> {
    return client.transferAcknowledgement
      .findFirst({
        select: {
          transfer: true,
        },
        where: {
          deletedAt: null,
          transferId,
        },
      })
      .then((record) => record?.transfer ?? null);
  }

  async findMany(
    args: Prisma.TransferAcknowledgementFindManyArgs,
  ): Promise<TransferAcknowledgementWithRelations[]> {
    return this.prisma.transferAcknowledgement.findMany({
      ...args,
      include: acknowledgementInclude,
    });
  }

  async findStockBalance(
    {
      batchNumber,
      businessDate,
      expiryDate,
      hospitalId,
      itemType,
      itemId,
      locationId,
      locationType,
    }: {
      batchNumber: string | null;
      businessDate: Date | null;
      expiryDate: Date | null;
      hospitalId: string;
      itemType: ItemType;
      itemId: string;
      locationId: string;
      locationType: InventoryLocationType;
    },
    client: AcknowledgementClient,
  ): Promise<StockBalance | null> {
    return client.stockBalance.findFirst({
      where: {
        batchNumber,
        businessDate,
        deletedAt: null,
        expiryDate,
        hospitalId,
        itemId,
        itemType,
        locationId,
        locationType,
      },
    });
  }

  async updateTransfer(
    id: string,
    data: Prisma.TransferUpdateInput,
    client: AcknowledgementClient,
  ): Promise<void> {
    await client.transfer.update({
      data,
      where: {
        id,
      },
    });
  }

  async updateTransferLine(
    id: string,
    data: Prisma.TransferLineUpdateInput,
    client: AcknowledgementClient,
  ): Promise<void> {
    await client.transferLine.update({
      data,
      where: {
        id,
      },
    });
  }

  async upsertStockBalance(
    {
      actorId,
      batchNumber,
      businessDate,
      expiryDate,
      hospitalId,
      itemType,
      itemId,
      locationId,
      locationType,
      quantity,
    }: {
      actorId?: string;
      batchNumber: string | null;
      businessDate: Date | null;
      expiryDate: Date | null;
      hospitalId: string;
      itemType: ItemType;
      itemId: string;
      locationId: string;
      locationType: InventoryLocationType;
      quantity: number;
    },
    client: AcknowledgementClient,
  ): Promise<StockBalance> {
    const existing = await this.findStockBalance(
      {
        batchNumber,
        businessDate,
        expiryDate,
        hospitalId,
        itemId,
        itemType,
        locationId,
        locationType,
      },
      client,
    );

    if (existing) {
      return client.stockBalance.update({
        data: {
          availableQty: {
            increment: quantity,
          },
          lastUpdatedOn: new Date(),
          updatedBy: actorId,
        },
        where: {
          id: existing.id,
        },
      });
    }

    return client.stockBalance.create({
      data: {
        availableQty: quantity,
        batchNumber,
        businessDate,
        createdBy: actorId,
        expiryDate,
        hospitalId,
        itemId,
        itemType,
        lastUpdatedOn: new Date(),
        locationId,
        locationType,
        updatedBy: actorId,
      },
    });
  }
}
