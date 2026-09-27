import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RateType } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreateItemPriceDto } from './dto/create-item-price.dto';
import { ItemPriceSortField, ListItemPricesQueryDto } from './dto/list-item-prices-query.dto';
import { ResolveItemPriceQueryDto } from './dto/resolve-item-price-query.dto';
import { UpdateItemPriceDto } from './dto/update-item-price.dto';
import { ItemPricesRepository, ItemPriceWithRelations } from './item-prices.repository';

type ItemPriceClient = Prisma.TransactionClient;
type PriceSource = 'LOCATION' | 'MISSING' | 'RESTAURANT';

const overlappingPriceMessage =
  'An active price already exists for this item, rate type, and date range.';

function toDateOnly(value: string | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);

  date.setHours(0, 0, 0, 0);

  return date;
}

function toNumber(value: Prisma.Decimal | number): number {
  return Number(value);
}

function toItemPriceResponse(itemPrice: ItemPriceWithRelations) {
  return {
    createdAt: itemPrice.createdAt,
    deletedAt: itemPrice.deletedAt,
    effectiveFrom: itemPrice.effectiveFrom,
    effectiveTo: itemPrice.effectiveTo,
    gstPercent: itemPrice.gstPercent === null ? null : toNumber(itemPrice.gstPercent),
    hospital: itemPrice.hospital,
    hospitalId: itemPrice.hospitalId,
    id: itemPrice.id,
    isActive: itemPrice.isActive,
    isTaxInclusive: itemPrice.isTaxInclusive,
    item: itemPrice.item,
    itemId: itemPrice.itemId,
    price: toNumber(itemPrice.price),
    rateType: itemPrice.rateType,
    restaurant: itemPrice.restaurant,
    restaurantId: itemPrice.restaurantId,
    updatedAt: itemPrice.updatedAt,
  };
}

function getItemPriceOrderBy(
  query: ListItemPricesQueryDto,
): Prisma.ItemPriceOrderByWithRelationInput {
  const sortBy: ItemPriceSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

function validateDateRange(effectiveFrom: Date, effectiveTo: Date | null): void {
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new BadRequestException('Effective To must be greater than Effective From');
  }
}

function validateGstPercent(gstPercent: number | undefined, isTaxInclusive: boolean): void {
  const validGstPercentages = [0, 5, 12, 18];

  if (isTaxInclusive && gstPercent === undefined) {
    throw new BadRequestException('GST Percentage is required when Tax Inclusive is enabled.');
  }

  if (gstPercent !== undefined && !validGstPercentages.includes(gstPercent)) {
    throw new BadRequestException('GST Percentage must be one of 0, 5, 12, or 18.');
  }
}

function effectiveDateWhere(date: Date): Prisma.ItemPriceWhereInput {
  return {
    effectiveFrom: {
      lte: date,
    },
    OR: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          gte: date,
        },
      },
    ],
  };
}

