import { Permissions, Public } from '@aahar/auth';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateKioskOrderDto, KioskOrderLookupQueryDto, KioskStaffQueryDto } from './dto/kiosk.dto';
import { KioskService } from './kiosk.service';

// Every kiosk at a site may share one network address.
const sharedAddressLimit = { default: { limit: 600, ttl: 60_000 } };
// Enough for staff typing their number; too few to try numbers to find who is staff.
const staffLookupLimit = { default: { limit: 20, ttl: 60_000 } };
// In the address, as the board's: a custom header would need a CORS preflight.
const tokenQuery = { description: "The restaurant's board link secret.", name: 'token' };

@ApiTags('kiosk')
@Controller()
export class KioskController {
  constructor(private readonly kiosk: KioskService) {}

  @Get('kiosk/:restaurantId/menu')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({ summary: 'What the self-service kiosk sells right now' })
  @ApiOkResponse({ description: 'Menu returned.' })
  async menu(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
  ) {
    return {
      data: await this.kiosk.menu(restaurantId, token),
      message: 'Success',
      success: true,
    };
  }

  @Get('kiosk/:restaurantId/staff')
  @Public()
  @Throttle(staffLookupLimit)
  @ApiOperation({ summary: "A staff member's discount, by their registered mobile" })
  @ApiOkResponse({ description: 'Discount returned.' })
  async staff(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: KioskStaffQueryDto,
  ) {
    return {
      data: await this.kiosk.staffDiscount(restaurantId, query.token, query.mobile),
      message: 'Success',
      success: true,
    };
  }

  @Post('kiosk/:restaurantId/orders')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({ summary: 'Place a kiosk order, to be paid at a counter' })
  @ApiOkResponse({ description: 'Order placed: its number and total.' })
  async create(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
    @Body() body: CreateKioskOrderDto,
  ) {
    return {
      data: await this.kiosk.createOrder(restaurantId, token, body),
      message: 'Success',
      success: true,
    };
  }

  @Get('pos/kiosk-orders')
  @ApiBearerAuth('access-token')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'Kiosk orders waiting to be paid at this counter’s restaurant' })
  @ApiOkResponse({ description: 'Waiting kiosk orders returned.' })
  async waiting(@Query() query: KioskOrderLookupQueryDto) {
    return {
      data: await this.kiosk.waiting(query.counterId),
      message: 'Success',
      success: true,
    };
  }

  @Get('pos/kiosk-orders/:number')
  @ApiBearerAuth('access-token')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: "Today's kiosk order by its number, to bill at this counter" })
  @ApiOkResponse({ description: 'Kiosk order returned.' })
  async forCounter(
    @Param('number', ParseIntPipe) number: number,
    @Query() query: KioskOrderLookupQueryDto,
  ) {
    return {
      data: await this.kiosk.forCounter(query.counterId, number),
      message: 'Success',
      success: true,
    };
  }
}
