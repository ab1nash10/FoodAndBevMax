import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import {
  CancelPosOrderDto,
  CreatePosOrderDto,
  EmployeeLookupQueryDto,
  ListPosOrdersQueryDto,
  PosCountersQueryDto,
  PosMenuQueryDto,
  PosSummaryQueryDto,
  SetMenuAvailabilityDto,
  SetStaffDiscountsDto,
} from './dto/pos.dto';
import { PosService } from './pos.service';

@ApiBearerAuth('access-token')
@ApiTags('pos')
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Get('counters')
  @Permissions('POS_ORDER_VIEW')
  @ApiOperation({
    summary: 'Counters the signed-in user may bill at; with host, only that till computer’s',
  })
  @ApiOkResponse({ description: 'Counters returned.' })
  async counters(@Query() query: PosCountersQueryDto) {
    return { data: await this.pos.counters(query.host), message: 'Success', success: true };
  }

  @Get('menu')
  @Permissions('POS_ORDER_VIEW')
  @ApiOperation({ summary: "A counter's menu for a channel, with prices, availability and stock" })
  @ApiOkResponse({ description: 'Menu returned.' })
  async menu(@Query() query: PosMenuQueryDto) {
    return { data: await this.pos.menu(query), message: 'Success', success: true };
  }

  @Patch('menu/:id/availability')
  @Permissions('POS_MENU_UPDATE')
  @ApiOperation({ summary: 'Mark a menu item available or sold out' })
  @ApiOkResponse({ description: 'Availability saved.' })
  async setAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetMenuAvailabilityDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.pos.setAvailability(id, body.isAvailable, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('orders')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'Bill an order at a counter' })
  @ApiOkResponse({ description: 'Bill saved.' })
  async create(
    @Body() body: CreatePosOrderDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.pos.createOrder(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
        permissions: user?.permissions,
      }),
      message: 'Success',
      success: true,
    };
  }

  @Get('orders')
  @Permissions('POS_ORDER_VIEW')
  @ApiOperation({ summary: 'Counter bills: history, complimentary and cancelled' })
  @ApiOkResponse({ description: 'Bills returned.' })
  async list(@Query() query: ListPosOrdersQueryDto) {
    return { data: await this.pos.list(query), message: 'Success', success: true };
  }

  @Get('orders/:id')
  @Permissions('POS_ORDER_VIEW')
  @ApiOperation({ summary: 'One bill with its lines, for viewing and reprinting' })
  @ApiOkResponse({ description: 'Bill returned.' })
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.pos.detail(id), message: 'Success', success: true };
  }

  @Patch('orders/:id/cancel')
  @Permissions('POS_ORDER_CANCEL')
  @ApiOperation({ summary: 'Cancel a bill and put its stock back' })
  @ApiOkResponse({ description: 'Bill cancelled.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelPosOrderDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.pos.cancel(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Get('employee')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'Who an Employee ID is, and the staff discount they get here' })
  @ApiOkResponse({ description: 'Employee returned.' })
  async employee(@Query() query: EmployeeLookupQueryDto) {
    return { data: await this.pos.lookupEmployee(query), message: 'Success', success: true };
  }

  @Get('staff-discounts/:restaurantId')
  @Permissions('RESTAURANT_VIEW')
  @ApiOperation({ summary: "A restaurant's staff discount for each employee type" })
  @ApiOkResponse({ description: 'Staff discounts returned.' })
  async staffDiscounts(@Param('restaurantId', ParseUUIDPipe) restaurantId: string) {
    return { data: await this.pos.staffDiscounts(restaurantId), message: 'Success', success: true };
  }

  @Put('staff-discounts/:restaurantId')
  @Permissions('RESTAURANT_UPDATE')
  @ApiOperation({ summary: "Set a restaurant's staff discount for each employee type" })
  @ApiOkResponse({ description: 'Staff discounts saved.' })
  async setStaffDiscounts(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Body() body: SetStaffDiscountsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.pos.setStaffDiscounts(restaurantId, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Get('stock-summary')
  @Permissions('COUNTER_STOCK_VIEW')
  @ApiOperation({ summary: "A counter's stock per item for a day: received, sold, available" })
  @ApiOkResponse({ description: 'Stock summary returned.' })
  async stockSummary(@Query() query: PosSummaryQueryDto) {
    return { data: await this.pos.stockSummary(query), message: 'Success', success: true };
  }

  @Get('summary')
  @Permissions('POS_ORDER_VIEW')
  @ApiOperation({ summary: "A counter's takings for a business day" })
  @ApiOkResponse({ description: 'Summary returned.' })
  async summary(@Query() query: PosSummaryQueryDto) {
    return { data: await this.pos.summary(query), message: 'Success', success: true };
  }
}
