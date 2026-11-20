import { randomUUID } from 'node:crypto';
import { logger } from '@aahar/logging';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  GrnEntryStatus,
  InventoryLocationType,
  ItemType,
  Prisma,
  StockReferenceType,
  StockTransactionType,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { Mailer } from '../common/mailer';
import { getPageMeta, getPagination } from '../common/pagination';
import { holdsPermission, worksAt } from '../common/permission-holders';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { StoreArrivals, type StoreArrival } from '../common/store-arrivals';
import { toDateOnly, toNumber } from '../common/values';
import { GrnsRepository } from '../grns/grns.repository';
import { isExpiredForAcceptance, sum } from '../grns/grns.helpers';
import { siteBusinessDate } from '../pos/pos-pricing';
import type { ErpGrnRowDto, ListGrnEntriesQueryDto } from './dto/erp-grn.dto';

type Tx = Prisma.TransactionClient;

const entryInclude = {
  hospital: { select: { hospitalName: true } },
  store: { select: { storeName: true } },
  verifier: { select: { employeeCode: true, name: true } },
} satisfies Prisma.GrnEntryInclude;

type Entry = Prisma.GrnEntryGetPayload<{ include: typeof entryInclude }>;

/** Same codes whatever case the ERP sends them in; AAHAR keeps codes in capitals. */
const code = (value: string) => value.trim().toUpperCase();

/** Where a GRN from the ERP lands: the ERP names only the location. */
const MAIN_STORE = 'Main Store';
const MAX_ROWS = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quantities are kept to 3 decimals; sums of them are rounded back. */
const round = (value: number) => Math.round(value * 1000) / 1000;

/** A text field the ERP sent, or undefined if it left it out or blank. */
const filled = (value?: string) => value?.trim() || undefined;

/** What a row still has to move: sent, less what moved and what was closed. */
const remainingOf = (row: {
  acceptedQty: Prisma.Decimal | null;
  rejectedQty: Prisma.Decimal | null;
  sentQty: Prisma.Decimal | null;
}) =>
  Math.max(
    0,
    round(
      toNumber(row.sentQty ?? 0) - toNumber(row.acceptedQty ?? 0) - toNumber(row.rejectedQty ?? 0),
    ),
  );

/** The ERP's time; without a zone ("2026-10-26 15:50:00") it is India time. */
export function indiaTime(value: string): Date {
  const text = value.trim().replace(' ', 'T');

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return new Date(text);

  return new Date(`${text.length === 10 ? `${text}T00:00:00` : text}+05:30`);
}

/**
 * GRNs from the ERP. The store person checks the goods in the ERP, so a GRN moves AAHAR's stock
 * the moment it arrives: goods in (flag 0) go into the location's Main Store; a reverse (flag 1)
 * takes what the store holds of the batch and waits, PENDING, for the rest to come back from the
 * restaurants. A waiting reverse runs again whenever its batch reaches the store, when the store
 * runs it, or when its automatic rerun is resumed; a store admin can close it with a reason.
 */
@Injectable()
export class ErpGrnsService implements OnModuleInit {
  constructor(
    private readonly arrivals: StoreArrivals,
    private readonly auditLog: AuditLogService,
    private readonly grns: GrnsRepository,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  /** Stock reaching a store from anywhere (a restaurant return, Deliveries) runs waiting reverses. */
  onModuleInit() {
    this.arrivals.listen((arrivals) => this.runWaitingFor(arrivals));
  }

  /**
   * Checks every row, saves the GRN and moves its stock, all or nothing. A grn_No already
   * received is refused with the transaction number it got, so an ERP retry cannot move stock
   * twice. A field the ERP leaves out that AAHAR knows (the item's name and HSN code) is filled
   * in from the Item master.
   */
  async receive(rows: ErpGrnRowDto[], ipAddress?: string) {
    if (rows.length === 0) {
      throw new BadRequestException('Send the GRN as a JSON array with at least one row');
    }

    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`A GRN can have at most ${MAX_ROWS} rows`);
    }

    const grnNumber = rows[0]!.grn_No.trim();

    if (rows.some((row) => row.grn_No.trim() !== grnNumber)) {
      throw unprocessable(grnNumber, [
        'Every row must have the same grn_No: send one GRN at a time',
      ]);
    }

