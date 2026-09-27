import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimeSlot } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import {
  CreateRestaurantMenuDto,
  RestaurantMenuPositionType,
} from './dto/create-restaurant-menu.dto';
import {
  ListRestaurantMenusQueryDto,
  RestaurantMenuSortField,
} from './dto/list-restaurant-menus-query.dto';
import { UpdateRestaurantMenuDto } from './dto/update-restaurant-menu.dto';
import {
  RestaurantMenusRepository,
  RestaurantMenuWithRelations,
} from './restaurant-menus.repository';

type RestaurantMenuClient = Prisma.TransactionClient;
type TimeSlotSummary = Pick<
  TimeSlot,
  'endTime' | 'id' | 'isActive' | 'isAlwaysAvailable' | 'slotName' | 'startTime'
>;

function getRestaurantMenuOrderBy(
  query: ListRestaurantMenusQueryDto,
): Prisma.RestaurantMenuOrderByWithRelationInput {
  const sortBy: RestaurantMenuSortField = query.sortBy ?? 'displayOrder';

  return {
    [sortBy]: query.sortOrder ?? 'asc',
  };
}

function uniqueValues(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

@Injectable()
export class RestaurantMenusService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly restaurantMenus: RestaurantMenusRepository,
  ) {}

  async list(query: ListRestaurantMenusQueryDto) {
    const { limit, page } = getPagination(query);
    const timeSlotIdsForSearch = query.search
      ? await this.restaurantMenus.findActiveTimeSlotIdsBySearch(query.search)
      : [];
    const where: Prisma.RestaurantMenuWhereInput = {
      deletedAt: null,
      ...(query.dayOfWeek ? { daysOfWeek: { has: query.dayOfWeek } } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { item: { itemType: query.itemType } } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.timeSlotId ? { timeSlotIds: { has: query.timeSlotId } } : {}),
      ...(query.search
        ? {
            OR: [
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantCode: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } } },
              ...(timeSlotIdsForSearch.length
                ? [{ timeSlotIds: { hasSome: timeSlotIdsForSearch } }]
                : []),
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.restaurantMenus.findMany({
        orderBy: getRestaurantMenuOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.restaurantMenus.count({ where }),
    ]);

    return {
      items: await this.toRestaurantMenuResponses(items),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return this.toRestaurantMenuResponse(await this.findActiveRestaurantMenu(id));
  }

  async create(dto: CreateRestaurantMenuDto, context: ActorContext) {
    try {
      return await this.restaurantMenus.transaction(async (tx) => {
        const restaurant = await this.assertValidRestaurant(dto.restaurantId, tx);
        const timeSlotIds = uniqueValues(dto.timeSlotIds);
        const daysOfWeek = uniqueValues(dto.daysOfWeek);

        await this.assertValidItem(dto.itemId, tx);
        await this.assertValidTimeSlots(timeSlotIds, tx);
        await this.assertUniqueMapping(dto.restaurantId, dto.itemId, undefined, tx);

        const displayOrder = await this.resolveDisplayOrder(
          {
            positionType: dto.positionType ?? RestaurantMenuPositionType.LAST,
            referenceMenuId: dto.referenceMenuId,
            restaurantId: dto.restaurantId,
          },
          tx,
        );

        const mapping = await this.restaurantMenus.create(
          {
            createdBy: context.actorId,
            daysOfWeek,
            displayOrder,
            hospitalId: restaurant.hospitalId,
            isActive: dto.isActive ?? true,
            isAvailable: dto.isAvailable ?? true,
            itemId: dto.itemId,
            restaurantId: dto.restaurantId,
            timeSlotIds,
            updatedBy: context.actorId,
          },
          tx,
        );
        const newValue = await this.toRestaurantMenuResponse(mapping, tx);

        await this.auditLog.record(
          {
            action: 'RESTAURANT_MENU_CREATE',
            actorId: context.actorId,
            entityId: mapping.id,
            entityName: 'restaurant_menus',
            hospitalId: mapping.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'Restaurant menu mapping');
    }
  }

  async update(id: string, dto: UpdateRestaurantMenuDto, context: ActorContext) {
    try {
      return await this.restaurantMenus.transaction(async (tx) => {
        const existing = await this.findActiveRestaurantMenu(id, tx);
        const nextRestaurantId = dto.restaurantId ?? existing.restaurantId;
        const nextItemId = dto.itemId ?? existing.itemId;
        const data: Prisma.RestaurantMenuUpdateInput = {};
        const oldValue = await this.toRestaurantMenuResponse(existing, tx);

        if (dto.referenceMenuId && dto.positionType === undefined) {
          throw new BadRequestException(
            'Position type is required when reference menu is selected',
          );
        }

        if (dto.restaurantId !== undefined) {
          const restaurant = await this.assertValidRestaurant(dto.restaurantId, tx);

          data.hospital = { connect: { id: restaurant.hospitalId } };
          data.restaurant = { connect: { id: dto.restaurantId } };
        }

        if (dto.itemId !== undefined) {
          await this.assertValidItem(dto.itemId, tx);
          data.item = { connect: { id: dto.itemId } };
        }

        if (dto.restaurantId !== undefined || dto.itemId !== undefined) {
          await this.assertUniqueMapping(nextRestaurantId, nextItemId, id, tx);
        }

        if (dto.timeSlotIds !== undefined) {
          const timeSlotIds = uniqueValues(dto.timeSlotIds);

          await this.assertValidTimeSlots(timeSlotIds, tx);
          data.timeSlotIds = { set: timeSlotIds };
        }

        if (dto.daysOfWeek !== undefined) {
          data.daysOfWeek = { set: uniqueValues(dto.daysOfWeek) };
        }

        if (dto.positionType !== undefined || dto.restaurantId !== undefined) {
          data.displayOrder = await this.resolveDisplayOrder(
            {
              positionType: dto.positionType ?? RestaurantMenuPositionType.LAST,
              referenceMenuId: dto.referenceMenuId,
              restaurantId: nextRestaurantId,
            },
            tx,
            id,
          );
        }

        if (dto.isAvailable !== undefined) {
          data.isAvailable = dto.isAvailable;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const mapping = Object.keys(data).length
          ? await this.restaurantMenus.update(id, data, tx)
          : existing;
        const newValue = await this.toRestaurantMenuResponse(mapping, tx);

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'RESTAURANT_MENU_STATUS_CHANGE'
                : dto.isAvailable !== undefined && dto.isAvailable !== existing.isAvailable
                  ? 'RESTAURANT_MENU_AVAILABILITY_CHANGE'
                  : 'RESTAURANT_MENU_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'restaurant_menus',
            hospitalId: mapping.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
            oldValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'Restaurant menu mapping');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveRestaurantMenu(id);
    const oldValue = await this.toRestaurantMenuResponse(existing);

    await this.restaurantMenus.transaction(async (tx) => {
      await this.restaurantMenus.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          isAvailable: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'RESTAURANT_MENU_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'restaurant_menus',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue,
        },
        tx,
      );
    });

    return { id };
  }

  private async assertUniqueMapping(
    restaurantId: string,
    itemId: string,
    excludeId: string | undefined,
    client: RestaurantMenuClient,
  ): Promise<void> {
    const mapping = await this.restaurantMenus.findActiveMapping(
      restaurantId,
      itemId,
      excludeId,
      client,
    );

    if (mapping) {
      throw new ConflictException('Restaurant menu mapping already exists');
    }
  }

  private async assertValidItem(itemId: string, client: RestaurantMenuClient): Promise<void> {
    const item = await this.restaurantMenus.findActiveItem(itemId, client);

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    if (!item.isActive) {
      throw new BadRequestException('This item is inactive and cannot be used.');
    }
  }

  private async assertValidRestaurant(restaurantId: string, client: RestaurantMenuClient) {
    const restaurant = await this.restaurantMenus.findActiveRestaurant(restaurantId, client);

    if (!restaurant || !restaurant.isActive) {
      throw new BadRequestException('Restaurant not found or inactive');
    }

    return restaurant;
  }

  private async assertValidTimeSlots(
    timeSlotIds: string[],
    client: RestaurantMenuClient,
  ): Promise<void> {
    if (timeSlotIds.length === 0) {
      return;
    }

    const timeSlots = await this.restaurantMenus.findActiveTimeSlotsByIds(timeSlotIds, client);

    if (timeSlots.length !== timeSlotIds.length) {
      throw new BadRequestException('One or more time slots were not found or inactive');
    }
  }

  private async resolveDisplayOrder(
    {
      positionType,
      referenceMenuId,
      restaurantId,
    }: {
      positionType: RestaurantMenuPositionType;
      referenceMenuId?: string;
      restaurantId: string;
    },
    client: RestaurantMenuClient,
    excludeId?: string,
  ): Promise<number> {
    if (positionType === RestaurantMenuPositionType.LAST) {
      return (await this.restaurantMenus.getMaxDisplayOrder(restaurantId, client)) + 1;
    }

    if (positionType === RestaurantMenuPositionType.FIRST) {
      await this.restaurantMenus.incrementDisplayOrders(restaurantId, 1, excludeId, client);
      return 1;
    }

    if (!referenceMenuId) {
      throw new BadRequestException('Reference menu item is required for before or after position');
    }

    if (referenceMenuId === excludeId) {
      throw new BadRequestException('Reference menu item cannot be the same menu item');
    }

    const referenceMenu = await this.restaurantMenus.findActiveReferenceMenu(
      referenceMenuId,
      restaurantId,
      client,
    );

    if (!referenceMenu) {
      throw new BadRequestException('Reference menu item not found for selected restaurant');
    }

    const displayOrder =
      positionType === RestaurantMenuPositionType.BEFORE_ITEM
        ? Math.max(referenceMenu.displayOrder, 1)
        : Math.max(referenceMenu.displayOrder + 1, 1);

    await this.restaurantMenus.incrementDisplayOrders(
      restaurantId,
      displayOrder,
      excludeId,
      client,
    );

    return displayOrder;
  }

  private async findActiveRestaurantMenu(
    id: string,
    client?: RestaurantMenuClient,
  ): Promise<RestaurantMenuWithRelations> {
    const mapping = await this.restaurantMenus.findActiveById(id, client);

    if (!mapping) {
      throw new NotFoundException('Restaurant menu mapping not found');
    }

    return mapping;
  }

  private async toRestaurantMenuResponse(
    mapping: RestaurantMenuWithRelations,
    client?: RestaurantMenuClient,
  ) {
    return (await this.toRestaurantMenuResponses([mapping], client))[0];
  }

  private async toRestaurantMenuResponses(
    mappings: RestaurantMenuWithRelations[],
    client?: RestaurantMenuClient,
  ) {
    const timeSlotIds = [...new Set(mappings.flatMap((mapping) => mapping.timeSlotIds))];
    const timeSlots = await this.restaurantMenus.findActiveTimeSlotsByIds(timeSlotIds, client);
    const timeSlotMap = new Map<string, TimeSlotSummary>(
      timeSlots.map((timeSlot) => [timeSlot.id, timeSlot] as const),
    );

    return mappings.map((mapping) => ({
      createdAt: mapping.createdAt,
      daysOfWeek: mapping.daysOfWeek,
      deletedAt: mapping.deletedAt,
      displayOrder: mapping.displayOrder,
      hospitalId: mapping.hospitalId,
      id: mapping.id,
      isActive: mapping.isActive,
      isAvailable: mapping.isAvailable,
      item: mapping.item,
      itemId: mapping.itemId,
      restaurant: mapping.restaurant,
      restaurantId: mapping.restaurantId,
      timeSlotIds: mapping.timeSlotIds,
      timeSlots: mapping.timeSlotIds
        .map((timeSlotId) => timeSlotMap.get(timeSlotId))
        .filter((timeSlot): timeSlot is TimeSlotSummary => Boolean(timeSlot)),
      updatedAt: mapping.updatedAt,
    }));
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
