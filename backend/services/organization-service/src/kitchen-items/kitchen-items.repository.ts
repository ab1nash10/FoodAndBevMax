import { Injectable } from '@nestjs/common';
import { Item, Kitchen, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const kitchenItemInclude = {
  item: {
    select: {
      id: true,
      isActive: true,
      itemCode: true,
      itemName: true,
      itemType: true,
      type: true,
      category: {
        select: {
          categoryName: true,
          id: true,
          isActive: true,
        },
      },
    },
  },
  kitchen: {
    select: {
      hospital: {
        select: {
          hospitalCode: true,
          hospitalName: true,
          id: true,
          isActive: true,
        },
      },
      id: true,
      isActive: true,
      kitchenCode: true,
      kitchenName: true,
    },
  },
} satisfies Prisma.KitchenItemInclude;

export type KitchenItemWithRelations = Prisma.KitchenItemGetPayload<{
  include: typeof kitchenItemInclude;
}>;

type KitchenItemClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class KitchenItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.KitchenItemCountArgs): Promise<number> {
    return this.prisma.kitchenItem.count(args);
  }

  async create(
    data: Prisma.KitchenItemUncheckedCreateInput,
    client: KitchenItemClient,
  ): Promise<KitchenItemWithRelations> {
    return client.kitchenItem.create({
      data,
      include: kitchenItemInclude,
    });
  }

  async findActiveById(
    id: string,
    client: KitchenItemClient = this.prisma,
  ): Promise<KitchenItemWithRelations | null> {
    return client.kitchenItem.findFirst({
      include: kitchenItemInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveItem(id: string, client: KitchenItemClient): Promise<Item | null> {
    return client.item.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveKitchen(id: string, client: KitchenItemClient): Promise<Kitchen | null> {
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

  async findActiveMapping(
    kitchenId: string,
    itemId: string,
    excludeId?: string,
    client: KitchenItemClient = this.prisma,
  ): Promise<KitchenItemWithRelations | null> {
    return client.kitchenItem.findFirst({
      include: kitchenItemInclude,
      where: {
        deletedAt: null,
        itemId,
        kitchenId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.KitchenItemFindManyArgs): Promise<KitchenItemWithRelations[]> {
    return this.prisma.kitchenItem.findMany({
      ...args,
      include: kitchenItemInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.KitchenItemUpdateInput,
    client: KitchenItemClient,
  ): Promise<KitchenItemWithRelations> {
    return client.kitchenItem.update({
      data,
      include: kitchenItemInclude,
      where: {
        id,
      },
    });
  }
}
