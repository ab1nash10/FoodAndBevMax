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
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { ListTimeSlotsQueryDto } from './dto/list-time-slots-query.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';
import { TimeSlotsService } from './time-slots.service';

@ApiBearerAuth('access-token')
@ApiTags('time-slots')
@Controller('time-slots')
export class TimeSlotsController {
  constructor(private readonly timeSlots: TimeSlotsService) {}

  @Get()
  @Permissions('TIME_SLOT_VIEW')
  @ApiOperation({ summary: 'Get time slots' })
  @ApiOkResponse({ description: 'Time slots returned successfully.' })
  async list(@Query() query: ListTimeSlotsQueryDto) {
    return { data: await this.timeSlots.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('TIME_SLOT_VIEW')
  @ApiOperation({ summary: 'Get time slot by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Time slot returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.timeSlots.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('TIME_SLOT_CREATE')
  @ApiBody({ type: CreateTimeSlotDto })
  @ApiOperation({ summary: 'Create time slot' })
  @ApiOkResponse({ description: 'Time slot created successfully.' })
  async create(
    @Body() body: CreateTimeSlotDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.timeSlots.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('TIME_SLOT_UPDATE')
  @ApiBody({ type: UpdateTimeSlotDto })
  @ApiOperation({ summary: 'Update time slot' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Time slot updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTimeSlotDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.timeSlots.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('TIME_SLOT_DELETE')
  @ApiOperation({ summary: 'Delete time slot' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Time slot deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.timeSlots.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
