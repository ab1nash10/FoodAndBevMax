import { Injectable } from '@nestjs/common';
import { Hospital, Location, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export const storeInclude = {
  hospital: true,
  location: true,
} satisfies Prisma.StoreInclude;

export type StoreWithRelations = Prisma.StoreGetPayload<{ include: typeof storeInclude }>;

type StoreClient = Prisma.TransactionClient | PrismaService;

interface StoreCodeSequenceRow {
  nextValue: bigint;
}

@Injectable()
export class StoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.StoreCountArgs): Promise<number> {
    return this.prisma.store.count(args);
  }

  async create(
    data: Prisma.StoreUncheckedCreateInput,
    client: StoreClient,
  ): Promise<StoreWithRelations> {
    return client.store.create({
      data,
      include: storeInclude,
    });
  }

  async findActiveById(
    id: string,
    client: StoreClient = this.prisma,
  ): Promise<StoreWithRelations | null> {
    return client.store.findFirst({
      include: storeInclude,
      where: {
        deletedAt: null,
        id,
        hospital: {
          deletedAt: null,
        },
      },
    });
  }

  async findActiveHospital(id: string, client: StoreClient): Promise<Hospital | null> {
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
    client: StoreClient,
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
    storeCode: string,
    excludeId?: string,
    client: StoreClient = this.prisma,
  ): Promise<StoreWithRelations | null> {
    return client.store.findFirst({
      include: storeInclude,
      where: {
        hospitalId,
        storeCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findByCode(
    storeCode: string,
    excludeId?: string,
    client: StoreClient = this.prisma,
  ): Promise<StoreWithRelations | null> {
    return client.store.findFirst({
      include: storeInclude,
      where: {
        storeCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async getNextStoreCodeSequenceValue(client: StoreClient): Promise<number> {
    const rows = await client.$queryRaw<StoreCodeSequenceRow[]>`
      SELECT nextval('store_code_sequence')::bigint AS "nextValue"
    `;
    const nextValue = rows[0]?.nextValue;

    return typeof nextValue === 'bigint' ? Number(nextValue) : Number(nextValue ?? 0);
  }

  async findMany(args: Prisma.StoreFindManyArgs): Promise<StoreWithRelations[]> {
    return this.prisma.store.findMany({
      ...args,
      include: storeInclude,
    });
  }

  async unlinkRestaurants(storeId: string, client: StoreClient): Promise<void> {
    await client.restaurant.updateMany({
      data: {
        storeId: null,
      },
      where: {
        storeId,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.StoreUpdateInput,
    client: StoreClient,
  ): Promise<StoreWithRelations> {
    return client.store.update({
      data,
      include: storeInclude,
      where: {
        id,
      },
    });
  }
}
