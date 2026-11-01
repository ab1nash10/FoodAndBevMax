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
import type { ErpGrnDto, ListGrnEntriesQueryDto, VerifyGrnEntryDto } from './dto/erp-grn.dto';

type Tx = Prisma.TransactionClient;

const entryInclude = {
  store: { select: { storeName: true } },
  verifier: { select: { employeeCode: true, name: true } },
} satisfies Prisma.GrnEntryInclude;

type Entry = Prisma.GrnEntryGetPayload<{ include: typeof entryInclude }>;

/** Same codes whatever case the ERP sends them in; AAHAR keeps codes in capitals. */
const code = (value: string) => value.trim().toUpperCase();

@Injectable()
export class ErpGrnsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly grns: GrnsRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Saves a GRN from the ERP as PENDING, one row per batch, all or nothing. Sent again while
   * still pending, it replaces the earlier copy; once verified it is refused.
   */
  async receive(dto: ErpGrnDto, ipAddress?: string) {
    const grnNumber = dto.grnNumber.trim();
    const batches = dto.items.flatMap((item) => item.batches.map((batch) => ({ batch, item })));
    const problems = repeatedTransactionNumbers(
      batches.map(({ batch }) => batch.transactionNumber),
    );
    const { hospital, itemIds, store } = await this.resolveCodes(dto, problems);

    if (problems.length > 0 || !hospital || !store) {
      throw unprocessable(grnNumber, problems);
    }

    const data = batches.map(({ batch, item }) => ({
      batchNumber: batch.batchNumber.trim(),
      discount: item.discount,
      expiryDate: toDateOnly(batch.expiryDate),
      flag: dto.flag,
      grnNumber,
      hospitalCode: hospital.hospitalCode,
      hospitalId: hospital.id,
      hsnCode: item.hsnCode,
      issuedBy: dto.issuedBy,
      itemCode: code(item.itemCode),
      itemId: itemIds.get(code(item.itemCode))!,
      itemName: item.itemName,
      mrp: item.mrp,
      purchaseOrder: dto.purchaseOrder,
      requisitionNumber: dto.requisitionNumber,
      sentQty: batch.qty,
      storeCode: store.storeCode,
      storeId: store.id,
      taxRate: item.taxRate,
      totalValue: batch.totalValue,
      transactionDate: new Date(dto.transactionDate),
      transactionNumber: batch.transactionNumber.trim(),
      unitRate: item.unitRate,
      uom: item.uom,
      vendorCode: dto.vendorCode,
    }));

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
          newValue: dto,
        },
        tx,
      );

      return {
        batches: data.length,
        grnNumber,
        replaced: existing.length > 0,
        status: GrnEntryStatus.PENDING,
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

  /** The hospital, store and items behind the ERP's codes; each one not found is a problem. */
  private async resolveCodes(dto: ErpGrnDto, problems: string[]) {
    const hospital = await this.prisma.hospital.findFirst({
      select: { hospitalCode: true, id: true },
      where: {
        deletedAt: null,
        hospitalCode: { equals: dto.hospitalCode.trim(), mode: 'insensitive' },
        isActive: true,
      },
    });
    const store = hospital
      ? await this.prisma.store.findFirst({
          select: { id: true, storeCode: true },
          where: {
            deletedAt: null,
            hospitalId: hospital.id,
            isActive: true,
            storeCode: { equals: dto.storeCode.trim(), mode: 'insensitive' },
          },
        })
      : null;

    if (!hospital) {
      problems.push(`Hospital code ${dto.hospitalCode} is not in AAHAR`);
    } else if (!store) {
      problems.push(`Store code ${dto.storeCode} is not in hospital ${hospital.hospitalCode}`);
    }

    const codes = [...new Set(dto.items.map((item) => code(item.itemCode)))];
    const items = await this.prisma.item.findMany({
      select: { id: true, itemCode: true },
      where: { deletedAt: null, isActive: true, itemCode: { in: codes, mode: 'insensitive' } },
    });
    const itemIds = new Map(items.map((item) => [code(item.itemCode), item.id]));
    const mapped = store
      ? new Set(
          (
            await this.grns.findActiveStoreMappings(store.id, [...itemIds.values()], this.prisma)
          ).map((mapping) => mapping.itemId),
        )
      : undefined;

    for (const itemCode of codes) {
      const itemId = itemIds.get(itemCode);

      if (!itemId) {
        problems.push(`Item code ${itemCode} is not in AAHAR`);
      } else if (mapped && !mapped.has(itemId)) {
        problems.push(
          `Item code ${itemCode} is not set up as a stock item of store ${store!.storeCode}`,
        );
      }
    }

    return { hospital, itemIds, store };
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

/** One GRN as the ERP and the portal see it: the GRN's details once, then items and batches. */
function toGrnResponse(rows: Entry[]) {
  const first = rows[0]!;
  const verified = first.status === GrnEntryStatus.VERIFIED;
  const total = (pick: (row: Entry) => Prisma.Decimal | null) =>
    sum(rows.map((row) => amount(pick(row)) ?? 0));
  const itemCodes = [...new Set(rows.map((row) => row.itemCode))];

  return {
    flag: first.flag,
    grnNumber: first.grnNumber,
    hospitalCode: first.hospitalCode,
    hospitalId: first.hospitalId,
    issuedBy: first.issuedBy,
    items: itemCodes.map((itemCode) => {
      const batches = rows.filter((row) => row.itemCode === itemCode);
      const item = batches[0]!;

      return {
        batches: batches.map((row) => ({
          acceptedQty: amount(row.acceptedQty),
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate.toISOString().slice(0, 10),
          rejectedQty: amount(row.rejectedQty),
          rejectionReason: row.rejectionReason,
          sentQty: toNumber(row.sentQty),
          totalValue: amount(row.totalValue),
          transactionNumber: row.transactionNumber,
        })),
        discount: amount(item.discount),
        hsnCode: item.hsnCode,
        itemCode,
        itemId: item.itemId,
        itemName: item.itemName,
        mrp: amount(item.mrp),
        taxRate: item.taxRate,
        unitRate: amount(item.unitRate),
        uom: item.uom,
      };
    }),
    purchaseOrder: first.purchaseOrder,
    receivedAt: first.createdAt,
    requisitionNumber: first.requisitionNumber,
    status: first.status,
    storeCode: first.storeCode,
    storeId: first.storeId,
    storeName: first.store.storeName,
    totals: {
      acceptedQty: verified ? total((row) => row.acceptedQty) : null,
      rejectedQty: verified ? total((row) => row.rejectedQty) : null,
      sentQty: total((row) => row.sentQty),
    },
    transactionDate: first.transactionDate,
    vendorCode: first.vendorCode,
    verifiedAt: first.verifiedAt,
    verifiedBy: first.verifier,
  };
}
