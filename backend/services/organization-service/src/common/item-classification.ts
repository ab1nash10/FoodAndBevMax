import { BadRequestException, ConflictException } from '@nestjs/common';
import { ItemType, type Prisma } from '@prisma/client';

/**
 * An item's category and type are set on the Item Mapping screens, not on Items: mapping it to
 * a store makes it MRP, to a kitchen READYMADE, and the category is chosen there. Until its
 * first mapping an item has neither.
 */

const typeLabels: Record<ItemType, string> = {
  LIVE: 'a Live item',
  MRP: 'an MRP item (mapped to stores)',
  READYMADE: 'a Readymade item (mapped to kitchens)',
};
const mappedTo: Record<ItemType, string> = {
  LIVE: 'a restaurant',
  MRP: 'a store',
  READYMADE: 'a kitchen',
};

/**
 * An item's type for stock: stock only exists for classified items (a GRN brings MRP items in,
 * production makes READYMADE ones), so an unclassified item here is a broken invariant.
 */
export function stockItemType(item: { itemName?: string; itemType: ItemType | null }): ItemType {
  if (!item.itemType) {
    throw new BadRequestException(
      `${item.itemName ?? 'This item'} has no type yet: map it to a store or kitchen first.`,
    );
  }

  return item.itemType;
}

/**
 * Called when an item is mapped (to a store as MRP, to a kitchen as READYMADE): gives an
 * unclassified item that type, and sets its category - required the first time, optional
 * later to change it. Refuses an item already classified the other way.
 */
export async function classifyItem(
  tx: Prisma.TransactionClient,
  itemId: string,
  as: ItemType,
  categoryId: string | undefined,
  actorId: string | undefined,
): Promise<void> {
  const item = await tx.item.findFirst({
    select: {
      categoryId: true,
      id: true,
      isActive: true,
      itemName: true,
      itemType: true,
      normalizedName: true,
    },
    where: { deletedAt: null, id: itemId },
  });

  if (!item) {
    throw new BadRequestException('Item not found');
  }

  if (!item.isActive) {
    throw new BadRequestException('This item is inactive and cannot be used.');
  }

  if (item.itemType && item.itemType !== as) {
    throw new BadRequestException(
      `${item.itemName} is ${typeLabels[item.itemType]}, so it cannot be mapped to ${mappedTo[as]}.`,
    );
  }

  const nextCategoryId = categoryId ?? item.categoryId;

  if (!nextCategoryId) {
    throw new BadRequestException(
      `Choose a category for ${item.itemName}: this is its first mapping.`,
    );
  }

  if (nextCategoryId !== item.categoryId) {
    const category = await tx.itemCategory.findFirst({
      select: { isActive: true },
      where: { deletedAt: null, id: nextCategoryId },
    });

    if (!category) {
      throw new BadRequestException('Item category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException('This category is inactive and cannot be used.');
    }

    // An item name is used once per category.
    const twin = await tx.item.findFirst({
      select: { id: true },
      where: {
        categoryId: nextCategoryId,
        deletedAt: null,
        id: { not: item.id },
        normalizedName: item.normalizedName,
      },
    });

    if (twin) {
      throw new ConflictException(
        `Another item named ${item.itemName} is already in that category.`,
      );
    }
  }

  if (item.itemType !== as || nextCategoryId !== item.categoryId) {
    await tx.item.update({
      data: { categoryId: nextCategoryId, itemType: as, updatedBy: actorId },
      where: { id: item.id },
    });
  }
}

/**
 * After an item's mapping is removed: if it has no other mapping of that kind and has never
 * been received, produced or stocked, its type is cleared so it can be mapped the other way
 * (a mistaken mapping is fully undone). Its category stays.
 */
export async function releaseItemTypeIfUnused(
  tx: Prisma.TransactionClient,
  itemId: string,
  type: ItemType,
): Promise<void> {
  const [mappings, documents, ledgers] = await Promise.all([
    type === ItemType.MRP
      ? tx.storeItem.count({ where: { deletedAt: null, itemId } })
      : tx.kitchenItem.count({ where: { deletedAt: null, itemId } }),
    type === ItemType.MRP
      ? tx.grnLine.count({ where: { itemId } })
      : tx.kitchenProductionLine.count({ where: { itemId } }),
    tx.stockLedger.count({ where: { itemId } }),
  ]);

  if (mappings + documents + ledgers === 0) {
    await tx.item.updateMany({ data: { itemType: null }, where: { id: itemId, itemType: type } });
  }
}
