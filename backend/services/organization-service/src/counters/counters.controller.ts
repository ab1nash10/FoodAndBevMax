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
import { CountersService } from './counters.service';
import { CreateCounterDto } from './dto/create-counter.dto';
import { ListCountersQueryDto } from './dto/list-counters-query.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';

@ApiBearerAuth('access-token')
@ApiTags('counters')
@Controller('counters')
export class CountersController {
  constructor(private readonly counters: CountersService) {}

  @Get()
  @Permissions('COUNTER_VIEW')
  @ApiOperation({ summary: 'Get counters' })
  @ApiOkResponse({ description: 'Counters returned successfully.' })
  async list(@Query() query: ListCountersQueryDto) {
    return {
      data: await this.counters.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('COUNTER_VIEW')
  @ApiOperation({ summary: 'Get counter by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Counter returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.counters.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('COUNTER_CREATE')
  @ApiBody({ type: CreateCounterDto })
  @ApiOperation({ summary: 'Create counter' })
  @ApiOkResponse({ description: 'Counter created successfully.' })
  async create(
    @Body() body: CreateCounterDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.counters.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('COUNTER_UPDATE')
  @ApiBody({ type: UpdateCounterDto })
  @ApiOperation({ summary: 'Update counter' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Counter updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCounterDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.counters.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('COUNTER_DELETE')
  @ApiOperation({ summary: 'Delete counter' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Counter deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.counters.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
