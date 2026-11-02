import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErpPostingStatus, type Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ReportRow } from '../reports/report-builders';
import { ReportsService } from '../reports/reports.service';
import type { ErpPostingQueryDto, SendErpPostingDto } from './dto/erp-posting.dto';
import { revenuePayload, revenueSucceeded } from './erp-revenue';

/** The ERP's answer is kept up to this much. */
const RESPONSE_LIMIT = 16 * 1024;
const TIMEOUT_MS = 60_000;
/** A send still PENDING after this died with its process; it stops blocking the day. */
const STALE_MS = 5 * 60_000;

const summarySelect = {
  billCount: true,
  businessDate: true,
  createdAt: true,
  durationMs: true,
  error: true,
  hospitalId: true,
  id: true,
  responseStatus: true,
  restaurantId: true,
  rowCount: true,
  sentBy: true,
  status: true,
} satisfies Prisma.ErpPostingSelect;

type Summary = Prisma.ErpPostingGetPayload<{ select: typeof summarySelect }>;
type Caller = { allowedHospitalIds: string[] | null; id: string };

const indiaDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

/** "2026-10-31" → the next day, "2026-11-01". */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Sends a restaurant's day to the ERP (the ERP Journal (SUN) report for it, as the ERP's revenue
 * API takes it) when an admin asks, and keeps every attempt: what was sent, what came back.
 * Off until ERP_REVENUE_URL and ERP_REVENUE_TOKEN are set.
 */
