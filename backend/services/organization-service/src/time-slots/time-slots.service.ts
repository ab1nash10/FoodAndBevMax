import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimeSlot } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { ListTimeSlotsQueryDto } from './dto/list-time-slots-query.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { TimeSlotsRepository } from './time-slots.repository';

type TimeSlotClient = Prisma.TransactionClient;

function toTimeSlotResponse(timeSlot: TimeSlot) {
  return {
    createdAt: timeSlot.createdAt,
    deletedAt: timeSlot.deletedAt,
    endTime: timeSlot.endTime,
    id: timeSlot.id,
    isActive: timeSlot.isActive,
    isAlwaysAvailable: timeSlot.isAlwaysAvailable,
    slotName: timeSlot.slotName,
    startTime: timeSlot.startTime,
    updatedAt: timeSlot.updatedAt,
  };
}

function validateTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): void {
  if (startTime && endTime && startTime >= endTime) {
    throw new BadRequestException('End time must be after start time');
  }
}

@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly timeSlots: TimeSlotsRepository,
  ) {}

  async list(query: ListTimeSlotsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.TimeSlotWhereInput = {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isAlwaysAvailable !== undefined
        ? { isAlwaysAvailable: query.isAlwaysAvailable }
        : {}),
      ...(query.search
        ? {
            slotName: {
              contains: query.search,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.timeSlots.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.timeSlots.count({ where }),
    ]);

    return {
      items: items.map(toTimeSlotResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toTimeSlotResponse(await this.findActiveTimeSlot(id));
  }

  async create(dto: CreateTimeSlotDto, context: ActorContext) {
    try {
      const created = await this.timeSlots.transaction(async (tx) => {
        await this.assertUniqueSlotName(dto.slotName, undefined, tx);

        if (!dto.isAlwaysAvailable) {
          validateTimeRange(dto.startTime, dto.endTime);
        }

        const timeSlot = await this.timeSlots.create(
          {
            createdBy: context.actorId,
            endTime: dto.isAlwaysAvailable ? null : dto.endTime,
            isActive: dto.isActive ?? true,
            isAlwaysAvailable: dto.isAlwaysAvailable ?? false,
            slotName: dto.slotName,
            startTime: dto.isAlwaysAvailable ? null : dto.startTime,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'TIME_SLOT_CREATE',
            actorId: context.actorId,
            entityId: timeSlot.id,
            entityName: 'time_slots',
            ipAddress: context.ipAddress,
            newValue: toTimeSlotResponse(timeSlot),
          },
          tx,
        );

        return timeSlot;
      });

      return toTimeSlotResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Time slot');
    }
  }

  async update(id: string, dto: UpdateTimeSlotDto, context: ActorContext) {
    try {
      const updated = await this.timeSlots.transaction(async (tx) => {
        const existing = await this.findActiveTimeSlot(id, tx);
        const nextAlwaysAvailable = dto.isAlwaysAvailable ?? existing.isAlwaysAvailable;
        const nextStartTime = nextAlwaysAvailable
          ? null
          : dto.startTime !== undefined
            ? dto.startTime
            : existing.startTime;
        const nextEndTime = nextAlwaysAvailable
          ? null
          : dto.endTime !== undefined
            ? dto.endTime
            : existing.endTime;
        const data: Prisma.TimeSlotUpdateInput = {};

        if (dto.slotName !== undefined) {
          await this.assertUniqueSlotName(dto.slotName, id, tx);
          data.slotName = dto.slotName;
        }

        if (!nextAlwaysAvailable && (!nextStartTime || !nextEndTime)) {
          throw new BadRequestException('Start time and end time are required');
        }

        validateTimeRange(nextStartTime, nextEndTime);

        if (dto.isAlwaysAvailable !== undefined) {
          data.isAlwaysAvailable = dto.isAlwaysAvailable;
        }

        if (dto.startTime !== undefined || dto.isAlwaysAvailable !== undefined) {
          data.startTime = nextStartTime;
        }

        if (dto.endTime !== undefined || dto.isAlwaysAvailable !== undefined) {
          data.endTime = nextEndTime;
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const timeSlot = Object.keys(data).length
          ? await this.timeSlots.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'TIME_SLOT_STATUS_CHANGE'
                : 'TIME_SLOT_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'time_slots',
            ipAddress: context.ipAddress,
            newValue: toTimeSlotResponse(timeSlot),
            oldValue: toTimeSlotResponse(existing),
          },
          tx,
        );

        return timeSlot;
      });

      return toTimeSlotResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Time slot');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveTimeSlot(id);

    await this.timeSlots.transaction(async (tx) => {
      const hasMenus = await this.timeSlots.hasActiveRestaurantMenus(id, tx);

      if (hasMenus) {
        throw new BadRequestException('Time slot is assigned to active restaurant menu mappings');
      }

      await this.timeSlots.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          updatedBy: context.actorId,
        },
        tx,
      );

      await this.auditLog.record(
        {
          action: 'TIME_SLOT_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'time_slots',
          ipAddress: context.ipAddress,
          oldValue: toTimeSlotResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  private async assertUniqueSlotName(
    slotName: string,
    excludeId: string | undefined,
    client: TimeSlotClient,
  ): Promise<void> {
    const timeSlot = await this.timeSlots.findByName(slotName, excludeId, client);

    if (timeSlot) {
      throw new ConflictException('Time slot already exists');
    }
  }

  private async findActiveTimeSlot(id: string, client?: TimeSlotClient): Promise<TimeSlot> {
    const timeSlot = await this.timeSlots.findActiveById(id, client);

    if (!timeSlot) {
      throw new NotFoundException('Time slot not found');
    }

    return timeSlot;
  }
}
