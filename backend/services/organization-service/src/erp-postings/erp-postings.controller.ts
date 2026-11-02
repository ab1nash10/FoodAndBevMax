import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErpPostingQueryDto, SendErpPostingDto } from './dto/erp-posting.dto';
import { ErpPostingsService } from './erp-postings.service';

@ApiBearerAuth('access-token')
@ApiTags('erp-postings')
@Controller('erp-postings')
export class ErpPostingsController {
  constructor(private readonly postings: ErpPostingsService) {}

  @Get()
  @Permissions('REPORT_ERP')
  @ApiOperation({ summary: 'Every send to the ERP, newest first, and whether sending is set up' })
  @ApiOkResponse({ description: '{ items, total, page, limit, enabled }' })
  async list(@Query() query: ErpPostingQueryDto, @CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.postings.list(query, user?.allowedHospitalIds ?? null),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('REPORT_ERP')
  @ApiOperation({ summary: 'One send in full: the journal, the request and the ERP’s answer' })
  @ApiOkResponse({ description: 'ERP posting returned.' })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.postings.get(id, user?.allowedHospitalIds ?? null),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('ERP_POSTING_SEND')
  @ApiOperation({ summary: "Send a restaurant's day to the ERP" })
  @ApiOkResponse({ description: 'The attempt, with its status.' })
  async send(@Body() body: SendErpPostingDto, @CurrentUser() user: JwtRequestUser) {
    const posting = await this.postings.send(body, user);
    return {
      data: posting,
      message:
        posting.status === 'SUCCESS'
          ? 'Sent to the ERP.'
          : posting.status === 'EMPTY'
            ? 'No bills that day: nothing was sent.'
            : 'The ERP did not take it.',
      success: true,
    };
  }
}
