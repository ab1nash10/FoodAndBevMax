import { Public } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CreateQrOrderDto,
  QrMenuQueryDto,
  QrOrderStatusQueryDto,
  QrStaffOtpDto,
  QrStaffVerifyDto,
} from './dto/qr.dto';
import { QrOrdersService } from './qr-orders.service';

// Guests on the hospital's Wi-Fi share one network address.
const sharedAddressLimit = { default: { limit: 600, ttl: 60_000 } };
// Enough for staff typing their ID and code; too few to try IDs or guess codes.
const staffLimit = { default: { limit: 10, ttl: 60_000 } };
// In the address, as the board's and the kiosk's: a custom header would need a CORS preflight.
const tokenQuery = { description: "The restaurant's board link secret.", name: 'token' };

const ok = <T>(data: T) => ({ data, message: 'Success', success: true });

/** The guest's phone, from the restaurant's QR: no sign-in, the board link secret instead. */
@ApiTags('qr')
@Controller('qr')
export class QrOrdersController {
  constructor(private readonly qr: QrOrdersService) {}

  @Get(':restaurantId/menu')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiOperation({ summary: 'What a guest can have delivered to their room now' })
  @ApiOkResponse({ description: 'Menu returned.' })
  async menu(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query() query: QrMenuQueryDto,
  ) {
    return ok(await this.qr.menu(restaurantId, query.token));
  }

  @Post(':restaurantId/staff-otp')
  @Public()
  @Throttle(staffLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({ summary: "Send an OTP to an employee's registered mobile for their discount" })
  @ApiOkResponse({ description: 'OTP sent; the mobile it went to, masked.' })
  async staffOtp(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
    @Body() body: QrStaffOtpDto,
  ) {
    return ok(await this.qr.sendStaffOtp(restaurantId, token, body.employeeCode));
  }

  @Post(':restaurantId/staff-verify')
  @Public()
  @Throttle(staffLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({ summary: 'Confirm the OTP: the discount and a token for checkout' })
  @ApiOkResponse({ description: 'Discount confirmed.' })
  async staffVerify(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
    @Body() body: QrStaffVerifyDto,
  ) {
    return ok(await this.qr.verifyStaffOtp(restaurantId, token, body.employeeCode, body.otp));
  }

  @Post(':restaurantId/orders')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiQuery(tokenQuery)
  @ApiOperation({ summary: 'Place a QR order: priced here, with a UPI link to pay it' })
  @ApiOkResponse({ description: 'Order placed, awaiting payment.' })
  async create(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query('token') token: string | undefined,
    @Body() body: CreateQrOrderDto,
  ) {
    return ok(await this.qr.createOrder(restaurantId, token, body));
  }

  @Get('orders/:id')
  @Public()
  @Throttle(sharedAddressLimit)
  @ApiOperation({ summary: "Where a guest's QR order stands; once paid, it is billed" })
  @ApiOkResponse({ description: 'Order returned.' })
  async status(@Param('id', ParseUUIDPipe) id: string, @Query() query: QrOrderStatusQueryDto) {
    return ok(await this.qr.status(id, query.key));
  }
}
