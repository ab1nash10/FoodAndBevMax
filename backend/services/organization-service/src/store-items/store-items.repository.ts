import { Injectable } from '@nestjs/common';
import { Item, Prisma, Store } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const storeItemInclude = {
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
  store: {
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
      storeCode: true,
      storeName: true,
    },
  },
} satisfies Prisma.StoreItemInclude;

export type StoreItemWithRelations = Prisma.StoreItemGetPayload<{
  include: typeof storeItemInclude;
}>;

type StoreItemClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class StoreItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.StoreItemCountArgs): Promise<number> {
    return this.prisma.storeItem.count(args);
  }

  async create(
    data: Prisma.StoreItemUncheckedCreateInput,
    client: StoreItemClient,
  ): Promise<StoreItemWithRelations> {
    return client.storeItem.create({
      data,
      include: storeItemInclude,
    });
  }

  async findActiveById(
    id: string,
    client: StoreItemClient = this.prisma,
  ): Promise<StoreItemWithRelations | null> {
    return client.storeItem.findFirst({
      include: storeItemInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveItem(id: string, client: StoreItemClient): Promise<Item | null> {
    return client.item.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveMapping(
    storeId: string,
    itemId: string,
    excludeId?: string,
    client: StoreItemClient = this.prisma,
  ): Promise<StoreItemWithRelations | null> {
    return client.storeItem.findFirst({
      include: storeItemInclude,
      where: {
        deletedAt: null,
        itemId,
        storeId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findActiveStore(id: string, client: StoreItemClient): Promise<Store | null> {
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

  async findMany(args: Prisma.StoreItemFindManyArgs): Promise<StoreItemWithRelations[]> {
    return this.prisma.storeItem.findMany({
      ...args,
      include: storeItemInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.StoreItemUpdateInput,
    client: StoreItemClient,
  ): Promise<StoreItemWithRelations> {
    return client.storeItem.update({
      data,
      include: storeItemInclude,
      where: {
        id,
      },
    });
  }
}
