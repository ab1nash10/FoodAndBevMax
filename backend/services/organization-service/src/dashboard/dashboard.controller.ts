import { CurrentUser } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  DashboardRecordsQueryDto,
  DashboardServiceQueryDto,
  DashboardSetupQueryDto,
} from './dto/dashboard-query.dto';

// No @Permissions here: each part is checked against its list endpoint's view permission.
@ApiBearerAuth('access-token')
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('records')
  @ApiOperation({ summary: "Get the period's transfers, productions and GRNs for the dashboard" })
  @ApiOkResponse({ description: 'Dashboard records returned successfully.' })
  async records(
    @Query() query: DashboardRecordsQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.dashboard.records(query, user?.permissions ?? []),
      message: 'Success',
      success: true,
    };
  }

  @Get('nav-counts')
  @ApiOperation({
    summary: "Get the nav badges' counts: transfers to acknowledge, draft GRNs and productions",
  })
  @ApiOkResponse({ description: 'Dashboard nav counts returned successfully.' })
  async navCounts(
    @Query() query: DashboardSetupQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.dashboard.navCounts(query, user?.permissions ?? []),
      message: 'Success',
      success: true,
    };
  }

  @Get('location-names')
  @ApiOperation({
    summary: 'Get the id, name and code of every active store, kitchen, restaurant and counter',
  })
  @ApiOkResponse({ description: 'Location names returned successfully.' })
  async locationNames(@CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.dashboard.locationNames(user?.permissions ?? []),
      message: 'Success',
      success: true,
    };
  }

  @Get('service')
  @ApiOperation({
    summary:
      "Get a day's sales by hour and channel beside the same day last week, the counters now and the kitchen's queue",
  })
  @ApiOkResponse({ description: 'Dashboard service day returned successfully.' })
  async service(
    @Query() query: DashboardServiceQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.dashboard.serviceDay(query, user?.permissions ?? []),
      message: 'Success',
      success: true,
    };
  }

  @Get('setup')
  @ApiOperation({ summary: "Get the dashboard setup checklist's counts" })
  @ApiOkResponse({ description: 'Dashboard setup returned successfully.' })
  async setup(
    @Query() query: DashboardSetupQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.dashboard.setup(query, user?.permissions ?? []),
      message: 'Success',
      success: true,
    };
  }
}
