import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

// Items have no category of their own: each mapping and menu item has one.
export const itemInclude = {} satisfies Prisma.ItemInclude;

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
        deletedAt: null,
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
