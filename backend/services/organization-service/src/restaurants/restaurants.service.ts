import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantsRepository, RestaurantWithRelations } from './restaurants.repository';
import { toRestaurantResponse } from './restaurants.helpers';

type RestaurantClient = Prisma.TransactionClient;

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly restaurants: RestaurantsRepository,
  ) {}

  async list(query: ListRestaurantsQueryDto) {
    const { limit, page } = getPagination(query);
    const filters: Prisma.RestaurantWhereInput[] = [];

    if (query.kitchenId) {
      filters.push({
        OR: [
          { kitchenId: query.kitchenId },
          {
            restaurantKitchens: {
              some: {
                deletedAt: null,
                isActive: true,
                kitchenId: query.kitchenId,
              },
            },
          },
        ],
      });
    }

    if (query.search) {
      filters.push({
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { fssaiNumber: { contains: query.search, mode: 'insensitive' } },
          { gstNumber: { contains: query.search, mode: 'insensitive' } },
          { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
          { kitchen: { kitchenName: { contains: query.search, mode: 'insensitive' } } },
          { location: { locationName: { contains: query.search, mode: 'insensitive' } } },
          { mobile: { contains: query.search, mode: 'insensitive' } },
          { restaurantCode: { contains: query.search, mode: 'insensitive' } },
          { restaurantName: { contains: query.search, mode: 'insensitive' } },
          {
            restaurantKitchens: {
              some: {
                kitchen: {
                  kitchenName: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          },
          { store: { storeName: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.RestaurantWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(filters.length > 0 ? { AND: filters } : {}),
    };

    const [items, total] = await Promise.all([
      this.restaurants.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.restaurants.count({ where }),
    ]);

    return {
      items: items.map(toRestaurantResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const restaurant = await this.findActiveRestaurant(id);

    return toRestaurantResponse(restaurant);
  }

  async create(dto: CreateRestaurantDto, context: ActorContext) {
    try {
      const created = await this.restaurants.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);
        const kitchenIds = this.getRequestedKitchenIds(dto);

        if (dto.locationId) {
          await this.assertActiveLocation(dto.locationId, dto.hospitalId, tx);
        }

        if (dto.storeId) {
          await this.assertActiveStore(dto.storeId, dto.hospitalId, tx);
        }

        if (kitchenIds.length > 0) {
          await this.assertActiveKitchens(kitchenIds, dto.hospitalId, tx);
        }

        const restaurantCode = await this.generateUniqueRestaurantCode(tx);
        const primaryKitchenId = kitchenIds[0];

        const restaurant = await this.restaurants.create(
          {
            address: dto.address,
            b2cQrEnabled: dto.b2cQrEnabled ?? false,
            accountNumber: dto.accountNumber,
            atTableDining: dto.isAtTableDiningEnabled ?? dto.atTableDining ?? false,
            bankBranch: dto.bankBranch,
            bankName: dto.bankNameBranch ?? dto.bankName,
            closingTime: dto.closingTime,
            coverImageUrl: dto.coverImageUrl,
            createdBy: context.actorId,
            delivery: dto.isDeliveryEnabled ?? dto.delivery ?? false,
            email: dto.email,
            fssaiNumber: dto.fssaiNumbers ?? dto.fssaiNumber,
            gstNumber: dto.gstNumber,
            gstAddress: dto.gstAddress,
            homeDelivery: dto.isHomeDeliveryEnabled ?? dto.homeDelivery ?? false,
            hospitalId: dto.hospitalId,
            ifscCode: dto.ifscCode,
            inCarDining: dto.isInCarDiningEnabled ?? dto.inCarDining ?? false,
            inRoomDiningEnabled:
              dto.isInRoomDiningEnabled ?? dto.inRoomDining ?? dto.inRoomDiningEnabled ?? false,
            inventory: dto.isInventoryEnabled ?? dto.inventory ?? false,
            isActive: dto.isActive ?? true,
            isRegisteredInGst: dto.isRegisteredInGst ?? false,
            kitchenId: primaryKitchenId,
            legalName: dto.legalName,
            locationId: dto.locationId,
            mobile: dto.mobile,
            normalDiscountApplicable: dto.normalDiscountApplicable ?? false,
            offline: dto.isOffline ?? dto.offline ?? false,
            onlineOrderingEnabled:
              dto.isOnlineOrdersEnabled ?? dto.onlineOrders ?? dto.onlineOrderingEnabled ?? false,
            openingTime: dto.openingTime,
            open24x7: dto.isOpen24x7 ?? dto.open24x7 ?? false,
            panNumber: dto.panNumber,
            posOrders: dto.isPosOrdersEnabled ?? dto.posOrders ?? false,
            qrUnitName: dto.unitNameForQr ?? dto.qrUnitName,
            restaurantCode,
            restaurantName: dto.restaurantName,
            staffDiscountApplicable: dto.staffDiscountApplicable ?? false,
            storeId: dto.storeId,
            sodexoMid: dto.sodexoMid,
            sodexoTid: dto.sodexoTid,
            sunBu: dto.sunBu,
            sunT1: dto.sunT1,
            sunT2: dto.sunT2,
            takeaway: dto.isTakeawayEnabled ?? dto.takeaway ?? false,
            thumbnailUrl: dto.thumbnailUrl,
            updatedBy: context.actorId,
            upiId: dto.upiId,
            vegOnly: dto.isVegOnly ?? dto.vegOnly ?? false,
          },
          tx,
        );

        await this.restaurants.syncKitchens(restaurant.id, kitchenIds, context.actorId, tx);
        const mappedRestaurant = await this.findActiveRestaurant(restaurant.id, tx);

        await this.auditLog.record(
          {
            action: 'RESTAURANT_CREATE',
            actorId: context.actorId,
            entityId: mappedRestaurant.id,
            entityName: 'restaurants',
            hospitalId: mappedRestaurant.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toRestaurantResponse(mappedRestaurant),
          },
          tx,
        );

        return mappedRestaurant;
      });

      return toRestaurantResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Restaurant');
    }
  }

  async update(id: string, dto: UpdateRestaurantDto, context: ActorContext) {
    try {
      const updated = await this.restaurants.transaction(async (tx) => {
        const existing = await this.findActiveRestaurant(id, tx);
        const data: Prisma.RestaurantUpdateInput = {};
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const restaurantCode = dto.restaurantCode ?? existing.restaurantCode;
        const shouldSyncKitchens = dto.kitchenIds !== undefined || dto.kitchenId !== undefined;
        const requestedKitchenIds = shouldSyncKitchens ? this.getRequestedKitchenIds(dto) : [];
        const primaryKitchenId = requestedKitchenIds[0];

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
          data.hospital = {
            connect: {
              id: dto.hospitalId,
            },
          };
        }

        if (dto.storeId) {
          await this.assertActiveStore(dto.storeId, hospitalId, tx);
        }

        if (shouldSyncKitchens && requestedKitchenIds.length > 0) {
          await this.assertActiveKitchens(requestedKitchenIds, hospitalId, tx);
        }

        if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber;
        if (dto.address !== undefined) data.address = dto.address;
        if (dto.isAtTableDiningEnabled !== undefined || dto.atTableDining !== undefined) {
          data.atTableDining = dto.isAtTableDiningEnabled ?? dto.atTableDining;
        }
        if (dto.b2cQrEnabled !== undefined) data.b2cQrEnabled = dto.b2cQrEnabled;
        if (dto.bankBranch !== undefined) data.bankBranch = dto.bankBranch;
        if (dto.bankNameBranch !== undefined || dto.bankName !== undefined) {
          data.bankName = dto.bankNameBranch ?? dto.bankName;
        }
        if (dto.closingTime !== undefined) data.closingTime = dto.closingTime;
        if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
        if (dto.isDeliveryEnabled !== undefined || dto.delivery !== undefined) {
          data.delivery = dto.isDeliveryEnabled ?? dto.delivery;
        }
        if (dto.email !== undefined) data.email = dto.email;
        if (dto.fssaiNumbers !== undefined || dto.fssaiNumber !== undefined) {
          data.fssaiNumber = dto.fssaiNumbers ?? dto.fssaiNumber;
        }
        if (dto.gstNumber !== undefined) data.gstNumber = dto.gstNumber;
        if (dto.gstAddress !== undefined) data.gstAddress = dto.gstAddress;
        if (dto.isHomeDeliveryEnabled !== undefined || dto.homeDelivery !== undefined) {
          data.homeDelivery = dto.isHomeDeliveryEnabled ?? dto.homeDelivery;
        }
        if (dto.ifscCode !== undefined) data.ifscCode = dto.ifscCode;
        if (dto.isInCarDiningEnabled !== undefined || dto.inCarDining !== undefined) {
          data.inCarDining = dto.isInCarDiningEnabled ?? dto.inCarDining;
        }
        if (
          dto.isInRoomDiningEnabled !== undefined ||
          dto.inRoomDining !== undefined ||
          dto.inRoomDiningEnabled !== undefined
        ) {
          data.inRoomDiningEnabled =
            dto.isInRoomDiningEnabled ?? dto.inRoomDining ?? dto.inRoomDiningEnabled;
        }
        if (dto.isInventoryEnabled !== undefined || dto.inventory !== undefined) {
          data.inventory = dto.isInventoryEnabled ?? dto.inventory;
        }
        if (dto.isActive !== undefined) {
          if (dto.isActive && dto.hospitalId === undefined && !existing.hospital.isActive) {
            throw new BadRequestException('Location is inactive. Restaurant cannot be activated.');
          }

          data.isActive = dto.isActive;
        }
        if (dto.isRegisteredInGst !== undefined) {
          data.isRegisteredInGst = dto.isRegisteredInGst;
        }
        if (dto.kitchenIds !== undefined || dto.kitchenId !== undefined) {
          data.kitchen = primaryKitchenId
            ? {
                connect: {
                  id: primaryKitchenId,
                },
              }
            : {
                disconnect: true,
              };
        }
        if (dto.legalName !== undefined) data.legalName = dto.legalName;
        if (dto.locationId !== undefined) {
          await this.assertActiveLocation(dto.locationId, hospitalId, tx);
          data.location = {
            connect: {
              id: dto.locationId,
            },
          };
        }
        if (dto.mobile !== undefined) data.mobile = dto.mobile;
        if (dto.normalDiscountApplicable !== undefined) {
          data.normalDiscountApplicable = dto.normalDiscountApplicable;
        }
        if (dto.isOffline !== undefined || dto.offline !== undefined) {
          data.offline = dto.isOffline ?? dto.offline;
        }
        if (
          dto.isOnlineOrdersEnabled !== undefined ||
          dto.onlineOrders !== undefined ||
          dto.onlineOrderingEnabled !== undefined
        ) {
          data.onlineOrderingEnabled =
            dto.isOnlineOrdersEnabled ?? dto.onlineOrders ?? dto.onlineOrderingEnabled;
        }
        if (dto.openingTime !== undefined) data.openingTime = dto.openingTime;
        if (dto.isOpen24x7 !== undefined || dto.open24x7 !== undefined) {
          data.open24x7 = dto.isOpen24x7 ?? dto.open24x7;
        }
        if (dto.panNumber !== undefined) data.panNumber = dto.panNumber;
        if (dto.isPosOrdersEnabled !== undefined || dto.posOrders !== undefined) {
          data.posOrders = dto.isPosOrdersEnabled ?? dto.posOrders;
        }
        if (dto.unitNameForQr !== undefined || dto.qrUnitName !== undefined) {
          data.qrUnitName = dto.unitNameForQr ?? dto.qrUnitName;
        }
        if (dto.restaurantCode !== undefined) data.restaurantCode = dto.restaurantCode;
        if (dto.restaurantName !== undefined) data.restaurantName = dto.restaurantName;
        if (dto.staffDiscountApplicable !== undefined) {
          data.staffDiscountApplicable = dto.staffDiscountApplicable;
        }
        if (dto.storeId !== undefined) {
          data.store = {
            connect: {
              id: dto.storeId,
            },
          };
        }
        if (dto.sodexoMid !== undefined) data.sodexoMid = dto.sodexoMid;
        if (dto.sodexoTid !== undefined) data.sodexoTid = dto.sodexoTid;
        if (dto.sunBu !== undefined) data.sunBu = dto.sunBu;
        if (dto.sunT1 !== undefined) data.sunT1 = dto.sunT1;
        if (dto.sunT2 !== undefined) data.sunT2 = dto.sunT2;
        if (dto.isTakeawayEnabled !== undefined || dto.takeaway !== undefined) {
          data.takeaway = dto.isTakeawayEnabled ?? dto.takeaway;
        }
        if (dto.thumbnailUrl !== undefined) data.thumbnailUrl = dto.thumbnailUrl;
        if (dto.upiId !== undefined) data.upiId = dto.upiId;
        if (dto.isVegOnly !== undefined || dto.vegOnly !== undefined) {
          data.vegOnly = dto.isVegOnly ?? dto.vegOnly;
        }

        if (dto.restaurantCode !== undefined || dto.hospitalId !== undefined) {
          await this.assertUniqueRestaurantCode(hospitalId, restaurantCode, id, tx);
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const restaurant = Object.keys(data).length
          ? await this.restaurants.update(id, data, tx)
          : existing;

        if (shouldSyncKitchens) {
          await this.restaurants.syncKitchens(id, requestedKitchenIds, context.actorId, tx);
        }

        const mappedRestaurant = await this.findActiveRestaurant(restaurant.id, tx);

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'RESTAURANT_STATUS_CHANGE'
                : 'RESTAURANT_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'restaurants',
            hospitalId: mappedRestaurant.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toRestaurantResponse(mappedRestaurant),
            oldValue: toRestaurantResponse(existing),
          },
          tx,
        );

        return mappedRestaurant;
      });

      return toRestaurantResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Restaurant');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveRestaurant(id);

    await this.restaurants.transaction(async (tx) => {
      const deletedAt = new Date();

      await this.restaurants.softDeleteCounters(
        id,
        {
          deletedAt,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.restaurants.update(
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
          action: 'RESTAURANT_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'restaurants',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toRestaurantResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveHospital(id: string, client: RestaurantClient): Promise<void> {
    const hospital = await this.restaurants.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async assertActiveKitchens(
    ids: string[],
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    const kitchens = await this.restaurants.findActiveKitchens(uniqueIds, hospitalId, client);

    if (kitchens.length !== uniqueIds.length) {
      throw new BadRequestException('One or more kitchens were not found for selected hospital');
    }
  }

  private async assertActiveLocation(
    id: string,
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<void> {
    const location = await this.restaurants.findActiveLocation(id, hospitalId, client);

    if (!location || !location.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }
  }

  private async assertActiveStore(
    id: string,
    hospitalId: string,
    client: RestaurantClient,
  ): Promise<void> {
    const store = await this.restaurants.findActiveStore(id, hospitalId, client);

    if (!store || !store.isActive) {
      throw new BadRequestException('Store not found or inactive');
    }
  }

  private async assertUniqueRestaurantCode(
    hospitalId: string,
    restaurantCode: string,
    excludeId: string | undefined,
    client: RestaurantClient,
  ): Promise<void> {
    const restaurant = await this.restaurants.findByCodeWithinHospital(
      hospitalId,
      restaurantCode,
      excludeId,
      client,
    );

    if (restaurant) {
      throw new ConflictException('Restaurant code already exists within hospital');
    }
  }

  private async generateUniqueRestaurantCode(client: RestaurantClient): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextValue = await this.restaurants.getNextRestaurantCodeSequenceValue(client);

      if (!Number.isSafeInteger(nextValue) || nextValue < 1) {
        throw new InternalServerErrorException('Unable to generate restaurant code');
      }

      const restaurantCode = `RST${String(nextValue).padStart(4, '0')}`;
      const existing = await this.restaurants.findByCode(restaurantCode, undefined, client);

      if (!existing) {
        return restaurantCode;
      }
    }

    throw new ConflictException('Restaurant code already exists');
  }

  private getRequestedKitchenIds(
    dto: Pick<CreateRestaurantDto, 'kitchenId' | 'kitchenIds'>,
  ): string[] {
    const ids = dto.kitchenIds ?? (dto.kitchenId ? [dto.kitchenId] : []);

    return [...new Set(ids.filter(Boolean))];
  }

  private async findActiveRestaurant(
    id: string,
    client?: RestaurantClient,
  ): Promise<RestaurantWithRelations> {
    const restaurant = await this.restaurants.findActiveById(id, client);

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }
}
