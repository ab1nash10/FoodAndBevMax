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
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { KitchenSortField, ListKitchensQueryDto } from './dto/list-kitchens-query.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';
import { KitchensRepository, KitchenWithRelations } from './kitchens.repository';

type KitchenClient = Prisma.TransactionClient;

function toKitchenResponse(kitchen: KitchenWithRelations) {
  return {
    closingTime: kitchen.closingTime,
    createdAt: kitchen.createdAt,
    deletedAt: kitchen.deletedAt,
    hospital: {
      hospitalCode: kitchen.hospital.hospitalCode,
      hospitalName: kitchen.hospital.hospitalName,
      id: kitchen.hospital.id,
      isActive: kitchen.hospital.isActive,
    },
    hospitalId: kitchen.hospitalId,
    id: kitchen.id,
    isActive: kitchen.isActive,
    kitchenCode: kitchen.kitchenCode,
    kitchenName: kitchen.kitchenName,
    location: kitchen.location
      ? {
          id: kitchen.location.id,
          isActive: kitchen.location.isActive,
          locationName: kitchen.location.locationName,
        }
      : null,
    locationId: kitchen.locationId,
    openingTime: kitchen.openingTime,
    updatedAt: kitchen.updatedAt,
  };
}

function getKitchenOrderBy(query: ListKitchensQueryDto): Prisma.KitchenOrderByWithRelationInput {
  const sortBy: KitchenSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class KitchensService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly kitchens: KitchensRepository,
  ) {}

  async list(query: ListKitchensQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.KitchenWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.search
        ? {
            OR: [
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { kitchenCode: { contains: query.search, mode: 'insensitive' } },
              { kitchenName: { contains: query.search, mode: 'insensitive' } },
              { location: { locationName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.kitchens.findMany({
        orderBy: getKitchenOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.kitchens.count({ where }),
    ]);

    return {
      items: items.map(toKitchenResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const kitchen = await this.findActiveKitchen(id);

    return toKitchenResponse(kitchen);
  }

  async create(dto: CreateKitchenDto, context: ActorContext) {
    try {
      const created = await this.kitchens.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);

        if (dto.locationId) {
          await this.assertActiveLocation(dto.locationId, dto.hospitalId, tx);
        }

        const kitchenCode = await this.generateUniqueKitchenCode(tx);

        const kitchen = await this.kitchens.create(
          {
            closingTime: dto.closingTime,
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            isActive: dto.isActive ?? true,
            kitchenCode,
            kitchenName: dto.kitchenName,
            locationId: dto.locationId,
            openingTime: dto.openingTime,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'KITCHEN_CREATE',
            actorId: context.actorId,
            entityId: kitchen.id,
            entityName: 'kitchens',
            hospitalId: kitchen.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toKitchenResponse(kitchen),
          },
          tx,
        );

        return kitchen;
      });

      return toKitchenResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Kitchen');
    }
  }

  async update(id: string, dto: UpdateKitchenDto, context: ActorContext) {
    try {
      const updated = await this.kitchens.transaction(async (tx) => {
        const existing = await this.findActiveKitchen(id, tx);
        const data: Prisma.KitchenUpdateInput = {};
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const kitchenCode = dto.kitchenCode ?? existing.kitchenCode;

        if (dto.closingTime !== undefined) {
          data.closingTime = dto.closingTime;
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
            throw new BadRequestException('Location is inactive. Kitchen cannot be activated.');
          }

          data.isActive = dto.isActive;
        }

        if (dto.kitchenCode !== undefined) {
          data.kitchenCode = dto.kitchenCode;
        }

        if (dto.kitchenName !== undefined) {
          data.kitchenName = dto.kitchenName;
        }

        if (dto.locationId !== undefined) {
          await this.assertActiveLocation(dto.locationId, hospitalId, tx);
          data.location = {
            connect: {
              id: dto.locationId,
            },
          };
        }

        if (dto.openingTime !== undefined) {
          data.openingTime = dto.openingTime;
        }

        if (dto.kitchenCode !== undefined || dto.hospitalId !== undefined) {
          await this.assertUniqueKitchenCode(hospitalId, kitchenCode, id, tx);
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const kitchen = Object.keys(data).length
          ? await this.kitchens.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'KITCHEN_STATUS_CHANGE'
                : 'KITCHEN_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'kitchens',
            hospitalId: kitchen.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toKitchenResponse(kitchen),
            oldValue: toKitchenResponse(existing),
          },
          tx,
        );

        return kitchen;
      });

      return toKitchenResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Kitchen');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveKitchen(id);

    await this.kitchens.transaction(async (tx) => {
      await this.kitchens.unlinkRestaurants(id, tx);
      await this.kitchens.update(
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
          action: 'KITCHEN_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'kitchens',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toKitchenResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveHospital(id: string, client: KitchenClient): Promise<void> {
    const hospital = await this.kitchens.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async assertActiveLocation(
    id: string,
    hospitalId: string,
    client: KitchenClient,
  ): Promise<void> {
    const location = await this.kitchens.findActiveLocation(id, hospitalId, client);

    if (!location || !location.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }
  }

  private async assertUniqueKitchenCode(
    hospitalId: string,
    kitchenCode: string,
    excludeId: string | undefined,
    client: KitchenClient,
  ): Promise<void> {
    const kitchen = await this.kitchens.findByCodeWithinHospital(
      hospitalId,
      kitchenCode,
      excludeId,
      client,
    );

    if (kitchen) {
      throw new ConflictException('Kitchen code already exists within hospital');
    }
  }

  private async generateUniqueKitchenCode(client: KitchenClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextValue = await this.kitchens.getNextKitchenCodeSequenceValue(client);

      if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
        throw new InternalServerErrorException('Unable to generate kitchen code');
      }

      const kitchenCode = `KIT${String(nextValue).padStart(4, '0')}`;
      const existing = await this.kitchens.findByCode(kitchenCode, undefined, client);

      if (!existing) {
        return kitchenCode;
      }
    }

    throw new ConflictException('Kitchen code already exists');
  }

  private async findActiveKitchen(
    id: string,
    client?: KitchenClient,
  ): Promise<KitchenWithRelations> {
    const kitchen = await this.kitchens.findActiveById(id, client);

    if (!kitchen) {
      throw new NotFoundException('Kitchen not found');
    }

    return kitchen;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
