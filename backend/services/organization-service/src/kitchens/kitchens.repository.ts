import { Injectable } from '@nestjs/common';
import { Hospital, Location, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const kitchenInclude = {
  hospital: true,
  location: true,
} satisfies Prisma.KitchenInclude;

export type KitchenWithRelations = Prisma.KitchenGetPayload<{ include: typeof kitchenInclude }>;

type KitchenClient = Prisma.TransactionClient | PrismaService;

interface KitchenCodeSequenceRow {
  nextValue: bigint;
}

@Injectable()
export class KitchensRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.KitchenCountArgs): Promise<number> {
    return this.prisma.kitchen.count(args);
  }

  async create(
    data: Prisma.KitchenUncheckedCreateInput,
    client: KitchenClient,
  ): Promise<KitchenWithRelations> {
    return client.kitchen.create({
      data,
      include: kitchenInclude,
    });
  }

  async findActiveById(
    id: string,
    client: KitchenClient = this.prisma,
  ): Promise<KitchenWithRelations | null> {
    return client.kitchen.findFirst({
      include: kitchenInclude,
      where: {
        deletedAt: null,
        id,
        hospital: {
          deletedAt: null,
        },
      },
    });
  }

  async findActiveHospital(id: string, client: KitchenClient): Promise<Hospital | null> {
    return client.hospital.findFirst({
      where: {
        deletedAt: null,
        id,
      },
    });
  }

  async findActiveLocation(
    id: string,
    hospitalId: string,
    client: KitchenClient,
  ): Promise<Location | null> {
    return client.location.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        id,
      },
    });
  }

  async findByCodeWithinHospital(
    hospitalId: string,
    kitchenCode: string,
    excludeId?: string,
    client: KitchenClient = this.prisma,
  ): Promise<KitchenWithRelations | null> {
    return client.kitchen.findFirst({
      include: kitchenInclude,
      where: {
        hospitalId,
        kitchenCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByCode(
    kitchenCode: string,
    excludeId?: string,
    client: KitchenClient = this.prisma,
  ): Promise<KitchenWithRelations | null> {
    return client.kitchen.findFirst({
      include: kitchenInclude,
      where: {
        kitchenCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async getNextKitchenCodeSequenceValue(client: KitchenClient): Promise<number> {
    const rows = await client.$queryRaw<KitchenCodeSequenceRow[]>`
      SELECT nextval('kitchen_code_sequence')::bigint AS "nextValue"
    `;
    const nextValue = rows[0]?.nextValue;

    return typeof nextValue === 'bigint' ? Number(nextValue) : Number(nextValue ?? 0);
  }

  async findMany(args: Prisma.KitchenFindManyArgs): Promise<KitchenWithRelations[]> {
    return this.prisma.kitchen.findMany({
      ...args,
      include: kitchenInclude,
    });
  }

  async unlinkRestaurants(kitchenId: string, client: KitchenClient): Promise<void> {
    await client.restaurantKitchen.updateMany({
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      where: {
        deletedAt: null,
        kitchenId,
      },
    });
    await client.restaurant.updateMany({
      data: {
        kitchenId: null,
      },
      where: {
        kitchenId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.KitchenUpdateInput,
    client: KitchenClient,
  ): Promise<KitchenWithRelations> {
    return client.kitchen.update({
      data,
      include: kitchenInclude,
      where: {
        id,
      },
    });
  }
}