@Injectable()
export class ErpPostingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly config: ConfigService,
    @Optional() private readonly auditLog?: AuditLogService,
  ) {}

  private settings() {
    return {
      // ponytail: one fixed bearer token; add the ERP's sign-in call once its API doc names one.
      token: this.config.get<string>('ERP_REVENUE_TOKEN')?.trim() ?? '',
      url: this.config.get<string>('ERP_REVENUE_URL')?.trim() ?? '',
    };
  }

  enabled(): boolean {
    const { token, url } = this.settings();
    return Boolean(token && url);
  }

  async list(query: ErpPostingQueryDto, allowed: string[] | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ErpPostingWhereInput = {
      ...(query.hospitalId
        ? { hospitalId: query.hospitalId }
        : allowed
          ? { hospitalId: { in: allowed } }
          : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            businessDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.erpPosting.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: summarySelect,
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.erpPosting.count({ where }),
    ]);

    return { enabled: this.enabled(), items: await this.named(rows), limit, page, total };
  }

  /** One attempt in full, for its log file and Excel data. */
  async get(id: string, allowed: string[] | null) {
    const posting = await this.prisma.erpPosting.findUnique({
      select: { ...summarySelect, report: true, requestBody: true, responseBody: true },
      where: { id },
    });

    if (!posting || (allowed && !allowed.includes(posting.hospitalId))) {
      throw new NotFoundException('ERP posting not found.');
    }

    const [named] = await this.named([posting]);
    return { ...posting, ...named! };
  }

  async send(dto: SendErpPostingDto, caller: Caller) {
    const { token, url } = this.settings();

    if (!token || !url) {
      throw new ServiceUnavailableException(
        'Sending to the ERP is not set up yet: IT has to add the ERP address and token.',
      );
    }

    if (dto.businessDate >= indiaDay(new Date())) {
      throw new BadRequestException('A day is sent once it is over: pick yesterday or earlier.');
    }

    const restaurant = await this.prisma.restaurant.findFirst({
      select: { restaurantName: true },
      where: { deletedAt: null, hospitalId: dto.hospitalId, id: dto.restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found at this location.');
    }

    const day = { businessDate: new Date(dto.businessDate), restaurantId: dto.restaurantId };

    await this.prisma.erpPosting.updateMany({
      data: { error: 'Stopped before the ERP answered.', status: ErpPostingStatus.FAILED },
      where: {
        ...day,
        createdAt: { lt: new Date(Date.now() - STALE_MS) },
        status: ErpPostingStatus.PENDING,
      },
    });

    if (!dto.resend) {
      const sent = await this.prisma.erpPosting.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, id: true },
        where: { ...day, status: ErpPostingStatus.SUCCESS },
      });

      if (sent) {
        throw new ConflictException(
          `This day was already sent on ${sent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Send it again only if the ERP does not have it.`,
        );
      }
    }

    const report = await this.reports.run(
      'erp',
      {
        from: `${dto.businessDate}T00:00:00+05:30`,
        hospitalId: dto.hospitalId,
        restaurantIds: dto.restaurantId,
        to: `${nextDay(dto.businessDate)}T00:00:00+05:30`,
      },
      ['REPORT_ERP'],
    );
    const rows: ReportRow[] = report.rows;
    const base = {
      ...day,
      billCount: new Set(rows.map((row) => row.AFS_11)).size,
      hospitalId: dto.hospitalId,
      // Dates become ISO text, as the API returns them.
      report: JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue,
      rowCount: rows.length,
      sentBy: caller.id,
    };

    if (!rows.length) {
      const empty = await this.prisma.erpPosting.create({
        data: { ...base, status: ErpPostingStatus.EMPTY },
        select: summarySelect,
      });
      return this.finish(empty, restaurant.restaurantName, dto.businessDate);
    }

    const requestBody = JSON.stringify(revenuePayload(rows));
    let pending: Summary;

    try {
      pending = await this.prisma.erpPosting.create({
        data: { ...base, requestBody, status: ErpPostingStatus.PENDING },
        select: summarySelect,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('This day is being sent right now.');
      }
      throw error;
    }

    const started = Date.now();
    let outcome: {
      error: string | null;
      responseBody: string | null;
      responseStatus: number | null;
      status: ErpPostingStatus;
    };

    try {
      const response = await fetch(url, {
        body: requestBody,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      const verdict = revenueSucceeded(response.status, text);
      outcome = {
        error: verdict.ok ? null : verdict.error,
        responseBody: text.slice(0, RESPONSE_LIMIT),
        responseStatus: response.status,
        status: verdict.ok ? ErpPostingStatus.SUCCESS : ErpPostingStatus.FAILED,
      };
    } catch (error) {
      outcome = {
        error: `The ERP could not be reached: ${(error as Error).message}`,
        responseBody: null,
        responseStatus: null,
        status: ErpPostingStatus.FAILED,
      };
    }

    const done = await this.prisma.erpPosting.update({
      data: { ...outcome, durationMs: Date.now() - started },
      select: summarySelect,
      where: { id: pending.id },
    });
    return this.finish(done, restaurant.restaurantName, dto.businessDate);
  }

  private async finish(posting: Summary, restaurantName: string, day: string) {
    const outcome = {
      [ErpPostingStatus.EMPTY]: 'nothing to send',
      [ErpPostingStatus.FAILED]: 'failed',
      [ErpPostingStatus.PENDING]: 'pending',
      [ErpPostingStatus.SUCCESS]: 'sent',
    }[posting.status];

    void this.auditLog?.record({
      action: 'ERP_POST',
      actorId: posting.sentBy ?? undefined,
      entityId: posting.id,
      entityName: 'erp_postings',
      hospitalId: posting.hospitalId,
      newValue: {
        bills: posting.billCount,
        businessDate: day,
        error: posting.error,
        lines: posting.rowCount,
        restaurant: restaurantName,
        status: posting.status,
      },
      summary: `${restaurantName}, ${day}: ${posting.billCount} bills to the ERP, ${outcome}`,
    });

    const [named] = await this.named([posting]);
    return named!;
  }

  /** Adds the restaurant's and the sender's names. */
  private async named<T extends Summary>(rows: T[]) {
    const restaurantIds = [...new Set(rows.map((row) => row.restaurantId))];
    const userIds = [...new Set(rows.map((row) => row.sentBy).filter(Boolean))] as string[];
    const [restaurants, users] = await Promise.all([
      restaurantIds.length
        ? this.prisma.restaurant.findMany({
            select: { id: true, restaurantName: true },
            where: { id: { in: restaurantIds } },
          })
        : [],
      userIds.length
        ? this.prisma.user.findMany({
            select: { id: true, name: true },
            where: { id: { in: userIds } },
          })
        : [],
    ]);
    const restaurantName = new Map(restaurants.map((row) => [row.id, row.restaurantName]));
    const userName = new Map(users.map((row) => [row.id, row.name]));

    return rows.map((row) => ({
      ...row,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      restaurantName: restaurantName.get(row.restaurantId) ?? null,
      sentByName: row.sentBy ? (userName.get(row.sentBy) ?? null) : null,
    }));
  }
}
