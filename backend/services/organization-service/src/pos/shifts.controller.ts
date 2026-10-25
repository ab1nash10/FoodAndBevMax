import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CloseDayDto, EndShiftDto, OpenShiftDto } from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@ApiBearerAuth('access-token')
@ApiTags('pos')
@Controller('pos')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('shifts')
  @Permissions('POS_SHIFT_MANAGE')
  @ApiOperation({ summary: 'Open a shift at a counter, with the cash in the till' })
  @ApiOkResponse({ description: 'Shift opened.' })
  async open(
    @Body() body: OpenShiftDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.shifts.open(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch('shifts/:id/end')
  @Permissions('POS_SHIFT_MANAGE', 'POS_DAY_CLOSE')
  @ApiOperation({ summary: 'End a shift with the cash counted: close it, or hand it over' })
  @ApiOkResponse({ description: 'Shift ended.' })
  async end(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EndShiftDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.shifts.end(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
        permissions: user?.permissions,
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('day-closes')
  @Permissions('POS_DAY_CLOSE')
  @ApiOperation({ summary: "Close a counter's business day once no shift is open" })
  @ApiOkResponse({ description: 'Day closed.' })
  async closeDay(
    @Body() body: CloseDayDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.shifts.closeDay(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
