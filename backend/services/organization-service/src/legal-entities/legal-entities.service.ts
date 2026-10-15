import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LegalEntity, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { ListLegalEntitiesQueryDto } from './dto/list-legal-entities-query.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';
import { LegalEntitiesRepository } from './legal-entities.repository';
import { normalizeGstNumber } from './legal-entity-guards';

type LegalEntityClient = Prisma.TransactionClient;

function toLegalEntityResponse(entity: LegalEntity) {
  return {
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    entityAddress: entity.entityAddress,
    entityName: entity.entityName,
    gstNumber: entity.gstNumber,
    id: entity.id,
    isActive: entity.isActive,
    locationName: entity.locationName,
    updatedAt: entity.updatedAt,
  };
}

function requiredText(value: string, message: string): string {
  const text = value.trim();

  if (!text) {
    throw new BadRequestException(message);
  }

  return text;
}

@Injectable()
export class LegalEntitiesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly legalEntities: LegalEntitiesRepository,
  ) {}

  async list(query: ListLegalEntitiesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.LegalEntityWhereInput = {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { locationName: { contains: query.search, mode: 'insensitive' } },
              { entityName: { contains: query.search, mode: 'insensitive' } },
              { entityAddress: { contains: query.search, mode: 'insensitive' } },
              { gstNumber: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.legalEntities.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.legalEntities.count({ where }),
    ]);

    return { items: items.map(toLegalEntityResponse), meta: getPageMeta(page, limit, total) };
  }

  async getById(id: string) {
    return toLegalEntityResponse(await this.findActiveLegalEntity(id));
  }

  async create(dto: CreateLegalEntityDto, context: ActorContext) {
    const created = await this.legalEntities.transaction(async (tx) => {
      const gstNumber = normalizeGstNumber(dto.gstNumber);
      const entityAddress = requiredText(dto.entityAddress, 'Entity address is required');

      await this.assertNotDuplicate(gstNumber, entityAddress, undefined, tx);

      const entity = await this.legalEntities.create(
        {
          createdBy: context.actorId,
          entityAddress,
          entityName: requiredText(dto.entityName, 'Entity name is required'),
          gstNumber,
          isActive: dto.isActive ?? true,
          locationName: requiredText(dto.locationName, 'Location name is required'),
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'LEGAL_ENTITY_CREATE',
          actorId: context.actorId,
          entityId: entity.id,
          entityName: 'legal_entities',
          ipAddress: context.ipAddress,
          newValue: toLegalEntityResponse(entity),
        },
        tx,
      );

      return entity;
    });

    return toLegalEntityResponse(created);
  }

  async update(id: string, dto: UpdateLegalEntityDto, context: ActorContext) {
    const updated = await this.legalEntities.transaction(async (tx) => {
      const existing = await this.findActiveLegalEntity(id, tx);
      const data: Prisma.LegalEntityUpdateInput = {};

      if (dto.locationName !== undefined) {
        data.locationName = requiredText(dto.locationName, 'Location name is required');
      }

      if (dto.entityName !== undefined) {
        data.entityName = requiredText(dto.entityName, 'Entity name is required');
      }

      const gstNumber =
        dto.gstNumber === undefined ? existing.gstNumber : normalizeGstNumber(dto.gstNumber);
      const entityAddress =
        dto.entityAddress === undefined
          ? existing.entityAddress
          : requiredText(dto.entityAddress, 'Entity address is required');

      if (dto.gstNumber !== undefined || dto.entityAddress !== undefined) {
        await this.assertNotDuplicate(gstNumber, entityAddress, id, tx);
        data.gstNumber = gstNumber;
        data.entityAddress = entityAddress;
      }

      if (dto.isActive !== undefined) {
        data.isActive = dto.isActive;
      }

      if (Object.keys(data).length > 0) {
        data.updatedBy = context.actorId;
      }

      const entity = Object.keys(data).length
        ? await this.legalEntities.update(id, data, tx)
        : existing;

      await this.auditLog.record(
        {
          action:
            dto.isActive !== undefined && dto.isActive !== existing.isActive
              ? 'LEGAL_ENTITY_STATUS_CHANGE'
              : 'LEGAL_ENTITY_UPDATE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'legal_entities',
          ipAddress: context.ipAddress,
          newValue: toLegalEntityResponse(entity),
          oldValue: toLegalEntityResponse(existing),
        },
        tx,
      );

      return entity;
    });

    return toLegalEntityResponse(updated);
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveLegalEntity(id);

    await this.legalEntities.transaction(async (tx) => {
      if ((await this.legalEntities.countLinks(id, tx)) > 0) {
        throw new BadRequestException(
          'This entity is linked to locations, restaurants or POS devices. Change their entity first.',
        );
      }

      await this.legalEntities.update(
        id,
        { deletedAt: new Date(), isActive: false, updatedBy: context.actorId },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'LEGAL_ENTITY_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'legal_entities',
          ipAddress: context.ipAddress,
          oldValue: toLegalEntityResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  // One company can bill for several sites under one GST number, so only an exact repeat (the
  // same GST number at the same address) is refused.
  private async assertNotDuplicate(
    gstNumber: string,
    entityAddress: string,
    excludeId: string | undefined,
    client: LegalEntityClient,
  ): Promise<void> {
    if (await this.legalEntities.findDuplicate(gstNumber, entityAddress, excludeId, client)) {
      throw new ConflictException('An entity with this GST number and address already exists');
    }
  }

  private async findActiveLegalEntity(
    id: string,
    client?: LegalEntityClient,
  ): Promise<LegalEntity> {
    const entity = await this.legalEntities.findActiveById(id, client);

    if (!entity) {
      throw new NotFoundException('Entity not found');
    }

    return entity;
  }
}