    const location = rows[0]!.location.trim();
    const problems: string[] = [];

    if (rows.some((row) => row.location.trim().toLowerCase() !== location.toLowerCase())) {
      problems.push('Every row of a GRN must have the same location');
    }

    const { hospital, items, store } = await this.resolveCodes(
      location,
      rows.map((row) => row.part_item_code),
      problems,
    );

    if (problems.length > 0 || !hospital || !store) {
      throw unprocessable(grnNumber, problems);
    }

    // Goods in that have already expired cannot go into stock: refused in the reply.
    const expired = rows
      .filter((row) => row.flag === 0 && isExpiredForAcceptance(toDateOnly(row.expiry_date)))
      .map(
        (row) =>
          `Batch ${row.batch.trim()} of item ${items.get(code(row.part_item_code))!.itemCode} has expired and cannot be received`,
      );
    const stockProblems = [
      ...new Set(expired),
      ...(await this.overReturns(rows, items, hospital.id, store.id)),
    ];

    if (stockProblems.length > 0) {
      throw unprocessable(grnNumber, stockProblems);
    }

    // AAHAR's number for this request, kept on each of its rows and given back to the ERP.
    const transactionNumber = randomUUID();
    const data = rows.map((row) => {
      const item = items.get(code(row.part_item_code))!;

      return {
        batchNumber: row.batch.trim(),
        discount: row['Discount/Extra Charges'],
        expiryDate: toDateOnly(row.expiry_date),
        flag: row.flag,
        grnNumber,
        hospitalCode: hospital.hospitalCode,
        hospitalId: hospital.id,
        hsnCode: filled(row['HSN No']) ?? item.hsnCode,
        issuedBy: filled(row.issued_by),
        itemCode: item.itemCode,
        itemId: item.id,
        itemName: filled(row.item_name) ?? item.itemName,
        mrp: row.MRP,
        purchaseOrder: filled(row.purchase_order),
        requisitionNumber: filled(row.requisition),
        sentQty: row.transaction_qty,
        storeCode: store.storeCode,
        storeId: store.id,
        taxRate: filled(row['Tax Rate']),
        totalValue: row['Total Value'],
        transactionDate: indiaTime(row.date),
        transactionNumber,
        unitRate: row['Unit Rate'],
        uom: filled(row.UOM),
        vendorCode: filled(row.supplier),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await lockGrn(tx, grnNumber);
      const existing = await tx.grnEntry.findFirst({
        select: { transactionNumber: true },
        where: { grnNumber },
      });

      if (existing) {
        throw new ConflictException(
          `GRN ${grnNumber} was already received (transaction ${existing.transactionNumber})`,
        );
      }

      const [first] = await tx.grnEntry.createManyAndReturn({ data, select: { id: true } });
      await this.settle(tx, grnNumber);

      await this.auditLog.record(
        {
          action: 'ERP_GRN_RECEIVE',
          entityId: first!.id,
          entityName: 'grn_entries',
          hospitalId: hospital.id,
          ipAddress,
          newValue: rows,
        },
        tx,
      );
    });

    // Goods in may be what an earlier reverse is waiting for.
    await this.arrivals.arrived(
      data
        .filter((row) => row.flag === 0)
        .map((row) => ({ batchNumber: row.batchNumber, itemId: row.itemId, storeId: store.id })),
    );

    await this.alertIfWaiting(grnNumber);

    return { transactionNumber };
  }

