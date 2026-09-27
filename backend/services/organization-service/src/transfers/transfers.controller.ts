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
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { TransfersService } from './transfers.service';

@ApiBearerAuth('access-token')
@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @Permissions('TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW')
  @ApiOperation({ summary: 'Get transfers' })
  @ApiOkResponse({ description: 'Transfers returned successfully.' })
  async list(@Query() query: ListTransfersQueryDto) {
    return { data: await this.transfers.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('TRANSFER_VIEW', 'KITCHEN_TRANSFER_VIEW')
  @ApiOperation({ summary: 'Get transfer by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Transfer returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.transfers.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('TRANSFER_CREATE', 'KITCHEN_TRANSFER_CREATE')
  @ApiBody({ type: CreateTransferDto })
  @ApiOperation({ summary: 'Create draft Store/Kitchen to Restaurant transfer' })
  @ApiOkResponse({ description: 'Transfer created successfully.' })
  async create(
    @Body() body: CreateTransferDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.transfers.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
        permissions: user?.permissions,
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/dispatch')
  @Permissions('TRANSFER_DISPATCH', 'KITCHEN_TRANSFER_DISPATCH')
  @ApiOperation({ summary: 'Dispatch transfer and reduce source stock' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Transfer dispatched successfully.' })
  async dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.transfers.dispatch(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
        permissions: user?.permissions,
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/cancel')
  @Permissions('TRANSFER_CANCEL')
  @ApiOperation({ summary: 'Cancel draft transfer' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Transfer cancelled successfully.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.transfers.cancel(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
