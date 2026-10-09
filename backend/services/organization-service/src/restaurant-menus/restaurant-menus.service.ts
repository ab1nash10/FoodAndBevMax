import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuServeAt, Prisma, Restaurant } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import {
  CreateRestaurantMenuDto,
  RestaurantMenuPositionType,
} from './dto/create-restaurant-menu.dto';
import { ListRestaurantMenusQueryDto } from './dto/list-restaurant-menus-query.dto';
import { UpdateRestaurantMenuDto } from './dto/update-restaurant-menu.dto';
import {
  RestaurantMenusRepository,
  RestaurantMenuWithRelations,
} from './restaurant-menus.repository';
import { toNumber } from '../common/values';

type RestaurantMenuClient = Prisma.TransactionClient;

function uniqueValues(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

const detailFields = [
  'accompaniments',
  'addOn',
  'availableFrom',
  'availableTo',
  'gstPercent',
  'isDiscountable',
  'isGstInclusive',
  'preparationTimeMinutes',
  'price',
  'roomPrice',
  'serveAt',
  'serves',
] as const;

type MenuDetails = Pick<Prisma.RestaurantMenuUncheckedCreateInput, (typeof detailFields)[number]>;

/** The serving and pricing fields a request sets; blank text is stored as null. */
export function menuDetails(dto: UpdateRestaurantMenuDto): MenuDetails {
  return Object.fromEntries(
    detailFields
      .filter((field) => dto[field] !== undefined)
      .map((field) => {
        const value = dto[field];

        return [field, typeof value === 'string' ? value.trim() || null : value];
      }),
  );
}

/** A window has both ends or neither; neither means the item is on sale all day. */
export function assertWindow(menu: {
  availableFrom?: string | null;
  availableTo?: string | null;
}): void {
  if (Boolean(menu.availableFrom) !== Boolean(menu.availableTo)) {
    throw new BadRequestException('Set both the from and to times, or neither for all day');
  }

  if (menu.availableFrom && menu.availableFrom === menu.availableTo) {
    throw new BadRequestException('The from and to times cannot be the same');
  }
}

/** Counter sales need a price and in-room dining a room price, depending on where it is served. */
export function assertPricesFor(menu: {
  price?: number | null;
  roomPrice?: number | null;
  serveAt: MenuServeAt;
}): void {
  if (menu.serveAt !== MenuServeAt.ROOM && (menu.price === null || menu.price === undefined)) {
    throw new BadRequestException('Price is required for an item served at the counter');
  }

  if (
    menu.serveAt !== MenuServeAt.COUNTER &&
    (menu.roomPrice === null || menu.roomPrice === undefined)
  ) {
    throw new BadRequestException('In-room price is required for an item served in rooms');
  }
}

@Injectable()
export class RestaurantMenusService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly restaurantMenus: RestaurantMenusRepository,
  ) {}

  async list(query: ListRestaurantMenusQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.RestaurantMenuWhereInput = {
      deletedAt: null,
      ...(query.dayOfWeek ? { daysOfWeek: { has: query.dayOfWeek } } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { item: { itemType: query.itemType } } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.search
        ? {
            OR: [
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantCode: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.restaurantMenus.findMany({
        orderBy: getOrderBy(query, 'displayOrder', 'asc'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.restaurantMenus.count({ where }),
    ]);

    return {
      items: this.toRestaurantMenuResponses(items),
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
        const daysOfWeek = uniqueValues(dto.daysOfWeek);

        await this.assertValidItem(dto.itemId, tx);
        await this.assertUniqueMapping(dto.restaurantId, dto.itemId, undefined, tx);
        assertWindow(dto);
        assertPricesFor({
          price: dto.price,
          roomPrice: dto.roomPrice,
          serveAt: dto.serveAt ?? MenuServeAt.BOTH,
        });

        if (dto.kitchenId) {
          await this.assertRestaurantKitchen(restaurant, dto.kitchenId, tx);
        }

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
            ...menuDetails(dto),
            createdBy: context.actorId,
            daysOfWeek,
            displayOrder,
            hospitalId: restaurant.hospitalId,
            isActive: dto.isActive ?? true,
            isAvailable: dto.isAvailable ?? true,
            itemId: dto.itemId,
            kitchenId: dto.kitchenId ?? null,
            restaurantId: dto.restaurantId,
            updatedBy: context.actorId,
          },
          tx,
        );
        const newValue = this.toRestaurantMenuResponse(mapping);

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
      handlePrismaError(error, 'Restaurant menu mapping');
    }
  }

  async update(id: string, dto: UpdateRestaurantMenuDto, context: ActorContext) {
    try {
      return await this.restaurantMenus.transaction(async (tx) => {
        const existing = await this.findActiveRestaurantMenu(id, tx);
        const nextRestaurantId = dto.restaurantId ?? existing.restaurantId;
        const nextItemId = dto.itemId ?? existing.itemId;
        const data: Prisma.RestaurantMenuUpdateInput = menuDetails(dto);
        const oldValue = this.toRestaurantMenuResponse(existing);

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

        const nextKitchenId = dto.kitchenId === undefined ? existing.kitchenId : dto.kitchenId;

        if (nextKitchenId && (dto.kitchenId || dto.restaurantId !== undefined)) {
          await this.assertRestaurantKitchen(
            await this.assertValidRestaurant(nextRestaurantId, tx),
            nextKitchenId,
            tx,
          );
        }

        if (dto.kitchenId !== undefined) {
          data.kitchen = dto.kitchenId ? { connect: { id: dto.kitchenId } } : { disconnect: true };
        }

        if (dto.serveAt !== undefined || dto.price !== undefined || dto.roomPrice !== undefined) {
          assertPricesFor({
            price:
              dto.price === undefined
                ? existing.price === null
                  ? null
                  : toNumber(existing.price)
                : dto.price,
            roomPrice:
              dto.roomPrice === undefined
                ? existing.roomPrice === null
                  ? null
                  : toNumber(existing.roomPrice)
                : dto.roomPrice,
            serveAt: dto.serveAt ?? existing.serveAt,
          });
        }

        if (dto.itemId !== undefined) {
          await this.assertValidItem(dto.itemId, tx);
          data.item = { connect: { id: dto.itemId } };
        }

        if (dto.restaurantId !== undefined || dto.itemId !== undefined) {
          await this.assertUniqueMapping(nextRestaurantId, nextItemId, id, tx);
        }

        if (dto.availableFrom !== undefined || dto.availableTo !== undefined) {
          assertWindow({
            availableFrom:
              dto.availableFrom === undefined ? existing.availableFrom : dto.availableFrom,
            availableTo: dto.availableTo === undefined ? existing.availableTo : dto.availableTo,
          });
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
        const newValue = this.toRestaurantMenuResponse(mapping);

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
      handlePrismaError(error, 'Restaurant menu mapping');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveRestaurantMenu(id);
    const oldValue = this.toRestaurantMenuResponse(existing);

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

  private async assertRestaurantKitchen(
    restaurant: Restaurant,
    kitchenId: string,
    client: RestaurantMenuClient,
  ): Promise<void> {
    if (!(await this.restaurantMenus.isRestaurantKitchen(restaurant, kitchenId, client))) {
      throw new BadRequestException('Choose an active kitchen at this restaurant’s location');
    }
  }

  private async assertValidRestaurant(restaurantId: string, client: RestaurantMenuClient) {
    const restaurant = await this.restaurantMenus.findActiveRestaurant(restaurantId, client);

    if (!restaurant || !restaurant.isActive) {
      throw new BadRequestException('Restaurant not found or inactive');
    }

    return restaurant;
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

  private toRestaurantMenuResponse(mapping: RestaurantMenuWithRelations) {
    return this.toRestaurantMenuResponses([mapping])[0];
  }

  private toRestaurantMenuResponses(mappings: RestaurantMenuWithRelations[]) {
    return mappings.map((mapping) => ({
      accompaniments: mapping.accompaniments,
      addOn: mapping.addOn,
      availableFrom: mapping.availableFrom,
      availableTo: mapping.availableTo,
      createdAt: mapping.createdAt,
      daysOfWeek: mapping.daysOfWeek,
      deletedAt: mapping.deletedAt,
      displayOrder: mapping.displayOrder,
      gstPercent: toNumber(mapping.gstPercent),
      hospitalId: mapping.hospitalId,
      id: mapping.id,
      isActive: mapping.isActive,
      isAvailable: mapping.isAvailable,
      isDiscountable: mapping.isDiscountable,
      isGstInclusive: mapping.isGstInclusive,
      item: mapping.item,
      itemId: mapping.itemId,
      kitchen: mapping.kitchen,
      kitchenId: mapping.kitchenId,
      preparationTimeMinutes: mapping.preparationTimeMinutes,
      price: mapping.price === null ? null : toNumber(mapping.price),
      restaurant: mapping.restaurant,
      restaurantId: mapping.restaurantId,
      roomPrice: mapping.roomPrice === null ? null : toNumber(mapping.roomPrice),
      serveAt: mapping.serveAt,
      serves: mapping.serves,
      updatedAt: mapping.updatedAt,
    }));
  }
}
