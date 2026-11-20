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
  LocationScope,
  Prisma,
  RecordStatus,
  StockReferenceType,
  StockTransactionType,
  UserStatus,
} from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { Mailer } from '../common/mailer';
import { getPageMeta, getPagination } from '../common/pagination';
import { worksAt } from '../common/permission-holders';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { StoreArrivals, type StoreArrival } from '../common/store-arrivals';
import { toDateOnly, toNumber } from '../common/values';
import { GrnsRepository } from '../grns/grns.repository';
import { isExpiredForAcceptance, sum } from '../grns/grns.helpers';
import { siteBusinessDate } from '../pos/pos-pricing';
import {
  CLOSE_REASONS,
  type CloseReason,
  type ErpGrnRowDto,
  type ErpStockQueryDto,
  type ListGrnEntriesQueryDto,
  type ListGrnRefusalsQueryDto,
} from './dto/erp-grn.dto';
import { remainingOf, round } from './held-batches';

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

/** A text field the ERP sent, or undefined if it left it out or blank. */
const filled = (value?: string) => value?.trim() || undefined;

/** The ERP's time; without a zone ("2026-10-26 15:50:00") it is India time. */
export function indiaTime(value: string): Date {
  const text = value.trim().replace(' ', 'T');

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return new Date(text);

  return new Date(`${text.length === 10 ? `${text}T00:00:00` : text}+05:30`);
}

/** The role whose holders hear about a return the Main Store could not cover. */
const F_AND_B_ADMIN = 'F&B Admin';

