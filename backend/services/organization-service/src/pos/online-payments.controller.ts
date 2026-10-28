import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getActorId } from '../common/request-context';
import { StartOnlinePaymentDto } from './dto/pos.dto';
import { OnlinePaymentsService } from './online-payments.service';

@ApiBearerAuth('access-token')
@ApiTags('pos')
@Controller('pos/online-payments')
export class OnlinePaymentsController {
  constructor(private readonly payments: OnlinePaymentsService) {}

  @Get('providers')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'The online UPI providers set up here (Razorpay, PayU)' })
  @ApiOkResponse({ description: 'Providers returned.' })
  providers() {
    return { data: this.payments.available(), message: 'Success', success: true };
  }

  @Get('card-machine/:counterId')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: "The counter's Pine Labs card machine, or null when it has none" })
  @ApiOkResponse({ description: 'Card machine returned.' })
  async cardMachine(@Param('counterId', ParseUUIDPipe) counterId: string) {
    return {
      data: await this.payments.cardMachine(counterId),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({
    summary: "Start a bill's payment: a UPI provider's link for its QR, or a card on Pine Labs",
  })
  @ApiOkResponse({ description: 'Payment started.' })
  async start(
    @Body() body: StartOnlinePaymentDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.payments.start(body, { actorId: getActorId(user) }),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'Whether the guest has paid: asks the provider while pending' })
  @ApiOkResponse({ description: 'Payment returned.' })
  async check(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.payments.check(id), message: 'Success', success: true };
  }

  @Post(':id/cancel')
  @Permissions('POS_ORDER_CREATE')
  @ApiOperation({ summary: 'Let an unpaid payment go; one paid meanwhile comes back PAID' })
  @ApiOkResponse({ description: 'Payment returned.' })
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.payments.cancel(id), message: 'Success', success: true };
  }
}
