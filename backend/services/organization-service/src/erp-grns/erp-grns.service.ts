import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
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
import { getPageMeta, getPagination } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { quantitiesMatch, toDateOnly, toNumber } from '../common/values';
import { GrnsRepository } from '../grns/grns.repository';
import { isExpiredForAcceptance, sum } from '../grns/grns.helpers';
import { siteBusinessDate } from '../pos/pos-pricing';
import type { ErpGrnRowDto, ListGrnEntriesQueryDto, VerifyGrnEntryDto } from './dto/erp-grn.dto';

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

/** A text field the ERP sent, or undefined if it left it out or blank. */
const filled = (value?: string) => value?.trim() || undefined;

/** The ERP's time; without a zone ("2026-10-26 15:50:00") it is India time. */
export function indiaTime(value: string): Date {
  const text = value.trim().replace(' ', 'T');

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return new Date(text);

  return new Date(`${text.length === 10 ? `${text}T00:00:00` : text}+05:30`);
}

@Injectable()
export class ErpGrnsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly grns: GrnsRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Saves a GRN from the ERP as PENDING, one row per batch, all or nothing. Sent again while
   * still pending, it replaces the earlier copy; once verified it is refused. A field the ERP
   * leaves out that AAHAR knows (the item's name and HSN code) is filled in from the Item master.
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

    problems.push(
      ...repeatedTransactionNumbers(
        rows.map((row) => filled(row.transaction_number)).filter((number) => number !== undefined),
      ),
    );
    const { hospital, items, store } = await this.resolveCodes(
      location,
      rows.map((row) => row.part_item_code),
      problems,
    );

    if (problems.length > 0 || !hospital || !store) {
      throw unprocessable(grnNumber, problems);
    }

    const data = rows.map((row) => {
      const item = items.get(code(row.part_item_code))!;
      // A row the ERP sends without its own number takes the row's record id as its number.
      const id = randomUUID();

      return {
        id,
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
        transactionNumber: filled(row.transaction_number) ?? id,
        unitRate: row['Unit Rate'],
        uom: filled(row.UOM),
        vendorCode: filled(row.supplier),
      };
    });

    return this.prisma.$transaction(async (tx) => {
      await lockGrn(tx, grnNumber);
      const existing = await tx.grnEntry.findMany({
        select: { status: true },
        where: { grnNumber },
      });

      if (existing.some((row) => row.status === GrnEntryStatus.VERIFIED)) {
        throw new ConflictException(
          `GRN ${grnNumber} is already verified. Send a return (flag 1) to reverse it.`,
        );
      }

      const taken = await tx.grnEntry.findMany({
        select: { grnNumber: true, transactionNumber: true },
        where: {
          grnNumber: { not: grnNumber },
          transactionNumber: { in: data.map((row) => row.transactionNumber) },
        },
      });

      if (taken.length > 0) {
        throw unprocessable(
          grnNumber,
          taken.map(
            (row) =>
              `Transaction number ${row.transactionNumber} already belongs to GRN ${row.grnNumber}`,
          ),
        );
      }

      await tx.grnEntry.deleteMany({ where: { grnNumber } });
      const [first] = await tx.grnEntry.createManyAndReturn({ data, select: { id: true } });

      await this.auditLog.record(
        {
          action: existing.length > 0 ? 'ERP_GRN_RESEND' : 'ERP_GRN_RECEIVE',
          entityId: first!.id,
          entityName: 'grn_entries',
          hospitalId: hospital.id,
          ipAddress,
          newValue: rows,
        },
        tx,
      );

      return {
        grn_No: grnNumber,
        replaced: existing.length > 0,
        rows: data.length,
        status: GrnEntryStatus.PENDING,
        /** Each row's transaction number, in the order sent: the ERP's own, or the one given. */
        transaction_numbers: data.map((row) => row.transactionNumber),
      };
    });
  }

  /** A page of GRNs, newest first; for the ERP (`verifiedSince`), oldest verified first. */
  async list(query: ListGrnEntriesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.GrnEntryWhereInput = {
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? { grnNumber: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.verifiedSince ? { verifiedAt: { gte: new Date(query.verifiedSince) } } : {}),
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
          orderBy: { transactionNumber: 'asc' },
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

  async get(grnNumber: string) {
    return toGrnResponse(await this.findGrn(this.prisma, grnNumber));
  }

  /**
   * The store's answer for every batch: what was accepted and what rejected. Accepted
   * quantity goes into (flag 0) or out of (flag 1) the store's stock in the same transaction.
   */
  async verify(grnNumber: string, dto: VerifyGrnEntryDto, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      // Two verifies at once (a double click) queue here; the second then sees VERIFIED.
      await lockGrn(tx, grnNumber);
      const rows = await this.findGrn(tx, grnNumber);

      if (rows[0]!.status === GrnEntryStatus.VERIFIED) {
        throw new ConflictException(`GRN ${grnNumber} is already verified`);
      }

      const answers = answersFor(rows, dto);
      const now = new Date();

      for (const row of rows) {
        const answer = answers.get(row.transactionNumber)!;

        if (answer.acceptedQty > 0) {
          await (row.flag === 1
            ? this.takeOut(tx, row, answer.acceptedQty, now, context)
            : this.putIn(tx, row, answer.acceptedQty, now, context));
        }

        await tx.grnEntry.update({
          data: {
            acceptedQty: answer.acceptedQty,
            rejectedQty: answer.rejectedQty,
            rejectionReason: answer.rejectedQty > 0 ? answer.rejectionReason?.trim() : null,
            status: GrnEntryStatus.VERIFIED,
            verifiedAt: now,
            verifiedBy: context.actorId,
          },
          where: { id: row.id },
        });
      }

      const verified = toGrnResponse(await this.findGrn(tx, grnNumber));

      await this.auditLog.record(
        {
          action: 'ERP_GRN_VERIFY',
          actorId: context.actorId,
          entityId: rows[0]!.id,
          entityName: 'grn_entries',
          hospitalId: rows[0]!.hospitalId,
          ipAddress: context.ipAddress,
          newValue: verified,
        },
        tx,
      );

      return verified;
    });
  }

  private async putIn(tx: Tx, row: Entry, quantity: number, now: Date, context: ActorContext) {
    const balance = await this.grns.upsertStockBalance(
      {
        actorId: context.actorId,
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
      { balanceAfter: toNumber(balance.availableQty), qtyIn: quantity },
      now,
      context,
    );
  }

  private async takeOut(tx: Tx, row: Entry, quantity: number, now: Date, context: ActorContext) {
    const balance = await this.grns.findStockBalance(
      {
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        hospitalId: row.hospitalId,
        itemId: row.itemId,
        locationId: row.storeId,
      },
      tx,
    );
    const available = balance ? toNumber(balance.availableQty) : 0;
    // Only if the stock is still there: a sale or transfer taking it meanwhile wins.
    const taken = balance
      ? await tx.stockBalance.updateMany({
          data: {
            availableQty: { decrement: quantity },
            lastUpdatedOn: now,
            updatedBy: context.actorId,
          },
          where: { availableQty: { gte: quantity }, id: balance.id },
        })
      : { count: 0 };

    if (taken.count !== 1) {
      throw new BadRequestException(
        `Batch ${row.transactionNumber}: the store has only ${available} of batch ${row.batchNumber} to return`,
      );
    }

    const after = Math.round((available - quantity) * 1000) / 1000;
    await this.ledger(tx, row, { balanceAfter: after, qtyOut: quantity }, now, context);
  }

  private async ledger(
    tx: Tx,
    row: Entry,
    movement: { balanceAfter: number; qtyIn?: number; qtyOut?: number },
    now: Date,
    context: ActorContext,
  ) {
    await tx.stockLedger.create({
      data: {
        ...movement,
        batchNumber: row.batchNumber,
        businessDate: toDateOnly(siteBusinessDate(now)),
        createdBy: context.actorId,
        expiryDate: row.expiryDate,
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
        updatedBy: context.actorId,
      },
    });
  }

  /** Every batch of the GRN; a portal user only finds their own hospitals' GRNs. */
  private async findGrn(client: Tx | PrismaService, grnNumber: string): Promise<Entry[]> {
    const rows = await client.grnEntry.findMany({
      include: entryInclude,
      orderBy: { transactionNumber: 'asc' },
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

/** Serialises everything done to one GRN number, even before it has any rows to lock. */
async function lockGrn(tx: Tx, grnNumber: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`erp-grn:${grnNumber}`}))) AS locked`;
}

function unprocessable(grnNumber: string, errors: string[]) {
  return new UnprocessableEntityException({ errors, message: `GRN ${grnNumber} cannot be saved` });
}

function repeatedTransactionNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const number of numbers.map((value) => value.trim())) {
    (seen.has(number) ? repeated : seen).add(number);
  }

  return [...repeated].map((number) => `Transaction number ${number} appears more than once`);
}

/** The store's answer per batch, after checking it accounts for every batch and every unit. */
function answersFor(rows: Entry[], dto: VerifyGrnEntryDto) {
  const answers = new Map(dto.batches.map((batch) => [batch.transactionNumber.trim(), batch]));
  const ofGrn = new Set(rows.map((row) => row.transactionNumber));

  if (answers.size !== dto.batches.length) {
    throw new BadRequestException('Each batch can be answered only once');
  }

  for (const transactionNumber of answers.keys()) {
    if (!ofGrn.has(transactionNumber)) {
      throw new BadRequestException(
        `Batch ${transactionNumber} is not part of GRN ${rows[0]!.grnNumber}`,
      );
    }
  }

  for (const row of rows) {
    const t = row.transactionNumber;
    const answer = answers.get(t);

    if (!answer) {
      throw new BadRequestException(
        `Batch ${t} is missing: every batch of the GRN must be accepted or rejected`,
      );
    }

    const sent = toNumber(row.sentQty);

    if (!quantitiesMatch(answer.acceptedQty + answer.rejectedQty, sent)) {
      throw new BadRequestException(
        `Batch ${t}: accepted ${answer.acceptedQty} + rejected ${answer.rejectedQty} must equal the ${sent} sent`,
      );
    }

    if (answer.rejectedQty > 0 && !answer.rejectionReason?.trim()) {
      throw new BadRequestException(`Batch ${t}: give a reason for the rejected quantity`);
    }

    if (row.flag === 0 && answer.acceptedQty > 0 && isExpiredForAcceptance(row.expiryDate)) {
      throw new BadRequestException(`Batch ${t} has expired and cannot be accepted`);
    }
  }

  return answers;
}

const amount = (value: Prisma.Decimal | null) => (value === null ? null : toNumber(value));

/** One row as the ERP sent it, in its own field names, with the store's answer. */
function toRow(row: Entry) {
  return {
    'Discount/Extra Charges': amount(row.discount),
    'HSN No': row.hsnCode,
    MRP: amount(row.mrp),
    'Tax Rate': row.taxRate,
    'Total Value': amount(row.totalValue),
    UOM: row.uom,
    'Unit Rate': amount(row.unitRate),
    accepted_qty: amount(row.acceptedQty),
    batch: row.batchNumber,
    date: row.transactionDate,
    expiry_date: row.expiryDate.toISOString().slice(0, 10),
    flag: row.flag,
    grn_No: row.grnNumber,
    issued_by: row.issuedBy,
    item_name: row.itemName,
    location: row.hospitalCode,
    part_item_code: row.itemCode,
    purchase_order: row.purchaseOrder,
    rejected_qty: amount(row.rejectedQty),
    rejection_reason: row.rejectionReason,
    requisition: row.requisitionNumber,
    supplier: row.vendorCode,
    transaction_number: row.transactionNumber,
    transaction_qty: toNumber(row.sentQty),
  };
}

/** One GRN as the ERP and the portal see it: where it landed, its status, then every row. */
function toGrnResponse(rows: Entry[]) {
  const first = rows[0]!;
  const verified = first.status === GrnEntryStatus.VERIFIED;
  const total = (pick: (row: Entry) => Prisma.Decimal | null) =>
    sum(rows.map((row) => amount(pick(row)) ?? 0));

  return {
    grn_No: first.grnNumber,
    hospital_id: first.hospitalId,
    location: first.hospitalCode,
    location_name: first.hospital.hospitalName,
    received_at: first.createdAt,
    rows: rows.map(toRow),
    status: first.status,
    store_code: first.storeCode,
    store_id: first.storeId,
    store_name: first.store.storeName,
    totals: {
      accepted_qty: verified ? total((row) => row.acceptedQty) : null,
      rejected_qty: verified ? total((row) => row.rejectedQty) : null,
      transaction_qty: total((row) => row.sentQty),
    },
    verified_at: first.verifiedAt,
    verified_by: first.verifier,
  };
}
