import { Injectable } from '@nestjs/common';
import { Hospital, Item, Prisma, RateType, Restaurant } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const itemPriceInclude = {
  hospital: {
    select: {
      city: true,
      displayName: true,
      hospitalCode: true,
      hospitalName: true,
      id: true,
      isActive: true,
      postalCode: true,
      state: true,
    },
  },
  item: {
    select: {
      category: {
        select: {
          categoryName: true,
          id: true,
          isActive: true,
        },
      },
      id: true,
      isActive: true,
      itemCode: true,
      itemName: true,
      itemType: true,
      type: true,
    },
  },
  restaurant: {
    select: {
      id: true,
      isActive: true,
      restaurantCode: true,
      restaurantName: true,
    },
  },
} satisfies Prisma.ItemPriceInclude;

export type ItemPriceWithRelations = Prisma.ItemPriceGetPayload<{
  include: typeof itemPriceInclude;
}>;

type ItemPriceClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ItemPricesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.ItemPriceCountArgs): Promise<number> {
    return this.prisma.itemPrice.count(args);
  }

  async create(
    data: Prisma.ItemPriceUncheckedCreateInput,
    client: ItemPriceClient,
  ): Promise<ItemPriceWithRelations> {
    return client.itemPrice.create({
      data,
      include: itemPriceInclude,
    });
  }

  async findActiveById(
    id: string,
    client: ItemPriceClient = this.prisma,
  ): Promise<ItemPriceWithRelations | null> {
    return client.itemPrice.findFirst({
      include: itemPriceInclude,
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveHospital(
    id: string,
    client: ItemPriceClient = this.prisma,
  ): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveItem(id: string, client: ItemPriceClient = this.prisma): Promise<Item | null> {
    return client.item.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveRestaurant(
    id: string,
    hospitalId: string,
    client: ItemPriceClient = this.prisma,
  ): Promise<Restaurant | null> {
    return client.restaurant.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findMany(args: Prisma.ItemPriceFindManyArgs): Promise<ItemPriceWithRelations[]> {
    return this.prisma.itemPrice.findMany({
      ...args,
      include: itemPriceInclude,
    });
  }

  async findOverlappingActivePrice(
    input: {
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludeId?: string;
      hospitalId: string;
      itemId: string;
      rateType: RateType;
      restaurantId: string | null;
    },
    client: ItemPriceClient,
  ): Promise<ItemPriceWithRelations | null> {
    return client.itemPrice.findFirst({
      include: itemPriceInclude,
      where: {
        deletedAt: null,
        effectiveFrom: {
          lte: input.effectiveTo ?? new Date('9999-12-31T00:00:00.000Z'),
        },
        hospitalId: input.hospitalId,
        isActive: true,
        itemId: input.itemId,
        rateType: input.rateType,
        restaurantId: input.restaurantId,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gte: input.effectiveFrom,
            },
          },
        ],
      },
    });
  }

  async findResolvedPrice(
    input: {
      date: Date;
      hospitalId: string;
      itemId: string;
      rateType: RateType;
      restaurantId: string | null;
    },
    client: ItemPriceClient = this.prisma,
  ): Promise<ItemPriceWithRelations | null> {
    return client.itemPrice.findFirst({
      include: itemPriceInclude,
      orderBy: [
        {
          effectiveFrom: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
      where: {
        deletedAt: null,
        effectiveFrom: {
          lte: input.date,
        },
        hospitalId: input.hospitalId,
        isActive: true,
        itemId: input.itemId,
        rateType: input.rateType,
        restaurantId: input.restaurantId,
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gte: input.date,
            },
          },
        ],
      },
    });
  }

  async update(
    id: string,
    data: Prisma.ItemPriceUncheckedUpdateInput,
    client: ItemPriceClient,
  ): Promise<ItemPriceWithRelations> {
    return client.itemPrice.update({
      data,
      include: itemPriceInclude,
      where: {
        id,
      },
    });
  }
}
