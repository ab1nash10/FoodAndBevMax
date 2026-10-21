import { Injectable } from '@nestjs/common';
import { MenuServeAt, Prisma, type RestaurantMenu } from '@prisma/client';
import {
  cellReader,
  cellText,
  changes,
  importAuditEntries,
  importResult,
  importTransactionOptions,
  nextSequenceValues,
  permissionError,
  repeatTracker,
  validateRow,
  type ImportRowResult,
  type ImportRowsDto,
} from '../common/import';
import { formatMasterCode } from '../common/master-code-generator';
import { normalizeMasterName } from '../common/normalize-master-name';
import { PrismaService } from '../common/prisma/prisma.service';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { toNumber } from '../common/values';
import { CreateRestaurantMenuDto } from './dto/create-restaurant-menu.dto';
import type { MenuSource } from './restaurant-menus.repository';
import { assertPricesFor } from './restaurant-menus.service';

const labels = {
  gstPercent: 'GST %',
  isActive: 'Status',
  isAvailable: 'Available',
  isDiscountable: 'Discountable',
  isGstInclusive: 'GST inclusive',
  price: 'Price',
  roomPrice: 'In-room price',
  serveAt: 'Serve at',
};

// Found from the row's codes, so the DTO's own "must be a UUID" never applies.
const lookedUp = ['categoryId', 'itemId', 'kitchenId', 'restaurantId', 'storeId'];

const serveAtChoices = {
  both: MenuServeAt.BOTH,
  counter: MenuServeAt.COUNTER,
  counteronly: MenuServeAt.COUNTER,
  room: MenuServeAt.ROOM,
  roomonly: MenuServeAt.ROOM,
};

type MenuFields = Pick<
  Prisma.RestaurantMenuUncheckedCreateInput,
  | 'categoryId'
  | 'gstPercent'
  | 'hospitalId'
  | 'isActive'
  | 'isAvailable'
  | 'isDiscountable'
  | 'isGstInclusive'
  | 'itemId'
  | 'kitchenId'
  | 'price'
  | 'restaurantId'
  | 'roomPrice'
  | 'serveAt'
  | 'storeId'
>;

export interface MenuImportLookups {
  categories: Array<{
    categoryName: string;
    id: string;
    isActive: boolean;
    normalizedName: string;
  }>;
  items: Array<{ id: string; isActive: boolean; itemCode: string; itemName: string }>;
  kitchens: Array<{ hospitalId: string; id: string; kitchenCode: string }>;
  /** Live menu entries for the rows' restaurants and items. */
  menus: RestaurantMenu[];
  restaurants: Array<{
    hospital: { hospitalCode: string; isActive: boolean };
    hospitalId: string;
    id: string;
    isActive: boolean;
    restaurantCode: string;
    restaurantName: string;
  }>;
  /** Active store and kitchen mappings under an active category: what a menu item can sell. */
  sources: MenuSource[];
  stores: Array<{ hospitalId: string; id: string; storeCode: string }>;
}

export interface MenuImportPlan {
  creates: MenuFields[];
  rows: ImportRowResult[];
  updates: Array<{ data: Partial<MenuFields>; existing: RestaurantMenu }>;
}

const sameSource = (a: Omit<MenuSource, 'hospitalId'>, b: Omit<MenuSource, 'hospitalId'>) =>
  a.categoryId === b.categoryId &&
  a.itemId === b.itemId &&
  (a.kitchenId ?? null) === (b.kitchenId ?? null) &&
  (a.storeId ?? null) === (b.storeId ?? null);

/**
 * What each row does. A row names a restaurant (by code, plus Location code when two locations
 * use that code) and an item; it updates the restaurant's menu entry for the item under its
 * Category, or with no Category, the restaurant's only entry for the item. Otherwise it adds the
 * item to the menu.
 *
 * What a menu item sells comes from Item Mapping: the item, under a category, from a kitchen or a
 * store at the restaurant's location. A row names them by Category, Kitchen code or Store code;
 * a new entry takes whatever is blank from the item's one mapping there, and an update keeps
 * what it has. Blank prices, GST and Yes/No cells keep an entry's values (a new one gets the
 * form's defaults); a price for a place it isn't served at is cleared, as the form does.
 */
