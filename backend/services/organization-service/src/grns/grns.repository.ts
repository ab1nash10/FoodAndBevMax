import { Injectable } from '@nestjs/common';
import {
  Hospital,
  InventoryLocationType,
  Item,
  ItemType,
  Prisma,
  StockBalance,
  Store,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const grnInclude = {
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
      batches: {
        orderBy: {
          createdAt: 'asc',
        },
        where: {
          deletedAt: null,
        },
      },
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
  store: {
    select: {
      hospitalId: true,
      id: true,
      isActive: true,
      storeCode: true,
      storeName: true,
    },
  },
} satisfies Prisma.GrnInclude;

export type GrnWithRelations = Prisma.GrnGetPayload<{ include: typeof grnInclude }>;

type GrnClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class GrnsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.GrnCountArgs): Promise<number> {
    return this.prisma.grn.count(args);
  }

  async create(data: Prisma.GrnUncheckedCreateInput, client: GrnClient): Promise<GrnWithRelations> {
    return client.grn.create({
      data,
      include: grnInclude,
    });
  }

  async createBatch(data: Prisma.GrnBatchUncheckedCreateInput, client: GrnClient): Promise<void> {
    await client.grnBatch.create({ data });
  }

  async createLine(data: Prisma.GrnLineUncheckedCreateInput, client: GrnClient): Promise<void> {
    await client.grnLine.create({ data });
  }

  async createStockLedger(
    data: Prisma.StockLedgerUncheckedCreateInput,
    client: GrnClient,
  ): Promise<void> {
    await client.stockLedger.create({ data });
  }

  async findActiveById(
    id: string,
    client: GrnClient = this.prisma,
  ): Promise<GrnWithRelations | null> {
    return client.grn.findFirst({
      include: grnInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveHospital(id: string, client: GrnClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveStore(id: string, client: GrnClient): Promise<Store | null> {
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

  async findActiveStoreMappings(
    storeId: string,
    itemIds: string[],
    client: GrnClient,
  ): Promise<Array<{ item: Item; itemId: string; storeId: string }>> {
    return client.storeItem.findMany({
      include: {
        item: true,
      },
      where: {
        deletedAt: null,
        isActive: true,
        itemId: {
          in: itemIds,
        },
        item: {
          deletedAt: null,
          isActive: true,
          itemType: ItemType.MRP,
        },
        storeId,
      },
    });
  }

  async findMany(args: Prisma.GrnFindManyArgs): Promise<GrnWithRelations[]> {
    return this.prisma.grn.findMany({
      ...args,
      include: grnInclude,
    });
  }

  async findStockBalance(
    {
      batchNumber,
      expiryDate,
      hospitalId,
      itemId,
      locationId,
    }: {
      batchNumber: string;
      expiryDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
    },
    client: GrnClient,
  ): Promise<StockBalance | null> {
    return client.stockBalance.findFirst({
      where: {
        batchNumber,
        deletedAt: null,
        expiryDate,
        hospitalId,
        itemId,
        itemType: ItemType.MRP,
        locationId,
        locationType: InventoryLocationType.STORE,
      },
    });
  }

  async softDeleteLinesAndBatches(grnId: string, actorId: string | undefined, client: GrnClient) {
    const now = new Date();
    const lines = await client.grnLine.findMany({
      select: { id: true },
      where: {
        deletedAt: null,
        grnId,
      },
    });
    const lineIds = lines.map((line) => line.id);

    if (lineIds.length > 0) {
      await client.grnBatch.updateMany({
        data: {
          deletedAt: now,
          updatedBy: actorId,
        },
        where: {
          deletedAt: null,
          grnLineId: {
            in: lineIds,
          },
        },
      });
    }

    await client.grnLine.updateMany({
      data: {
        deletedAt: now,
        updatedBy: actorId,
      },
      where: {
        deletedAt: null,
        grnId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.GrnUpdateInput,
    client: GrnClient,
  ): Promise<GrnWithRelations> {
    return client.grn.update({
      data,
      include: grnInclude,
      where: {
        id,
      },
    });
  }

  async upsertStockBalance(
    {
      actorId,
      batchNumber,
      expiryDate,
      hospitalId,
      itemId,
      locationId,
      quantity,
    }: {
      actorId?: string;
      batchNumber: string;
      expiryDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
      quantity: number;
    },
    client: GrnClient,
  ): Promise<StockBalance> {
    const existing = await this.findStockBalance(
      {
        batchNumber,
        expiryDate,
        hospitalId,
        itemId,
        locationId,
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
        createdBy: actorId,
        expiryDate,
        hospitalId,
        itemId,
        itemType: ItemType.MRP,
        lastUpdatedOn: new Date(),
        locationId,
        locationType: InventoryLocationType.STORE,
        updatedBy: actorId,
      },
    });
  }
}
