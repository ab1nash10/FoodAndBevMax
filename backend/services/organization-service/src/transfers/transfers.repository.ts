import { Injectable } from '@nestjs/common';
import {
  Hospital,
  InventoryLocationType,
  Item,
  ItemType,
  Kitchen,
  Prisma,
  Restaurant,
  StockBalance,
  Store,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const transferInclude = {
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
    },
    orderBy: {
      createdAt: 'asc',
    },
    where: {
      deletedAt: null,
    },
  },
} satisfies Prisma.TransferInclude;

export type TransferWithRelations = Prisma.TransferGetPayload<{ include: typeof transferInclude }>;

type TransferClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TransfersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.TransferCountArgs): Promise<number> {
    return this.prisma.transfer.count(args);
  }

  async create(
    data: Prisma.TransferUncheckedCreateInput,
    client: TransferClient,
  ): Promise<TransferWithRelations> {
    return client.transfer.create({
      data,
      include: transferInclude,
    });
  }

  async createLine(
    data: Prisma.TransferLineUncheckedCreateInput,
    client: TransferClient,
  ): Promise<void> {
    await client.transferLine.create({ data });
  }

  async createStockLedger(
    data: Prisma.StockLedgerUncheckedCreateInput,
    client: TransferClient,
  ): Promise<void> {
    await client.stockLedger.create({ data });
  }

  async decrementStockBalance(
    balanceId: string,
    quantity: number,
    actorId: string | undefined,
    client: TransferClient,
  ): Promise<StockBalance | null> {
    const result = await client.stockBalance.updateMany({
      data: {
        availableQty: {
          decrement: quantity,
        },
        lastUpdatedOn: new Date(),
        updatedBy: actorId,
      },
      where: {
        availableQty: {
          gte: quantity,
        },
        deletedAt: null,
        id: balanceId,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return client.stockBalance.findUnique({
      where: {
        id: balanceId,
      },
    });
  }

  async findActiveById(
    id: string,
    client: TransferClient = this.prisma,
  ): Promise<TransferWithRelations | null> {
    return client.transfer.findFirst({
      include: transferInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveHospital(id: string, client: TransferClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveRestaurant(id: string, client: TransferClient): Promise<Restaurant | null> {
    return client.restaurant.findFirst({
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
          isActive: true,
        },
        id,
      },
    });
  }

  async findActiveStore(id: string, client: TransferClient): Promise<Store | null> {
    return client.store.findFirst({
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
          isActive: true,
        },
        id,
      },
    });
  }

  async findActiveKitchen(id: string, client: TransferClient): Promise<Kitchen | null> {
    return client.kitchen.findFirst({
      where: {
        deletedAt: null,
        hospital: {
          deletedAt: null,
          isActive: true,
        },
        id,
      },
    });
  }

  async findActiveSourceStockBalances(
    hospitalId: string,
    sourceId: string,
    sourceType: InventoryLocationType,
    itemType: ItemType,
    keys: Array<{
      batchNumber: string | null;
      businessDate: Date | null;
      expiryDate: Date | null;
      itemId: string;
    }>,
    client: TransferClient,
  ): Promise<StockBalance[]> {
    if (keys.length === 0) {
      return [];
    }

    return client.stockBalance.findMany({
      where: {
        deletedAt: null,
        hospitalId,
        itemType,
        locationId: sourceId,
        locationType: sourceType,
        OR: keys.map((key) => ({
          batchNumber: key.batchNumber,
          businessDate: key.businessDate,
          expiryDate: key.expiryDate,
          itemId: key.itemId,
        })),
      },
    });
  }

  async findItemsByIds(itemIds: string[], client: TransferClient): Promise<Item[]> {
    return client.item.findMany({
      where: {
        deletedAt: null,
        id: {
          in: itemIds,
        },
        isActive: true,
      },
    });
  }

  async findMany(args: Prisma.TransferFindManyArgs): Promise<TransferWithRelations[]> {
    return this.prisma.transfer.findMany({
      ...args,
      include: transferInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.TransferUpdateInput,
    client: TransferClient,
  ): Promise<TransferWithRelations> {
    return client.transfer.update({
      data,
      include: transferInclude,
      where: {
        id,
      },
    });
  }
}
