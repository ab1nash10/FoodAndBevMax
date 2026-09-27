import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateLocationDto } from './dto/create-location.dto';
import { ListLocationsQueryDto, LocationSortField } from './dto/list-locations-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsRepository, LocationWithHospital } from './locations.repository';

type LocationClient = Prisma.TransactionClient;

function toLocationResponse(location: LocationWithHospital) {
  return {
    address: location.address,
    area: location.area,
    building: location.building,
    createdAt: location.createdAt,
    deletedAt: location.deletedAt,
    floor: location.floor,
    hospital: {
      hospitalCode: location.hospital.hospitalCode,
      hospitalName: location.hospital.hospitalName,
      id: location.hospital.id,
      isActive: location.hospital.isActive,
    },
    hospitalId: location.hospitalId,
    id: location.id,
    isActive: location.isActive,
    locationName: location.locationName,
    updatedAt: location.updatedAt,
  };
}

function getLocationOrderBy(query: ListLocationsQueryDto): Prisma.LocationOrderByWithRelationInput {
  const sortBy: LocationSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly locations: LocationsRepository,
  ) {}

  async list(query: ListLocationsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      ...(query.area ? { area: { contains: query.area, mode: 'insensitive' } } : {}),
      ...(query.building ? { building: { contains: query.building, mode: 'insensitive' } } : {}),
      ...(query.floor ? { floor: { contains: query.floor, mode: 'insensitive' } } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { address: { contains: query.search, mode: 'insensitive' } },
              { area: { contains: query.search, mode: 'insensitive' } },
              { building: { contains: query.search, mode: 'insensitive' } },
              { floor: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { locationName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.locations.findMany({
        orderBy: getLocationOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.locations.count({ where }),
    ]);

    return {
      items: items.map(toLocationResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const location = await this.findActiveLocation(id);

    return toLocationResponse(location);
  }

  async create(dto: CreateLocationDto, context: ActorContext) {
    const created = await this.locations.transaction(async (tx) => {
      await this.assertActiveHospital(dto.hospitalId, tx);

      const location = await this.locations.create(
        {
          address: dto.address,
          area: dto.area,
          building: dto.building,
          createdBy: context.actorId,
          floor: dto.floor,
          hospitalId: dto.hospitalId,
          isActive: dto.isActive ?? true,
          locationName: dto.locationName,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'LOCATION_CREATE',
          actorId: context.actorId,
          entityId: location.id,
          entityName: 'locations',
          hospitalId: location.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toLocationResponse(location),
        },
        tx,
      );

      return location;
    });

    return toLocationResponse(created);
  }

  async update(id: string, dto: UpdateLocationDto, context: ActorContext) {
    const updated = await this.locations.transaction(async (tx) => {
      const existing = await this.findActiveLocation(id, tx);
      const data: Prisma.LocationUpdateInput = {};

      if (dto.address !== undefined) {
        data.address = dto.address;
      }

      if (dto.area !== undefined) {
        data.area = dto.area;
      }

      if (dto.building !== undefined) {
        data.building = dto.building;
      }

      if (dto.floor !== undefined) {
        data.floor = dto.floor;
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
        data.isActive = dto.isActive;
      }

      if (dto.locationName !== undefined) {
        data.locationName = dto.locationName;
      }

      if (Object.keys(data).length > 0) {
        data.updatedBy = context.actorId;
      }

      const location = Object.keys(data).length
        ? await this.locations.update(id, data, tx)
        : existing;

      await this.auditLog.record(
        {
          action:
            dto.isActive !== undefined && dto.isActive !== existing.isActive
              ? 'LOCATION_STATUS_CHANGE'
              : 'LOCATION_UPDATE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'locations',
          hospitalId: location.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toLocationResponse(location),
          oldValue: toLocationResponse(existing),
        },
        tx,
      );

      return location;
    });

    return toLocationResponse(updated);
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveLocation(id);

    await this.locations.transaction(async (tx) => {
      const deletedAt = new Date();

      await this.locations.softDeleteChildren(
        id,
        {
          deletedAt,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.locations.update(
        id,
        {
          deletedAt,
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'LOCATION_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'locations',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toLocationResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveHospital(id: string, client: LocationClient): Promise<void> {
    const hospital = await this.locations.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async findActiveLocation(
    id: string,
    client?: LocationClient,
  ): Promise<LocationWithHospital> {
    const location = await this.locations.findActiveById(id, client);

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }
}
