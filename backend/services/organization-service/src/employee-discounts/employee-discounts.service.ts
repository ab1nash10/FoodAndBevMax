import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { toNumber } from '../common/values';
import type {
  CreateEmployeeDiscountDto,
  ListEmployeeDiscountsQueryDto,
  UpdateEmployeeDiscountDto,
} from './dto/employee-discount.dto';

const include = {
  restaurant: { select: { id: true, restaurantCode: true, restaurantName: true } },
} as const;

type DiscountWithRestaurant = Prisma.EmployeeDiscountGetPayload<{ include: typeof include }>;

function toResponse(discount: DiscountWithRestaurant) {
  return {
    archivedAt: discount.archivedAt,
    createdAt: discount.createdAt,
    daysOfWeek: discount.daysOfWeek,
    discountPercent: toNumber(discount.discountPercent),
    employmentType: discount.employmentType,
    endTime: discount.endTime,
    hospitalId: discount.hospitalId,
    id: discount.id,
    name: discount.name,
    restaurant: discount.restaurant,
    restaurantId: discount.restaurantId,
    startTime: discount.startTime,
    updatedAt: discount.updatedAt,
  };
}

/** Special timings are both times or neither, and a window has some length. */
function assertTimings(startTime: string | null | undefined, endTime: string | null | undefined) {
  if (Boolean(startTime) !== Boolean(endTime)) {
    throw new BadRequestException('Give both a start and an end time, or neither for all day.');
  }
  if (startTime && startTime === endTime) {
    throw new BadRequestException('The end time must differ from the start time.');
  }
}

/**
 * Employee Discounts: a restaurant's rules for staff (percentage, employee level, serve days,
 * special timings). Billing applies the best live one (PosService.employeeDiscount). Reads are
 * scoped to the user's locations; a restaurant outside them is "not found".
 */
@Injectable()
export class EmployeeDiscountsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: ListEmployeeDiscountsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.EmployeeDiscountWhereInput = {
      archivedAt: query.archived ? { not: null } : null,
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      limit === 0
        ? Promise.resolve([])
        : this.prisma.employeeDiscount.findMany({
            include,
            orderBy: getOrderBy(query, 'createdAt'),
            skip: (page - 1) * limit,
            take: limit,
            where,
          }),
      this.prisma.employeeDiscount.count({ where }),
    ]);

    return { items: items.map(toResponse), meta: getPageMeta(page, limit, total) };
  }

  async getById(id: string) {
    return toResponse(await this.find(id));
  }

  async create(dto: CreateEmployeeDiscountDto, context: ActorContext) {
    assertTimings(dto.startTime, dto.endTime);
    const restaurant = await this.findRestaurant(dto.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeDiscount.create({
        data: {
          createdBy: context.actorId,
          daysOfWeek: dto.daysOfWeek ?? [],
          discountPercent: dto.discountPercent,
          employmentType: dto.employmentType ?? null,
          endTime: dto.endTime || null,
          hospitalId: restaurant.hospitalId,
          name: dto.name,
          restaurantId: restaurant.id,
          startTime: dto.startTime || null,
          updatedBy: context.actorId,
        },
        include,
      });

      await this.auditLog.record(
        {
          action: 'EMPLOYEE_DISCOUNT_CREATE',
          actorId: context.actorId,
          entityId: created.id,
          entityName: 'employee_discounts',
          ipAddress: context.ipAddress,
          newValue: toResponse(created),
        },
        tx,
      );

      return toResponse(created);
    });
  }

  async update(id: string, dto: UpdateEmployeeDiscountDto, context: ActorContext) {
    const existing = await this.find(id);
    const startTime = dto.startTime !== undefined ? dto.startTime || null : existing.startTime;
    const endTime = dto.endTime !== undefined ? dto.endTime || null : existing.endTime;

    assertTimings(startTime, endTime);
    const restaurant =
      dto.restaurantId && dto.restaurantId !== existing.restaurantId
        ? await this.findRestaurant(dto.restaurantId)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employeeDiscount.update({
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
          ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
          ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
          ...(restaurant ? { hospitalId: restaurant.hospitalId, restaurantId: restaurant.id } : {}),
          ...(dto.archived !== undefined
            ? { archivedAt: dto.archived ? (existing.archivedAt ?? new Date()) : null }
            : {}),
          endTime,
          startTime,
          updatedBy: context.actorId,
        },
        include,
        where: { id },
      });

      await this.auditLog.record(
        {
          action:
            dto.archived === undefined
              ? 'EMPLOYEE_DISCOUNT_UPDATE'
              : dto.archived
                ? 'EMPLOYEE_DISCOUNT_ARCHIVE'
                : 'EMPLOYEE_DISCOUNT_RESTORE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'employee_discounts',
          ipAddress: context.ipAddress,
          newValue: toResponse(updated),
          oldValue: toResponse(existing),
        },
        tx,
      );

      return toResponse(updated);
    });
  }

  private async find(id: string) {
    const discount = await this.prisma.employeeDiscount.findFirst({ include, where: { id } });

    if (!discount) {
      throw new NotFoundException('Employee discount not found');
    }

    return discount;
  }

  private async findRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      select: { hospitalId: true, id: true },
      where: { deletedAt: null, id },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return restaurant;
  }
}
