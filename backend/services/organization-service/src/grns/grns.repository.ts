import { Injectable } from '@nestjs/common';
import { InventoryLocationType, Item, ItemType, Prisma, StockBalance } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type GrnClient = Prisma.TransactionClient | PrismaService;

/**
 * Stock coming into a store: the store-item mappings a GRN's items must have, and the store's
 * balance of a batch. ERP GRNs are the only way stock comes in (Deliveries were removed on
 * 2026-11-20); old delivery GRNs stay in the database as history.
 */
@Injectable()
export class GrnsRepository {
  async findActiveStoreMappings(
    storeId: string,
    itemIds: string[],
    client: GrnClient,
  ): Promise<Array<{ item: Item; itemId: string; storeId: string }>> {
    return client.storeItem.findMany({
      include: {
        item: true,
      },
      where: {
        deletedAt: null,
        isActive: true,
        itemId: {
          in: itemIds,
        },
        item: {
          deletedAt: null,
          isActive: true,
          itemType: ItemType.MRP,
        },
        storeId,
      },
    });
  }

  async findStockBalance(
    {
      batchNumber,
      expiryDate,
      hospitalId,
      itemId,
      locationId,
    }: {
      batchNumber: string;
      expiryDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
    },
    client: GrnClient,
  ): Promise<StockBalance | null> {
    return client.stockBalance.findFirst({
      where: {
        batchNumber,
        deletedAt: null,
        expiryDate,
        hospitalId,
        itemId,
        itemType: ItemType.MRP,
        locationId,
        locationType: InventoryLocationType.STORE,
      },
    });
  }

  async upsertStockBalance(
    {
      actorId,
      batchNumber,
      expiryDate,
      hospitalId,
      itemId,
      locationId,
      quantity,
    }: {
      actorId?: string;
      batchNumber: string;
      expiryDate: Date;
      hospitalId: string;
      itemId: string;
      locationId: string;
      quantity: number;
    },
    client: GrnClient,
  ): Promise<StockBalance> {
    const existing = await this.findStockBalance(
      {
        batchNumber,
        expiryDate,
        hospitalId,
        itemId,
        locationId,
      },
      client,
    );

    if (existing) {
      return client.stockBalance.update({
        data: {
          availableQty: {
            increment: quantity,
          },
          lastUpdatedOn: new Date(),
          updatedBy: actorId,
        },
        where: {
          id: existing.id,
        },
      });
    }

    return client.stockBalance.create({
      data: {
        availableQty: quantity,
        batchNumber,
        createdBy: actorId,
        expiryDate,
        hospitalId,
        itemId,
        itemType: ItemType.MRP,
        lastUpdatedOn: new Date(),
        locationId,
        locationType: InventoryLocationType.STORE,
        updatedBy: actorId,
      },
    });
  }
}