@Injectable()
export class ItemPricesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly itemPrices: ItemPricesRepository,
  ) {}

  async list(query: ListItemPricesQueryDto) {
    const { limit, page } = getPagination(query);
    const effectiveDate = query.effectiveDate ? toDateOnly(query.effectiveDate) : undefined;
    const where: Prisma.ItemPriceWhereInput = {
      deletedAt: null,
      ...(effectiveDate ? effectiveDateWhere(effectiveDate) : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.itemType ? { item: { itemType: query.itemType } } : {}),
      ...(query.rateType ? { rateType: query.rateType } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.search
        ? {
            OR: [
              { hospital: { hospitalCode: { contains: query.search, mode: 'insensitive' } } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemCode: { contains: query.search, mode: 'insensitive' } } },
              { item: { itemName: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantCode: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.itemPrices.findMany({
        orderBy: getItemPriceOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.itemPrices.count({ where }),
    ]);

    return {
      items: items.map(toItemPriceResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toItemPriceResponse(await this.findActiveItemPrice(id));
  }

  async create(dto: CreateItemPriceDto, context: ActorContext) {
    try {
      return await this.itemPrices.transaction(async (tx) => {
        const effectiveFrom = toDateOnly(dto.effectiveFrom);
        const effectiveTo = dto.effectiveTo ? toDateOnly(dto.effectiveTo) : null;
        const restaurantId = dto.restaurantId ?? null;
        const isTaxInclusive = dto.isTaxInclusive ?? true;

        validateDateRange(effectiveFrom, effectiveTo);
        validateGstPercent(dto.gstPercent, isTaxInclusive);
        await this.assertValidHospital(dto.hospitalId, tx);
        await this.assertValidItem(dto.itemId, tx);

        if (restaurantId) {
          await this.assertValidRestaurant(restaurantId, dto.hospitalId, tx);
        }

        if (dto.isActive !== false) {
          await this.assertNoActiveOverlap(
            {
              effectiveFrom,
              effectiveTo,
              hospitalId: dto.hospitalId,
              itemId: dto.itemId,
              rateType: dto.rateType,
              restaurantId,
            },
            tx,
          );
        }

        const itemPrice = await this.itemPrices.create(
          {
            createdBy: context.actorId,
            effectiveFrom,
            effectiveTo,
            gstPercent: dto.gstPercent === undefined ? null : new Prisma.Decimal(dto.gstPercent),
            hospitalId: dto.hospitalId,
            isActive: dto.isActive ?? true,
            isTaxInclusive,
            itemId: dto.itemId,
            price: new Prisma.Decimal(dto.price),
            rateType: dto.rateType,
            restaurantId,
            updatedBy: context.actorId,
          },
          tx,
        );
        const newValue = toItemPriceResponse(itemPrice);

        await this.auditLog.record(
          {
            action: 'ITEM_PRICE_CREATE',
            actorId: context.actorId,
            entityId: itemPrice.id,
            entityName: 'item_prices',
            hospitalId: itemPrice.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'Item price');
    }
  }

  async update(id: string, dto: UpdateItemPriceDto, context: ActorContext) {
    try {
      return await this.itemPrices.transaction(async (tx) => {
        const existing = await this.findActiveItemPrice(id, tx);
        const nextHospitalId = dto.hospitalId ?? existing.hospitalId;
        const nextRestaurantId =
          dto.restaurantId !== undefined ? (dto.restaurantId ?? null) : existing.restaurantId;
        const nextItemId = dto.itemId ?? existing.itemId;
        const nextRateType = dto.rateType ?? existing.rateType;
        const nextEffectiveFrom =
          dto.effectiveFrom !== undefined
            ? toDateOnly(dto.effectiveFrom)
            : toDateOnly(existing.effectiveFrom);
        const nextEffectiveTo =
          dto.effectiveTo !== undefined
            ? dto.effectiveTo
              ? toDateOnly(dto.effectiveTo)
              : null
            : existing.effectiveTo
              ? toDateOnly(existing.effectiveTo)
              : null;
        const nextIsActive = dto.isActive ?? existing.isActive;
        const nextIsTaxInclusive = dto.isTaxInclusive ?? existing.isTaxInclusive;
        const nextGstPercent =
          dto.gstPercent !== undefined
            ? dto.gstPercent
            : existing.gstPercent === null
              ? undefined
              : toNumber(existing.gstPercent);
        const shouldValidateGst =
          dto.effectiveFrom !== undefined ||
          dto.effectiveTo !== undefined ||
          dto.gstPercent !== undefined ||
          dto.hospitalId !== undefined ||
          dto.isTaxInclusive !== undefined ||
          dto.itemId !== undefined ||
          dto.price !== undefined ||
          dto.rateType !== undefined ||
          dto.restaurantId !== undefined;
        const data: Prisma.ItemPriceUncheckedUpdateInput = {};

        validateDateRange(nextEffectiveFrom, nextEffectiveTo);
        if (shouldValidateGst) {
          validateGstPercent(nextGstPercent, nextIsTaxInclusive);
        }
        await this.assertValidHospital(nextHospitalId, tx);
        await this.assertValidItem(nextItemId, tx);

        if (nextRestaurantId) {
          await this.assertValidRestaurant(nextRestaurantId, nextHospitalId, tx);
        }

        if (nextIsActive) {
          await this.assertNoActiveOverlap(
            {
              effectiveFrom: nextEffectiveFrom,
              effectiveTo: nextEffectiveTo,
              excludeId: id,
              hospitalId: nextHospitalId,
              itemId: nextItemId,
              rateType: nextRateType,
              restaurantId: nextRestaurantId,
            },
            tx,
          );
        }

        if (dto.effectiveFrom !== undefined) {
          data.effectiveFrom = nextEffectiveFrom;
        }

        if (dto.effectiveTo !== undefined) {
          data.effectiveTo = nextEffectiveTo;
        }

        if (dto.hospitalId !== undefined) {
          data.hospitalId = nextHospitalId;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.isTaxInclusive !== undefined) {
          data.isTaxInclusive = dto.isTaxInclusive;
        }

        if (dto.gstPercent !== undefined) {
          data.gstPercent = new Prisma.Decimal(dto.gstPercent);
        }

        if (dto.itemId !== undefined) {
          data.itemId = nextItemId;
        }

        if (dto.price !== undefined) {
          data.price = new Prisma.Decimal(dto.price);
        }

        if (dto.rateType !== undefined) {
          data.rateType = dto.rateType;
        }

        if (dto.restaurantId !== undefined) {
          data.restaurantId = nextRestaurantId;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const itemPrice = Object.keys(data).length
          ? await this.itemPrices.update(id, data, tx)
          : existing;
        const newValue = toItemPriceResponse(itemPrice);

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'ITEM_PRICE_STATUS_CHANGE'
                : 'ITEM_PRICE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'item_prices',
            hospitalId: itemPrice.hospitalId,
            ipAddress: context.ipAddress,
            newValue,
            oldValue: toItemPriceResponse(existing),
          },
          tx,
        );

        return newValue;
      });
    } catch (error) {
      this.handlePrismaError(error, 'Item price');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveItemPrice(id);

    await this.itemPrices.transaction(async (tx) => {
      await this.itemPrices.update(
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
          action: 'ITEM_PRICE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'item_prices',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toItemPriceResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  async resolve(query: ResolveItemPriceQueryDto) {
    const date = query.date ? toDateOnly(query.date) : toDateOnly(new Date());

    await this.assertValidHospital(query.hospitalId);
    await this.assertValidItem(query.itemId);

    if (query.restaurantId) {
      await this.assertValidRestaurant(query.restaurantId, query.hospitalId);
    }

    const restaurantSpecific = query.restaurantId
      ? await this.itemPrices.findResolvedPrice({
          date,
          hospitalId: query.hospitalId,
          itemId: query.itemId,
          rateType: query.rateType,
          restaurantId: query.restaurantId,
        })
      : null;

    if (restaurantSpecific) {
      return this.toResolvedPrice(restaurantSpecific, 'RESTAURANT');
    }

    const locationLevel = await this.itemPrices.findResolvedPrice({
      date,
      hospitalId: query.hospitalId,
      itemId: query.itemId,
      rateType: query.rateType,
      restaurantId: null,
    });

    if (locationLevel) {
      return this.toResolvedPrice(locationLevel, 'LOCATION');
    }

    return {
      itemPrice: null,
      price: null,
      source: 'MISSING' as PriceSource,
      status: 'PRICE_MISSING',
    };
  }

  private async assertNoActiveOverlap(
    input: {
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludeId?: string;
      hospitalId: string;
      itemId: string;
      rateType: RateType;
      restaurantId: string | null;
    },
    client: ItemPriceClient,
  ): Promise<void> {
    const overlappingPrice = await this.itemPrices.findOverlappingActivePrice(input, client);

    if (overlappingPrice) {
      throw new ConflictException(overlappingPriceMessage);
    }
  }

  private async assertValidHospital(id: string, client?: ItemPriceClient): Promise<void> {
    const hospital = await this.itemPrices.findActiveHospital(id, client);

    if (!hospital) {
      throw new BadRequestException('Location not found');
    }

    if (!hospital.isActive) {
      throw new BadRequestException('This location is inactive.');
    }
  }

  private async assertValidItem(id: string, client?: ItemPriceClient): Promise<void> {
    const item = await this.itemPrices.findActiveItem(id, client);

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    if (!item.isActive) {
      throw new BadRequestException('This item is inactive and cannot be priced.');
    }
  }

  private async assertValidRestaurant(
    id: string,
    hospitalId: string,
    client?: ItemPriceClient,
  ): Promise<void> {
    const restaurant = await this.itemPrices.findActiveRestaurant(id, hospitalId, client);

    if (!restaurant) {
      throw new BadRequestException('Restaurant not found for selected location');
    }

    if (!restaurant.isActive) {
      throw new BadRequestException('This restaurant is inactive.');
    }
  }

  private async findActiveItemPrice(
    id: string,
    client?: ItemPriceClient,
  ): Promise<ItemPriceWithRelations> {
    const itemPrice = await this.itemPrices.findActiveById(id, client);

    if (!itemPrice) {
      throw new NotFoundException('Item price not found');
    }

    return itemPrice;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(`${entityName} already exists`);
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('Referenced record not found');
      }
    }

    throw error;
  }

  private toResolvedPrice(itemPrice: ItemPriceWithRelations, source: PriceSource) {
    return {
      itemPrice: toItemPriceResponse(itemPrice),
      price: toNumber(itemPrice.price),
      source,
      status: 'FOUND',
    };
  }
}
