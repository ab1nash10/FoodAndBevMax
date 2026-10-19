import { BadRequestException } from '@nestjs/common';
import { ItemType, type Prisma } from '@prisma/client';

/**
 * An item's type comes from where it is mapped: to a store it becomes MRP, to a kitchen
 * READYMADE; until its first mapping it has none. Categories are not the item's: each store
 * mapping, kitchen mapping and restaurant menu item has its own (assertUsableCategory).
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
 * unclassified item that type, and refuses an item already classified the other way.
 */
export async function classifyItem(
  tx: Prisma.TransactionClient,
  itemId: string,
  as: ItemType,
  actorId: string | undefined,
): Promise<void> {
  const item = await tx.item.findFirst({
    select: { id: true, isActive: true, itemName: true, itemType: true },
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

  if (item.itemType !== as) {
    await tx.item.update({ data: { itemType: as, updatedBy: actorId }, where: { id: item.id } });
  }
}

/** A category a mapping or menu item may use: it exists and is active. */
export async function assertUsableCategory(
  tx: Prisma.TransactionClient,
  categoryId: string,
): Promise<void> {
  const category = await tx.itemCategory.findFirst({
    select: { isActive: true },
    where: { deletedAt: null, id: categoryId },
  });

  if (!category) {
    throw new BadRequestException('Item category not found');
  }

  if (!category.isActive) {
    throw new BadRequestException('This category is inactive and cannot be used.');
  }
}

/**
 * After an item's mapping is removed: if it has no other mapping of that kind and has never
 * been received, produced or stocked, its type is cleared so it can be mapped the other way
 * (a mistaken mapping is fully undone).
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
