import { Injectable } from '@nestjs/common';
import { FoodType, Prisma, type Item } from '@prisma/client';
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
import { normalizeMasterName } from '../common/normalize-master-name';
import { PrismaService } from '../common/prisma/prisma.service';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateItemDto } from './dto/create-item.dto';
import { toItemResponse } from './items.service';

const labels = {
  hsnCode: 'HSN code',
  isActive: 'Status',
  itemName: 'Item name',
  preparationTimeMinutes: 'Prep time (min)',
  type: 'Food type',
};

const foodTypes = {
  egg: FoodType.EGGETARIAN,
  eggetarian: FoodType.EGGETARIAN,
  nonveg: FoodType.NON_VEG,
  nonvegetarian: FoodType.NON_VEG,
  veg: FoodType.VEG,
  vegetarian: FoodType.VEG,
};

type ItemFields = Pick<
  Prisma.ItemUncheckedCreateInput,
  'hsnCode' | 'isActive' | 'itemName' | 'normalizedName' | 'preparationTimeMinutes' | 'type'
>;

export interface ItemImportPlan {
  creates: ItemFields[];
  rows: ImportRowResult[];
  updates: Array<{ data: Partial<ItemFields>; existing: Item }>;
}

/**
 * What each row does. A row with an Item code updates that item; a row without one adds an
 * item, which gets the next code. Item name and Food type are required on every row; a blank
 * HSN code, prep time or status leaves an existing item's value as it is. Names stay unique
 * across the catalogue, ignoring case, spaces and punctuation, as the form checks.
 */
export async function planItemImport(
  rows: Array<Record<string, unknown>>,
  existing: Item[],
  context: ActorContext,
): Promise<ItemImportPlan> {
  const byCode = new Map(existing.map((item) => [item.itemCode, item]));
  const byName = new Map(existing.map((item) => [item.normalizedName, item]));
  const repeatedCode = repeatTracker('Item code');
  const repeatedName = repeatTracker('item name');
  const plan: ItemImportPlan = { creates: [], rows: [], updates: [] };

  for (const [index, row] of rows.entries()) {
    const cells = cellReader(row);
    const itemCode = cells.upper('itemCode');
    const match = itemCode ? byCode.get(itemCode) : undefined;

    cells.required('itemName', 'Item name');

    const type = cells.required('type', 'Food type')
      ? cells.choice('type', 'Food type', foodTypes, 'Veg, Non-veg or Egg')
      : undefined;
    const { dto, errors } = await validateRow(
      CreateItemDto,
      {
        hsnCode: cells.text('hsnCode'),
        isActive: cells.status('isActive'),
        itemName: cells.text('itemName'),
        preparationTimeMinutes: cells.text('preparationTimeMinutes'),
        type,
      },
      labels,
      cells.failed,
    );
    const normalizedName = dto.itemName ? normalizeMasterName(dto.itemName) : undefined;
    const sameName = normalizedName ? byName.get(normalizedName) : undefined;

    if (itemCode && !match) {
      errors.push(`No item has code ${itemCode}; leave Item code blank to add a new item`);
    }

    if (sameName && sameName.id !== match?.id) {
      errors.push(`An item with this name already exists (${sameName.itemCode})`);
    }

    const data: ItemFields = {
      hsnCode: dto.hsnCode,
      isActive: dto.isActive,
      itemName: dto.itemName,
      normalizedName: normalizedName ?? '',
      preparationTimeMinutes: dto.preparationTimeMinutes,
      type: dto.type,
    };
    const action = match ? (changes(match, data) ? 'update' : 'skip') : 'create';

    errors.unshift(...cells.errors);
    errors.push(
      ...[
        repeatedCode(itemCode, index),
        repeatedName(normalizedName, index),
        permissionError(action, context, { create: 'ITEM_CREATE', update: 'ITEM_UPDATE' }, 'items'),
      ].filter((message): message is string => message !== null),
    );
    plan.rows.push({ action, errors });

    if (errors.length > 0) {
      continue;
    }

    if (action === 'create') {
      plan.creates.push({ ...data, isActive: data.isActive ?? true });
    } else if (action === 'update' && match) {
      plan.updates.push({ data, existing: match });
    }
  }

  return plan;
}

@Injectable()
export class ItemsImportService {
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
      handlePrismaError(error, 'Item');
    }
  }

  /** The items the rows name, by code or by name, in one query. */
  private async plan(
    rows: Array<Record<string, unknown>>,
    client: Prisma.TransactionClient,
    context: ActorContext,
  ) {
    const existing = await client.item.findMany({
      where: {
        deletedAt: null,
        OR: [
          { itemCode: { in: rows.map((row) => cellText(row, 'itemCode').toUpperCase()) } },
          {
            normalizedName: {
              in: rows.map((row) => normalizeMasterName(cellText(row, 'itemName'))),
            },
          },
        ],
      },
    });

    return planItemImport(rows, existing, context);
  }

  private async write(plan: ItemImportPlan, tx: Prisma.TransactionClient, context: ActorContext) {
    const codes = await nextSequenceValues(tx, 'item_code_sequence', plan.creates.length);
    const created = await tx.item.createManyAndReturn({
      data: plan.creates.map((data, index) => ({
        ...data,
        createdBy: context.actorId,
        itemCode: `ITM${String(codes[index]).padStart(4, '0')}`,
        updatedBy: context.actorId,
      })),
    });
    const updated: Array<{ existing: Item; item: Item }> = [];

    // Each row changes different fields, so one update per changed item.
    for (const { data, existing } of plan.updates) {
      updated.push({
        existing,
        item: await tx.item.update({
          data: { ...data, updatedBy: context.actorId },
          where: { id: existing.id },
        }),
      });
    }

    await tx.auditLog.createMany({
      data: importAuditEntries(
        [
          ...created.map((item) => ({
            action: 'ITEM_CREATE',
            entityId: item.id,
            entityName: 'items',
            newValue: toItemResponse(item),
          })),
          ...updated.map(({ existing, item }) => ({
            action: existing.isActive === item.isActive ? 'ITEM_UPDATE' : 'ITEM_STATUS_CHANGE',
            entityId: item.id,
            entityName: 'items',
            newValue: toItemResponse(item),
            oldValue: toItemResponse(existing),
          })),
        ],
        context,
      ),
    });
  }
}
