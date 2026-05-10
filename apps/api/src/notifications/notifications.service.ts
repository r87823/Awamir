import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationActorContext,
  NotificationListQuery,
} from './notification.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: NotificationListQuery, actor: NotificationActorContext) {
    const pagination = normalizePagination(query);
    const where = this.visibleWhere(actor, query);
    const [total, data] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return {
      data,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  async unreadCount(actor: NotificationActorContext) {
    const unreadCount = await this.prisma.notification.count({
      where: this.visibleWhere(actor, { unreadOnly: true }),
    });
    return { unreadCount };
  }

  async markRead(id: string, actor: NotificationActorContext) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, ...this.scopeWhere(actor) },
    });
    if (!notification) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    }
    if (notification.readAt) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(actor: NotificationActorContext) {
    const result = await this.prisma.notification.updateMany({
      where: {
        ...this.scopeWhere(actor),
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { updatedCount: result.count };
  }

  private visibleWhere(
    actor: NotificationActorContext,
    query: NotificationListQuery,
  ): Prisma.NotificationWhereInput {
    return {
      ...this.scopeWhere(actor),
      ...(asBoolean(query.unreadOnly) ? { readAt: null } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
  }

  private scopeWhere(
    actor: NotificationActorContext,
  ): Prisma.NotificationWhereInput {
    const recipients = [actor.actorId, actor.driverId].filter(
      (value): value is string => !!value,
    );
    return {
      OR: [
        { recipient: null },
        { recipient: '' },
        { recipient: { in: recipients } },
      ],
    };
  }
}

function asBoolean(value: string | boolean | undefined) {
  return value === true || value === 'true';
}
