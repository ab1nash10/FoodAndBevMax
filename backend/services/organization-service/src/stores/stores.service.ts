import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateStoreDto } from './dto/create-store.dto';
import { ListStoresQueryDto, StoreSortField } from './dto/list-stores-query.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresRepository, StoreWithRelations } from './stores.repository';

type StoreClient = Prisma.TransactionClient;

function toStoreResponse(store: StoreWithRelations) {
  return {
    address: store.address,
    createdAt: store.createdAt,
    deletedAt: store.deletedAt,
    hospital: {
      hospitalCode: store.hospital.hospitalCode,
      hospitalName: store.hospital.hospitalName,
      id: store.hospital.id,
      isActive: store.hospital.isActive,
    },
    hospitalId: store.hospitalId,
    id: store.id,
    isActive: store.isActive,
    location: store.location
      ? {
          id: store.location.id,
          isActive: store.location.isActive,
          locationName: store.location.locationName,
        }
      : null,
    locationId: store.locationId,
    storeCode: store.storeCode,
    storeName: store.storeName,
    storeType: store.storeType,
    updatedAt: store.updatedAt,
  };
}

function getStoreOrderBy(query: ListStoresQueryDto): Prisma.StoreOrderByWithRelationInput {
  const sortBy: StoreSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class StoresService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly stores: StoresRepository,
  ) {}

  async list(query: ListStoresQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.StoreWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.storeType ? { storeType: { contains: query.storeType, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { address: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { location: { locationName: { contains: query.search, mode: 'insensitive' } } },
              { storeCode: { contains: query.search, mode: 'insensitive' } },
              { storeName: { contains: query.search, mode: 'insensitive' } },
              { storeType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.stores.findMany({
        orderBy: getStoreOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.stores.count({ where }),
    ]);

    return {
      items: items.map(toStoreResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const store = await this.findActiveStore(id);

    return toStoreResponse(store);
  }

  async create(dto: CreateStoreDto, context: ActorContext) {
    try {
      const created = await this.stores.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);

        if (dto.locationId) {
          await this.assertActiveLocation(dto.locationId, dto.hospitalId, tx);
        }

        const storeCode = await this.generateUniqueStoreCode(tx);

        const store = await this.stores.create(
          {
            address: dto.address,
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            isActive: dto.isActive ?? true,
            locationId: dto.locationId,
            storeCode,
            storeName: dto.storeName,
            storeType: dto.storeType,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'STORE_CREATE',
            actorId: context.actorId,
            entityId: store.id,
            entityName: 'stores',
            hospitalId: store.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toStoreResponse(store),
          },
          tx,
        );

        return store;
      });

      return toStoreResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Store');
    }
  }

  async update(id: string, dto: UpdateStoreDto, context: ActorContext) {
    try {
      const updated = await this.stores.transaction(async (tx) => {
        const existing = await this.findActiveStore(id, tx);
        const data: Prisma.StoreUpdateInput = {};
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const storeCode = dto.storeCode ?? existing.storeCode;

        if (dto.address !== undefined) {
          data.address = dto.address;
        }

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
          data.hospital = {
            connect: {
              id: dto.hospitalId,
            },
          };
        }

        if (dto.isActive !== undefined) {
          if (dto.isActive && dto.hospitalId === undefined && !existing.hospital.isActive) {
            throw new BadRequestException('Location is inactive. Store cannot be activated.');
          }

          data.isActive = dto.isActive;
        }

        if (dto.locationId !== undefined) {
          await this.assertActiveLocation(dto.locationId, hospitalId, tx);
          data.location = {
            connect: {
              id: dto.locationId,
            },
          };
        }

        if (dto.storeCode !== undefined) {
          data.storeCode = dto.storeCode;
        }

        if (dto.storeName !== undefined) {
          data.storeName = dto.storeName;
        }

        if (dto.storeType !== undefined) {
          data.storeType = dto.storeType;
        }

        if (dto.storeCode !== undefined || dto.hospitalId !== undefined) {
          await this.assertUniqueStoreCode(hospitalId, storeCode, id, tx);
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const store = Object.keys(data).length ? await this.stores.update(id, data, tx) : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'STORE_STATUS_CHANGE'
                : 'STORE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'stores',
            hospitalId: store.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toStoreResponse(store),
            oldValue: toStoreResponse(existing),
          },
          tx,
        );

        return store;
      });

      return toStoreResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Store');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveStore(id);

    await this.stores.transaction(async (tx) => {
      await this.stores.unlinkRestaurants(id, tx);
      await this.stores.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'STORE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'stores',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toStoreResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveHospital(id: string, client: StoreClient): Promise<void> {
    const hospital = await this.stores.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async assertActiveLocation(
    id: string,
    hospitalId: string,
    client: StoreClient,
  ): Promise<void> {
    const location = await this.stores.findActiveLocation(id, hospitalId, client);

    if (!location || !location.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }
  }

  private async assertUniqueStoreCode(
    hospitalId: string,
    storeCode: string,
    excludeId: string | undefined,
    client: StoreClient,
  ): Promise<void> {
    const store = await this.stores.findByCodeWithinHospital(
      hospitalId,
      storeCode,
      excludeId,
      client,
    );

    if (store) {
      throw new ConflictException('Store code already exists within hospital');
    }
  }

  private async generateUniqueStoreCode(client: StoreClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextValue = await this.stores.getNextStoreCodeSequenceValue(client);

      if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
        throw new InternalServerErrorException('Unable to generate store code');
      }

      const storeCode = `STR${String(nextValue).padStart(4, '0')}`;
      const existing = await this.stores.findByCode(storeCode, undefined, client);

      if (!existing) {
        return storeCode;
      }
    }

    throw new ConflictException('Store code already exists');
  }

  private async findActiveStore(id: string, client?: StoreClient): Promise<StoreWithRelations> {
    const store = await this.stores.findActiveById(id, client);

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
