import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { ListPosDevicesQueryDto, PosDeviceSortField } from './dto/list-pos-devices-query.dto';
import { UpdatePosDeviceDto } from './dto/update-pos-device.dto';
import { PosDevicesRepository, PosDeviceWithRelations } from './pos-devices.repository';

type PosDeviceClient = Prisma.TransactionClient;

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

function toPosDeviceResponse(posDevice: PosDeviceWithRelations) {
  return {
    code: posDevice.code,
    createdAt: posDevice.createdAt,
    deletedAt: posDevice.deletedAt,
    entity: posDevice.entity,
    hostName: posDevice.hostName,
    hospital: {
      hospitalCode: posDevice.hospital.hospitalCode,
      hospitalName: posDevice.hospital.hospitalName,
      id: posDevice.hospital.id,
      isActive: posDevice.hospital.isActive,
    },
    hospitalId: posDevice.hospitalId,
    id: posDevice.id,
    isActive: posDevice.isActive,
    isInvoicePrintEnabled: posDevice.isInvoicePrintEnabled,
    isKotPrintEnabled: posDevice.isKotPrintEnabled,
    name: posDevice.name,
    restaurantIds: posDevice.restaurants.map((mapping) => mapping.restaurantId),
    restaurants: posDevice.restaurants.map((mapping) => ({
      id: mapping.restaurant.id,
      isActive: mapping.restaurant.isActive,
      restaurantCode: mapping.restaurant.restaurantCode,
      restaurantName: mapping.restaurant.restaurantName,
    })),
    updatedAt: posDevice.updatedAt,
  };
}

function describeHostNameOwner(posDevice: PosDeviceWithRelations): string {
  const restaurantNames = posDevice.restaurants.map((mapping) => mapping.restaurant.restaurantName);

  if (restaurantNames.length > 0) {
    return `${restaurantNames.join(', ')} (POS device ${posDevice.name})`;
  }

  return `POS device ${posDevice.name}`;
}

