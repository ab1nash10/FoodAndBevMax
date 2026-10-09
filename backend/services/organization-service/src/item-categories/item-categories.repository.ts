import { Injectable } from '@nestjs/common';
import { ItemCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type ItemCategoryClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ItemCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.ItemCategoryCountArgs): Promise<number> {
    return this.prisma.itemCategory.count(args);
  }

  async create(
    data: Prisma.ItemCategoryUncheckedCreateInput,
    client: ItemCategoryClient,
  ): Promise<ItemCategory> {
    return client.itemCategory.create({ data });
  }

  async findActiveById(
    id: string,
    client: ItemCategoryClient = this.prisma,
  ): Promise<ItemCategory | null> {
    return client.itemCategory.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findByName(
    categoryName: string,
    excludeId?: string,
    client: ItemCategoryClient = this.prisma,
  ): Promise<ItemCategory | null> {
    return client.itemCategory.findFirst({
      where: {
        categoryName,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByNormalizedName(
    normalizedName: string,
    excludeId?: string,
    client: ItemCategoryClient = this.prisma,
  ): Promise<ItemCategory | null> {
    return client.itemCategory.findFirst({
      where: {
        normalizedName,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.ItemCategoryFindManyArgs): Promise<ItemCategory[]> {
    return this.prisma.itemCategory.findMany(args);
  }

  async hasActiveItems(categoryId: string, client: ItemCategoryClient): Promise<boolean> {
    const count = await client.item.count({
      where: {
        categoryId,
        deletedAt: null,
      },
    });

    return count > 0;
  }

  async update(
    id: string,
    data: Prisma.ItemCategoryUpdateInput,
    client: ItemCategoryClient,
  ): Promise<ItemCategory> {
    return client.itemCategory.update({
      data,
      where: {
        id,
      },
    });
  }
}
