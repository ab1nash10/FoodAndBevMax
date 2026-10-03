import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getAllowedHospitalIds } from '@aahar/auth';
import { Hospital, OnlinePaymentOption, Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { formatMasterCode, getNextSequenceNumber } from '../common/master-code-generator';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { HospitalSortField, ListHospitalsQueryDto } from './dto/list-hospitals-query.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { HospitalsRepository } from './hospitals.repository';

type HospitalClient = Prisma.TransactionClient;

function toHospitalResponse(hospital: Hospital) {
  const invoicePrefix = hospital.billPrefix;
  const locationCode = hospital.hospitalCode;
  const title = hospital.hospitalName;

  return {
    address: hospital.address,
    area: hospital.area,
    billPrefix: hospital.billPrefix,
    city: hospital.city,
    createdAt: hospital.createdAt,
    deletedAt: hospital.deletedAt,
    displayName: hospital.displayName ?? hospital.hospitalName,
    gstApplicable: hospital.gstApplicable,
    hospitalCode: hospital.hospitalCode,
    hospitalName: hospital.hospitalName,
    id: hospital.id,
    invoicePrefix,
    ipAddress: hospital.ipAddress,
    isActive: hospital.isActive,
    latitude: hospital.latitude,
    locationCode,
    longitude: hospital.longitude,
    onlinePaymentOption: hospital.onlinePaymentOption,
    postalCode: hospital.postalCode,
    state: hospital.state,
    title,
    visitingCardAddress: hospital.visitingCardAddress,
    updatedAt: hospital.updatedAt,
  };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

function requiredText(value: string | undefined, message: string): string {
  const trimmedValue = optionalText(value);

  if (!trimmedValue) {
    throw new BadRequestException(message);
  }

  return trimmedValue;
}

function getHospitalOrderBy(query: ListHospitalsQueryDto): Prisma.HospitalOrderByWithRelationInput {
  const sortBy: HospitalSortField = query.sortBy ?? 'createdAt';
  const sortFieldMap: Record<HospitalSortField, keyof Prisma.HospitalOrderByWithRelationInput> = {
    city: 'city',
    createdAt: 'createdAt',
    displayName: 'displayName',
    hospitalCode: 'hospitalCode',
    hospitalName: 'hospitalName',
    invoicePrefix: 'billPrefix',
    isActive: 'isActive',
    locationCode: 'hospitalCode',
    onlinePaymentOption: 'onlinePaymentOption',
    postalCode: 'postalCode',
    state: 'state',
    title: 'hospitalName',
    updatedAt: 'updatedAt',
  };

  return {
    [sortFieldMap[sortBy]]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class HospitalsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly hospitals: HospitalsRepository,
  ) {}

  async list(query: ListHospitalsQueryDto) {
    const { limit, page } = getPagination(query);
    const allowed = getAllowedHospitalIds();
    const where: Prisma.HospitalWhereInput = {
      deletedAt: null,
      ...(allowed != null ? { id: { in: allowed } } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.onlinePaymentOption ? { onlinePaymentOption: query.onlinePaymentOption } : {}),
      ...(query.state ? { state: { contains: query.state, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { billPrefix: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { hospitalCode: { contains: query.search, mode: 'insensitive' } },
              { hospitalName: { contains: query.search, mode: 'insensitive' } },
              { postalCode: { contains: query.search, mode: 'insensitive' } },
              { state: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.hospitals.findMany({
        orderBy: getHospitalOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.hospitals.count({ where }),
    ]);

    return {
      items: items.map(toHospitalResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const hospital = await this.findActiveHospital(id);

    return toHospitalResponse(hospital);
  }

  async create(dto: CreateHospitalDto, context: ActorContext) {
    try {
      const created = await this.hospitals.transaction(async (tx) => {
        const hospitalName = requiredText(dto.title ?? dto.hospitalName, 'Title is required');
        const hospitalCode = requiredText(
          dto.locationCode ?? dto.hospitalCode,
          'Location code is required',
        );
        const billPrefix = optionalText(dto.invoicePrefix ?? dto.billPrefix);
        const displayName = requiredText(
          dto.displayName ?? hospitalName,
          'Display name is required',
        );
        const city = requiredText(dto.city, 'City is required');
        const state = requiredText(dto.state, 'State is required');

        await this.assertUniqueHospital(hospitalCode, billPrefix, undefined, tx);

        const hospital = await this.hospitals.create(
          {
            address: optionalText(dto.address),
            area: optionalText(dto.area),
            billPrefix,
            city,
            createdBy: context.actorId,
            displayName,
            gstApplicable: dto.gstApplicable ?? true,
            hospitalCode,
            hospitalName,
            ipAddress: optionalText(dto.ipAddress),
            isActive: dto.isActive ?? true,
            latitude: optionalText(dto.latitude),
            longitude: optionalText(dto.longitude),
            onlinePaymentOption: dto.onlinePaymentOption ?? OnlinePaymentOption.NONE,
            postalCode: optionalText(dto.postalCode),
            state,
            updatedBy: context.actorId,
            visitingCardAddress: optionalText(dto.visitingCardAddress),
          },
          tx,
        );

        const defaultStore = await this.createDefaultStore(hospital.id, context.actorId, tx);
        const defaultKitchen = await this.createDefaultKitchen(hospital.id, context.actorId, tx);

        await this.auditLog.record(
          {
            action: 'HOSPITAL_CREATE',
            actorId: context.actorId,
            entityId: hospital.id,
            entityName: 'hospitals',
            hospitalId: hospital.id,
            ipAddress: context.ipAddress,
            newValue: {
              ...toHospitalResponse(hospital),
              defaultKitchen: defaultKitchen
                ? {
                    id: defaultKitchen.id,
                    kitchenCode: defaultKitchen.kitchenCode,
                    kitchenName: defaultKitchen.kitchenName,
                  }
                : null,
              defaultStore: defaultStore
                ? {
                    id: defaultStore.id,
                    storeCode: defaultStore.storeCode,
                    storeName: defaultStore.storeName,
                  }
                : null,
            },
          },
          tx,
        );

        return hospital;
      });

      return toHospitalResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Location');
    }
  }

  async update(id: string, dto: UpdateHospitalDto, context: ActorContext) {
    try {
      const updated = await this.hospitals.transaction(async (tx) => {
        const existing = await this.findActiveHospital(id, tx);
        const data: Prisma.HospitalUpdateInput = {};

        if (dto.address !== undefined) {
          data.address = optionalText(dto.address);
        }

        if (dto.area !== undefined) {
          data.area = optionalText(dto.area);
        }

        if (dto.billPrefix !== undefined || dto.invoicePrefix !== undefined) {
          data.billPrefix = optionalText(dto.invoicePrefix ?? dto.billPrefix);
        }

        if (dto.city !== undefined) {
          data.city = requiredText(dto.city, 'City is required');
        }

        if (dto.displayName !== undefined) {
          data.displayName = requiredText(dto.displayName, 'Display name is required');
        }

        if (dto.gstApplicable !== undefined) {
          data.gstApplicable = dto.gstApplicable;
        }

        if (dto.hospitalCode !== undefined || dto.locationCode !== undefined) {
          data.hospitalCode = requiredText(
            dto.locationCode ?? dto.hospitalCode,
            'Location code is required',
          );
        }

        if (dto.hospitalName !== undefined || dto.title !== undefined) {
          data.hospitalName = requiredText(dto.title ?? dto.hospitalName, 'Title is required');
        }

        if (dto.ipAddress !== undefined) {
          data.ipAddress = optionalText(dto.ipAddress);
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.latitude !== undefined) {
          data.latitude = optionalText(dto.latitude);
        }

        if (dto.longitude !== undefined) {
          data.longitude = optionalText(dto.longitude);
        }

        if (dto.onlinePaymentOption !== undefined) {
          data.onlinePaymentOption = dto.onlinePaymentOption;
        }

        if (dto.postalCode !== undefined) {
          data.postalCode = optionalText(dto.postalCode);
        }

        if (dto.state !== undefined) {
          data.state = requiredText(dto.state, 'State is required');
        }

        if (dto.visitingCardAddress !== undefined) {
          data.visitingCardAddress = optionalText(dto.visitingCardAddress);
        }

        const nextHospitalCode =
          dto.locationCode !== undefined || dto.hospitalCode !== undefined
            ? requiredText(dto.locationCode ?? dto.hospitalCode, 'Location code is required')
            : undefined;
        const nextBillPrefix =
          dto.invoicePrefix !== undefined || dto.billPrefix !== undefined
            ? optionalText(dto.invoicePrefix ?? dto.billPrefix)
            : undefined;

        await this.assertUniqueHospital(
          nextHospitalCode !== undefined && nextHospitalCode !== existing.hospitalCode
            ? nextHospitalCode
            : undefined,
          nextBillPrefix !== undefined && nextBillPrefix !== existing.billPrefix
            ? nextBillPrefix
            : undefined,
          id,
          tx,
        );

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const hospital = Object.keys(data).length
          ? await this.hospitals.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'HOSPITAL_STATUS_CHANGE'
                : 'HOSPITAL_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'hospitals',
            hospitalId: id,
            ipAddress: context.ipAddress,
            newValue: toHospitalResponse(hospital),
            oldValue: toHospitalResponse(existing),
          },
          tx,
        );

        return hospital;
      });

      return toHospitalResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Location');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveHospital(id);

    await this.hospitals.transaction(async (tx) => {
      const deletedAt = new Date();

      await this.hospitals.softDeleteChildren(
        id,
        {
          deletedAt,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.hospitals.update(
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
          action: 'HOSPITAL_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'hospitals',
          hospitalId: id,
          ipAddress: context.ipAddress,
          oldValue: toHospitalResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertUniqueHospital(
    hospitalCode: string | undefined,
    billPrefix: string | undefined,
    excludeId: string | undefined,
    client: HospitalClient,
  ): Promise<void> {
    const [hospitalWithCode, hospitalWithBillPrefix] = await Promise.all([
      hospitalCode ? this.hospitals.findByCode(hospitalCode, excludeId, client) : null,
      billPrefix ? this.hospitals.findByBillPrefix(billPrefix, excludeId, client) : null,
    ]);

    if (hospitalWithCode) {
      throw new ConflictException('Location code already exists');
    }

    if (hospitalWithBillPrefix) {
      throw new ConflictException('Invoice prefix already exists');
    }
  }

  private async createDefaultKitchen(
    hospitalId: string,
    actorId: string | undefined,
    client: HospitalClient,
  ) {
    const existingKitchen = await client.kitchen.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        kitchenName: 'Main Kitchen',
      },
    });

    if (existingKitchen) {
      return existingKitchen;
    }

    return client.kitchen.create({
      data: {
        createdBy: actorId,
        hospitalId,
        isActive: true,
        kitchenCode: await this.generateDefaultKitchenCode(client),
        kitchenName: 'Main Kitchen',
        updatedBy: actorId,
      },
    });
  }

  private async createDefaultStore(
    hospitalId: string,
    actorId: string | undefined,
    client: HospitalClient,
  ) {
    const existingStore = await client.store.findFirst({
      where: {
        deletedAt: null,
        hospitalId,
        storeName: 'Main Store',
      },
    });

    if (existingStore) {
      return existingStore;
    }

    return client.store.create({
      data: {
        createdBy: actorId,
        hospitalId,
        isActive: true,
        storeCode: await this.generateDefaultStoreCode(client),
        storeName: 'Main Store',
        updatedBy: actorId,
      },
    });
  }

  private async generateDefaultKitchenCode(client: HospitalClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = formatMasterCode(
        'KIT',
        await getNextSequenceNumber(client, 'kitchen_code_sequence'),
      );
      const existing = await client.kitchen.findFirst({
        where: {
          kitchenCode: code,
        },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException('Kitchen code already exists');
  }

  private async generateDefaultStoreCode(client: HospitalClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = formatMasterCode(
        'STR',
        await getNextSequenceNumber(client, 'store_code_sequence'),
      );
      const existing = await client.store.findFirst({
        where: {
          storeCode: code,
        },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException('Store code already exists');
  }

  private async findActiveHospital(id: string, client?: HospitalClient): Promise<Hospital> {
    // Hospital is the scope itself, so the Prisma scope extension (keyed on hospital_id) cannot
    // cover it; without this, an Admin of one hospital could edit or delete any other.
    const allowed = getAllowedHospitalIds();
    const hospital =
      allowed == null || allowed.includes(id)
        ? await this.hospitals.findActiveById(id, client)
        : null;

    if (!hospital) {
      throw new NotFoundException('Location not found');
    }

    return hospital;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