export async function planMenuImport(
  rows: Array<Record<string, unknown>>,
  lookups: MenuImportLookups,
  context: ActorContext,
): Promise<MenuImportPlan> {
  const itemByCode = new Map(lookups.items.map((item) => [item.itemCode.toUpperCase(), item]));
  const categoryByName = new Map(
    lookups.categories.map((category) => [category.normalizedName, category]),
  );
  const repeatedEntry = repeatTracker('restaurant, item and category');
  const plan: MenuImportPlan = { creates: [], rows: [], updates: [] };

  for (const [index, row] of rows.entries()) {
    const cells = cellReader(row);
    const restaurantCode = cells.required('restaurantCode', 'Restaurant code')?.toUpperCase();
    const locationCode = cells.upper('locationCode');
    const itemCode = cells.required('itemCode', 'Item code')?.toUpperCase();
    const categoryName = cells.text('category');
    const kitchenCode = cells.upper('kitchenCode');
    const storeCode = cells.upper('storeCode');
    const restaurants = lookups.restaurants.filter(
      (option) =>
        option.restaurantCode.toUpperCase() === restaurantCode &&
        (!locationCode || option.hospital.hospitalCode.toUpperCase() === locationCode),
    );
    const restaurant = restaurants.length === 1 ? restaurants[0] : undefined;
    const item = itemCode ? itemByCode.get(itemCode) : undefined;
    const category = categoryName
      ? categoryByName.get(normalizeMasterName(categoryName))
      : undefined;
    const kitchen =
      kitchenCode && restaurant
        ? lookups.kitchens.find(
            (option) =>
              option.hospitalId === restaurant.hospitalId &&
              option.kitchenCode.toUpperCase() === kitchenCode,
          )
        : undefined;
    const store =
      storeCode && restaurant
        ? lookups.stores.find(
            (option) =>
              option.hospitalId === restaurant.hospitalId &&
              option.storeCode.toUpperCase() === storeCode,
          )
        : undefined;
    const at = restaurant ? `${restaurant.restaurantName}'s location` : '';

    if (restaurantCode && restaurants.length === 0) {
      cells.fail(
        'restaurantId',
        `No restaurant you can reach has code ${restaurantCode}${locationCode ? ` at location ${locationCode}` : ''}`,
      );
    } else if (restaurants.length > 1) {
      cells.fail(
        'restaurantId',
        `Restaurant code ${restaurantCode} is used at more than one location; fill in Location code`,
      );
    } else if (restaurant && !(restaurant.isActive && restaurant.hospital.isActive)) {
      cells.fail('restaurantId', `${restaurant.restaurantName} is inactive`);
    }

    if (itemCode && !item) {
      cells.fail('itemId', `No item has code ${itemCode}`);
    }

    if (categoryName && !category) {
      cells.fail('categoryId', `No category is named ${categoryName}`);
    } else if (category && !category.isActive) {
      cells.fail('categoryId', `Category ${category.categoryName} is inactive`);
    }

    if (kitchenCode && storeCode) {
      cells.fail('kitchenId', 'Fill in Kitchen code or Store code, not both');
    } else if (kitchenCode && restaurant && !kitchen) {
      cells.fail('kitchenId', `No kitchen at ${at} has code ${kitchenCode}`);
    } else if (storeCode && restaurant && !store) {
      cells.fail('storeId', `No store at ${at} has code ${storeCode}`);
    }

    const entries =
      restaurant && item
        ? lookups.menus.filter(
            (menu) => menu.restaurantId === restaurant.id && menu.itemId === item.id,
          )
        : [];
    const match = category
      ? entries.find((menu) => menu.categoryId === category.id)
      : entries.length === 1
        ? entries[0]
        : undefined;

    if (!category && entries.length > 1) {
      cells.fail(
        'categoryId',
        'This item is on the menu under more than one category; fill in Category',
      );
    }

    if (match === undefined && item && !item.isActive) {
      cells.fail('itemId', `${item.itemName} is inactive`);
    }

    const serveAt =
      cells.choice('serveAt', 'Serve at', serveAtChoices, 'Both, Room only or Counter only') ??
      match?.serveAt ??
      MenuServeAt.BOTH;
    const { dto, errors } = await validateRow(
      CreateRestaurantMenuDto,
      {
        gstPercent: cells.text('gstPercent'),
        isActive: cells.status('isActive'),
        isAvailable: cells.yesNo('isAvailable', 'Available'),
        isDiscountable: cells.yesNo('isDiscountable', 'Discountable'),
        isGstInclusive: cells.yesNo('isGstInclusive', 'GST inclusive'),
        price: cells.text('price'),
        roomPrice: cells.text('roomPrice'),
        serveAt,
      },
      labels,
      new Set([...cells.failed, ...lookedUp]),
    );
    const ready = restaurant && item && cells.errors.length === 0;
    const fits = ready
      ? lookups.sources.filter(
          (source) =>
            source.hospitalId === restaurant.hospitalId &&
            source.itemId === item.id &&
            (!category || source.categoryId === category.id) &&
            (!kitchen || source.kitchenId === kitchen.id) &&
            (!store || source.storeId === store.id),
        )
      : [];
    const only = fits.length === 1 ? fits[0] : undefined;
    const sourceGiven = Boolean(kitchen || store);
    // An update keeps what the row leaves blank; a new entry takes it from its one mapping.
    const source = {
      categoryId: category?.id ?? (match ? match.categoryId : only?.categoryId),
      itemId: item?.id ?? '',
      kitchenId: sourceGiven ? (kitchen?.id ?? null) : match ? match.kitchenId : only?.kitchenId,
      storeId: sourceGiven ? (store?.id ?? null) : match ? match.storeId : only?.storeId,
    };
    const sourceChanged = !match || !sameSource(source as MenuSource, match);

    if (ready && sourceChanged) {
      if (fits.length === 0) {
        errors.push(
          `${item.itemName} isn't mapped to a store or kitchen at ${at}${category || sourceGiven ? ' like this' : ''}. Map it in Item Mapping first.`,
        );
      } else if (!fits.some((fit) => sameSource(fit, source as MenuSource))) {
        errors.push(
          `${item.itemName} is mapped more than one way here; fill in Category and Kitchen code or Store code`,
        );
      }
    }

    // A price for a place it isn't served at is cleared; a blank one keeps the entry's own.
    const current = (value: Prisma.Decimal | null | undefined) =>
      value === null || value === undefined ? null : toNumber(value);
    const price = serveAt === MenuServeAt.ROOM ? null : (dto.price ?? current(match?.price));
    const roomPrice =
      serveAt === MenuServeAt.COUNTER ? null : (dto.roomPrice ?? current(match?.roomPrice));

    // Only once the entry is known: an update may keep the prices it has.
    if (restaurant && item && !cells.failed.has('serveAt')) {
      try {
        assertPricesFor({ price, roomPrice, serveAt });
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    const data: MenuFields = {
      categoryId: source.categoryId,
      gstPercent: dto.gstPercent,
      hospitalId: restaurant?.hospitalId ?? '',
      isActive: dto.isActive,
      isAvailable: dto.isAvailable,
      isDiscountable: dto.isDiscountable,
      isGstInclusive: dto.isGstInclusive,
      itemId: source.itemId,
      kitchenId: source.kitchenId,
      price,
      restaurantId: restaurant?.id ?? '',
      roomPrice,
      serveAt,
      storeId: source.storeId,
    };
    const action = match ? (changes(match, data) ? 'update' : 'skip') : 'create';

    errors.unshift(...cells.errors);
    errors.push(
      ...[
        restaurant && item
          ? repeatedEntry(`${restaurant.id}:${item.id}:${source.categoryId ?? ''}`, index)
          : null,
        permissionError(
          action,
          context,
          { create: 'RESTAURANT_MENU_CREATE', update: 'RESTAURANT_MENU_UPDATE' },
          'menu items',
        ),
      ].filter((message): message is string => message !== null),
    );
    plan.rows.push({ action, errors });

    if (errors.length > 0) {
      continue;
    }

    if (action === 'create') {
      plan.creates.push({
        ...data,
        isActive: data.isActive ?? true,
        isAvailable: data.isAvailable ?? true,
        isDiscountable: data.isDiscountable ?? false,
        isGstInclusive: data.isGstInclusive ?? false,
      });
    } else if (action === 'update' && match) {
      plan.updates.push({ data, existing: match });
    }
  }

  return plan;
}

@Injectable()
export class RestaurantMenusImportService {
  constructor(private readonly prisma: PrismaService) {}

  async import({ dryRun, rows }: ImportRowsDto, context: ActorContext) {
    if (dryRun) {
      return importResult((await this.plan(rows, this.prisma, context)).rows, false);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await this.plan(rows, tx, context);

        // All or nothing: one bad row and nothing is saved.
        if (plan.rows.some((row) => row.errors.length > 0)) {
          return importResult(plan.rows, false);
        }

        await this.write(plan, tx, context);

        return importResult(plan.rows, true);
      }, importTransactionOptions);
    } catch (error) {
      handlePrismaError(error, 'Restaurant menu mapping');
    }
  }

  /** Everything the rows refer to, a query per kind; reads are narrowed to the caller's locations. */
  private async plan(
    rows: Array<Record<string, unknown>>,
    client: Prisma.TransactionClient,
    context: ActorContext,
  ) {
    const cells = (field: string, normalize = (value: string) => value.toUpperCase()) =>
      rows.map((row) => normalize(cellText(row, field))).filter(Boolean);
    const [restaurants, items, categories] = await Promise.all([
      client.restaurant.findMany({
        select: {
          hospital: { select: { hospitalCode: true, isActive: true } },
          hospitalId: true,
          id: true,
          isActive: true,
          restaurantCode: true,
          restaurantName: true,
        },
        where: {
          deletedAt: null,
          hospital: { deletedAt: null },
          restaurantCode: { in: cells('restaurantCode') },
        },
      }),
      client.item.findMany({
        select: { id: true, isActive: true, itemCode: true, itemName: true },
        where: { deletedAt: null, itemCode: { in: cells('itemCode') } },
      }),
      client.itemCategory.findMany({
        select: { categoryName: true, id: true, isActive: true, normalizedName: true },
        where: { deletedAt: null, normalizedName: { in: cells('category', normalizeMasterName) } },
      }),
    ]);
    const hospitalId = { in: [...new Set(restaurants.map((restaurant) => restaurant.hospitalId))] };
    const itemId = { in: items.map((item) => item.id) };
    const mapped = {
      category: { deletedAt: null, isActive: true },
      deletedAt: null,
      isActive: true,
      itemId,
    };
    const live = { deletedAt: null, hospitalId, isActive: true };
    const [kitchens, stores, kitchenItems, storeItems, menus] = await Promise.all([
      client.kitchen.findMany({
        select: { hospitalId: true, id: true, kitchenCode: true },
        where: { ...live, kitchenCode: { in: cells('kitchenCode') } },
      }),
      client.store.findMany({
        select: { hospitalId: true, id: true, storeCode: true },
        where: { ...live, storeCode: { in: cells('storeCode') } },
      }),
      client.kitchenItem.findMany({
        select: {
          categoryId: true,
          itemId: true,
          kitchen: { select: { hospitalId: true } },
          kitchenId: true,
        },
        where: { ...mapped, kitchen: live },
      }),
      client.storeItem.findMany({
        select: {
          categoryId: true,
          itemId: true,
          store: { select: { hospitalId: true } },
          storeId: true,
        },
        where: { ...mapped, store: live },
      }),
      client.restaurantMenu.findMany({
        where: {
          deletedAt: null,
          itemId,
          restaurantId: { in: restaurants.map((restaurant) => restaurant.id) },
        },
      }),
    ]);

    return planMenuImport(
      rows,
      {
        categories,
        items,
        kitchens,
        menus,
        restaurants,
        sources: [
          ...kitchenItems.map((mapping) => ({
            categoryId: mapping.categoryId,
            hospitalId: mapping.kitchen.hospitalId,
            itemId: mapping.itemId,
            kitchenId: mapping.kitchenId,
            storeId: null,
          })),
          ...storeItems.map((mapping) => ({
            categoryId: mapping.categoryId,
            hospitalId: mapping.store.hospitalId,
            itemId: mapping.itemId,
            kitchenId: null,
            storeId: mapping.storeId,
          })),
        ],
        stores,
      },
      context,
    );
  }

  private async write(plan: MenuImportPlan, tx: Prisma.TransactionClient, context: ActorContext) {
    const codes = await nextSequenceValues(
      tx,
      'restaurant_menu_code_sequence',
      plan.creates.length,
    );
    // New entries go to the end of their restaurant's menu, in file order.
    const lastPlace = new Map(
      (
        await tx.restaurantMenu.groupBy({
          _max: { displayOrder: true },
          by: ['restaurantId'],
          where: {
            deletedAt: null,
            restaurantId: { in: plan.creates.map((data) => data.restaurantId) },
          },
        })
      ).map((group) => [group.restaurantId, group._max.displayOrder ?? 0]),
    );
    const created = await tx.restaurantMenu.createManyAndReturn({
      data: plan.creates.map((data, index) => {
        const displayOrder = (lastPlace.get(data.restaurantId) ?? 0) + 1;

        lastPlace.set(data.restaurantId, displayOrder);

        return {
          ...data,
          createdBy: context.actorId,
          displayOrder,
          menuItemCode: formatMasterCode('RMI', codes[index]!),
          updatedBy: context.actorId,
        };
      }),
    });
    const updated: Array<{ existing: RestaurantMenu; menu: RestaurantMenu }> = [];

    // Each row changes different fields, so one update per changed entry.
    for (const { data, existing } of plan.updates) {
      updated.push({
        existing,
        menu: await tx.restaurantMenu.update({
          data: { ...data, updatedBy: context.actorId },
          where: { id: existing.id },
        }),
      });
    }

    await tx.auditLog.createMany({
      data: importAuditEntries(
        [
          ...created.map((menu) => ({
            action: 'RESTAURANT_MENU_CREATE',
            entityId: menu.id,
            entityName: 'restaurant_menus',
            hospitalId: menu.hospitalId,
            newValue: menu,
          })),
          ...updated.map(({ existing, menu }) => ({
            action:
              existing.isActive !== menu.isActive
                ? 'RESTAURANT_MENU_STATUS_CHANGE'
                : existing.isAvailable !== menu.isAvailable
                  ? 'RESTAURANT_MENU_AVAILABILITY_CHANGE'
                  : 'RESTAURANT_MENU_UPDATE',
            entityId: menu.id,
            entityName: 'restaurant_menus',
            hospitalId: menu.hospitalId,
            newValue: menu,
            oldValue: existing,
          })),
        ],
        context,
      ),
    });
  }
}
