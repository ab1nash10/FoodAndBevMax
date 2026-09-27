import { Inject, Injectable } from '@nestjs/common';
import { UserStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { AUTH_PRISMA } from './access-resolver';

export interface NotificationAudience {
  /** Explicit recipients. */
  userIds?: string[];
  /** Everyone currently holding one of these roles. */
  roleNames?: string[];
  /** Narrows roleNames to users at this hospital, and tags the notification with it. */
  hospitalId?: string;
}

export interface PublishNotificationInput extends NotificationAudience {
  actorId?: string;
  body?: string;
  category: string;
  entityId?: string;
  entityName?: string;
  /** Portal route the bell should open, e.g. `/inventory/transfers`. */
  link?: string;
  title: string;
}

type NotificationClient = Pick<PrismaClient, 'notification' | 'user'> | Prisma.TransactionClient;

/**
 * Writes one notification row per recipient. Fanning out on create keeps the unread count a
 * plain indexed lookup instead of a join across every notification a user might be able to see.
 */
@Injectable()
export class NotificationPublisher {
  constructor(@Inject(AUTH_PRISMA) private readonly prisma: PrismaClient) {}

  async publish(
    input: PublishNotificationInput,
    client: NotificationClient = this.prisma,
  ): Promise<number> {
    const recipientIds = await this.resolveRecipients(input, client);

    if (!recipientIds.length) {
      return 0;
    }

    const { count } = await client.notification.createMany({
      data: recipientIds.map((userId) => ({
        body: input.body,
        category: input.category,
        createdBy: input.actorId,
        entityId: input.entityId,
        entityName: input.entityName,
        hospitalId: input.hospitalId,
        link: input.link,
        title: input.title,
        updatedBy: input.actorId,
        userId,
      })),
    });

    return count;
  }

  private async resolveRecipients(
    input: PublishNotificationInput,
    client: NotificationClient,
  ): Promise<string[]> {
    const recipients = new Set(input.userIds ?? []);

    if (input.roleNames?.length) {
      const users = await client.user.findMany({
        select: { id: true },
        where: {
          deletedAt: null,
          ...(input.hospitalId ? { hospitalId: input.hospitalId } : {}),
          roles: {
            some: {
              deletedAt: null,
              role: { deletedAt: null, name: { in: input.roleNames } },
            },
          },
          status: UserStatus.ACTIVE,
        },
      });
      users.forEach(({ id }) => recipients.add(id));
    }

    // Nobody needs telling about something they just did themselves.
    if (input.actorId) {
      recipients.delete(input.actorId);
    }

    return [...recipients];
  }
}
