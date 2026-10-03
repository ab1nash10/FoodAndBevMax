import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateTransferAcknowledgementDto } from './dto/create-transfer-acknowledgement.dto';
import { ListTransferAcknowledgementsQueryDto } from './dto/list-transfer-acknowledgements-query.dto';
import { TransferAcknowledgementsService } from './transfer-acknowledgements.service';

@ApiBearerAuth('access-token')
@ApiTags('transfer-acknowledgements')
@Controller('transfer-acknowledgements')
export class TransferAcknowledgementsController {
  constructor(private readonly acknowledgements: TransferAcknowledgementsService) {}

  @Get()
  @Permissions('TRANSFER_VIEW')
  @ApiOperation({ summary: 'Get transfer acknowledgements' })
  @ApiOkResponse({ description: 'Transfer acknowledgements returned successfully.' })
  async list(@Query() query: ListTransferAcknowledgementsQueryDto) {
    return { data: await this.acknowledgements.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('TRANSFER_VIEW')
  @ApiOperation({ summary: 'Get transfer acknowledgement by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Transfer acknowledgement returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.acknowledgements.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('TRANSFER_ACKNOWLEDGE')
  @ApiBody({ type: CreateTransferAcknowledgementDto })
  @ApiOperation({ summary: 'Acknowledge restaurant transfer receipt' })
  @ApiOkResponse({ description: 'Transfer acknowledged successfully.' })
  async create(
    @Body() body: CreateTransferAcknowledgementDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.acknowledgements.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
