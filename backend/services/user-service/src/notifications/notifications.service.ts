import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

function toNotificationResponse(notification: {
  body: string | null;
  category: string;
  createdAt: Date;
  entityId: string | null;
  entityName: string | null;
  id: string;
  link: string | null;
  readAt: Date | null;
  title: string;
}) {
  return {
    body: notification.body,
    category: notification.category,
    createdAt: notification.createdAt,
    entityId: notification.entityId,
    entityName: notification.entityName,
    id: notification.id,
    isRead: notification.readAt !== null,
    link: notification.link,
    readAt: notification.readAt,
    title: notification.title,
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      deletedAt: null,
      userId,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { deletedAt: null, readAt: null, userId } }),
    ]);

    return {
      items: items.map(toNotificationResponse),
      meta: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async unreadCount(userId: string) {
    return {
      unreadCount: await this.prisma.notification.count({
        where: { deletedAt: null, readAt: null, userId },
      }),
    };
  }

  /** Scoped by userId so one user can never mark another user's notification read. */
  async markRead(userId: string, id: string, isRead: boolean) {
    const { count } = await this.prisma.notification.updateMany({
      data: { readAt: isRead ? new Date() : null, updatedBy: userId },
      where: { deletedAt: null, id, userId },
    });

    if (count === 0) {
      throw new NotFoundException('Notification not found');
    }

    return this.unreadCount(userId);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      data: { readAt: new Date(), updatedBy: userId },
      where: { deletedAt: null, readAt: null, userId },
    });

    return this.unreadCount(userId);
  }
}