  /**
   * Emails the location's store staff (who may post GRNs) when a reverse has to wait: each
   * batch, how much is still to come back, and which restaurant or counter holds it. Best
   * effort: the GRN is saved whether or not the email goes.
   */
  private async alertIfWaiting(grnNumber: string) {
    try {
      const rows = (await this.findGrn(this.prisma, grnNumber)).filter(
        (row) => row.status === GrnEntryStatus.PENDING && row.flag === 1 && remainingOf(row) > 0,
      );

      if (rows.length === 0) {
        return;
      }

      const { hospital, hospitalId, transactionNumber } = rows[0]!;
      const [held, people] = await Promise.all([
        this.prisma.stockBalance.findMany({
          select: {
            availableQty: true,
            batchNumber: true,
            itemId: true,
            locationId: true,
            locationType: true,
          },
          where: {
            availableQty: { gt: 0 },
            deletedAt: null,
            hospitalId,
            itemType: ItemType.MRP,
            locationType: { in: [InventoryLocationType.RESTAURANT, InventoryLocationType.COUNTER] },
            OR: rows.map((row) => ({ batchNumber: row.batchNumber, itemId: row.itemId })),
          },
        }),
        this.prisma.user.findMany({
          select: { email: true },
          where: { AND: [worksAt(hospitalId), holdsPermission('GRN_POST')], email: { not: null } },
        }),
      ]);
      const idsOf = (type: InventoryLocationType) => [
        ...new Set(held.filter((b) => b.locationType === type).map((b) => b.locationId)),
      ];
      const [restaurants, counters] = await Promise.all([
        this.prisma.restaurant.findMany({
          select: { id: true, restaurantName: true },
          where: { id: { in: idsOf(InventoryLocationType.RESTAURANT) } },
        }),
        this.prisma.counter.findMany({
          select: { counterName: true, id: true },
          where: { id: { in: idsOf(InventoryLocationType.COUNTER) } },
        }),
      ]);
      const names = new Map([
        ...restaurants.map((r) => [r.id, r.restaurantName] as const),
        ...counters.map((c) => [c.id, c.counterName] as const),
      ]);
      const { html, subject } = waitingReverseEmail({
        batches: rows.map((row) => {
          const byPlace = new Map<string, number>();
          for (const b of held) {
            if (b.itemId === row.itemId && b.batchNumber === row.batchNumber) {
              byPlace.set(
                b.locationId,
                round((byPlace.get(b.locationId) ?? 0) + toNumber(b.availableQty)),
              );
            }
          }

          return {
            batch: row.batchNumber,
            holders: [...byPlace].map(([id, qty]) => ({
              name: names.get(id) ?? 'A restaurant no longer in AAHAR',
              qty,
            })),
            itemCode: row.itemCode,
            itemName: row.itemName,
            waiting: remainingOf(row),
          };
        }),
        grnNumber,
        locationName: hospital.hospitalName,
        transactionNumber,
      });

      await this.mailer.send(
        people.flatMap((person) => person.email ?? []),
        subject,
        html,
      );
    } catch (error) {
      logger.error({ err: error, grnNumber }, 'erp_grn_wait_alert_failed');
    }
  }

  /**
   * Reverses (flag 1) asking for more of a batch than the whole location holds (store,
   * restaurants and counters) plus what this GRN brings in, less what reverses already waiting
   * still need.
   */
  private async overReturns(
    rows: ErpGrnRowDto[],
    items: Map<string, { id: string; itemCode: string }>,
    hospitalId: string,
    storeId: string,
  ) {
    const batches = new Map<string, Batch>();

    for (const row of rows) {
      const item = items.get(code(row.part_item_code))!;
      const batch = row.batch.trim();
      const entry = batches.get(`${item.id}\n${batch}`) ?? { batch, in: 0, item, out: 0 };
      entry[row.flag === 1 ? 'out' : 'in'] += Number(row.transaction_qty);
      batches.set(`${item.id}\n${batch}`, entry);
    }

    const returned = [...batches.values()].filter((entry) => entry.out > 0);

    if (returned.length === 0) {
      return [];
    }

    const batchesOf = returned.map((entry) => ({
      batchNumber: entry.batch,
      itemId: entry.item.id,
    }));
    const [held, waiting] = await Promise.all([
      this.prisma.stockBalance.groupBy({
        _sum: { availableQty: true },
        by: ['itemId', 'batchNumber'],
        where: { deletedAt: null, hospitalId, itemType: ItemType.MRP, OR: batchesOf },
      }),
      this.prisma.grnEntry.groupBy({
        _sum: { acceptedQty: true, rejectedQty: true, sentQty: true },
        by: ['itemId', 'batchNumber'],
        where: { flag: 1, OR: batchesOf, status: GrnEntryStatus.PENDING, storeId },
      }),
    ]);
    const isOf = (entry: Batch) => (row: { batchNumber: string | null; itemId: string }) =>
      row.itemId === entry.item.id && row.batchNumber === entry.batch;

    return returned.flatMap((entry) => {
      const claim = waiting.find(isOf(entry))?._sum;
      const pending = claim ? remainingOf(claim) : 0;
      const stock = toNumber(held.find(isOf(entry))?._sum.availableQty ?? 0);
      const available = Math.max(0, round(stock + entry.in - pending));

      return entry.out > available
        ? [
            `Batch ${entry.batch} of item ${entry.item.itemCode}: the location has only ${available} to return, not ${entry.out}` +
              (pending > 0 ? ` (${pending} already waiting in other returns)` : ''),
          ]
        : [];
    });
  }