/**
 * GRNs from the ERP. The store person checks the goods in the ERP, so a GRN moves AAHAR's stock
 * the moment it arrives: goods in (flag 0) go into the location's Main Store; a reverse (flag 1)
 * takes what the store holds of the batch, and the rest is owed: the GRN waits, PENDING, the ERP
 * is told the shortfall and the location's F&B Admins are emailed. A waiting reverse runs again
 * whenever its batch reaches the store, when the store runs it, or when its automatic rerun is
 * resumed; a store admin can close it with a reason. A GRN AAHAR cannot take is refused and kept
 * for the store team (ERP GRN errors).
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
   * Checks every row, saves the request's rows and moves their stock, all or nothing. The same
   * grn_No again adds its rows to that GRN, each moving stock by its own flag (so a resent
   * request moves stock again). A field the ERP leaves out that AAHAR knows (the item's name and
   * HSN code) is filled in from the Item master. A refused GRN is kept, with why, for the store
   * team.
   */
  async receive(rows: ErpGrnRowDto[], ipAddress?: string) {
    if (rows.length === 0) {
      throw new BadRequestException('Send the GRN as a JSON array with at least one row');
    }

    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`A GRN can have at most ${MAX_ROWS} rows`);
    }

    const grnNumber = rows[0]!.grn_No.trim();
    const location = rows[0]!.location.trim();
    let hospitalId: string | undefined;

    try {
      if (rows.some((row) => row.grn_No.trim() !== grnNumber)) {
        throw unprocessable(grnNumber, [
          'Every row must have the same grn_No: send one GRN at a time',
        ]);
      }

      const problems: string[] = [];

      if (rows.some((row) => row.location.trim().toLowerCase() !== location.toLowerCase())) {
        problems.push('Every row of a GRN must have the same location');
      }

      const { hospital, items, store } = await this.resolveCodes(
        location,
        rows.map((row) => row.part_item_code),
        problems,
      );
      hospitalId = hospital?.id;

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
      if (expired.length > 0) {
        throw unprocessable(grnNumber, [...new Set(expired)]);
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
        // Requests of one GRN number go one after the other.
        await lockGrn(tx, grnNumber);
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

      // Returns the store could not cover in full: owed until the batch comes back.
      const owed = await this.owedBy(transactionNumber);

      if (owed.length > 0) {
        await this.alertOwed(owed);
      }

      return {
        shortfalls: owed.map((row) => ({
          batch: row.batchNumber,
          owed: remainingOf(row),
          part_item_code: row.itemCode,
          requested: toNumber(row.sentQty),
          returned: toNumber(row.acceptedQty ?? 0),
        })),
        transactionNumber,
      };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        await this.keepRefusal(grnNumber, location, hospitalId, rows, error);
      }

      throw error;
    }
  }

  /** Keeps a refused GRN for ERP GRN errors. Best effort: the ERP gets its answer either way. */
  private async keepRefusal(
    grnNumber: string,
    location: string,
    hospitalId: string | undefined,
    rows: ErpGrnRowDto[],
    refusal: UnprocessableEntityException,
  ) {
    try {
      await this.prisma.erpGrnRefusal.create({
        data: {
          errors: (refusal.getResponse() as { errors: string[] }).errors,
          grnNumber,
          hospitalId,
          location,
          rows: JSON.parse(JSON.stringify(rows)) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      logger.error({ err: error, grnNumber }, 'erp_grn_refusal_not_kept');
    }
  }

  /** A request's returns (flag 1) the Main Store could not cover in full: still owed. */
  private async owedBy(transactionNumber: string) {
    const rows = await this.prisma.grnEntry.findMany({
      include: entryInclude,
      orderBy: rowOrder,
      where: { flag: 1, status: GrnEntryStatus.PENDING, transactionNumber },
    });

    return rows.filter((row) => remainingOf(row) > 0);
  }

  /**
   * Emails the location's F&B Admins (the role by that name, at this location or over all of
   * them) when a return could not be covered in full: each batch, how much is still owed to the
   * vendor, and which restaurant or counter holds it. Best effort: the GRN is saved either way.
   */
  private async alertOwed(rows: Entry[]) {
    const { grnNumber, hospital, hospitalId, transactionNumber } = rows[0]!;

    try {
      const admin = { equals: F_AND_B_ADMIN, mode: 'insensitive' as const };
      const [holders, people] = await Promise.all([
        this.holdersOf(hospitalId, rows),
        this.prisma.user.findMany({
          select: { email: true },
          where: {
            AND: [
              {
                OR: [
                  worksAt(hospitalId),
                  {
                    roles: {
                      some: {
                        deletedAt: null,
                        role: { locationScope: LocationScope.ALL, name: admin },
                      },
                    },
                  },
                ],
              },
            ],
            deletedAt: null,
            email: { not: null },
            roles: {
              some: {
                deletedAt: null,
                role: { deletedAt: null, name: admin, status: RecordStatus.ACTIVE },
              },
            },
            status: UserStatus.ACTIVE,
          },
        }),
      ]);
      const { html, subject } = owedReturnEmail({
        batches: rows.map((row) => ({
          batch: row.batchNumber,
          holders: holders(row),
          itemCode: row.itemCode,
          itemName: row.itemName,
          owed: remainingOf(row),
        })),
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
      logger.error({ err: error, grnNumber }, 'erp_grn_owed_alert_failed');
    }
  }

  /** Which restaurants and counters of the location hold these batches, and how much each. */
  private async holdersOf(
    hospitalId: string,
    batches: Array<{ batchNumber: string; itemId: string }>,
  ) {
    const held = await this.prisma.stockBalance.findMany({
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
        OR: batches.map(({ batchNumber, itemId }) => ({ batchNumber, itemId })),
      },
    });
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

    return ({ batchNumber, itemId }: { batchNumber: string; itemId: string }) => {
      const byPlace = new Map<string, number>();
      for (const b of held) {
        if (b.itemId === itemId && b.batchNumber === batchNumber) {
          byPlace.set(
            b.locationId,
            round((byPlace.get(b.locationId) ?? 0) + toNumber(b.availableQty)),
          );
        }
      }

      return [...byPlace].map(([id, qty]) => ({
        name: names.get(id) ?? 'A restaurant no longer in AAHAR',
        qty,
      }));
    };
  }

  /**
   * For the ERP before a return: how much of a batch the location's Main Store holds (what a
   * return can take now), and which restaurants and counters hold the rest.
   */
  async stock(query: ErpStockQueryDto) {
    const problems: string[] = [];
    const location = query.location.trim();
    const { hospital, items, store } = await this.resolveCodes(
      location,
      [query.part_item_code],
      problems,
    );

    if (problems.length > 0 || !hospital || !store) {
      throw new UnprocessableEntityException({ errors: problems, message: 'Stock cannot be read' });
    }

    const item = items.get(code(query.part_item_code))!;
    const batchNumber = query.batch.trim();
    const [inStore, holders] = await Promise.all([
      this.prisma.stockBalance.aggregate({
        _sum: { availableQty: true },
        where: {
          batchNumber,
          deletedAt: null,
          itemId: item.id,
          itemType: ItemType.MRP,
          locationId: store.id,
          locationType: InventoryLocationType.STORE,
        },
      }),
      this.holdersOf(hospital.id, [{ batchNumber, itemId: item.id }]),
    ]);

    return {
      batch: batchNumber,
      held_elsewhere: holders({ batchNumber, itemId: item.id }),
      item_name: item.itemName,
      location: hospital.hospitalCode,
      location_name: hospital.hospitalName,
      main_store_qty: round(toNumber(inStore._sum.availableQty ?? 0)),
      part_item_code: item.itemCode,
    };
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
    } else if (after.some((row) => row.status !== GrnEntryStatus.PENDING)) {
      // One status for the whole GRN: a later request of it that leaves something owed reopens it.
      await tx.grnEntry.updateMany({
        data: { status: GrnEntryStatus.PENDING, verifiedAt: null, verifiedBy: null },
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

  /**
   * Closes a waiting reverse that can never finish (the stock was sold, wasted, or never there):
   * the rest is written off with one of the reasons, and a note (needed for Other).
   */
  async close(
    grnNumber: string,
    reason: CloseReason | undefined,
    note: string | undefined,
    context: ActorContext,
  ) {
    const said = note?.trim();

    if (!reason) {
      throw new BadRequestException('Give a reason for closing it');
    }

    if (reason === 'OTHER' && !said) {
      throw new BadRequestException('Say what happened in the note');
    }

    const why = said ? `${CLOSE_REASONS[reason]}: ${said}` : CLOSE_REASONS[reason];

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
      createdAt: receivedBetween(query.receivedFrom, query.receivedTo),
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
          orderBy: rowOrder,
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

  /** GRNs AAHAR refused (ERP GRN errors), newest first. `search` matches the GRN number. */
  async listRefusals(query: ListGrnRefusalsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.ErpGrnRefusalWhereInput = {
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.search
        ? { grnNumber: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
      createdAt: receivedBetween(query.receivedFrom, query.receivedTo),
    };
    const [refusals, total] = await Promise.all([
      this.prisma.erpGrnRefusal.findMany({
        include: { hospital: { select: { hospitalName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.erpGrnRefusal.count({ where }),
    ]);

    return {
      items: refusals.map((refusal) => ({
        errors: refusal.errors,
        grn_No: refusal.grnNumber,
        hospital_id: refusal.hospitalId,
        id: refusal.id,
        location: refusal.location,
        location_name: refusal.hospital?.hospitalName ?? null,
        received_at: refusal.createdAt,
        rows: refusal.rows,
      })),
      meta: getPageMeta(page, limit, total),
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
      orderBy: rowOrder,
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
      select: { hospitalCode: true, hospitalName: true, id: true },
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

/** A GRN's rows by item and batch, then in the order their requests came (goods in first). */
const rowOrder: Prisma.GrnEntryOrderByWithRelationInput[] = [
  { itemCode: 'asc' },
  { batchNumber: 'asc' },
  { createdAt: 'asc' },
  { flag: 'asc' },
];

/** Received on whole India days: from the start of the first to the end of the last. */
function receivedBetween(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: indiaTime(from.slice(0, 10)) } : {}),
    ...(to ? { lt: new Date(indiaTime(to.slice(0, 10)).getTime() + 86_400_000) } : {}),
  };
}

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
  // The GRN's number and time are its first request's; each row keeps its own request's number.
  const earliest = rows.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
  const mapped = rows.map(toRow);
  const total = (pick: (row: ReturnType<typeof toRow>) => number) => sum(mapped.map(pick));

  return {
    grn_No: first.grnNumber,
    hospital_id: first.hospitalId,
    location: first.hospitalCode,
    location_name: first.hospital.hospitalName,
    received_at: earliest.createdAt,
    rerun_active: first.rerunActive,
    rows: mapped,
    status: first.status,
    store_code: first.storeCode,
    store_id: first.storeId,
    store_name: first.store.storeName,
    transaction_number: earliest.transactionNumber,
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

/** A batch a return still owes the vendor, and where the location holds it. */
export interface OwedBatch {
  batch: string;
  holders: Array<{ name: string; qty: number }>;
  itemCode: string;
  itemName: string | null;
  owed: number;
}

const HTML_ESCAPES: Record<string, string> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** The email the location's F&B Admins get when a return could not be covered in full. */
export function owedReturnEmail(input: {
  batches: OwedBatch[];
  grnNumber: string;
  locationName: string;
  transactionNumber: string;
}) {
  const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
  const owed = number.format(round(sum(input.batches.map((b) => b.owed))));
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

      return `<tr><td style="${cell}">${item}</td><td style="${cell}">${escapeHtml(b.batch)}</td><td style="${cell}">${number.format(b.owed)}</td><td style="${cell}">${holders}</td></tr>`;
    })
    .join('');

  return {
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#101828;max-width:640px">
<p style="font-size:15px">The ERP sent a GRN reverse (return to vendor) for <b>${escapeHtml(input.locationName)}</b>. The Main Store did not hold all of it: what it held went back, and the rest is still owed to the vendor.</p>
<p style="font-size:14px">GRN <b>${escapeHtml(input.grnNumber)}</b> · Transaction ${escapeHtml(input.transactionNumber)}</p>
<table style="border-collapse:collapse;font-size:14px;margin:12px 0">
<thead><tr><th style="${cell}">Item</th><th style="${cell}">Batch</th><th style="${cell}">Owed</th><th style="${cell}">Held at</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="font-size:14px;margin-bottom:4px">To settle it:</p>
<ul style="font-size:14px;margin-top:0;padding-left:20px">
<li>If a restaurant or counter has the batch, it returns it to the Main Store in AAHAR. AAHAR takes what is owed by itself.</li>
<li>If the ERP returned more than the vendor got, ask the ERP team to send a goods in (flag 0) of the difference for the batch. AAHAR settles it by itself.</li>
<li>If it was sold, used or wasted, close the GRN with a reason on Inventory → ERP GRNs.</li>
</ul>
<p style="font-size:14px">Until then the batch cannot be sold at the location's counters.</p>
<p style="font-size:13px;color:#667085">Max Healthcare · AAHAR</p>
</div>`,
    subject: `GRN reverse ${input.grnNumber} at ${input.locationName}: ${owed} still owed to the vendor`,
  };
}
