import { CurrentUser, Permissions, Public } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import {
  BoardLinkDto,
  ListRestaurantOrdersQueryDto,
  UpdateOrderStatusDto,
} from './dto/order-requests.dto';
import { PushOrderDto } from './dto/push-order.dto';
import { RestaurantOrdersService } from './restaurant-orders.service';

// POS terminals, kiosks and board TVs often share one network address, so they get more room
// than the default per-address limit.
const sharedAddressLimit = { default: { limit: 600, ttl: 60_000 } };

@ApiTags('restaurant-orders')
@Controller()
export class RestaurantOrdersController {
  constructor(private readonly orders: RestaurantOrdersService) {}

  @Post('orders')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiHeader({
    description:
      "A POS device's key, or the restaurant's order key (kiosk, QR ordering, other apps).",
    name: 'x-order-key',
  })
  @ApiOperation({ summary: 'Send a guest order (or its cancellation) from any channel' })
  @ApiOkResponse({ description: 'Order saved.' })
  async push(@Headers('x-order-key') orderKey: string | undefined, @Body() body: PushOrderDto) {
    return { data: await this.orders.pushOrder(orderKey, body), message: 'Success', success: true };
  }

  @Post('restaurants/:id/order-key')
  @ApiBearerAuth('access-token')
  @Permissions('RESTAURANT_UPDATE')
  @ApiOperation({
    summary: "Issue the restaurant's order key for kiosks, QR and other apps (shown once)",
  })
  @ApiOkResponse({ description: 'Key issued.' })
  async issueRestaurantKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.orders.issueRestaurantKey(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Get('order-board/:restaurantId')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiHeader({ description: 'Or ?token=: the restaurant board secret.', name: 'x-board-token' })
  @ApiOperation({ summary: 'Pickup board feed for a TV: open orders, meal slot, open hours' })
  @ApiOkResponse({ description: 'Board returned.' })
  async board(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Headers('x-board-token') headerToken: string | undefined,
    @Query('token') queryToken: string | undefined,
  ) {
    return {
      data: await this.orders.board(restaurantId, headerToken ?? queryToken),
      message: 'Success',
      success: true,
    };
  }

  @Get('restaurant-orders')
  @ApiBearerAuth('access-token')
  @Permissions('ORDER_VIEW')
  @ApiOperation({ summary: "Kitchen screen: a restaurant's open orders today" })
  @ApiOkResponse({ description: 'Orders returned.' })
  async list(@Query() query: ListRestaurantOrdersQueryDto) {
    return {
      data: await this.orders.listActive(query.restaurantId),
      message: 'Success',
      success: true,
    };
  }

  @Patch('restaurant-orders/:id/status')
  @ApiBearerAuth('access-token')
  @Permissions('ORDER_UPDATE')
  @ApiOperation({ summary: 'Move an order to preparing, ready, collected or cancelled' })
  @ApiOkResponse({ description: 'Order updated.' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.orders.setStatus(id, body.status, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('restaurants/:id/board-link')
  @ApiBearerAuth('access-token')
  @Permissions('RESTAURANT_UPDATE')
  @ApiOperation({ summary: "The restaurant's TV board link (created on first use)" })
  @ApiOkResponse({ description: 'Board link returned.' })
  async boardLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BoardLinkDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.orders.boardLink(id, body.regenerate ?? false, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('pos-devices/:id/api-key')
  @ApiBearerAuth('access-token')
  @Permissions('POS_DEVICE_UPDATE')
  @ApiOperation({ summary: 'Issue a new order key for a POS device (shown once)' })
  @ApiOkResponse({ description: 'Key issued.' })
  async issuePosKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.orders.issuePosKey(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
