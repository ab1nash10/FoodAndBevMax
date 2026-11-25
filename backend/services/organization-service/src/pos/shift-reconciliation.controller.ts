import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import {
  ApproveShiftDto,
  ListShiftReconciliationsDto,
  SaveShiftReasonsDto,
  SendBackShiftDto,
} from './dto/shift-reconciliation.dto';
import { ShiftReconciliationService } from './shift-reconciliation.service';

/**
 * Payment reconciliation per closed shift: the restaurant admin's reasons (SHIFT_RECONCILE) and
 * the Supervisor's decision (SHIFT_APPROVE). No till: these are back-office screens. Under /pos,
 * so a decision refreshes the screens that show bills (live changes area "pos").
 */
@ApiBearerAuth('access-token')
@ApiTags('pos')
@Controller('pos/shift-reconciliations')
export class ShiftReconciliationController {
  constructor(private readonly reconciliations: ShiftReconciliationService) {}

  @Get()
  @Permissions('SHIFT_RECONCILE', 'SHIFT_APPROVE')
  @ApiOperation({ summary: "A day's ended shifts, each with its money check and where it stands" })
  @ApiOkResponse({ description: 'Shifts.' })
  async list(@Query() query: ListShiftReconciliationsDto) {
    return { data: await this.reconciliations.list(query), message: 'Success', success: true };
  }

  @Put(':shiftId/reasons')
  @Permissions('SHIFT_RECONCILE')
  @ApiOperation({
    summary: "Give a reason for each of a shift's differences; it then waits for approval",
  })
  @ApiOkResponse({ description: 'Reasons saved.' })
  async saveReasons(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body() body: SaveShiftReasonsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.reconciliations.saveReasons(shiftId, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post(':shiftId/approve')
  @Permissions('SHIFT_APPROVE')
  @ApiOperation({ summary: 'Approve a shift: its money is final' })
  @ApiOkResponse({ description: 'Shift approved.' })
  async approve(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body() body: ApproveShiftDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.reconciliations.approve(shiftId, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post(':shiftId/send-back')
  @Permissions('SHIFT_APPROVE')
  @ApiOperation({ summary: 'Send a shift back to the restaurant admin, saying what to fix' })
  @ApiOkResponse({ description: 'Shift sent back.' })
  async sendBack(
    @Param('shiftId', ParseUUIDPipe) shiftId: string,
    @Body() body: SendBackShiftDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.reconciliations.sendBack(shiftId, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
