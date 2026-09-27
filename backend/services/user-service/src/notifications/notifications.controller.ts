import { CurrentUser } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationDto } from './dto/mark-notification.dto';
import { NotificationsService } from './notifications.service';

/**
 * Every route is scoped to the caller. Notifications are personal, so there is no permission
 * to grant and no way to read or clear somebody else's.
 */
@ApiBearerAuth('access-token')
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  private requireUserId(user: JwtRequestUser | undefined): string {
    if (!user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    return user.id;
  }

  @Get()
  @ApiOperation({ summary: 'List the signed-in user notifications' })
  @ApiOkResponse({ description: 'Notifications returned successfully.' })
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.notifications.list(this.requireUserId(user), query),
      message: 'Success',
      success: true,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the unread notification count' })
  @ApiOkResponse({ description: 'Unread count returned successfully.' })
  async unreadCount(@CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.notifications.unreadCount(this.requireUserId(user)),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/read')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Mark one notification read or unread' })
  @ApiOkResponse({ description: 'Notification updated successfully.' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkNotificationDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.notifications.markRead(this.requireUserId(user), id, body.isRead ?? true),
      message: 'Success',
      success: true,
    };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark every notification read' })
  @ApiOkResponse({ description: 'Notifications updated successfully.' })
  async markAllRead(@CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.notifications.markAllRead(this.requireUserId(user)),
      message: 'Success',
      success: true,
    };
  }
}