  /**
   * Moves what each row still has to move: goods in go into the store, a reverse takes what the
   * store holds of its batch (exact expiry first). The GRN is VERIFIED once every row is done;
   * until then it stays PENDING. Runs inside the caller's transaction, under the GRN's lock.
   */
  private async settle(tx: Tx, grnNumber: string, actorId?: string) {
    const rows = await this.findGrn(tx, grnNumber);
    const now = new Date();

    // Goods in first, so a reverse in the same GRN can take what it brought.
    for (const row of [...rows].sort((a, b) => a.flag - b.flag)) {
      const remaining = remainingOf(row);

      // An expired batch from before goods were posted on arrival waits for a store admin.
      if (remaining === 0 || (row.flag === 0 && isExpiredForAcceptance(row.expiryDate))) {
        continue;
      }

      const moved =
        row.flag === 0
          ? await this.putIn(tx, row, remaining, now, actorId)
          : await this.takeOut(tx, row, remaining, now, actorId);

      if (moved > 0) {
        await tx.grnEntry.update({
          data: {
            acceptedQty: round(toNumber(row.acceptedQty ?? 0) + moved),
            rejectedQty: row.rejectedQty ?? 0,
          },
          where: { id: row.id },
        });
      }
    }

    const after = await this.findGrn(tx, grnNumber);

    if (after.every((row) => remainingOf(row) === 0)) {
      await tx.grnEntry.updateMany({
        data: { status: GrnEntryStatus.VERIFIED, verifiedAt: now, verifiedBy: actorId ?? null },
        where: { grnNumber },
      });
    }
  }

  private async putIn(tx: Tx, row: Entry, quantity: number, now: Date, actorId?: string) {
    const balance = await this.grns.upsertStockBalance(
      {
        actorId,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        hospitalId: row.hospitalId,
        itemId: row.itemId,
        locationId: row.storeId,
        quantity,
      },
      tx,
    );

    await this.ledger(
      tx,
      row,
      { balanceAfter: toNumber(balance.availableQty), expiryDate: row.expiryDate, qtyIn: quantity },
      now,
      actorId,
    );

    return quantity;
  }

  /** Takes up to `wanted` of the row's batch from the store; returns how much it took. */
  private async takeOut(tx: Tx, row: Entry, wanted: number, now: Date, actorId?: string) {
    // A reverse is of the batch, whatever expiry the ERP sends with it; the exact expiry first.
    const balances = (
      await tx.stockBalance.findMany({
        orderBy: { availableQty: 'desc' },
        where: {
          availableQty: { gt: 0 },
          batchNumber: row.batchNumber,
          deletedAt: null,
          hospitalId: row.hospitalId,
          itemId: row.itemId,
          itemType: ItemType.MRP,
          locationId: row.storeId,
          locationType: InventoryLocationType.STORE,
        },
      })
    ).sort(
      (a, b) =>
        Number(b.expiryDate?.getTime() === row.expiryDate.getTime()) -
        Number(a.expiryDate?.getTime() === row.expiryDate.getTime()),
    );
    let taken = 0;

    for (const balance of balances) {
      const quantity = Math.min(round(wanted - taken), toNumber(balance.availableQty));

      if (quantity <= 0) {
        break;
      }

      // Only if it is still there: a sale or transfer taking it meanwhile wins, and the rest
      // waits for the next run.
      const { count } = await tx.stockBalance.updateMany({
        data: { availableQty: { decrement: quantity }, lastUpdatedOn: now, updatedBy: actorId },
        where: { availableQty: { gte: quantity }, id: balance.id },
      });

      if (count === 1) {
        taken = round(taken + quantity);
        await this.ledger(
          tx,
          row,
          {
            balanceAfter: round(toNumber(balance.availableQty) - quantity),
            expiryDate: balance.expiryDate ?? row.expiryDate,
            qtyOut: quantity,
          },
          now,
          actorId,
        );
      }
    }

    return taken;
  }

