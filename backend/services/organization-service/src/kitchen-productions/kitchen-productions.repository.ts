import { Injectable } from '@nestjs/common';
import {
  Hospital,
  InventoryLocationType,
  Item,
  ItemType,
  Kitchen,
  Prisma,
  StockBalance,
  User,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const kitchenProductionInclude = {
  chef: {
    select: {
      email: true,
      employeeCode: true,
      id: true,
      mobile: true,
      name: true,
      status: true,
    },
  },
  hospital: {
    select: {
      hospitalCode: true,
      hospitalName: true,
      id: true,
      isActive: true,
    },
  },
  kitchen: {
    select: {
      hospitalId: true,
      id: true,
      isActive: true,
      kitchenCode: true,
      kitchenName: true,
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
} satisfies Prisma.KitchenProductionInclude;

export type KitchenProductionWithRelations = Prisma.KitchenProductionGetPayload<{
  include: typeof kitchenProductionInclude;
}>;

type KitchenProductionClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class KitchenProductionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.KitchenProductionCountArgs): Promise<number> {
    return this.prisma.kitchenProduction.count(args);
  }

  async create(
    data: Prisma.KitchenProductionUncheckedCreateInput,
    client: KitchenProductionClient,
  ): Promise<KitchenProductionWithRelations> {
    return client.kitchenProduction.create({
      data,
      include: kitchenProductionInclude,
    });
  }

  async createLine(
    data: Prisma.KitchenProductionLineUncheckedCreateInput,
    client: KitchenProductionClient,
  ): Promise<void> {
    await client.kitchenProductionLine.create({ data });
  }

  async createStockLedger(
    data: Prisma.StockLedgerUncheckedCreateInput,
    client: KitchenProductionClient,
  ): Promise<void> {
    await client.stockLedger.create({ data });
  }

  async findActiveById(
    id: string,
    client: KitchenProductionClient = this.prisma,
  ): Promise<KitchenProductionWithRelations | null> {
    return client.kitchenProduction.findFirst({
      include: kitchenProductionInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveChef(id: string, client: KitchenProductionClient): Promise<User | null> {
    return client.user.findFirst({
      where: {
        deletedAt: null,
        id,
        status: UserStatus.ACTIVE,
      },
    });
  }

  async findActiveHospital(id: string, client: KitchenProductionClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveKitchen(id: string, client: KitchenProductionClient): Promise<Kitchen | null> {
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

  async findActiveKitchenMappings(
    kitchenId: string,
    itemIds: string[],
    client: KitchenProductionClient,
  ): Promise<Array<{ item: Item; itemId: string; kitchenId: string }>> {
    return client.kitchenItem.findMany({
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
          itemType: ItemType.READYMADE,
        },
        kitchenId,
      },
    });
  }

  async findMany(
    args: Prisma.KitchenProductionFindManyArgs,
  ): Promise<KitchenProductionWithRelations[]> {
    return this.prisma.kitchenProduction.findMany({
      ...args,
      include: kitchenProductionInclude,
    });
  }

  async findStockBalance(
    {
      businessDate,
      hospitalId,
      itemId,
      locationId,
    }: {
      businessDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
    },
    client: KitchenProductionClient,
  ): Promise<StockBalance | null> {
    return client.stockBalance.findFirst({
      where: {
        batchNumber: null,
        businessDate,
        deletedAt: null,
        expiryDate: null,
        hospitalId,
        itemId,
        itemType: ItemType.READYMADE,
        locationId,
        locationType: InventoryLocationType.KITCHEN,
      },
    });
  }

  async softDeleteLines(
    productionId: string,
    actorId: string | undefined,
    client: KitchenProductionClient,
  ): Promise<void> {
    await client.kitchenProductionLine.updateMany({
      data: {
        deletedAt: new Date(),
        updatedBy: actorId,
      },
      where: {
        deletedAt: null,
        productionId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.KitchenProductionUncheckedUpdateInput,
    client: KitchenProductionClient,
  ): Promise<KitchenProductionWithRelations> {
    return client.kitchenProduction.update({
      data,
      include: kitchenProductionInclude,
      where: {
        id,
      },
    });
  }

  async upsertStockBalance(
    {
      actorId,
      businessDate,
      hospitalId,
      itemId,
      locationId,
      quantity,
    }: {
      actorId?: string;
      businessDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
      quantity: number;
    },
    client: KitchenProductionClient,
  ): Promise<StockBalance> {
    const existing = await this.findStockBalance(
      {
        businessDate,
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
        businessDate,
        createdBy: actorId,
        hospitalId,
        itemId,
        itemType: ItemType.READYMADE,
        lastUpdatedOn: new Date(),
        locationId,
        locationType: InventoryLocationType.KITCHEN,
        updatedBy: actorId,
      },
    });
  }
}
