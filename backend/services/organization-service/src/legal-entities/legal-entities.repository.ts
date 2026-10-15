import { Injectable } from '@nestjs/common';
import { LegalEntity, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type LegalEntityClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class LegalEntitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(handler);
  }

  async count(args: Prisma.LegalEntityCountArgs): Promise<number> {
    return this.prisma.legalEntity.count(args);
  }

  async create(
    data: Prisma.LegalEntityUncheckedCreateInput,
    client: LegalEntityClient,
  ): Promise<LegalEntity> {
    return client.legalEntity.create({ data });
  }

  async findActiveById(
    id: string,
    client: LegalEntityClient = this.prisma,
  ): Promise<LegalEntity | null> {
    return client.legalEntity.findFirst({ where: { deletedAt: null, id } });
  }

  /** A live entity with the same GST number at the same address (case and spacing aside). */
  async findDuplicate(
    gstNumber: string,
    entityAddress: string,
    excludeId: string | undefined,
    client: LegalEntityClient,
  ): Promise<LegalEntity | null> {
    return client.legalEntity.findFirst({
      where: {
        deletedAt: null,
        entityAddress: { equals: entityAddress, mode: 'insensitive' },
        gstNumber,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async findMany(args: Prisma.LegalEntityFindManyArgs): Promise<LegalEntity[]> {
    return this.prisma.legalEntity.findMany(args);
  }

  /** Locations, restaurants and POS devices still linked to the entity. */
  async countLinks(id: string, client: LegalEntityClient): Promise<number> {
    const counts = await Promise.all([
      client.hospital.count({ where: { deletedAt: null, legalEntityId: id } }),
      client.restaurant.count({ where: { deletedAt: null, legalEntityId: id } }),
      client.posDevice.count({ where: { deletedAt: null, legalEntityId: id } }),
    ]);

    return counts.reduce((total, count) => total + count, 0);
  }

  async update(
    id: string,
    data: Prisma.LegalEntityUpdateInput,
    client: LegalEntityClient,
  ): Promise<LegalEntity> {
    return client.legalEntity.update({ data, where: { id } });
  }
}
