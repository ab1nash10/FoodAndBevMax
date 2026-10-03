import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { ListPaymentMachinesQueryDto } from './dto/list-payment-machines-query.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';
import { PaymentMachinesService } from './payment-machines.service';

@ApiBearerAuth('access-token')
@ApiTags('payment-machines')
@Controller('payment-machines')
export class PaymentMachinesController {
  constructor(private readonly paymentMachines: PaymentMachinesService) {}

  @Get()
  @Permissions('PAYMENT_MACHINE_VIEW')
  @ApiOperation({ summary: 'Get payment machines' })
  @ApiOkResponse({ description: 'Payment machines returned successfully.' })
  async list(@Query() query: ListPaymentMachinesQueryDto) {
    return {
      data: await this.paymentMachines.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('PAYMENT_MACHINE_VIEW')
  @ApiOperation({ summary: 'Get payment machine by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Payment machine returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.paymentMachines.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('PAYMENT_MACHINE_CREATE')
  @ApiBody({ type: CreatePaymentMachineDto })
  @ApiOperation({ summary: 'Create payment machine' })
  @ApiOkResponse({ description: 'Payment machine created successfully.' })
  async create(
    @Body() body: CreatePaymentMachineDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.paymentMachines.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('PAYMENT_MACHINE_UPDATE')
  @ApiBody({ type: UpdatePaymentMachineDto })
  @ApiOperation({ summary: 'Update payment machine' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Payment machine updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePaymentMachineDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.paymentMachines.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('PAYMENT_MACHINE_DELETE')
  @ApiOperation({ summary: 'Delete payment machine' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Payment machine deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.paymentMachines.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
