import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import {
  CreateAmendmentDto,
  FindAmendableQueryDto,
  ListAmendmentsQueryDto,
  ListOrderReportQueryDto,
  OperatorsQueryDto,
} from './dto/order-reports.dto';
import { OrderReportsService } from './order-reports.service';

const ok = <T>(data: T, message = 'Success') => ({ data, message, success: true });

@ApiBearerAuth('access-token')
@ApiTags('order-reports')
@Controller('order-reports')
export class OrderReportsController {
  constructor(private readonly reports: OrderReportsService) {}

  @Get()
  @Permissions('ORDER_REPORT_VIEW')
  @ApiOperation({ summary: 'Counter bills with their steps, flags, money and payment' })
  @ApiOkResponse({ description: 'Bills returned.' })
  async list(@Query() query: ListOrderReportQueryDto) {
    return ok(await this.reports.list(query));
  }

  @Get('operators')
  @Permissions('ORDER_REPORT_VIEW')
  @ApiOperation({ summary: 'Users who have made bills, for the POS Operator filter' })
  @ApiOkResponse({ description: 'Operators returned.' })
  async operators(@Query() query: OperatorsQueryDto) {
    return ok(await this.reports.operators(query));
  }

  @Get('amendments')
  @Permissions('ORDER_REPORT_VIEW')
  @ApiOperation({ summary: 'Amendments made to bills, newest first' })
  @ApiOkResponse({ description: 'Amendments returned.' })
  async amendments(@Query() query: ListAmendmentsQueryDto) {
    return ok(await this.reports.amendments(query));
  }

  @Get('amendable')
  @Permissions('ORDER_AMEND')
  @ApiOperation({ summary: 'Bills of the last 48 hours with this order or bill number' })
  @ApiOkResponse({ description: 'Bills returned.' })
  async amendable(@Query() query: FindAmendableQueryDto) {
    return ok(await this.reports.findAmendable(query));
  }

  @Get(':id/bill')
  @Permissions('ORDER_REPORT_VIEW')
  @ApiOperation({ summary: 'One bill with its lines, for printing its invoice' })
  @ApiOkResponse({ description: 'Bill returned.' })
  async bill(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.reports.bill(id));
  }

  @Post(':id/amendments')
  @Permissions('ORDER_AMEND')
  @ApiOperation({ summary: 'Change a bill’s payment mode, with remarks (within 48 hours)' })
  @ApiOkResponse({ description: 'Bill amended.' })
  async amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAmendmentDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return ok(
      await this.reports.amend(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      'Bill amended',
    );
  }
}
