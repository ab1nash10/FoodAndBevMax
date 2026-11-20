import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateRoomDto, ListRoomsQueryDto, UpdateRoomDto } from './rooms.dto';
import { RoomsService } from './rooms.service';

const ok = <T>(data: T) => ({ data, message: 'Success', success: true });
// Import saves a hospital's room list a row at a time (up to 1,000 rows a file), and the open
// list refreshes as it goes: the usual 100 a minute would stop it a fifth of the way through.
const importLimit = { default: { limit: 1000, ttl: 60_000 } };

@ApiBearerAuth('access-token')
@ApiTags('rooms')
@Controller('rooms')
@Throttle(importLimit)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @Permissions('ROOM_VIEW')
  @ApiOperation({ summary: 'Get rooms and tables' })
  @ApiOkResponse({ description: 'Rooms returned.' })
  async list(@Query() query: ListRoomsQueryDto) {
    return ok(await this.rooms.list(query));
  }

  @Get(':id')
  @Permissions('ROOM_VIEW')
  @ApiOperation({ summary: 'Get a room or table' })
  @ApiOkResponse({ description: 'Room returned.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.rooms.getById(id));
  }

  @Post()
  @Permissions('ROOM_CREATE')
  @ApiOperation({ summary: 'Add a room or table: it gets the next code' })
  @ApiOkResponse({ description: 'Room created.' })
  async create(
    @Body() body: CreateRoomDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return ok(
      await this.rooms.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
    );
  }

  @Put(':id')
  @Permissions('ROOM_UPDATE')
  @ApiOperation({ summary: 'Rename a room or table, or change its status' })
  @ApiOkResponse({ description: 'Room updated.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoomDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return ok(
      await this.rooms.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
    );
  }
}
