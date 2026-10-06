import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { handlePrismaError } from '../common/prisma-errors';
import type { ActorContext } from '../common/request-context';
import { CountersRepository, CounterWithRelations } from './counters.repository';
import { CreateCounterDto } from './dto/create-counter.dto';
import { ListCountersQueryDto } from './dto/list-counters-query.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';

type CounterClient = Prisma.TransactionClient;

function toCounterResponse(counter: CounterWithRelations) {
  return {
    counterCode: counter.counterCode,
    counterName: counter.counterName,
    createdAt: counter.createdAt,
    deletedAt: counter.deletedAt,
    hospital: {
      hospitalCode: counter.hospital.hospitalCode,
      hospitalName: counter.hospital.hospitalName,
      id: counter.hospital.id,
      isActive: counter.hospital.isActive,
    },
    hospitalId: counter.hospitalId,
    id: counter.id,
    isActive: counter.isActive,
    paymentDeviceId: counter.paymentDeviceId,
    pineLabsDeviceId: counter.pineLabsDeviceId,
    posDeviceId: counter.posDeviceId,
    restaurant: {
      id: counter.restaurant.id,
      isActive: counter.restaurant.isActive,
      restaurantCode: counter.restaurant.restaurantCode,
      restaurantName: counter.restaurant.restaurantName,
    },
    restaurantId: counter.restaurantId,
    updatedAt: counter.updatedAt,
  };
}

@Injectable()
export class CountersService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly counters: CountersRepository,
  ) {}

  async list(query: ListCountersQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.CounterWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      restaurant: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.search
        ? {
            OR: [
              { counterCode: { contains: query.search, mode: 'insensitive' } },
              { counterName: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.counters.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.counters.count({ where }),
    ]);

    return {
      items: items.map(toCounterResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const counter = await this.findActiveCounter(id);

    return toCounterResponse(counter);
  }

  async create(dto: CreateCounterDto, context: ActorContext) {
    try {
      const created = await this.counters.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);
        await this.assertActiveRestaurant(dto.restaurantId, dto.hospitalId, tx);
        await this.assertUniqueCounterCode(dto.restaurantId, dto.counterCode, undefined, tx);

        const counter = await this.counters.create(
          {
            counterCode: dto.counterCode,
            counterName: dto.counterName,
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            isActive: dto.isActive ?? true,
            paymentDeviceId: dto.paymentDeviceId,
            pineLabsDeviceId: dto.pineLabsDeviceId,
            posDeviceId: dto.posDeviceId,
            restaurantId: dto.restaurantId,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'COUNTER_CREATE',
            actorId: context.actorId,
            entityId: counter.id,
            entityName: 'counters',
            hospitalId: counter.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toCounterResponse(counter),
          },
          tx,
        );

        return counter;
      });

      return toCounterResponse(created);
    } catch (error) {
      handlePrismaError(error, 'Counter');
    }
  }

  async update(id: string, dto: UpdateCounterDto, context: ActorContext) {
    try {
      const updated = await this.counters.transaction(async (tx) => {
        const existing = await this.findActiveCounter(id, tx);
        const data: Prisma.CounterUpdateInput = {};
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const restaurantId = dto.restaurantId ?? existing.restaurantId;
        const counterCode = dto.counterCode ?? existing.counterCode;

        if (dto.counterCode !== undefined) {
          data.counterCode = dto.counterCode;
        }

        if (dto.counterName !== undefined) {
          data.counterName = dto.counterName;
        }

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
          data.hospital = {
            connect: {
              id: dto.hospitalId,
            },
          };
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.paymentDeviceId !== undefined) {
          data.paymentDeviceId = dto.paymentDeviceId;
        }

        if (dto.pineLabsDeviceId !== undefined) {
          data.pineLabsDeviceId = dto.pineLabsDeviceId;
        }

        if (dto.posDeviceId !== undefined) {
          data.posDeviceId = dto.posDeviceId;
        }

        if (dto.restaurantId !== undefined) {
          data.restaurant = {
            connect: {
              id: dto.restaurantId,
            },
          };
        }

        if (dto.hospitalId !== undefined || dto.restaurantId !== undefined) {
          await this.assertActiveRestaurant(restaurantId, hospitalId, tx);
        }

        if (dto.counterCode !== undefined || dto.restaurantId !== undefined) {
          await this.assertUniqueCounterCode(restaurantId, counterCode, id, tx);
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const counter = Object.keys(data).length
          ? await this.counters.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'COUNTER_STATUS_CHANGE'
                : 'COUNTER_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'counters',
            hospitalId: counter.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toCounterResponse(counter),
            oldValue: toCounterResponse(existing),
          },
          tx,
        );

        return counter;
      });

      return toCounterResponse(updated);
    } catch (error) {
      handlePrismaError(error, 'Counter');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActiveCounter(id);

    await this.counters.transaction(async (tx) => {
      await this.counters.update(
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
          action: 'COUNTER_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'counters',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toCounterResponse(existing),
        },
        tx,
      );
    });

    return {
      id,
    };
  }

  private async assertActiveHospital(id: string, client: CounterClient): Promise<void> {
    const hospital = await this.counters.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Hospital not found or inactive');
    }
  }

  private async assertActiveRestaurant(
    id: string,
    hospitalId: string,
    client: CounterClient,
  ): Promise<void> {
    const restaurant = await this.counters.findActiveRestaurant(id, hospitalId, client);

    if (!restaurant || !restaurant.isActive) {
      throw new BadRequestException('Restaurant not found or inactive');
    }
  }

  private async assertUniqueCounterCode(
    restaurantId: string,
    counterCode: string,
    excludeId: string | undefined,
    client: CounterClient,
  ): Promise<void> {
    const counter = await this.counters.findByCodeWithinRestaurant(
      restaurantId,
      counterCode,
      excludeId,
      client,
    );

    if (counter) {
      throw new ConflictException('Counter code already exists within restaurant');
    }
  }

  private async findActiveCounter(
    id: string,
    client?: CounterClient,
  ): Promise<CounterWithRelations> {
    const counter = await this.counters.findActiveById(id, client);

    if (!counter) {
      throw new NotFoundException('Counter not found');
    }

    return counter;
  }
}
