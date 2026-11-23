import { Injectable } from '@nestjs/common';
import { Prisma, Transfer } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { addStock, type StockKey } from '../common/stock-balances';

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
  ): Promise<{ hospitalId: string; id: string }> {
    // Callers only need the new row's keys and read the record back once its lines exist, so
    // loading every relation here was wasted queries.
    return client.transferAcknowledgement.create({
      data,
      select: { hospitalId: true, id: true },
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
    { actorId, quantity, ...key }: StockKey & { actorId?: string; quantity: number },
    client: AcknowledgementClient,
  ) {
    return addStock(client, key, quantity, actorId);
  }
}