  private async ledger(
    tx: Tx,
    row: Entry,
    movement: { balanceAfter: number; expiryDate: Date; qtyIn?: number; qtyOut?: number },
    now: Date,
    actorId?: string,
  ) {
    await tx.stockLedger.create({
      data: {
        ...movement,
        batchNumber: row.batchNumber,
        businessDate: toDateOnly(siteBusinessDate(now)),
        createdBy: actorId,
        hospitalId: row.hospitalId,
        itemId: row.itemId,
        itemType: ItemType.MRP,
        locationId: row.storeId,
        locationType: InventoryLocationType.STORE,
        referenceId: row.id,
        referenceType: StockReferenceType.GRN_ENTRY,
        remarks: `ERP GRN ${row.grnNumber}`,
        transactionDateTime: now,
        transactionType: movement.qtyOut
          ? StockTransactionType.GRN_RETURN_OUT
          : StockTransactionType.GRN_IN,
        updatedBy: actorId,
      },
    });
  }

  /**
   * Runs every waiting reverse (automatic rerun on) that needs one of these batches, oldest
   * first, each in its own transaction. Called after stock reaches a Main Store; a failure is
   * logged and left for the next run, as the stock that came in is already saved.
   */
  async runWaitingFor(batches: StoreArrival[]) {
    if (batches.length === 0) {
      return;
    }

    const waiting = await this.prisma.grnEntry.groupBy({
      _min: { createdAt: true },
      by: ['grnNumber'],
      orderBy: { _min: { createdAt: 'asc' } },
      where: {
        flag: 1,
        OR: batches.map(({ batchNumber, itemId, storeId }) => ({ batchNumber, itemId, storeId })),
        rerunActive: true,
        status: GrnEntryStatus.PENDING,
      },
    });

    for (const { grnNumber } of waiting) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await lockGrn(tx, grnNumber);
          const [first] = await this.findGrn(tx, grnNumber);

          if (first!.status === GrnEntryStatus.PENDING && first!.rerunActive) {
            await this.settle(tx, grnNumber);
          }
        });
      } catch (error) {
        logger.error({ err: error, grnNumber }, 'erp_grn_rerun_failed');
      }
    }
  }

  /** The store runs a waiting reverse now, whether its automatic rerun is on or paused. */
  async run(grnNumber: string, context: ActorContext) {
    return this.whileWaiting(grnNumber, async (tx) => {
      await this.settle(tx, grnNumber, context.actorId);
      await this.audit(tx, grnNumber, 'ERP_GRN_RUN', context);
    });
  }

  /** Pauses or resumes a waiting reverse's automatic rerun; resuming runs it at once. */
  async setRerun(grnNumber: string, active: boolean, context: ActorContext) {
    return this.whileWaiting(grnNumber, async (tx) => {
      await tx.grnEntry.updateMany({ data: { rerunActive: active }, where: { grnNumber } });

      if (active) {
        await this.settle(tx, grnNumber, context.actorId);
      }

      await this.audit(tx, grnNumber, active ? 'ERP_GRN_RERUN_ON' : 'ERP_GRN_RERUN_OFF', context);
    });
  }

  /** Closes a waiting reverse that can never finish (the stock was sold): the rest is written off. */
  async close(grnNumber: string, reason: string | undefined, context: ActorContext) {
    const why = reason?.trim();

    if (!why) {
      throw new BadRequestException('Give a reason for closing it');
    }

    return this.whileWaiting(grnNumber, async (tx, rows) => {
      for (const row of rows) {
        const remaining = remainingOf(row);

        await tx.grnEntry.update({
          data: {
            acceptedQty: row.acceptedQty ?? 0,
            rejectedQty: round(toNumber(row.rejectedQty ?? 0) + remaining),
            ...(remaining > 0 ? { rejectionReason: why } : {}),
          },
          where: { id: row.id },
        });
      }

      await tx.grnEntry.updateMany({
        data: {
          status: GrnEntryStatus.CLOSED,
          verifiedAt: new Date(),
          verifiedBy: context.actorId ?? null,
        },
        where: { grnNumber },
      });
      await this.audit(tx, grnNumber, 'ERP_GRN_CLOSE', context, { reason: why });
    });
  }

  /** Does `act` on a GRN that is still waiting, under its lock; answers with the GRN after. */
  private async whileWaiting(grnNumber: string, act: (tx: Tx, rows: Entry[]) => Promise<void>) {
    return this.prisma.$transaction(async (tx) => {
      await lockGrn(tx, grnNumber);
      const rows = await this.findGrn(tx, grnNumber);

      if (rows[0]!.status !== GrnEntryStatus.PENDING) {
        throw new ConflictException(`GRN ${grnNumber} has nothing waiting`);
      }

      await act(tx, rows);

      return toGrnResponse(await this.findGrn(tx, grnNumber));
    });
  }

  private async audit(
    tx: Tx,
    grnNumber: string,
    action: string,
    context: ActorContext,
    extra: Record<string, unknown> = {},
  ) {
    const after = toGrnResponse(await this.findGrn(tx, grnNumber));

    await this.auditLog.record(
      {
        action,
        actorId: context.actorId,
        entityId: (after.rows[0] as { row_id: string }).row_id,
        entityName: 'grn_entries',
        hospitalId: after.hospital_id,
        ipAddress: context.ipAddress,
        newValue: { ...extra, status: after.status, totals: after.totals },
      },
      tx,
    );
  }

  /** A page of GRNs, newest first; for the ERP (`verifiedSince`), oldest done first. */
  async list(query: ListGrnEntriesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.GrnEntryWhereInput = {
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      // The GRN number, or the transaction number AAHAR gave the request (as the log shows it).
      ...(query.search
        ? {
            OR: [
              { grnNumber: { contains: query.search.trim(), mode: 'insensitive' } },
              { transactionNumber: { startsWith: query.search.trim().toLowerCase() } },
            ],
          }
        : {}),
      ...(query.verifiedSince ? { verifiedAt: { gte: new Date(query.verifiedSince) } } : {}),
      // Whole India days: from the start of the first to the end of the last.
      ...(query.receivedFrom || query.receivedTo
        ? {
            createdAt: {
              ...(query.receivedFrom ? { gte: indiaTime(query.receivedFrom.slice(0, 10)) } : {}),
              ...(query.receivedTo
                ? { lt: new Date(indiaTime(query.receivedTo.slice(0, 10)).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };
    const latest = query.verifiedSince
      ? { _max: { verifiedAt: 'asc' as const } }
      : { _max: { createdAt: query.sortOrder ?? ('desc' as const) } };

    const [groups, all] = await Promise.all([
      limit > 0
        ? this.prisma.grnEntry.groupBy({
            by: ['grnNumber'],
            orderBy: [latest, { grnNumber: 'asc' }],
            skip: (page - 1) * limit,
            take: limit,
            where,
          })
        : [],
      this.prisma.grnEntry.groupBy({ by: ['grnNumber'], where }),
    ]);
    const numbers = groups.map((group) => group.grnNumber);
    const rows = numbers.length
      ? await this.prisma.grnEntry.findMany({
          include: entryInclude,
          orderBy: [{ itemCode: 'asc' }, { batchNumber: 'asc' }],
          where: { grnNumber: { in: numbers } },
        })
      : [];

    return {
      items: numbers.map((grnNumber) =>
        toGrnResponse(rows.filter((row) => row.grnNumber === grnNumber)),
      ),
      meta: getPageMeta(page, limit, all.length),
    };
  }

  /** One GRN, by its grn_No or by the transaction number AAHAR gave the request. */
  async get(grnNumberOrTransaction: string) {
    const byTransaction = UUID.test(grnNumberOrTransaction)
      ? await this.prisma.grnEntry.findFirst({
          select: { grnNumber: true },
          where: { transactionNumber: grnNumberOrTransaction.toLowerCase() },
        })
      : null;

    return toGrnResponse(
      await this.findGrn(this.prisma, byTransaction?.grnNumber ?? grnNumberOrTransaction),
    );
  }

  /** Every batch of the GRN; a portal user only finds their own hospitals' GRNs. */
  private async findGrn(client: Tx | PrismaService, grnNumber: string): Promise<Entry[]> {
    const rows = await client.grnEntry.findMany({
      include: entryInclude,
      orderBy: [{ itemCode: 'asc' }, { batchNumber: 'asc' }],
      where: { grnNumber },
    });

    if (rows.length === 0) {
      throw new NotFoundException(`GRN ${grnNumber} not found`);
    }

    return rows;
  }

  /**
   * The location (by code or name), its Main Store and the items behind the ERP's codes; each
   * one not found is a problem.
   */
  private async resolveCodes(location: string, itemCodes: string[], problems: string[]) {
    const named = { equals: location, mode: 'insensitive' as const };
    const matches = await this.prisma.hospital.findMany({
      select: { hospitalCode: true, id: true },
      take: 5,
      where: {
        OR: [{ hospitalCode: named }, { hospitalName: named }, { displayName: named }],
        deletedAt: null,
        isActive: true,
      },
    });
    // A code is unique; a name may not be, and then only the code will do.
    const hospital =
      matches.find((match) => match.hospitalCode.toLowerCase() === location.toLowerCase()) ??
      (matches.length === 1 ? matches[0] : undefined);
    const store = hospital
      ? await this.prisma.store.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true, storeCode: true },
          where: {
            deletedAt: null,
            hospitalId: hospital.id,
            isActive: true,
            storeName: { equals: MAIN_STORE, mode: 'insensitive' },
          },
        })
      : null;

    if (!hospital) {
      problems.push(
        matches.length > 1
          ? `Location ${location} matches more than one location: send its code`
          : `Location ${location} is not in AAHAR`,
      );
    } else if (!store) {
      problems.push(`Location ${hospital.hospitalCode} has no active ${MAIN_STORE}`);
    }

    const codes = [...new Set(itemCodes.map(code))];
    const found = await this.prisma.item.findMany({
      select: { hsnCode: true, id: true, itemCode: true, itemName: true },
      where: { deletedAt: null, isActive: true, itemCode: { in: codes, mode: 'insensitive' } },
    });
    const items = new Map(found.map((item) => [code(item.itemCode), item]));
    const mapped = store
      ? new Set(
          (
            await this.grns.findActiveStoreMappings(
              store.id,
              found.map((item) => item.id),
              this.prisma,
            )
          ).map((mapping) => mapping.itemId),
        )
      : undefined;

    for (const itemCode of codes) {
      const item = items.get(itemCode);

      if (!item) {
        problems.push(`Item code ${itemCode} is not in AAHAR`);
      } else if (mapped && !mapped.has(item.id)) {
        problems.push(
          `Item code ${itemCode} is not set up as a stock item of store ${store!.storeCode}`,
        );
      }
    }

    return { hospital, items, store };
  }
}

/** One batch of one item in a request: how much comes in and how much goes back. */
type Batch = { batch: string; in: number; item: { id: string; itemCode: string }; out: number };

/** Serialises everything done to one GRN number, even before it has any rows to lock. */
async function lockGrn(tx: Tx, grnNumber: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`erp-grn:${grnNumber}`}))) AS locked`;
}

function unprocessable(grnNumber: string, errors: string[]) {
  return new UnprocessableEntityException({ errors, message: `GRN ${grnNumber} cannot be saved` });
}

const amount = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));

/** One row as the ERP sent it, in its own field names, with what moved and what still waits. */
function toRow(row: Entry) {
  return {
    'Discount/Extra Charges': amount(row.discount),
    'HSN No': row.hsnCode,
    MRP: amount(row.mrp),
    'Tax Rate': row.taxRate,
    'Total Value': amount(row.totalValue),
    UOM: row.uom,
    'Unit Rate': amount(row.unitRate),
    accepted_qty: toNumber(row.acceptedQty ?? 0),
    batch: row.batchNumber,
    date: row.transactionDate,
    expiry_date: row.expiryDate.toISOString().slice(0, 10),
    flag: row.flag,
    grn_No: row.grnNumber,
    issued_by: row.issuedBy,
    item_name: row.itemName,
    location: row.hospitalCode,
    part_item_code: row.itemCode,
    pending_qty: row.status === GrnEntryStatus.PENDING ? remainingOf(row) : 0,
    purchase_order: row.purchaseOrder,
    rejected_qty: toNumber(row.rejectedQty ?? 0),
    rejection_reason: row.rejectionReason,
    requisition: row.requisitionNumber,
    row_id: row.id,
    supplier: row.vendorCode,
    transaction_number: row.transactionNumber,
    transaction_qty: toNumber(row.sentQty),
  };
}

/**
 * One GRN as the ERP and the portal see it: where it landed, its status (PENDING while a reverse
 * waits, VERIFIED when everything moved, CLOSED when a store admin closed it), then every row.
 */
function toGrnResponse(rows: Entry[]) {
  const first = rows[0]!;
  const mapped = rows.map(toRow);
  const total = (pick: (row: ReturnType<typeof toRow>) => number) => sum(mapped.map(pick));

  return {
    grn_No: first.grnNumber,
    hospital_id: first.hospitalId,
    location: first.hospitalCode,
    location_name: first.hospital.hospitalName,
    received_at: first.createdAt,
    rerun_active: first.rerunActive,
    rows: mapped,
    status: first.status,
    store_code: first.storeCode,
    store_id: first.storeId,
    store_name: first.store.storeName,
    transaction_number: first.transactionNumber,
    totals: {
      accepted_qty: total((row) => row.accepted_qty),
      pending_qty: total((row) => row.pending_qty),
      rejected_qty: total((row) => row.rejected_qty),
      transaction_qty: total((row) => row.transaction_qty),
    },
    verified_at: first.verifiedAt,
    verified_by: first.verifier,
  };
}

/** A batch a reverse still waits for, and where the location holds it. */
export interface WaitingBatch {
  batch: string;
  holders: Array<{ name: string; qty: number }>;
  itemCode: string;
  itemName: string | null;
  waiting: number;
}

const HTML_ESCAPES: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** The email the location's store staff get when a reverse has to wait. */
export function waitingReverseEmail(input: {
  batches: WaitingBatch[];
  grnNumber: string;
  locationName: string;
  transactionNumber: string;
}) {
  const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
  const waiting = number.format(round(sum(input.batches.map((b) => b.waiting))));
  const cell =
    'padding:6px 10px;border-bottom:1px solid #e4e7ec;text-align:left;vertical-align:top';
  const rows = input.batches
    .map((b) => {
      const item = b.itemName
        ? `${escapeHtml(b.itemName)} (${escapeHtml(b.itemCode)})`
        : escapeHtml(b.itemCode);
      const holders = b.holders.length
        ? b.holders.map((h) => `${escapeHtml(h.name)}: ${number.format(h.qty)}`).join('<br>')
        : 'Not found in any restaurant or counter';

      return `<tr><td style="${cell}">${item}</td><td style="${cell}">${escapeHtml(b.batch)}</td><td style="${cell}">${number.format(b.waiting)}</td><td style="${cell}">${holders}</td></tr>`;
    })
    .join('');

  return {
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#101828;max-width:640px">
<p style="font-size:15px">The ERP sent a GRN reverse (return to vendor) for <b>${escapeHtml(input.locationName)}</b>. The Main Store did not hold all of it, so the rest is waiting to come back from the restaurants.</p>
<p style="font-size:14px">GRN <b>${escapeHtml(input.grnNumber)}</b> · Transaction ${escapeHtml(input.transactionNumber)}</p>
<table style="border-collapse:collapse;font-size:14px;margin:12px 0">
<thead><tr><th style="${cell}">Item</th><th style="${cell}">Batch</th><th style="${cell}">Waiting</th><th style="${cell}">Held at</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="font-size:14px">Ask these restaurants to send the batch back to the store (Return to store, or at shift or day end). Once the store counts it in, AAHAR takes it off automatically. If it was sold, a store admin can close the reverse on Inventory → ERP GRNs.</p>
<p style="font-size:13px;color:#667085">Max Healthcare · AAHAR</p>
</div>`,
    subject: `GRN reverse ${input.grnNumber} at ${input.locationName} is waiting for ${waiting} to come back`,
  };
}
