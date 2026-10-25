import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportQueryDto } from './dto/report-query.dto';
import { reportPermissions, ReportsService } from './reports.service';

@ApiBearerAuth('access-token')
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Permissions(...reportPermissions)
  @ApiOperation({ summary: 'The reports the signed-in user may run' })
  @ApiOkResponse({ description: 'Reports returned.' })
  catalog(@CurrentUser() user: JwtRequestUser | undefined) {
    return { data: this.reports.catalog(user?.permissions), message: 'Success', success: true };
  }

  @Get(':code')
  @Permissions(...reportPermissions)
  @ApiOperation({ summary: 'Run a report for a location and a date-time range' })
  @ApiOkResponse({ description: 'Report returned.' })
  async run(
    @Param('code') code: string,
    @Query() query: ReportQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.reports.run(code, query, user?.permissions),
      message: 'Success',
      success: true,
    };
  }
}
