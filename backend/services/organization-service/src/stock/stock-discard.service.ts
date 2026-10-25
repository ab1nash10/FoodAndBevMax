import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockTransactionType } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { toDateOnly, toNumber } from '../common/values';
import { siteBusinessDate } from '../pos/pos-pricing';
import type { DiscardStockDto } from './dto/discard-stock.dto';
import { discardProblem, discardRemarks } from './stock-discard';

/**
 * Throws stock away from one batch where it is held (store, kitchen, restaurant or counter):
 * the balance goes down and a DISCARD_OUT ledger line records how much and why. Reads are scoped
 * to the user's locations (hospitalScopeExtension), so another location's batch is not found.
 */
@Injectable()
export class StockDiscardService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async discard(dto: DiscardStockDto, context: ActorContext) {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.stockBalance.findFirst({
        where: { deletedAt: null, id: dto.stockBalanceId },
      });

      if (!balance) {
        throw new NotFoundException('Stock batch not found');
      }

      const available = toNumber(balance.availableQty);
      const problem = discardProblem(available, dto.quantity);

      if (problem) {
        throw new BadRequestException(problem);
      }

      // Only if the stock is still there: a sale or transfer taking it meanwhile wins.
      const result = await tx.stockBalance.updateMany({
        data: {
          availableQty: { decrement: dto.quantity },
          lastUpdatedOn: now,
          updatedBy: context.actorId,
        },
        where: { availableQty: { gte: dto.quantity }, deletedAt: null, id: balance.id },
      });

      if (result.count !== 1) {
        throw new ConflictException(
          'This batch has just changed (stock was used or moved). Check it and try again.',
        );
      }

      const after = Math.round((available - dto.quantity) * 1000) / 1000;
      const remarks = discardRemarks(dto.reason, dto.note);
      const ledger = await tx.stockLedger.create({
        data: {
          balanceAfter: after,
          batchNumber: balance.batchNumber,
          businessDate: toDateOnly(siteBusinessDate(now)),
          createdBy: context.actorId,
          expiryDate: balance.expiryDate,
          hospitalId: balance.hospitalId,
          itemId: balance.itemId,
          itemType: balance.itemType,
          locationId: balance.locationId,
          locationType: balance.locationType,
          qtyIn: 0,
          qtyOut: dto.quantity,
          remarks,
          transactionDateTime: now,
          transactionType: StockTransactionType.DISCARD_OUT,
          updatedBy: context.actorId,
        },
      });

      await this.auditLog.record(
        {
          action: 'STOCK_DISCARD',
          actorId: context.actorId,
          entityId: balance.id,
          entityName: 'stock_balances',
          ipAddress: context.ipAddress,
          newValue: { availableQty: after, ledgerId: ledger.id, quantity: dto.quantity, remarks },
          oldValue: { availableQty: available },
        },
        tx,
      );

      return { availableQty: after, ledgerId: ledger.id, stockBalanceId: balance.id };
    });
  }
}
