import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getOrderBy, getPageMeta, getPagination } from '../common/pagination';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import type { CreateRoomDto, ListRoomsQueryDto, UpdateRoomDto } from './rooms.dto';

const roomSelect = {
  createdAt: true,
  hospital: {
    select: { displayName: true, hospitalCode: true, hospitalName: true, id: true, isActive: true },
  },
  hospitalId: true,
  id: true,
  isActive: true,
  // A table's restaurant; whether it takes table orders tells the portal if the QR works yet.
  restaurant: {
    select: { atTableDining: true, id: true, restaurantCode: true, restaurantName: true },
  },
  restaurantId: true,
  roomCode: true,
  roomName: true,
  updatedAt: true,
} satisfies Prisma.RoomSelect;

type Client = Prisma.TransactionClient | PrismaService;

/**
 * A room or bed at a location (its QR: GET /qr/rooms/:id), or a restaurant's dine-in table (its
 * QR: GET /qr/tables/:id). A table is a room with a restaurant.
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: ListRoomsQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.RoomWhereInput = {
      deletedAt: null,
      hospital: { deletedAt: null },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.restaurantId
        ? { restaurantId: query.restaurantId }
        : query.kind
          ? { restaurantId: query.kind === 'TABLE' ? { not: null } : null }
          : {}),
      ...(query.search
        ? {
            OR: [
              { roomCode: { contains: query.search, mode: 'insensitive' } },
              { roomName: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              {
                restaurant: { restaurantName: { contains: query.search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.room.findMany({
        orderBy: getOrderBy(query, 'createdAt'),
        select: roomSelect,
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.room.count({ where }),
    ]);

    return { items, meta: getPageMeta(page, limit, total) };
  }

  async getById(id: string) {
    return this.find(id, this.prisma);
  }

  async create(dto: CreateRoomDto, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const hospital = await tx.hospital.findFirst({
        select: { isActive: true },
        where: { deletedAt: null, id: dto.hospitalId },
      });

      if (!hospital?.isActive) throw new BadRequestException('Location not found or inactive');

      if (dto.restaurantId) {
        const restaurant = await tx.restaurant.findFirst({
          select: { id: true },
          where: {
            deletedAt: null,
            hospitalId: dto.hospitalId,
            id: dto.restaurantId,
            isActive: true,
          },
        });

        if (!restaurant) {
          throw new BadRequestException('Restaurant not found at this location or inactive');
        }
      }
      await this.assertUniqueName(tx, dto.hospitalId, dto.restaurantId ?? null, dto.roomName);

      const [sequence] = dto.restaurantId
        ? await tx.$queryRaw<Array<{ next: bigint }>>`
            SELECT nextval('table_code_sequence') AS "next"`
        : await tx.$queryRaw<Array<{ next: bigint }>>`
            SELECT nextval('room_code_sequence') AS "next"`;
      const room = await tx.room.create({
        data: {
          createdBy: context.actorId,
          hospitalId: dto.hospitalId,
          isActive: dto.isActive ?? true,
          restaurantId: dto.restaurantId ?? null,
          roomCode: `${dto.restaurantId ? 'T' : 'R'}-${String(sequence!.next).padStart(6, '0')}`,
          roomName: dto.roomName,
          updatedBy: context.actorId,
        },
        select: roomSelect,
      });

      await this.auditLog.record(
        {
          action: 'ROOM_CREATE',
          actorId: context.actorId,
          entityId: room.id,
          entityName: 'rooms',
          hospitalId: room.hospitalId,
          ipAddress: context.ipAddress,
          newValue: room,
        },
        tx,
      );

      return room;
    });
  }

  async update(id: string, dto: UpdateRoomDto, context: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.find(id, tx);

      if (dto.roomName !== undefined)
        await this.assertUniqueName(
          tx,
          existing.hospitalId,
          existing.restaurantId,
          dto.roomName,
          id,
        );
      if (dto.isActive && !existing.isActive && !existing.hospital.isActive) {
        throw new BadRequestException('Location is inactive. Room cannot be activated.');
      }

      const room = await tx.room.update({
        data: { isActive: dto.isActive, roomName: dto.roomName, updatedBy: context.actorId },
        select: roomSelect,
        where: { id },
      });

      await this.auditLog.record(
        {
          action:
            dto.isActive !== undefined && dto.isActive !== existing.isActive
              ? 'ROOM_STATUS_CHANGE'
              : 'ROOM_UPDATE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'rooms',
          hospitalId: room.hospitalId,
          ipAddress: context.ipAddress,
          newValue: room,
          oldValue: existing,
        },
        tx,
      );

      return room;
    });
  }

  private async find(id: string, client: Client) {
    const room = await client.room.findFirst({
      select: roomSelect,
      where: { deletedAt: null, hospital: { deletedAt: null }, id },
    });

    if (!room) throw new NotFoundException('Room not found');

    return room;
  }

  /**
   * Two rooms at one location may not share a name, nor two tables at one restaurant: the QR,
   * the steward and the waiter go by it. A table and a bed may (they are never confused).
   */
  private async assertUniqueName(
    tx: Client,
    hospitalId: string,
    restaurantId: string | null,
    roomName: string,
    excludeId?: string,
  ) {
    const clash = await tx.room.findFirst({
      select: { roomCode: true },
      where: {
        deletedAt: null,
        hospitalId,
        restaurantId,
        roomName: { equals: roomName, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (clash) {
      throw new ConflictException(
        `${roomName} already exists at this ${restaurantId ? 'restaurant' : 'location'} (${clash.roomCode}).`,
      );
    }
  }
}
