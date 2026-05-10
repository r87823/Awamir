import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { NotificationListQuery } from './notification.types';
import { NotificationsService } from './notifications.service';

@UseGuards(PermissionsGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications:view')
  list(@Query() query: NotificationListQuery, @Req() request: Request) {
    return this.notifications.list(
      coerceQuery(query),
      actorFromRequest(request),
    );
  }

  @Get('unread-count')
  @RequirePermissions('notifications:view')
  unreadCount(@Req() request: Request) {
    return this.notifications.unreadCount(actorFromRequest(request));
  }

  @Post(':id/read')
  @RequirePermissions('notifications:read')
  markRead(@Param('id') id: string, @Req() request: Request) {
    return this.notifications.markRead(id, actorFromRequest(request));
  }

  @Post('read-all')
  @RequirePermissions('notifications:read')
  markAllRead(@Req() request: Request) {
    return this.notifications.markAllRead(actorFromRequest(request));
  }
}

function coerceQuery(query: NotificationListQuery): NotificationListQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}

function actorFromRequest(request: Request) {
  return {
    actorId: headerValue(request, 'x-actor-id'),
    driverId: headerValue(request, 'x-driver-id'),
  };
}

function headerValue(request: Request, key: string) {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}
