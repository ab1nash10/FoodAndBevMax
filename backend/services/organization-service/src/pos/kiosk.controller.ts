import { Public } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateKioskPaidOrderDto } from './dto/qr.dto';
import { KioskService } from './kiosk.service';
import { QrOrdersService } from './qr-orders.service';

// Every kiosk at a site may share one network address.
const sharedAddressLimit = { default: { limit: 600, ttl: 60_000 } };
// In the address, as the board's: a custom header would need a CORS preflight.
const tokenQuery = { description: "The restaurant's board link secret.", name: 'token' };

@ApiTags('kiosk')
@Controller()
export class KioskController {
  constructor(
    private readonly kiosk: KioskService,
    private readonly guestOrders: QrOrdersService,
  ) {}

  @Post('kiosk/:restaurantId/paid-orders')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({
    summary: 'A kiosk order paid at the kiosk: by UPI (a QR for the amount) or card',
  })
  @ApiOkResponse({ description: 'Order placed, awaiting payment.' })
  async createPaid(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
    @Body() body: CreateKioskPaidOrderDto,
  ) {
    return {
      data: await this.guestOrders.createKioskOrder(restaurantId, token, body),
      message: 'Success',
      success: true,
    };
  }

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
}
