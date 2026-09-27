import { Injectable } from '@nestjs/common';
import { ItemCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const itemInclude = {
  category: true,
} satisfies Prisma.ItemInclude;

export type ItemWithCategory = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

type ItemClient = Prisma.TransactionClient | PrismaService;

interface ItemCodeSequenceRow {
  nextValue: bigint;
}

@Injectable()
export class ItemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.ItemCountArgs): Promise<number> {
    return this.prisma.item.count(args);
  }

  async create(
    data: Prisma.ItemUncheckedCreateInput,
    client: ItemClient,
  ): Promise<ItemWithCategory> {
    return client.item.create({
      data,
      include: itemInclude,
    });
  }

  async findActiveById(
    id: string,
    client: ItemClient = this.prisma,
  ): Promise<ItemWithCategory | null> {
    return client.item.findFirst({
      include: itemInclude,
      where: {
        category: {
          deletedAt: null,
        },
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveCategory(id: string, client: ItemClient): Promise<ItemCategory | null> {
    return client.itemCategory.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findByCode(
    itemCode: string,
    excludeId?: string,
    client: ItemClient = this.prisma,
  ): Promise<ItemWithCategory | null> {
    return client.item.findFirst({
      include: itemInclude,
      where: {
        itemCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async getNextItemCodeSequenceValue(client: ItemClient): Promise<number> {
    const rows = await client.$queryRaw<ItemCodeSequenceRow[]>`
      SELECT nextval('item_code_sequence')::bigint AS "nextValue"
    `;
    const nextValue = rows[0]?.nextValue;

    return typeof nextValue === 'bigint' ? Number(nextValue) : Number(nextValue ?? 0);
  }

  async findByNormalizedName(
    normalizedName: string,
    excludeId?: string,
    client: ItemClient = this.prisma,
  ): Promise<ItemWithCategory | null> {
    return client.item.findFirst({
      include: itemInclude,
      where: {
        normalizedName,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.ItemFindManyArgs): Promise<ItemWithCategory[]> {
    return this.prisma.item.findMany({
      ...args,
      include: itemInclude,
    });
  }

  async update(
    id: string,
    data: Prisma.ItemUpdateInput,
    client: ItemClient,
  ): Promise<ItemWithCategory> {
    return client.item.update({
      data,
      include: itemInclude,
      where: {
        id,
      },
    });
  }
}