function getPosDeviceOrderBy(
  query: ListPosDevicesQueryDto,
): Prisma.PosDeviceOrderByWithRelationInput {
  const sortBy: PosDeviceSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class PosDevicesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly posDevices: PosDevicesRepository,
  ) {}

  async list(query: ListPosDevicesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.PosDeviceWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.hostName
        ? { hostName: { equals: query.hostName, mode: 'insensitive' as const } }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.restaurantId
        ? {
            restaurants: {
              some: {
                deletedAt: null,
                isActive: true,
                restaurantId: query.restaurantId,
              },
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { entity: { contains: query.search, mode: 'insensitive' } },
              { hostName: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              {
                restaurants: {
                  some: {
                    restaurant: {
                      restaurantName: { contains: query.search, mode: 'insensitive' },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.posDevices.findMany({
        orderBy: getPosDeviceOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.posDevices.count({ where }),
    ]);

    return {
      items: items.map(toPosDeviceResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toPosDeviceResponse(await this.findActivePosDevice(id));
  }

  async create(dto: CreatePosDeviceDto, context: ActorContext) {
    try {
      const created = await this.posDevices.transaction(async (tx) => {
        const restaurantIds = uniqueIds(dto.restaurantIds);

        await this.assertActiveHospital(dto.hospitalId, tx);
        await this.assertRestaurantsBelongToHospital(restaurantIds, dto.hospitalId, tx);
        await this.assertUniqueCode(dto.hospitalId, dto.code, undefined, tx);
        await this.assertUniqueHostName(dto.hostName, undefined, tx);

        const posDevice = await this.posDevices.create(
          {
            code: dto.code,
            createdBy: context.actorId,
            entity: dto.entity,
            hospitalId: dto.hospitalId,
            hostName: dto.hostName,
            isActive: dto.isActive ?? true,
            isInvoicePrintEnabled: dto.isInvoicePrintEnabled ?? false,
            isKotPrintEnabled: dto.isKotPrintEnabled ?? false,
            name: dto.name,
            updatedBy: context.actorId,
          },
          tx,
        );

        if (restaurantIds.length > 0) {
          await this.posDevices.syncRestaurants(posDevice.id, restaurantIds, context.actorId, tx);
        }

        const mappedPosDevice = await this.findActivePosDevice(posDevice.id, tx);

        await this.auditLog.record(
          {
            action: 'POS_DEVICE_CREATE',
            actorId: context.actorId,
            entityId: mappedPosDevice.id,
            entityName: 'pos_devices',
            hospitalId: mappedPosDevice.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toPosDeviceResponse(mappedPosDevice),
          },
          tx,
        );

        return mappedPosDevice;
      });

      return toPosDeviceResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'POS device');
    }
  }

  async update(id: string, dto: UpdatePosDeviceDto, context: ActorContext) {
    try {
      const updated = await this.posDevices.transaction(async (tx) => {
        const existing = await this.findActivePosDevice(id, tx);
        const data: Prisma.PosDeviceUpdateInput = {};
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const code = dto.code ?? existing.code;
        // Restaurant mappings are maintained from their own screen, so only touch them when the
        // caller sends a list, or when a location change invalidates the current mappings.
        const isHospitalChanging =
          dto.hospitalId !== undefined && dto.hospitalId !== existing.hospitalId;
        const shouldSyncRestaurants = dto.restaurantIds !== undefined || isHospitalChanging;
        const restaurantIds = dto.restaurantIds !== undefined ? uniqueIds(dto.restaurantIds) : [];

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
          data.hospital = {
            connect: {
              id: dto.hospitalId,
            },
          };
        }

        if (dto.code !== undefined || dto.hospitalId !== undefined) {
          await this.assertUniqueCode(hospitalId, code, id, tx);
        }

        if (dto.hostName !== undefined) {
          await this.assertUniqueHostName(dto.hostName, id, tx);
        }

        if (shouldSyncRestaurants) {
          await this.assertRestaurantsBelongToHospital(restaurantIds, hospitalId, tx);
        }

        if (dto.code !== undefined) {
          data.code = dto.code;
        }

        if (dto.entity !== undefined) {
          data.entity = dto.entity;
        }

        if (dto.hostName !== undefined) {
          data.hostName = dto.hostName;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.isInvoicePrintEnabled !== undefined) {
          data.isInvoicePrintEnabled = dto.isInvoicePrintEnabled;
        }

        if (dto.isKotPrintEnabled !== undefined) {
          data.isKotPrintEnabled = dto.isKotPrintEnabled;
        }

        if (dto.name !== undefined) {
          data.name = dto.name;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const posDevice = Object.keys(data).length
          ? await this.posDevices.update(id, data, tx)
          : existing;

        if (shouldSyncRestaurants) {
          await this.posDevices.syncRestaurants(id, restaurantIds, context.actorId, tx);
        }

        const mappedPosDevice = await this.findActivePosDevice(posDevice.id, tx);

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'POS_DEVICE_STATUS_CHANGE'
                : 'POS_DEVICE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'pos_devices',
            hospitalId: mappedPosDevice.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toPosDeviceResponse(mappedPosDevice),
            oldValue: toPosDeviceResponse(existing),
          },
          tx,
        );

        return mappedPosDevice;
      });

      return toPosDeviceResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'POS device');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActivePosDevice(id);

    await this.posDevices.transaction(async (tx) => {
      const deletedAt = new Date();

      await this.posDevices.softDeleteChildren(
        id,
        {
          deletedAt,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.posDevices.update(
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
          action: 'POS_DEVICE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'pos_devices',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toPosDeviceResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  private async assertActiveHospital(id: string, client: PosDeviceClient): Promise<void> {
    const hospital = await this.posDevices.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }
  }

  private async assertRestaurantsBelongToHospital(
    restaurantIds: string[],
    hospitalId: string,
    client: PosDeviceClient,
  ): Promise<void> {
    if (restaurantIds.length === 0) {
      return;
    }

    const restaurants = await this.posDevices.findActiveRestaurants(
      restaurantIds,
      hospitalId,
      client,
    );

    if (restaurants.length !== restaurantIds.length) {
      throw new BadRequestException('One or more restaurants do not belong to selected location');
    }
  }

  private async assertUniqueCode(
    hospitalId: string,
    code: string,
    excludeId: string | undefined,
    client: PosDeviceClient,
  ): Promise<void> {
    const posDevice = await this.posDevices.findByCodeWithinHospital(
      hospitalId,
      code,
      excludeId,
      client,
    );

    if (posDevice) {
      throw new ConflictException('POS device code already exists for this location');
    }
  }

  private async assertUniqueHostName(
    hostName: string | undefined,
    excludeId: string | undefined,
    client: PosDeviceClient,
  ): Promise<void> {
    const normalizedHostName = hostName?.trim();

    if (!normalizedHostName) {
      return;
    }

    const posDevice = await this.posDevices.findByHostName(normalizedHostName, excludeId, client);

    if (!posDevice) {
      return;
    }

    throw new ConflictException(
      `Host name ${normalizedHostName} is already tagged to ${describeHostNameOwner(posDevice)}`,
    );
  }

  private async findActivePosDevice(
    id: string,
    client?: PosDeviceClient,
  ): Promise<PosDeviceWithRelations> {
    const posDevice = await this.posDevices.findActiveById(id, client);

    if (!posDevice) {
      throw new NotFoundException('POS device not found');
    }

    return posDevice;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
